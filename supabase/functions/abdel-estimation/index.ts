// =============================================================================
// Abdel — fonction serveur « abdel-estimation » (PUBLIQUE, sans connexion)
// =============================================================================
// Sert les simulateurs publics du site (app/abdel/) :
//   { action: "infos" }    -> infos publiques (noms des sociétés, n° CNAPS, tarifs publiés)
//   { action: "demande", activite: "secu"|"net", ... } -> crée la fiche dans le CRM Abdel
//                                                         + prévient Émilie par e-mail (Brevo)
//
// Sécurité :
//   1. Aucune donnée du CRM n'est jamais renvoyée : seulement les infos publiques
//      choisies dans les Paramètres (noms, n° CNAPS, tarifs que l'on a décidé d'afficher).
//   2. La fonction ne peut que CRÉER une fiche (ou ajouter une note à la fiche de la
//      même entreprise), jamais lire, modifier ou supprimer autre chose.
//   3. Verrou CNAPS : aucune demande « sécurité » n'est acceptée tant que le numéro
//      d'autorisation d'exercice n'est pas renseigné (art. L612-14 du CSI).
//   4. Anti-abus : champ piège invisible, longueurs limitées, origine contrôlée,
//      plafond de 30 demandes par heure, une même adresse ou un même numéro
//      ne crée qu'une fiche par 24 h.
//   5. La clé de service Supabase et la clé Brevo restent ici, jamais dans le site.
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES = ["https://filrouge-apprenant.github.io"];
const SOURCE = "Simulateur du site";
const NOTIF = Deno.env.get("ABDEL_EMAIL_NOTIF") || Deno.env.get("EMAIL_ADMIN") || "emilie.rachas@gmail.com";
const BOITE = Deno.env.get("EMAIL_FIL_ROUGE") || "contact.filrouge.apprenant@gmail.com";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function entetes(o: string | null) {
  return {
    "Access-Control-Allow-Origin": o && (ORIGINES.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) ? o : ORIGINES[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
}
const rep = (o: string | null, s: number, c: Record<string, unknown>) => new Response(JSON.stringify(c), { status: s, headers: entetes(o) });
const txt = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const nombre = (v: unknown, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : 0; };
const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const telNorm = (t: string) => t.replace(/[^\d+]/g, "").replace(/^\+33/, "0");
// Ne garde de l'estimation que des nombres, des booléens et des petits textes (jamais d'objet imbriqué).
function nettoyerEstimation(e: unknown) {
  const out: Record<string, unknown> = {};
  if (!e || typeof e !== "object") return out;
  for (const [k, v] of Object.entries(e as Record<string, unknown>).slice(0, 30)) {
    if (!/^[a-zA-Z]{1,30}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = txt(v, 80);
  }
  return out;
}
const uid = () => "site_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "_" + crypto.randomUUID().slice(0, 8);

function cleBrevo(): string {
  for (const nom of ["BREVO_API_KEY", "brevo_api_key"]) { const v = (Deno.env.get(nom) || "").trim(); if (v) return v; }
  for (const v of Object.values(Deno.env.toObject())) if (String(v).trim().startsWith("xkeysib-")) return String(v).trim();
  return "";
}

async function parametres(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.from("abdel_parametres").select("data").eq("id", "main").maybeSingle();
  return (data?.data || {}) as Record<string, any>;
}

// SIREN = 9 premiers chiffres du SIRET saisi dans les Paramètres.
const siren = (v: unknown) => { const c = String(v ?? "").replace(/\D/g, ""); return c.length >= 9 ? c.slice(0, 9).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") : ""; };

function infosPubliques(p: Record<string, any>) {
  const cnaps = txt(p.cnaps, 80);
  const societeSecu = txt(p.companySecu, 120);
  return {
    securite: {
      actif: !!(cnaps && societeSecu),
      societe: societeSecu, cnaps, siren: siren(p.sirenSecu || p.secuSiret),
      tarif: p.publierTarifSecu ? nombre(p.rateSecu, 0, 200) || null : null,
    },
    nettoyage: {
      actif: true,
      societe: txt(p.companyNet, 120) || "Abdel", siren: siren(p.sirenNet || p.netSiret),
      tarifClient: p.publierTarifNet === false ? null : nombre(p.rateNetClient, 0, 200) || null,
      tarifProduits: p.publierTarifNet === false ? null : nombre(p.rateNetProduits, 0, 200) || null,
    },
    contact: { ville: txt(p.villePublique, 80) || "Bordeaux Métropole", email: txt(p.emailPublic, 120), telephone: txt(p.telPublic, 25) },
    responsable: txt(p.responsablePublication, 120),
    adresse: txt(p.adresseSiege || p.netAdresse, 200),
  };
}

async function notifier(sujet: string, lignes: string[]) {
  const cle = cleBrevo();
  if (!cle) return false;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#10151f;max-width:560px;margin:0 auto;border-top:2px solid #e39b2d;padding-top:16px;">
    ${lignes.map((l) => `<p style="margin:0 0 10px;">${echapper(l)}</p>`).join("")}
    <p style="margin:18px 0 0;"><a href="https://filrouge-apprenant.github.io/dp-abdel/#/" style="color:#15365c;">Ouvrir le CRM Abdel</a></p></div>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "CRM Abdel", email: Deno.env.get("EMAIL_EXPEDITEUR") || BOITE },
      to: [{ email: NOTIF }], subject: sujet, htmlContent: html, textContent: lignes.join("\n"), tags: ["abdel-site"],
    }),
  });
  if (!r.ok) console.error("Brevo :", r.status, await r.text().catch(() => ""));
  return r.ok;
}

Deno.serve(async (req: Request) => {
  const o = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(o) });
  if (req.method !== "POST") return rep(o, 405, { erreur: "Méthode non autorisée." });
  let d: Record<string, any>;
  try { d = await req.json(); } catch { return rep(o, 400, { erreur: "Demande illisible." }); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const p = await parametres(admin);
  const infos = infosPubliques(p);
  if (d.action === "infos") return rep(o, 200, infos);
  if (d.action !== "demande") return rep(o, 400, { erreur: "Action inconnue." });

  // Origine : seules les pages du site peuvent déposer une demande.
  if (o && !ORIGINES.includes(o) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return rep(o, 403, { erreur: "Origine non autorisée." });
  // Champ piège rempli = robot : on répond « merci » sans rien enregistrer.
  if (txt(d.site_web, 200)) return rep(o, 200, { ok: true });

  const act = d.activite === "secu" ? "secu" : "net";
  if (act === "secu" && !infos.securite.actif) return rep(o, 403, { erreur: "Le service sécurité n'est pas encore ouvert aux demandes en ligne." });

  const entreprise = txt(d.entreprise, 120), nom = txt(d.nom, 80), fonction = txt(d.fonction, 80);
  const telephone = txt(d.telephone, 25), email = txt(d.email, 120).toLowerCase(), commune = txt(d.commune, 60);
  const message = txt(d.message, 1200), resume = txt(d.resume, 600);
  if (!entreprise || !nom) return rep(o, 400, { erreur: "Merci d'indiquer votre entreprise et votre nom." });
  if (!telephone && !email) return rep(o, 400, { erreur: "Merci d'indiquer un téléphone ou une adresse e-mail." });
  if (telephone && telNorm(telephone).replace(/\D/g, "").length < 9) return rep(o, 400, { erreur: "Le numéro de téléphone semble incomplet." });
  if (email && !EMAIL.test(email)) return rep(o, 400, { erreur: "L'adresse e-mail semble incorrecte." });
  if (d.consentement !== true) return rep(o, 400, { erreur: "Merci de cocher la case d'accord pour être recontacté." });

  // Plafond global anti-abus.
  const ilYaUneHeure = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("abdel_prospects").select("id", { count: "exact", head: true }).eq("data->>source", SOURCE).gte("cree_le", ilYaUneHeure);
  if ((count ?? 0) >= 30) return rep(o, 429, { erreur: "Trop de demandes en ce moment. Merci de réessayer dans une heure." });

  const maintenant = new Date().toISOString(), jour = maintenant.slice(0, 10);
  const heuresMois = nombre(d.heuresMois, 0, 20000);
  const contact = `${nom}${fonction ? " — " + fonction : ""} (demande via le site, ${jour.split("-").reverse().join("/")})`;
  const besoin = `Demande d'estimation ${act === "secu" ? "sécurité" : "nettoyage"} reçue via le site le ${jour.split("-").reverse().join("/")} : ${resume || "voir notes"}`;
  const noteSignal = `Nouveau signal : demande entrante via le simulateur ${act === "secu" ? "sécurité" : "nettoyage"} du site (${nom}${fonction ? ", " + fonction : ""}). ${resume}`.slice(0, 900);

  // Même entreprise déjà connue (même e-mail ou même téléphone) : on ajoute une note au lieu de créer un doublon.
  const filtres: string[] = [];
  if (email) filtres.push(`data->>email.eq."${email.replace(/"/g, "")}"`);
  if (telephone) filtres.push(`data->>phone.eq."${telephone.replace(/"/g, "")}"`);
  const { data: existants } = await admin.from("abdel_prospects").select("id, data").or(filtres.join(",")).limit(1);
  const existant = existants && existants[0];
  if (existant) {
    const ex = existant.data as Record<string, any>;
    const derniere = [...(ex.history || [])].reverse().find((h: any) => /simulateur/i.test(h.text || ""));
    if (derniere && (Date.now() - new Date(derniere.ts).getTime()) < 86400_000) return rep(o, 200, { ok: true });
    const maj = {
      ...ex,
      [act === "secu" ? "secu" : "net"]: true,
      notes: `${ex.notes || ""}\n\n[Site ${jour.split("-").reverse().join("/")}] ${besoin}${message ? `\nMessage : ${message}` : ""}`.trim(),
      history: [...(ex.history || []), { ts: maintenant, type: "note", text: noteSignal }],
      nextDate: jour, nextAction: "Rappeler : nouvelle demande via le site (sous 24 h ouvrées)", updatedAt: maintenant,
    };
    await admin.from("abdel_prospects").update({ data: maj, modifie_le: maintenant }).eq("id", existant.id);
  } else {
    const fiche = {
      name: entreprise, siren: "", siret: "", address: "", cp: "", city: commune, website: "", sector: "", size: "",
      secu: act === "secu", net: act === "net", netProduits: d.produits === "abdel",
      contacts: { dirigeant: "", securite: "", achats: "", sg: "", site: contact },
      phone: telephone, email, linkedin: "", source: SOURCE, discoveredAt: jour, need: besoin,
      hoursSecu: act === "secu" && heuresMois ? Math.round(heuresMois) : "", hoursNet: act === "net" && heuresMois ? Math.round(heuresMois) : "",
      notes: `[Site ${jour.split("-").reverse().join("/")}] Demande entrante : ${nom}${fonction ? ", " + fonction : ""}.\nEstimation faite par le prospect : ${resume}${message ? `\nMessage : ${message}` : ""}\nConsentement à être recontacté : oui (case cochée sur le site).`,
      status: "besoin", reached: ["identifie", "besoin"],
      criteria: { besoin: { on: true, proof: `Demande d'estimation via le site, ${jour}` }, recherche: { on: true, proof: `Le prospect a rempli le formulaire du site le ${jour}` } },
      nextAction: "Rappeler sous 24 h ouvrées (demande entrante du site)", nextDate: jour, rdvDate: "", lastCallDate: "", callCount: 0, optOut: false,
      history: [{ ts: maintenant, type: "create" }, { ts: maintenant, type: "note", text: noteSignal }],
      estimation: nettoyerEstimation(d.estimation),
      createdAt: maintenant, updatedAt: maintenant,
    };
    const { error } = await admin.from("abdel_prospects").insert({ id: uid(), data: fiche, cree_le: maintenant, modifie_le: maintenant });
    if (error) { console.error(error); return rep(o, 500, { erreur: "La demande n'a pas pu être enregistrée. Merci de réessayer." }); }
  }

  await notifier(`🔥 Nouvelle demande ${act === "secu" ? "sécurité" : "nettoyage"} : ${entreprise}`, [
    `${entreprise}${commune ? " (" + commune + ")" : ""} vient de faire une estimation sur le site.`,
    `Contact : ${nom}${fonction ? ", " + fonction : ""}`, `Téléphone : ${telephone || "—"} · E-mail : ${email || "—"}`,
    `Estimation : ${resume || "—"}`, message ? `Message : ${message}` : "",
    "À rappeler sous 24 h ouvrées : la fiche est en tête des signaux chauds du CRM.",
  ].filter(Boolean)).catch(() => false);

  return rep(o, 200, { ok: true });
});
