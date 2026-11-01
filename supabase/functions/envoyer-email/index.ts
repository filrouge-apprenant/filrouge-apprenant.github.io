// =============================================================================
// Fil Rouge Apprenants — fonction serveur « envoyer-email »
// =============================================================================
// Envoie un email à UN apprenant, depuis la plateforme, par Brevo (gratuit
// jusqu'à 300 emails par jour). Sert aux relances automatiques après un appel
// sans réponse et à l'envoi d'un modèle choisi dans les menus déroulants.
//
// Sécurité :
//   1. Supabase refuse tout appel sans jeton de connexion (verify_jwt).
//   2. La fonction lit l'apprenant AVEC le jeton de la personne : la base
//      (cloisonnement) ne le lui montre que si elle y a droit.
//   3. Seules l'administratrice (double authentification) et une appelante
//      active peuvent envoyer ; un compte client ne peut jamais envoyer.
//   4. L'adresse du destinataire vient de la base, jamais de la demande :
//      impossible d'utiliser la fonction pour écrire à n'importe qui.
//   5. La clé Brevo (secret BREVO_API_KEY) reste ici, jamais dans le site.
//
// Appels (POST, JSON) :
//   { action: "etat" }                                   -> { brevo: boolean }
//   { action: "envoyer", apprenant_id, objet, texte }    -> { ok: true } | { ok: false, raison }
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES_AUTORISEES = ["https://filrouge-apprenant.github.io"];
const BOITE = Deno.env.get("EMAIL_FIL_ROUGE") || "contact.filrouge.apprenant@gmail.com";
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
const reponse = (origine: string | null, statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: entetes(origine) });

// Même recherche de clé que la fonction « tunnel-vente ».
function cleBrevo(): string {
  for (const nom of ["BREVO_API_KEY", "brevo_api_key"]) {
    const v = (Deno.env.get(nom) || "").trim();
    if (v) return v;
  }
  for (const v of Object.values(Deno.env.toObject())) {
    if (String(v).trim().startsWith("xkeysib-")) return String(v).trim();
  }
  return "";
}

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Mise en page sobre : fond blanc, fin filet rouge (charte Fil Rouge).
function html(texte: string) {
  const paragraphes = echapper(texte).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="background:#ffffff;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#2b2326;">
  <div style="max-width:560px;margin:0 auto;border-top:2px solid #c1121f;padding-top:18px;">${paragraphes}</div>
</div>`;
}

Deno.serve(async (req: Request) => {
  const origine = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(origine) });
  if (req.method !== "POST") return reponse(origine, 405, { erreur: "Méthode non autorisée." });

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return reponse(origine, 400, { erreur: "Demande illisible." }); }

  if (d.action === "etat") return reponse(origine, 200, { brevo: !!cleBrevo() });
  if (d.action !== "envoyer") return reponse(origine, 400, { erreur: "Action inconnue." });

  const apprenantId = String(d.apprenant_id || "");
  const objet = String(d.objet || "").trim();
  const texte = String(d.texte || "").trim();
  if (!UUID.test(apprenantId)) return reponse(origine, 400, { erreur: "Apprenant inconnu." });
  if (!objet || objet.length > 200) return reponse(origine, 400, { erreur: "Objet manquant ou trop long." });
  if (!texte || texte.length > 5000) return reponse(origine, 400, { erreur: "Message manquant ou trop long." });
  if (/\{\w+\}/.test(objet + texte)) return reponse(origine, 400, { erreur: "Une variable entre accolades n'a pas été complétée." });

  // Client Supabase au nom de la personne connectée : la base applique ses droits.
  const jeton = req.headers.get("Authorization") || "";
  const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: jeton } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur } = await base.auth.getUser();
  if (!utilisateur?.user) return reponse(origine, 401, { erreur: "Connexion requise." });

  const { data: profil } = await base.from("profils").select("role, actif, nom_affiche").eq("id", utilisateur.user.id).maybeSingle();
  if (!profil || !profil.actif || !["admin", "appelante"].includes(profil.role)) {
    return reponse(origine, 403, { erreur: "Seules l'administratrice et les appelantes peuvent envoyer un email." });
  }

  const { data: apprenant, error } = await base.from("apprenants").select("id, prenom, nom, email").eq("id", apprenantId).maybeSingle();
  if (error || !apprenant) return reponse(origine, 404, { erreur: "Apprenant introuvable ou non autorisé." });
  const destinataire = String(apprenant.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destinataire)) {
    return reponse(origine, 400, { erreur: "Pas d'adresse email valable sur la fiche de l'apprenant." });
  }

  const cle = cleBrevo();
  if (!cle) return reponse(origine, 200, { ok: false, raison: "sans_cle" });

  const prenomExpediteur = String(profil.nom_affiche || "").trim().split(" ")[0] || "Fil Rouge";
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: `${prenomExpediteur} — Fil Rouge Apprenants`, email: Deno.env.get("EMAIL_EXPEDITEUR") || BOITE },
      to: [{ email: destinataire, name: [apprenant.prenom, apprenant.nom].filter(Boolean).join(" ") || undefined }],
      replyTo: { email: BOITE },
      subject: objet,
      htmlContent: html(texte),
      textContent: texte,
      tags: ["apprenant"],
    }),
  });
  if (!r.ok) {
    console.error("Brevo :", r.status, await r.text().catch(() => ""));
    return reponse(origine, 200, { ok: false, raison: "brevo" });
  }
  return reponse(origine, 200, { ok: true });
});
