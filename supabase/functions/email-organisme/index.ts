// =============================================================================
// Fil Rouge Apprenants — fonction serveur « email-organisme » (19/11/2026)
// =============================================================================
// Envoie un email à un ORGANISME (prospect ou client) par Brevo, l'enregistre,
// puis lit chez Brevo son accusé de réception : délivré, rejeté, spam, et
// l'ouverture SEULEMENT si le centre a donné son accord (recommandation CNIL du
// 12 mars 2026 sur les pixels de suivi, B2B compris).
//
// Sécurité :
//   1. verify_jwt : appel refusé sans jeton de connexion.
//   2. Réservé à l'administratrice (prive.est_admin() via la base, avec SON jeton).
//   3. La clé Brevo (secret BREVO_API_KEY) reste ici.
//   4. Le consentement est lu dans la base au moment de l'envoi, jamais dans la
//      demande : impossible de forcer le suivi d'un destinataire.
//
// Appels (POST, JSON) :
//   { action: "etat" }                                            -> { brevo }
//   { action: "envoyer", organisme_id, destinataire, objet, texte, modele? }
//                                                                 -> { ok, id } | { ok: false, raison }
//   { action: "actualiser", organisme_id }                        -> { ok, emails: [...] }
//   { action: "lien_preferences", organisme_id }                  -> { lien, suivi_ouverture }
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES_AUTORISEES = ["https://filrouge-apprenant.github.io"];
const SITE = "https://filrouge-apprenant.github.io";
const BOITE = Deno.env.get("EMAIL_FIL_ROUGE") || "contact.filrouge.apprenant@gmail.com";
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
const reponse = (origine: string | null, statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: entetes(origine) });

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

const lienPreferences = (jeton: string) => `${SITE}/preferences-email.html?t=${jeton}`;

// Mention en bas de chaque email : choix du suivi d'ouverture + désinscription.
function mention(jeton: string) {
  return `Fil Rouge Apprenants, suivi téléphonique des apprenants en formation à distance. `
    + `Vous pouvez accepter ou refuser que nous sachions quand vous ouvrez nos emails : ${lienPreferences(jeton)}. `
    + `Sans réponse de votre part, rien n'est suivi. Pour ne plus recevoir d'email, répondez simplement « STOP ».`;
}

function html(texte: string, jeton: string) {
  const paragraphes = echapper(texte).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`).join("");
  const lien = lienPreferences(jeton);
  return `<div style="background:#ffffff;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#2b2326;">
  <div style="max-width:560px;margin:0 auto;border-top:2px solid #c1121f;padding-top:18px;">${paragraphes}
  <p style="margin:24px 0 0;padding-top:10px;border-top:1px solid #eee;font-size:12px;line-height:1.5;color:#77707a;">Fil Rouge Apprenants, suivi téléphonique des apprenants en formation à distance. Vous pouvez <a href="${lien}" style="color:#77707a;">accepter ou refuser</a> que nous sachions quand vous ouvrez nos emails ; sans réponse de votre part, rien n'est suivi. Pour ne plus recevoir d'email, répondez simplement « STOP ».</p></div>
</div>`;
}

// Statut d'un email d'après la liste des événements Brevo.
function statutDepuis(evenements: { event: string; date: string; reason?: string }[], suivi: boolean) {
  const tri = [...evenements].sort((a, b) => a.date.localeCompare(b.date));
  const premier = (types: string[]) => tri.find((e) => types.includes(e.event));
  const rejet = premier(["hardBounces", "softBounces", "blocked", "invalid", "error"]);
  const spam = premier(["spam"]);
  const delivre = premier(["delivered"]);
  const ouvertures = suivi ? tri.filter((e) => e.event === "opened" || e.event === "loadedByProxy") : [];
  const ouvert = ouvertures[0];
  let statut = "envoye";
  if (delivre) statut = "delivre";
  if (ouvert) statut = "ouvert";
  if (spam) statut = "spam";
  if (rejet && !delivre) statut = "rejete";
  return {
    statut,
    delivre_le: delivre?.date ?? null,
    ouvert_le: ouvert?.date ?? null,
    ouvertures: ouvertures.length,
    detail: rejet && !delivre ? String(rejet.reason || rejet.event).slice(0, 300) : null,
  };
}

Deno.serve(async (req: Request) => {
  const origine = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(origine) });
  if (req.method !== "POST") return reponse(origine, 405, { erreur: "Méthode non autorisée." });

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return reponse(origine, 400, { erreur: "Demande illisible." }); }

  const jeton = req.headers.get("Authorization") || "";
  const appelant = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: jeton } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: utilisateur } = await appelant.auth.getUser();
  if (!utilisateur?.user) return reponse(origine, 401, { erreur: "Connexion requise." });
  const { data: profil } = await appelant.from("profils").select("role, actif").eq("id", utilisateur.user.id).maybeSingle();
  if (!profil || !profil.actif || profil.role !== "admin") return reponse(origine, 403, { erreur: "Réservé à l'administratrice." });

  if (d.action === "etat") return reponse(origine, 200, { brevo: !!cleBrevo() });

  const organismeId = String(d.organisme_id || "");
  if (!UUID.test(organismeId)) return reponse(origine, 400, { erreur: "Organisme inconnu." });

  // Accès complet (clé de service) après contrôle du rôle.
  const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: org } = await base.from("organismes").select("id, nom").eq("id", organismeId).maybeSingle();
  if (!org) return reponse(origine, 404, { erreur: "Organisme introuvable." });
  // Fiche de suivi commercial (créée si besoin, pour avoir le jeton des préférences).
  let { data: suivi } = await base.from("organismes_suivi_commercial")
    .select("organisme_id, contact_nom, suivi_ouverture, jeton_preferences").eq("organisme_id", organismeId).maybeSingle();
  if (!suivi) {
    const r = await base.from("organismes_suivi_commercial").upsert({ organisme_id: organismeId })
      .select("organisme_id, contact_nom, suivi_ouverture, jeton_preferences").single();
    if (r.error) throw r.error;
    suivi = r.data;
  }

  try {
    if (d.action === "lien_preferences") {
      return reponse(origine, 200, { lien: lienPreferences(suivi.jeton_preferences), suivi_ouverture: suivi.suivi_ouverture });
    }

    if (d.action === "envoyer") {
      const destinataire = String(d.destinataire || "").trim();
      const objet = String(d.objet || "").trim();
      const texte = String(d.texte || "").trim();
      const modele = d.modele ? String(d.modele).slice(0, 150) : null;
      if (!EMAIL.test(destinataire) || destinataire.length > 254) return reponse(origine, 400, { erreur: "Adresse email non valable." });
      if (!objet || objet.length > 200) return reponse(origine, 400, { erreur: "Objet manquant ou trop long." });
      if (!texte || texte.length > 8000) return reponse(origine, 400, { erreur: "Message manquant ou trop long." });
      if (/\{\w+\}/.test(objet + texte)) return reponse(origine, 400, { erreur: "Une variable entre accolades n'a pas été complétée." });
      const cle = cleBrevo();
      if (!cle) return reponse(origine, 200, { ok: false, raison: "sans_cle" });

      const consenti = suivi.suivi_ouverture === true;
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": cle, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name: "Émilie — Fil Rouge Apprenants", email: Deno.env.get("EMAIL_EXPEDITEUR") || BOITE },
          to: [{ email: destinataire, name: suivi.contact_nom || undefined, contactPixelTrackingConsent: consenti }],
          replyTo: { email: BOITE, name: "Émilie — Fil Rouge Apprenants" },
          subject: objet,
          htmlContent: html(texte, suivi.jeton_preferences),
          textContent: `${texte}\n\n—\n${mention(suivi.jeton_preferences)}`,
          tags: ["organisme"],
        }),
      });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("Brevo :", r.status, JSON.stringify(corps));
        return reponse(origine, 200, { ok: false, raison: "brevo", detail: String(corps?.message || "").slice(0, 200) });
      }
      const { data: ligne, error } = await base.from("emails_organismes").insert({
        organisme_id: organismeId, destinataire, objet, modele, brevo_message_id: corps.messageId ?? null,
        suivi_ouverture: consenti, auteur_id: utilisateur.user.id,
      }).select("id").single();
      if (error) throw error;
      await base.from("echanges_commerciaux").insert({
        organisme_id: organismeId, date_echange: new Date().toISOString().slice(0, 10), canal: "email",
        resume: `Email envoyé par Brevo${modele ? ` « ${modele} »` : ""} à ${destinataire} : ${objet}`, auteur_id: utilisateur.user.id,
      });
      return reponse(origine, 200, { ok: true, id: ligne.id });
    }

    if (d.action === "actualiser") {
      const cle = cleBrevo();
      const { data: emails } = await base.from("emails_organismes").select("*")
        .eq("organisme_id", organismeId).order("envoye_le", { ascending: false }).limit(30);
      const liste = emails ?? [];
      if (cle) {
        const limite = Date.now() - 89 * 24 * 3600 * 1000;
        for (const e of liste) {
          if (!e.brevo_message_id || new Date(e.envoye_le).getTime() < limite) continue;
          if (["rejete"].includes(e.statut) && e.verifie_le) continue;
          const url = `https://api.brevo.com/v3/smtp/statistics/events?limit=100&days=90&messageId=${encodeURIComponent(e.brevo_message_id)}`;
          const r = await fetch(url, { headers: { "api-key": cle, Accept: "application/json" } });
          if (!r.ok) { console.error("Brevo événements :", r.status, await r.text().catch(() => "")); continue; }
          const ev = (await r.json().catch(() => ({})))?.events ?? [];
          const maj = { ...statutDepuis(ev, e.suivi_ouverture === true), verifie_le: new Date().toISOString() };
          // Sans accord, aucune ouverture n'est gardée.
          if (!e.suivi_ouverture) { maj.ouvert_le = null; maj.ouvertures = 0; }
          await base.from("emails_organismes").update(maj).eq("id", e.id);
          Object.assign(e, maj);
        }
      }
      return reponse(origine, 200, { ok: true, brevo: !!cle, suivi_ouverture: suivi.suivi_ouverture, emails: liste });
    }

    return reponse(origine, 400, { erreur: "Action inconnue." });
  } catch (e) {
    console.error("email-organisme", e);
    return reponse(origine, 500, { erreur: "Erreur inattendue. Réessayez." });
  }
});
