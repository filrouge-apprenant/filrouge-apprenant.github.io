// =============================================================================
// Fil Rouge Apprenants — fonction serveur « prelevement » (Stripe, SEPA)
// =============================================================================
// Prélèvement automatique au réel des appels passés dans le mois.
//
// Côté centre (page proposition.html, sans connexion, lien secret « jeton ») :
//   - « etat »      : le mandat de prélèvement est-il en place ?
//   - « mandat »    : ouvre la page sécurisée Stripe où le centre saisit son IBAN
//                     et signe le mandat SEPA (aucun débit à ce moment-là).
//   - « confirmer » : au retour de Stripe, enregistre le mandat signé.
//
// Côté administratrice (connectée, double authentification) :
//   - « synchroniser » : relit chez Stripe l'état du mandat d'un centre.
//   - « prelever »     : prélève le montant d'une échéance (appels du mois × tarif).
//                        Rien ne part sans ce clic. Le centre reçoit sa facture par email.
//   - « suivre »       : met à jour les prélèvements en cours (3 à 5 jours ouvrés).
//   - « serveur »      : la clé Stripe est-elle enregistrée ? (oui / non, test / réel)
//
// Sécurité : le montant est toujours relu dans la base, jamais pris dans la
// demande ; une même échéance ne peut pas être prélevée deux fois (clé
// d'idempotence Stripe + contrôle du statut) ; les identifiants Stripe ne sont
// écrits que par cette fonction (clé de service).
//
// Secrets : STRIPE_SECRET_KEY (sk_test_… puis sk_live_…), BREVO_API_KEY.
// Facultatif : SIRET (affiché sur les factures envoyées par email).
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES_AUTORISEES = ["https://filrouge-apprenant.github.io"];
const SITE = "https://filrouge-apprenant.github.io/";
const BOITE = "contact.filrouge.apprenant@gmail.com";
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

const echapper = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const moisFr = (iso: string) => { const [a, m] = iso.split("-").map(Number); return `${MOIS[m - 1]} ${a}`; };
const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const aujourdhui = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

// --- Stripe ------------------------------------------------------------------

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

function cleStripe() { return (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim(); }

// deno-lint-ignore no-explicit-any
async function stripe(methode: "GET" | "POST", chemin: string, parametres: Record<string, unknown> = {}, idempotence?: string): Promise<any> {
  const cle = cleStripe();
  if (!/^(sk|rk)_(test|live)_/.test(cle)) throw new Error("La clé Stripe n'est pas encore enregistrée sur le serveur (secret STRIPE_SECRET_KEY).");
  const corpsForm = encoder(parametres);
  const url = methode === "GET" ? `https://api.stripe.com/v1/${chemin}${corpsForm.toString() ? `?${corpsForm}` : ""}` : `https://api.stripe.com/v1/${chemin}`;
  const r = await fetch(url, {
    method: methode,
    headers: {
      Authorization: `Bearer ${cle}`,
      ...(methode === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotence ? { "Idempotency-Key": idempotence } : {}),
    },
    body: methode === "POST" ? corpsForm : undefined,
  });
  const corps = await r.json();
  if (!r.ok) throw new Error(corps?.error?.message || `Stripe a refusé la demande (${r.status}).`);
  return corps;
}

// --- Emails (Brevo) ----------------------------------------------------------

function cleBrevo(): string {
  for (const nom of ["BREVO_API_KEY", "brevo_api_key"]) {
    const v = (Deno.env.get(nom) || "").trim();
    if (v) return v;
  }
  for (const v of Object.values(Deno.env.toObject())) if (String(v).trim().startsWith("xkeysib-")) return String(v).trim();
  return "";
}
function gabarit(lignesHtml: string) {
  return `<div style="margin:0;padding:24px 12px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#2a1f21;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border:1px solid #ead9dc;border-radius:6px;">
    <tr><td style="padding:18px 24px;border-bottom:2px solid #b3172f;">
      <span style="font-family:Georgia,serif;font-size:20px;color:#2a1f21;">Fil Rouge</span><span style="font-family:Georgia,serif;font-size:20px;color:#b3172f;"> Apprenants</span>
    </td></tr>
    <tr><td style="padding:22px 24px;font-size:15px;line-height:1.55;">${lignesHtml}</td></tr>
    <tr><td style="padding:12px 24px;border-top:1px solid #ead9dc;font-size:12px;color:#6f6265;">
      Fil Rouge Apprenants · Émilie Rachas${Deno.env.get("SIRET") ? ` · SIRET ${echapper(Deno.env.get("SIRET")!)}` : ""} · ${BOITE} · 06 17 75 56 17
    </td></tr>
  </table>
</div>`;
}
const p = (s: string) => `<p style="margin:0 0 12px;">${s}</p>`;
async function envoyer(a: string, objet: string, html: string) {
  const cle = cleBrevo();
  if (!cle || !a) return false;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Fil Rouge Apprenants", email: Deno.env.get("EMAIL_EXPEDITEUR") || BOITE }, to: [{ email: a }], replyTo: { email: BOITE }, subject: objet, htmlContent: html }),
  }).catch(() => null);
  if (r && !r.ok) console.error("Brevo :", r.status, await r.text().catch(() => ""));
  return !!r?.ok;
}

// =============================================================================

Deno.serve(async (req: Request) => {
  const origine = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(origine) });
  if (req.method !== "POST") return reponse(origine, 405, { erreur: "Méthode non autorisée." });

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return reponse(origine, 400, { erreur: "Demande illisible." }); }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    // -------------------------------------------------------------------------
    // Côté centre : lien secret de la proposition
    // -------------------------------------------------------------------------
    if (d.action === "etat" || d.action === "mandat" || d.action === "confirmer") {
      const jeton = String(d.jeton ?? "");
      if (!UUID.test(jeton)) return reponse(origine, 400, { erreur: "Lien de proposition non valable." });
      const { data: prop } = await admin.from("propositions")
        .select("id, organisme_id, type_offre, statut, accepte_le, accepte_email, accepte_nom, titre, organismes ( nom, organismes_suivi_commercial ( contact_email ) )")
        .eq("jeton", jeton).maybeSingle();
      if (!prop || prop.type_offre !== "standard" || !prop.accepte_le || prop.statut === "refusee") {
        return reponse(origine, 400, { erreur: "Le prélèvement se met en place après avoir accepté la proposition." });
      }
      // deno-lint-ignore no-explicit-any
      const org: any = prop.organismes ?? {};
      const { data: m } = await admin.from("mandats_sepa").select("*").eq("organisme_id", prop.organisme_id).maybeSingle();
      const etat = (x: typeof m) => ({ mandat: x?.statut ?? "aucun", iban_fin: x?.statut === "actif" ? x.iban_fin : null });

      if (d.action === "etat") return reponse(origine, 200, etat(m));

      if (d.action === "mandat") {
        if (m?.statut === "actif") return reponse(origine, 200, { ...etat(m), deja: true });
        let client = m?.stripe_client_id as string | undefined;
        if (!client) {
          const c = await stripe("POST", "customers", {
            name: org.nom ?? "Organisme",
            email: prop.accepte_email || undefined,
            preferred_locales: ["fr"],
            metadata: { organisme_id: prop.organisme_id },
          }, `client-${prop.organisme_id}`);
          client = c.id;
        }
        const session = await stripe("POST", "checkout/sessions", {
          mode: "setup",
          customer: client,
          payment_method_types: ["sepa_debit"],
          currency: "eur",
          locale: "fr",
          success_url: `${SITE}proposition.html?p=${jeton}&mandat={CHECKOUT_SESSION_ID}`,
          cancel_url: `${SITE}proposition.html?p=${jeton}`,
          metadata: { organisme_id: prop.organisme_id, proposition_id: prop.id },
          setup_intent_data: {
            description: `Prélèvement mensuel Fil Rouge Apprenants — ${org.nom ?? ""}`.slice(0, 500),
            metadata: { organisme_id: prop.organisme_id, proposition_id: prop.id },
          },
        });
        const { error } = await admin.from("mandats_sepa").upsert({
          organisme_id: prop.organisme_id, statut: m?.statut === "revoque" ? "en_attente" : (m?.statut ?? "en_attente"),
          stripe_client_id: client, stripe_session_id: session.id,
        }, { onConflict: "organisme_id" });
        if (error) throw new Error("Mandat non enregistré : réessayez.");
        return reponse(origine, 200, { url: session.url });
      }

      // confirmer
      const sessionId = String(d.session_id ?? "");
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return reponse(origine, 400, { erreur: "Retour de Stripe non valable." });
      if (m?.statut === "actif") return reponse(origine, 200, etat(m));
      const resultat = await enregistrerMandat(admin, prop.organisme_id, sessionId, m?.stripe_client_id);
      if (resultat.actif) {
        await envoyer(Deno.env.get("EMAIL_ADMIN") || BOITE, `Mandat de prélèvement signé — ${org.nom ?? ""}`,
          gabarit(p(`<strong>${echapper(org.nom ?? "")}</strong> a signé son mandat de prélèvement SEPA (IBAN se terminant par ${echapper(resultat.iban_fin ?? "")}).`)
            + p("Chaque mois, l'échéance (appels du mois × tarif) apparaît dans l'onglet Comptabilité : vérifie-la puis clique sur « Prélever ».")));
      }
      const { data: m2 } = await admin.from("mandats_sepa").select("*").eq("organisme_id", prop.organisme_id).maybeSingle();
      return reponse(origine, 200, etat(m2));
    }

    // -------------------------------------------------------------------------
    // Côté administratrice
    // -------------------------------------------------------------------------
    const appelant = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: estAdmin } = await appelant.rpc("je_suis_admin");
    if (estAdmin !== true) {
      return reponse(origine, 403, { erreur: "Action réservée à l'administratrice connectée avec la double authentification." });
    }

    if (d.action === "serveur") {
      const cle = cleStripe();
      return reponse(origine, 200, { stripe: /^(sk|rk)_(test|live)_/.test(cle), mode: cle.includes("_live_") ? "réel" : cle ? "test" : null, emails: !!cleBrevo() });
    }

    if (d.action === "synchroniser") {
      const organisme = String(d.organisme_id ?? "");
      if (!UUID.test(organisme)) return reponse(origine, 400, { erreur: "Organisme non valable." });
      const { data: m } = await admin.from("mandats_sepa").select("*").eq("organisme_id", organisme).maybeSingle();
      if (!m?.stripe_session_id) return reponse(origine, 200, { mandat: m?.statut ?? "aucun" });
      const r = await enregistrerMandat(admin, organisme, m.stripe_session_id, m.stripe_client_id);
      return reponse(origine, 200, { mandat: r.actif ? "actif" : m.statut, iban_fin: r.iban_fin });
    }

    if (d.action === "prelever") {
      const id = String(d.echeance_id ?? "");
      if (!UUID.test(id)) return reponse(origine, 400, { erreur: "Échéance non valable." });
      const { data: e } = await admin.from("echeances").select("*").eq("id", id).maybeSingle();
      if (!e) return reponse(origine, 404, { erreur: "Échéance introuvable." });
      if (e.annulee) return reponse(origine, 400, { erreur: "Cette échéance est annulée." });
      if (e.payee_le) return reponse(origine, 400, { erreur: "Cette échéance est déjà payée." });
      if (e.prelevement_statut === "en_cours" || e.prelevement_statut === "reussi") {
        return reponse(origine, 400, { erreur: "Le prélèvement de cette échéance est déjà demandé." });
      }
      const centimes = Math.round(Number(e.montant) * 100);
      if (centimes < 50) return reponse(origine, 400, { erreur: "Montant trop faible pour un prélèvement (0 appel ce mois-ci ?)." });
      const { data: m } = await admin.from("mandats_sepa").select("*").eq("organisme_id", e.organisme_id).maybeSingle();
      if (m?.statut !== "actif" || !m.stripe_moyen_id) {
        return reponse(origine, 400, { erreur: "Pas de mandat de prélèvement actif pour ce centre : il doit d'abord le signer depuis sa page proposition." });
      }
      const { data: org } = await admin.from("organismes").select("nom").eq("id", e.organisme_id).maybeSingle();
      const { data: contrat } = await admin.from("contrats").select("email_facturation").eq("organisme_id", e.organisme_id).maybeSingle();
      const { data: suivi } = await admin.from("organismes_suivi_commercial").select("contact_email").eq("organisme_id", e.organisme_id).maybeSingle();

      const pi = await stripe("POST", "payment_intents", {
        amount: centimes,
        currency: "eur",
        customer: m.stripe_client_id,
        payment_method: m.stripe_moyen_id,
        payment_method_types: ["sepa_debit"],
        mandate: m.stripe_mandat_id || undefined,
        confirm: true,
        off_session: true,
        description: `Facture ${e.reference} — suivi des apprenants, ${moisFr(e.mois)} (${e.nb_appels} appels)`.slice(0, 500),
        metadata: { echeance_id: e.id, organisme_id: e.organisme_id, reference: e.reference },
      }, `prelevement-${e.id}-${centimes}-${e.prelevement_id ?? "premier"}`);

      const maj = etatPaiement(pi);
      await admin.from("echeances").update({
        prelevement_id: pi.id, prelevement_statut: maj.statut, prelevement_demande_le: new Date().toISOString(),
        prelevement_erreur: maj.erreur, ...(maj.statut === "reussi" ? { payee_le: aujourdhui() } : {}),
      }).eq("id", e.id);

      // Facture et avis de prélèvement au centre
      let emailEnvoye = false;
      const dest = contrat?.email_facturation || suivi?.contact_email || "";
      if (maj.statut !== "echoue" && dest) {
        emailEnvoye = await envoyer(dest, `Facture ${e.reference} — Fil Rouge Apprenants`, gabarit(
          p("Bonjour,")
          + p(`Voici votre facture pour le suivi téléphonique de vos apprenants en <strong>${moisFr(e.mois)}</strong>.`)
          + `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 14px;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;border-bottom:1px solid #ead9dc;">Facture</td><td style="padding:6px 0;border-bottom:1px solid #ead9dc;text-align:right;"><strong>${echapper(e.reference)}</strong></td></tr>
              <tr><td style="padding:6px 0;border-bottom:1px solid #ead9dc;">Client</td><td style="padding:6px 0;border-bottom:1px solid #ead9dc;text-align:right;">${echapper(org?.nom ?? "")}</td></tr>
              <tr><td style="padding:6px 0;border-bottom:1px solid #ead9dc;">Date</td><td style="padding:6px 0;border-bottom:1px solid #ead9dc;text-align:right;">${dateFr(new Date().toISOString())}</td></tr>
              <tr><td style="padding:6px 0;border-bottom:1px solid #ead9dc;">Appels passés en ${moisFr(e.mois)}</td><td style="padding:6px 0;border-bottom:1px solid #ead9dc;text-align:right;">${e.nb_appels} × ${euros(Number(e.tarif_unitaire))} HT</td></tr>
              <tr><td style="padding:8px 0;"><strong>Total</strong></td><td style="padding:8px 0;text-align:right;"><strong>${euros(Number(e.montant))} HT</strong></td></tr>
            </table>`
          + p("TVA non applicable, article 293 B du CGI.")
          + p(`Ce montant sera prélevé sur votre compte se terminant par <strong>${echapper(m.iban_fin ?? "")}</strong> dans les 2 à 5 jours ouvrés, conformément au mandat SEPA que vous avez signé. Le détail de chaque appel est disponible dans votre espace Fil Rouge.`)
          + p("Une question ? Répondez simplement à cet email.")
          + p("Belle journée,<br>Émilie Rachas<br>Fil Rouge Apprenants"),
        ));
      }
      return reponse(origine, 200, { statut: maj.statut, erreur: maj.erreur, email: emailEnvoye, mode_test: cleStripe().includes("_test_") });
    }

    if (d.action === "suivre") {
      const organisme = String(d.organisme_id ?? "");
      if (!UUID.test(organisme)) return reponse(origine, 400, { erreur: "Organisme non valable." });
      const { data: enCours } = await admin.from("echeances").select("id, prelevement_id")
        .eq("organisme_id", organisme).eq("prelevement_statut", "en_cours");
      let changes = 0;
      for (const e of enCours ?? []) {
        if (!e.prelevement_id) continue;
        const pi = await stripe("GET", `payment_intents/${e.prelevement_id}`);
        const maj = etatPaiement(pi);
        if (maj.statut !== "en_cours") {
          await admin.from("echeances").update({
            prelevement_statut: maj.statut, prelevement_erreur: maj.erreur,
            ...(maj.statut === "reussi" ? { payee_le: aujourdhui() } : {}),
          }).eq("id", e.id);
          changes++;
        }
      }
      return reponse(origine, 200, { verifies: (enCours ?? []).length, changes });
    }

    return reponse(origine, 400, { erreur: "Demande non valable." });
  } catch (e) {
    return reponse(origine, 502, { erreur: e instanceof Error ? e.message : "Erreur Stripe." });
  }
});

// deno-lint-ignore no-explicit-any
function etatPaiement(pi: any): { statut: "en_cours" | "reussi" | "echoue"; erreur: string | null } {
  if (pi.status === "succeeded") return { statut: "reussi", erreur: null };
  if (pi.status === "processing" || pi.status === "requires_confirmation" || pi.status === "requires_action") return { statut: "en_cours", erreur: null };
  const msg = pi.last_payment_error?.message || (pi.status === "canceled" ? "Prélèvement annulé." : "Prélèvement refusé par la banque.");
  return { statut: "echoue", erreur: String(msg).slice(0, 500) };
}

// Relit la session Stripe et enregistre le mandat s'il est signé.
// deno-lint-ignore no-explicit-any
async function enregistrerMandat(admin: any, organisme: string, sessionId: string, clientAttendu?: string | null) {
  const s = await stripe("GET", `checkout/sessions/${sessionId}`, { expand: ["setup_intent", "setup_intent.payment_method"] });
  if (s.metadata?.organisme_id !== organisme || (clientAttendu && s.customer !== clientAttendu)) {
    throw new Error("Ce retour de Stripe ne correspond pas à cet organisme.");
  }
  const si = s.setup_intent;
  if (!si || typeof si !== "object" || si.status !== "succeeded") return { actif: false, iban_fin: null as string | null };
  const pm = si.payment_method ?? {};
  const iban = pm.sepa_debit?.last4 ?? null;
  await admin.from("mandats_sepa").upsert({
    organisme_id: organisme,
    statut: "actif",
    stripe_client_id: s.customer,
    stripe_session_id: sessionId,
    stripe_moyen_id: pm.id ?? null,
    stripe_mandat_id: typeof si.mandate === "string" ? si.mandate : si.mandate?.id ?? null,
    iban_fin: iban,
    banque: pm.sepa_debit?.bank_code ?? null,
    titulaire: pm.billing_details?.name ?? null,
    signe_le: new Date().toISOString(),
  }, { onConflict: "organisme_id" });
  return { actif: true, iban_fin: iban as string | null };
}
