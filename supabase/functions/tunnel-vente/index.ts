// =============================================================================
// Fil Rouge Apprenants — fonction serveur « tunnel-vente » (publique)
// =============================================================================
// Appelée par les pages publiques, sans connexion :
//   - offre-pilote.html  → action « demande »  : enregistre la demande d'essai
//     gratuit ou de devis (fonction demander_essai_ou_devis), prévient Émilie
//     par email et envoie un accusé de réception au centre.
//   - proposition.html   → action « accepter » : enregistre l'acceptation en
//     ligne (fonction accepter_proposition), prévient Émilie et confirme au
//     centre (avec le lien de paiement s'il y en a un).
//
// Sécurité :
//   - Tout passe par les fonctions de la base avec la clé publique : mêmes
//     contrôles et mêmes limites que la page (3 demandes par email et par jour,
//     30 par heure, une acceptation par proposition).
//   - Champ piège rempli (robot) : rien n'est enregistré ni envoyé.
//   - Les emails partent par Brevo (secret BREVO_API_KEY). Sans clé, la demande
//     est quand même enregistrée : seuls les emails ne partent pas.
//
// Secrets : BREVO_API_KEY (obligatoire pour les emails),
//           EMAIL_ADMIN et EMAIL_EXPEDITEUR (facultatifs, boîte Fil Rouge par défaut).
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES_AUTORISEES = ["https://filrouge-apprenant.github.io"];
const SITE = "https://filrouge-apprenant.github.io/";
const BOITE = "contact.filrouge.apprenant@gmail.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

const texte = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const euros = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

// Gabarit commun des emails : fond blanc, filet rouge, comme les autres emails Fil Rouge.
function gabarit(lignesHtml: string, bouton?: { texte: string; lien: string }) {
  return `<div style="margin:0;padding:24px 12px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#2a1f21;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;border:1px solid #ead9dc;border-radius:6px;">
    <tr><td style="padding:18px 24px;border-bottom:2px solid #b3172f;">
      <span style="font-family:Georgia,serif;font-size:20px;color:#2a1f21;">Fil Rouge</span><span style="font-family:Georgia,serif;font-size:20px;color:#b3172f;"> Apprenants</span>
    </td></tr>
    <tr><td style="padding:22px 24px;font-size:15px;line-height:1.55;">${lignesHtml}
      ${bouton ? `<p style="margin:22px 0 4px;"><a href="${echapper(bouton.lien)}" style="display:inline-block;padding:11px 20px;border:1px solid #b3172f;border-radius:6px;color:#b3172f;text-decoration:none;font-weight:bold;">${echapper(bouton.texte)}</a></p>` : ""}
    </td></tr>
    <tr><td style="padding:12px 24px;border-top:1px solid #ead9dc;font-size:12px;color:#6f6265;">
      Fil Rouge Apprenants · Émilie Rachas · ${BOITE} · 06 17 75 56 17
    </td></tr>
  </table>
</div>`;
}
const p = (s: string) => `<p style="margin:0 0 12px;">${s}</p>`;

// Clé Brevo : BREVO_API_KEY (ou brevo_api_key) ; à défaut, n'importe quel secret
// dont la valeur est une clé API Brevo (commence par « xkeysib- »).
function trouverCleBrevo(): { nom: string; cle: string } | null {
  for (const nom of ["BREVO_API_KEY", "brevo_api_key"]) {
    const v = (Deno.env.get(nom) || "").trim();
    if (v) return { nom, cle: v };
  }
  for (const [nom, v] of Object.entries(Deno.env.toObject())) {
    if (String(v).trim().startsWith("xkeysib-")) return { nom, cle: String(v).trim() };
  }
  return null;
}
const cleBrevo = () => trouverCleBrevo()?.cle ?? "";

async function envoyer(email: { a: string; nom?: string; objet: string; html: string; repondreA?: string }) {
  const cle = cleBrevo();
  if (!cle) return false;
  const expediteur = Deno.env.get("EMAIL_EXPEDITEUR") || BOITE;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Fil Rouge Apprenants", email: expediteur },
      to: [{ email: email.a, ...(email.nom ? { name: email.nom } : {}) }],
      replyTo: { email: email.repondreA || BOITE },
      subject: email.objet,
      htmlContent: email.html,
    }),
  });
  if (!r.ok) console.error("Brevo :", r.status, await r.text().catch(() => ""));
  return r.ok;
}

Deno.serve(async (req: Request) => {
  const origine = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(origine) });
  if (req.method !== "POST") return reponse(origine, 405, { erreur: "Méthode non autorisée." });

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return reponse(origine, 400, { erreur: "Demande illisible." }); }

  const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = Deno.env.get("EMAIL_ADMIN") || BOITE;

  // ---------------------------------------------------------------------------
  // Demande d'essai gratuit ou de devis
  // ---------------------------------------------------------------------------
  if (d.action === "demande") {
    // Robot : on fait comme si tout allait bien, sans rien enregistrer ni envoyer.
    if (texte(d.site, 200)) return reponse(origine, 200, { ok: true });

    const type = d.type === "essai" ? "essai" : "devis";
    const f = {
      organisme: texte(d.organisme, 150), nom: texte(d.nom, 120), fonction: texte(d.fonction, 120),
      email: texte(d.email, 200).toLowerCase(), telephone: texte(d.telephone, 30),
      formations: texte(d.formations, 500), message: texte(d.message, 3000),
      nb: Number.isFinite(Number(d.nb)) && Number(d.nb) > 0 ? Math.round(Number(d.nb)) : null,
    };

    const { error } = await base.rpc("demander_essai_ou_devis", {
      p_organisme: f.organisme, p_contact_nom: f.nom, p_contact_fonction: f.fonction, p_email: f.email,
      p_telephone: f.telephone, p_nb_apprenants: f.nb, p_formations: f.formations, p_message: f.message,
      p_piege: null, p_type: type,
    });
    if (error) {
      const message = error.code === "P0001" ? error.message
        : "La demande n'a pas pu être envoyée. Réessayez, ou écrivez à " + BOITE + ".";
      return reponse(origine, error.code === "P0001" ? 400 : 500, { erreur: message });
    }

    const libelle = type === "essai" ? "essai gratuit de 15 jours" : "devis";
    const prenom = f.nom.split(" ")[0];
    const details = [
      `<strong>${echapper(f.organisme)}</strong>`,
      `${echapper(f.nom)}${f.fonction ? ` (${echapper(f.fonction)})` : ""}`,
      `<a href="mailto:${echapper(f.email)}">${echapper(f.email)}</a>${f.telephone ? ` · ${echapper(f.telephone)}` : ""}`,
      f.nb ? `${f.nb} apprenant${f.nb > 1 ? "s" : ""}` : "",
      f.formations ? `Formations : ${echapper(f.formations)}` : "",
    ].filter(Boolean).join("<br>");

    const resultats = await Promise.allSettled([
      envoyer({
        a: admin,
        objet: `Nouvelle demande d'${type === "essai" ? "essai gratuit" : "devis"} — ${f.organisme}`,
        repondreA: f.email,
        html: gabarit(
          p(`Nouvelle demande d'<strong>${libelle}</strong> reçue depuis le site :`) + p(details)
          + (f.message ? p(`<em>« ${echapper(f.message).replace(/\n/g, "<br>")} »</em>`) : "")
          + p("La fiche de l'organisme est créée et la proposition est pré-remplie. Répondre à cet email écrit directement au centre."),
          { texte: "Ouvrir les demandes de devis", lien: `${SITE}#/devis` },
        ),
      }),
      envoyer({
        a: f.email, nom: f.nom,
        objet: type === "essai" ? "Votre demande d'essai gratuit — Fil Rouge Apprenants" : "Votre demande de devis — Fil Rouge Apprenants",
        html: gabarit(
          p(`Bonjour ${echapper(prenom)},`)
          + p(type === "essai"
            ? `Merci pour votre demande d'essai gratuit de 15 jours pour <strong>${echapper(f.organisme)}</strong>. Je vous appelle sous 48 h pour organiser le démarrage : vos formations, vos apprenants, et le fichier à me transmettre.`
            : `Merci pour votre demande de devis pour <strong>${echapper(f.organisme)}</strong>. Je vous envoie une proposition adaptée à vos formations sous 48 h.`)
          + p("Une question d'ici là ? Répondez simplement à cet email.")
          + p("Belle journée,<br>Émilie Rachas<br>Fil Rouge Apprenants"),
        ),
      }),
    ]);
    const emails = resultats.every((r) => r.status === "fulfilled" && r.value === true);
    return reponse(origine, 200, { ok: true, emails });
  }

  // ---------------------------------------------------------------------------
  // Acceptation en ligne d'une proposition
  // ---------------------------------------------------------------------------
  if (d.action === "accepter") {
    const jeton = texte(d.jeton, 40);
    const nom = texte(d.nom, 120);
    const fonction = texte(d.fonction, 120);
    const email = texte(d.email, 200).toLowerCase();
    if (!UUID.test(jeton)) return reponse(origine, 400, { erreur: "Lien de proposition non valable." });
    if (nom.length < 2) return reponse(origine, 400, { erreur: "Indiquez votre nom." });
    if (!EMAIL.test(email)) return reponse(origine, 400, { erreur: "Vérifiez votre adresse email." });
    if (d.accord !== true) return reponse(origine, 400, { erreur: "Cochez la case pour confirmer votre accord." });

    const { data, error } = await base.rpc("accepter_proposition", { p_jeton: jeton, p_nom: nom, p_fonction: fonction, p_email: email });
    if (error) {
      const message = error.code === "P0001" ? error.message : "L'acceptation n'a pas pu être enregistrée. Réessayez dans un instant.";
      return reponse(origine, error.code === "P0001" ? 400 : 500, { erreur: message });
    }
    const a = Array.isArray(data) ? data[0] : data;
    if (!a) return reponse(origine, 500, { erreur: "L'acceptation n'a pas pu être enregistrée." });

    const essai = a.type_offre === "essai";
    const montant = Number(a.montant_total) || 0;
    const lien = typeof a.lien_paiement === "string" && /^https:\/\/(buy|checkout)\.stripe\.com\//.test(a.lien_paiement) ? a.lien_paiement : null;
    const prix = essai ? "gratuit" : `${euros(montant)} HT${a.paiement === "mensuel" ? `, soit ${euros(montant / Math.max(1, a.duree_mois))} par mois` : ""}`;

    const resultats = await Promise.allSettled([
      envoyer({
        a: admin,
        objet: `${essai ? "Essai gratuit accepté" : "Proposition acceptée"} — ${a.organisme}`,
        repondreA: email,
        html: gabarit(
          p(`<strong>${echapper(a.organisme)}</strong> vient d'accepter en ligne : <strong>${echapper(a.titre)}</strong> (${prix}).`)
          + p(`Par ${echapper(nom)}${fonction ? ` (${echapper(fonction)})` : ""}, <a href="mailto:${echapper(email)}">${echapper(email)}</a>.`)
          + p(essai
            ? "La fiche est passée en « Test gratuit ». Prochaine étape : appeler le centre pour récupérer le fichier des apprenants."
            : lien ? "La fiche est passée en « Client ». Le lien de paiement lui a été envoyé." : "La fiche est passée en « Client ». Pas encore de lien de paiement : crée-le depuis la fiche."),
          { texte: "Ouvrir la fiche", lien: `${SITE}#/organisme/${a.organisme_id}/proposition` },
        ),
      }),
      envoyer({
        a: email, nom,
        objet: essai ? "Votre essai gratuit est confirmé — Fil Rouge Apprenants" : "Votre accord est bien reçu — Fil Rouge Apprenants",
        html: gabarit(
          p(`Bonjour ${echapper(nom.split(" ")[0])},`)
          + p(essai
            ? `C'est confirmé : votre <strong>essai gratuit de 15 jours</strong> pour ${echapper(a.organisme)} est enregistré. Je vous appelle sous 48 h pour récupérer la liste de vos apprenants et démarrer les appels.`
            : `Merci, votre accord pour « ${echapper(a.titre)} » (${prix}) est bien enregistré.${lien ? " Vous pouvez régler en ligne, par prélèvement sur RIB ou par carte bancaire, avec le bouton ci-dessous." : " Je vous recontacte sous 48 h pour démarrer."}`)
          + p("Une question ? Répondez simplement à cet email.")
          + p("Belle journée,<br>Émilie Rachas<br>Fil Rouge Apprenants"),
          lien && !essai ? { texte: "Régler en ligne", lien } : undefined,
        ),
      }),
    ]);
    const emails = resultats.every((r) => r.status === "fulfilled" && r.value === true);
    return reponse(origine, 200, { ok: true, type_offre: a.type_offre, lien_paiement: essai ? null : lien, emails });
  }

  // Diagnostic minimal : la clé Brevo est-elle enregistrée ? (oui / non, rien d'autre)
  if (d.action === "diagnostic") {
    const cle = cleBrevo();
    return reponse(origine, 200, { cle_presente: !!cle, cle_format_api: cle.startsWith("xkeysib-") });
  }

  return reponse(origine, 400, { erreur: "Demande non valable." });
});
