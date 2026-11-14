// =============================================================================
// CRM Abdel — fonction serveur « abdel-envoi »
// =============================================================================
// Envoie au prospect, par e-mail (Brevo), le lien du simulateur public d'Abdel,
// quand Émilie clique sur « Envoyer par e-mail » dans l'onglet Simulateur d'une fiche.
//
// Sécurité :
//   1. Réservé au compte membre du CRM (double authentification) : la fonction lit
//      les paramètres et la fiche AVEC le jeton de la personne connectée (règles de la base).
//   2. Le destinataire vient de la fiche (champ e-mail), jamais de la demande :
//      impossible d'écrire à quelqu'un d'autre.
//   3. Refus si la fiche est marquée « Ne plus contacter ».
//   4. Sécurité privée : refus tant que le nom légal et le n° CNAPS ne sont pas renseignés,
//      et la mention de l'autorisation CNAPS est ajoutée (art. L612-14 du CSI).
//   5. Chaque message dit qui écrit et comment ne plus être contacté (prospection B2B).
//   6. Une même fiche ne reçoit pas deux fois le simulateur en moins de 24 h.
// Appel (POST, JSON) : { prospect_id, activite: "net"|"secu", objet, texte }
// =============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES = ["https://filrouge-apprenant.github.io"];
const BOITE = Deno.env.get("EMAIL_FIL_ROUGE") || "contact.filrouge.apprenant@gmail.com";
const REPONSE = Deno.env.get("ABDEL_EMAIL_NOTIF") || Deno.env.get("EMAIL_ADMIN") || "emilie.rachas@gmail.com";
const SITE = "https://filrouge-apprenant.github.io/abdel/";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const entetes = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && (ORIGINES.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) ? o : ORIGINES[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", Vary: "Origin",
});
const rep = (o: string | null, s: number, c: Record<string, unknown>) => new Response(JSON.stringify(c), { status: s, headers: entetes(o) });
const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function cleBrevo(): string {
  for (const nom of ["BREVO_API_KEY", "brevo_api_key"]) { const v = (Deno.env.get(nom) || "").trim(); if (v) return v; }
  for (const v of Object.values(Deno.env.toObject())) if (String(v).trim().startsWith("xkeysib-")) return String(v).trim();
  return "";
}

// Mise en page : fond blanc, filet doré, lien du simulateur en bouton bleu,
// puis « Je veux être rappelé » (bouton clair) et « Pas intéressé » (petit lien en bas).
function html(texte: string, lien: string, bouton: string, rappel: string, stop: string) {
  const blocs = echapper(texte).split(/\n{2,}/).map((p) => {
    if (p.includes("[[SIMULATEUR]]") || p.includes(echapper(lien))) {
      return `<p style="margin:18px 0 10px;"><a href="${echapper(lien)}" style="display:inline-block;background:#0a78b8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px;">${echapper(bouton)}</a></p>
      <p style="margin:0 0 18px;"><a href="${echapper(rappel)}" style="display:inline-block;background:#ffffff;color:#0a78b8;text-decoration:none;font-weight:bold;padding:11px 19px;border-radius:10px;border:1px solid #0a78b8;">📞 Je préfère être rappelé</a></p>`;
    }
    return `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`;
  }).join("") + `<p style="margin:22px 0 0;font-size:12px;color:#6b7280;">Pas concerné ? <a href="${echapper(stop)}" style="color:#6b7280;">Ne plus recevoir de message</a></p>`;
  return `<div style="background:#ffffff;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#121820;">
  <div style="max-width:560px;margin:0 auto;border-top:2px solid #c2a36b;padding-top:18px;">${blocs}</div></div>`;
}

Deno.serve(async (req: Request) => {
  const o = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(o) });
  if (req.method !== "POST") return rep(o, 405, { erreur: "Méthode non autorisée." });
  let d: Record<string, any>;
  try { d = await req.json(); } catch { return rep(o, 400, { erreur: "Demande illisible." }); }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  // Seul un membre du CRM (double authentification) peut lire les paramètres.
  const { data: prm } = await sb.from("abdel_parametres").select("data").eq("id", "main").maybeSingle();
  if (!prm) return rep(o, 403, { erreur: "Accès refusé : reconnecte-toi au CRM." });
  const P = (prm.data || {}) as Record<string, any>;

  const id = String(d.prospect_id || "");
  const { data: ligne } = await sb.from("abdel_prospects").select("id, data").eq("id", id).maybeSingle();
  if (!ligne) return rep(o, 404, { erreur: "Fiche introuvable." });
  const p = ligne.data as Record<string, any>;
  const dest = String(p.email || "").trim().toLowerCase();
  if (!EMAIL.test(dest)) return rep(o, 400, { erreur: "Pas d'adresse e-mail valable sur la fiche : renseigne-la d'abord." });
  if (p.optOut) return rep(o, 400, { erreur: "Cette fiche est marquée « Ne plus contacter » : aucun envoi." });

  const act = d.activite === "secu" ? "secu" : "net";
  const cnaps = String(P.cnaps || "").trim(), societeSecu = String(P.companySecu || "").trim();
  if (act === "secu" && !(cnaps && societeSecu)) return rep(o, 400, { erreur: "Simulateur sécurité fermé : renseigne d'abord le nom légal et le n° CNAPS dans Paramètres." });

  const derniers = (p.history || []).filter((h: any) => /Simulateur envoyé par e-mail/.test(h.text || "") && Date.now() - new Date(h.ts).getTime() < 86400_000);
  if (derniers.length && d.forcer !== true) return rep(o, 409, { erreur: "Le simulateur a déjà été envoyé à cette fiche il y a moins de 24 h.", deja: true });

  const objet = String(d.objet || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  let texte = String(d.texte || "").trim().slice(0, 5000);
  if (!objet || !texte) return rep(o, 400, { erreur: "Objet et message sont obligatoires." });
  const lien = String(d.lien || "").startsWith(SITE) ? String(d.lien) : SITE + (act === "secu" ? "securite/" : "nettoyage/");
  // Le repère [[SIMULATEUR]] devient un bouton dans l'e-mail (et le lien dans la version texte).
  if (!texte.includes("[[SIMULATEUR]]") && !texte.includes(lien)) texte += "\n\n[[SIMULATEUR]]";
  const societe = act === "secu" ? societeSecu : (String(P.companyNet || "").trim() || "Abdel");
  const pied = [
    act === "secu" ? `${societeSecu} — autorisation d'exercice CNAPS n° ${cnaps}. L'autorisation d'exercice délivrée par le CNAPS ne confère aucune prérogative de puissance publique à l'entreprise ou aux personnes qui en bénéficient.` : "",
    `Vous recevez ce message en tant que professionnel, au sujet des services de ${societe}. Pour ne plus être contacté, cliquez sur « Ne plus recevoir de message » ou répondez « STOP ».`,
  ].filter(Boolean).join("\n");
  const texteFinal = `${texte}\n\n${pied}`;
  const texteBrut = texteFinal.split("[[SIMULATEUR]]").join(lien);

  const cle = cleBrevo();
  if (!cle) return rep(o, 200, { ok: false, raison: "sans_cle" });

  // Jeton unique pour les boutons « Je veux être rappelé » / « Pas intéressé ».
  const jeton = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const rappel = `${SITE}reponse/?t=${jeton}&r=rappel`, stop = `${SITE}reponse/?t=${jeton}&r=stop`;
  const texteMail = texteBrut + `\n\nJe préfère être rappelé : ${rappel}\nNe plus recevoir de message : ${stop}`;
  // Le jeton est enregistré sur la fiche AVANT l'envoi : les boutons fonctionnent dès réception.
  const majFiche = async (ajout: (b: Record<string, any>) => Record<string, any>) => {
    const { data: fraiche } = await sb.from("abdel_prospects").select("data").eq("id", id).maybeSingle();
    const base = (fraiche?.data || p) as Record<string, any>;
    const maj = { ...base, ...ajout(base), updatedAt: new Date().toISOString() };
    const { error } = await sb.from("abdel_prospects").update({ data: maj, modifie_le: maj.updatedAt }).eq("id", id);
    return error ? null : maj;
  };
  const avecJeton = await majFiche((b: any) => ({ jetonsSimu: [...(b.jetonsSimu || []).slice(-19), { t: jeton, act, ts: new Date().toISOString() }] }));
  if (!avecJeton) return rep(o, 500, { erreur: "La fiche n'a pas pu être mise à jour : réessaie." });
  const expediteur = `${String(P.userName || "Émilie").trim()} — ${societe}`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: expediteur.slice(0, 70), email: Deno.env.get("EMAIL_EXPEDITEUR") || BOITE },
      to: [{ email: dest, name: String(p.name || "").slice(0, 70) || undefined }],
      replyTo: { email: REPONSE },
      subject: objet,
      htmlContent: html(texteFinal, lien, act === "secu" ? "Faire la comparaison en 1 minute" : "Estimer mon budget en 1 minute", rappel, stop),
      textContent: texteMail,
      tags: ["abdel-simulateur"],
    }),
  });
  if (!r.ok) { console.error("Brevo :", r.status, await r.text().catch(() => "")); return rep(o, 200, { ok: false, raison: "brevo" }); }

  const maj = await majFiche((b: any) => ({ history: [...(b.history || []), { ts: new Date().toISOString(), type: "note", text: `Simulateur envoyé par e-mail (${act === "secu" ? "sécurité" : "nettoyage"}) à ${dest}` }] }));
  return rep(o, 200, { ok: true, destinataire: dest, fiche: maj || avecJeton });
});
