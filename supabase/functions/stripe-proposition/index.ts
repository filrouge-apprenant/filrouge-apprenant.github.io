// =============================================================================
// Fil Rouge Apprenants — fonction serveur « stripe-proposition »
// =============================================================================
// Crée (ou remplace) le lien de paiement Stripe d'une proposition commerciale,
// au montant et au mode de paiement (unique ou mensuel) saisis sur la fiche
// client. La clé secrète Stripe ne quitte jamais le serveur.
//
// Sécurité :
//   1. Supabase refuse tout appel sans jeton de connexion valide (verify_jwt).
//   2. La fonction demande à la base, avec le jeton de l'appelant, s'il est
//      administratrice avec la double authentification (je_suis_admin).
//   3. Le montant est relu dans la base, jamais pris dans la demande.
//   4. L'ancien lien est désactivé : un client ne peut plus payer un ancien prix.
//
// Secret à définir : STRIPE_SECRET_KEY (clé secrète test sk_test_… puis réelle).
// Appel : POST { action: "lien", proposition_id }
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES_AUTORISEES = ["https://filrouge-apprenant.github.io"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entetes(origine: string | null) {
  return {
    "Access-Control-Allow-Origin": origine && ORIGINES_AUTORISEES.includes(origine) ? origine : ORIGINES_AUTORISEES[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}
function reponse(origine: string | null, statut: number, corps: Record<string, unknown>) {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetes(origine) });
}

// Encodage « formulaire » de Stripe : objets et tableaux imbriqués → a[b][0][c]=…
function encoder(objet: Record<string, unknown>, prefixe = "", sortie = new URLSearchParams()) {
  for (const [cle, valeur] of Object.entries(objet)) {
    if (valeur === undefined || valeur === null) continue;
    const nom = prefixe ? `${prefixe}[${cle}]` : cle;
    if (Array.isArray(valeur)) {
      valeur.forEach((v, i) => {
        if (v !== null && typeof v === "object") encoder(v as Record<string, unknown>, `${nom}[${i}]`, sortie);
        else sortie.append(`${nom}[${i}]`, String(v));
      });
    } else if (typeof valeur === "object") {
      encoder(valeur as Record<string, unknown>, nom, sortie);
    } else {
      sortie.append(nom, String(valeur));
    }
  }
  return sortie;
}

async function stripe(cle: string, chemin: string, parametres: Record<string, unknown>) {
  const r = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: encoder(parametres),
  });
  const corps = await r.json();
  if (!r.ok) throw new Error(corps?.error?.message || `Stripe a refusé la demande (${r.status}).`);
  return corps;
}

Deno.serve(async (req: Request) => {
  const origine = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(origine) });
  if (req.method !== "POST") return reponse(origine, 405, { erreur: "Méthode non autorisée." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const cleAnonyme = Deno.env.get("SUPABASE_ANON_KEY")!;
  const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cleStripe = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

  // 1. Qui appelle ?
  const appelant = createClient(url, cleAnonyme, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: estAdmin, error: erreurAdmin } = await appelant.rpc("je_suis_admin");
  if (erreurAdmin || estAdmin !== true) {
    return reponse(origine, 403, { erreur: "Action réservée à l'administratrice connectée avec la double authentification." });
  }
  if (!/^(sk|rk)_(test|live)_/.test(cleStripe)) {
    return reponse(origine, 503, { erreur: "La clé Stripe n'est pas encore enregistrée sur le serveur (secret STRIPE_SECRET_KEY)." });
  }

  // 2. La demande
  let demande: Record<string, unknown>;
  try { demande = await req.json(); } catch { return reponse(origine, 400, { erreur: "Demande illisible." }); }
  const id = String(demande.proposition_id ?? "");
  if (demande.action !== "lien" || !UUID.test(id)) return reponse(origine, 400, { erreur: "Demande non valable." });

  const admin = createClient(url, cleService, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: p, error } = await admin
    .from("propositions")
    .select("id, organisme_id, titre, description, nb_apprenants, duree_mois, appels_par_mois, montant_total, paiement, stripe_lien_id, statut, organismes ( nom )")
    .eq("id", id)
    .maybeSingle();
  if (error || !p) return reponse(origine, 404, { erreur: "Proposition introuvable." });
  if (p.statut === "payee") return reponse(origine, 400, { erreur: "Cette proposition est déjà payée." });

  const total = Number(p.montant_total);
  if (!(total > 0)) return reponse(origine, 400, { erreur: "Indiquez un montant total supérieur à 0 €." });
  const mensuel = p.paiement === "mensuel";
  const centimes = Math.round((mensuel ? total / p.duree_mois : total) * 100);
  if (centimes < 50) return reponse(origine, 400, { erreur: "Montant trop faible pour un paiement en ligne." });

  // @ts-ignore relation à un seul organisme
  const organisme: string = p.organismes?.nom ?? "Organisme";
  const detail = `${p.nb_apprenants} apprenants · ${p.duree_mois} mois · ${String(p.appels_par_mois).replace(".", ",")} appel(s) par mois et par apprenant`;
  const metadata = { proposition_id: p.id, organisme_id: p.organisme_id };

  try {
    // 3. Le prix (avec son produit) au montant enregistré
    const prix = await stripe(cleStripe, "prices", {
      currency: "eur",
      unit_amount: centimes,
      recurring: mensuel ? { interval: "month" } : undefined,
      product_data: { name: `${p.titre} — ${organisme}`.slice(0, 250), metadata },
      metadata,
    });

    // 4. Le lien de paiement
    const lien = await stripe(cleStripe, "payment_links", {
      line_items: [{ price: prix.id, quantity: 1 }],
      payment_method_types: ["sepa_debit", "card"],
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      name_collection: { business: { enabled: true, optional: false }, individual: { enabled: true, optional: false } },
      tax_id_collection: { enabled: true },
      metadata,
      ...(mensuel
        ? { subscription_data: { description: `${p.titre} — ${detail} — ${p.duree_mois} mensualités`.slice(0, 500), metadata } }
        : {
            customer_creation: "always",
            payment_intent_data: { setup_future_usage: "off_session", description: `${p.titre} — ${detail}`.slice(0, 500), metadata },
            invoice_creation: {
              enabled: true,
              invoice_data: {
                description: `${p.titre} : ${detail}.`.slice(0, 500),
                footer: "Fil Rouge Apprenants · Émilie Rachas · contact.filrouge.apprenant@gmail.com · 06 17 75 56 17",
                metadata,
              },
            },
          }),
      after_completion: {
        type: "hosted_confirmation",
        hosted_confirmation: { custom_message: "Merci ! Votre paiement est bien enregistré. Émilie vous contacte sous 48 h pour démarrer le suivi de vos apprenants." },
      },
    });

    // 5. L'ancien lien ne doit plus fonctionner
    if (p.stripe_lien_id && p.stripe_lien_id !== lien.id) {
      await stripe(cleStripe, `payment_links/${p.stripe_lien_id}`, { active: false }).catch(() => null);
    }

    const { error: erreurMaj } = await admin.from("propositions").update({
      stripe_lien_id: lien.id,
      stripe_lien_url: lien.url,
      stripe_lien_montant: total,
      stripe_lien_paiement: p.paiement,
    }).eq("id", p.id);
    if (erreurMaj) throw new Error("Lien créé dans Stripe mais non enregistré : réessayez.");

    return reponse(origine, 200, { url: lien.url, mode_test: cleStripe.includes("_test_") });
  } catch (e) {
    return reponse(origine, 502, { erreur: e instanceof Error ? e.message : "Erreur Stripe." });
  }
});
