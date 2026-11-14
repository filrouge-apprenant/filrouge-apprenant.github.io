// =============================================================================
// CRM DP Abdel — fonction serveur « abdel-recherche »
// =============================================================================
// Interroge, pour le CRM uniquement, deux sources publiques et gratuites :
//   - l'API Recherche d'entreprises de l'État (recherche-entreprises.api.gouv.fr)
//   - l'open data du BOAMP (avis de marchés publics, DILA)
// Pourquoi côté serveur : la page n'a le droit de parler qu'à Supabase (sécurité).
// Accès : uniquement un compte membre du CRM, connecté avec double authentification
// (vérifié en lisant abdel_parametres avec les droits de la personne connectée).
// =============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const API_ENTREPRISES = "https://recherche-entreprises.api.gouv.fr";
const API_BOAMP = "https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function lire(url: string, delaiMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), delaiMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("La source a répondu " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const nafOk = (s: string) => /^\d{2}\.\d{2}[A-Z]$/.test(s);
const cpOk = (s: string) => /^\d{5}$/.test(s);
const trancheOk = (s: string) => /^\d{2}$/.test(s);

function etablissement(e: any) {
  if (!e) return null;
  return {
    siret: e.siret, adresse: e.adresse, cp: e.code_postal, ville: e.libelle_commune,
    naf: e.activite_principale, effectif: e.tranche_effectif_salarie, siege: !!e.est_siege,
    enseigne: (e.liste_enseignes || [])[0] || e.nom_commercial || null, ouvert: e.etat_administratif === "A",
  };
}

function compacte(r: any) {
  const dirigeants = (r.dirigeants || [])
    .filter((d: any) => d.type_dirigeant === "personne physique")
    .slice(0, 3)
    .map((d: any) => `${(d.prenoms || "").split(" ")[0]} ${d.nom || ""}`.trim() + (d.qualite ? ` (${d.qualite})` : ""));
  const etabs = (r.matching_etablissements || []).filter((e: any) => e.etat_administratif === "A").map(etablissement);
  return {
    siren: r.siren, nom: r.nom_complet, naf: r.activite_principale, categorie: r.categorie_entreprise,
    effectif: r.tranche_effectif_salarie, opposition: !!r.opposition_diffusion_commerciale,
    nbEtabOuverts: r.nombre_etablissements_ouverts, dirigeants,
    siege: etablissement(r.siege), etablissements: etabs.slice(0, 5), creation: r.date_creation,
  };
}

async function entreprises(b: any) {
  const p = new URLSearchParams();
  const naf = (Array.isArray(b.naf) ? b.naf : []).filter(nafOk).slice(0, 15);
  if (naf.length) p.set("activite_principale", naf.join(","));
  if (typeof b.section === "string" && /^[A-U]$/.test(b.section)) p.set("section_activite_principale", b.section);
  const tranches = (Array.isArray(b.tranches) ? b.tranches : []).filter(trancheOk).slice(0, 15);
  if (tranches.length) p.set("tranche_effectif_salarie", tranches.join(","));
  p.set("etat_administratif", "A");
  p.set("per_page", "25");
  p.set("page", String(Math.min(Math.max(parseInt(b.page) || 1, 1), 20)));
  let url: string;
  if (typeof b.lat === "number" && typeof b.long === "number") {
    p.set("lat", String(b.lat)); p.set("long", String(b.long));
    p.set("radius", String(Math.min(Math.max(Number(b.radius) || 5, 0.5), 50)));
    url = `${API_ENTREPRISES}/near_point?${p}`;
  } else {
    if (typeof b.q === "string" && b.q.trim()) p.set("q", b.q.trim().slice(0, 100));
    const cps = (Array.isArray(b.cp) ? b.cp : []).filter(cpOk).slice(0, 40);
    if (cps.length) p.set("code_postal", cps.join(","));
    else p.set("departement", "33");
    url = `${API_ENTREPRISES}/search?${p}`;
  }
  const d = await lire(url, 15000);
  return { total: d.total_results ?? null, page: d.page ?? 1, pages: d.total_pages ?? 1, resultats: (d.results || []).map(compacte) };
}

const MOTS_SECU = /(gardiennage|surveillance humaine|agents? de s[ée]curit[ée]|s[ée]curit[ée] (priv[ée]e|incendie|des sites|des b[âa]timents|[ée]v[ée]nementielle)|ssiap|rondes?|t[ée]l[ée]surveillance|accueil et s[ée]curit[ée]|pr[ée]vention et s[ée]curit[ée])/i;
const MOTS_NET = /(nettoyage|propret[ée]|entretien (m[ée]nager|des locaux|courant)|m[ée]nage|vitrerie|hygi[èe]ne des locaux)/i;

async function boamp(b: any) {
  const jours = Math.min(Math.max(parseInt(b.jours) || 30, 7), 90);
  const depuis = new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
  const trouves: any[] = [];
  for (let page = 0; page < 6; page++) {
    const p = new URLSearchParams({
      limit: "100", offset: String(page * 100), order_by: "dateparution desc",
      select: "idweb,objet,nomacheteur,dateparution,datelimitereponse,descripteur_libelle,nature_libelle,type_marche",
      refine: 'code_departement:"33"',
    });
    const d = await lire(`${API_BOAMP}?${p}`, 55000);
    const res = d.results || [];
    for (const r of res) {
      const texte = `${r.objet || ""} ${(r.descripteur_libelle || []).join(" ")}`;
      const secu = MOTS_SECU.test(texte), net = MOTS_NET.test(texte);
      if (!secu && !net) continue;
      trouves.push({
        idweb: r.idweb, objet: r.objet, acheteur: r.nomacheteur, parution: r.dateparution,
        dateLimite: r.datelimitereponse ? String(r.datelimitereponse).slice(0, 10) : null,
        nature: r.nature_libelle, type: secu && net ? "both" : secu ? "secu" : "net",
        lien: `https://www.boamp.fr/pages/avis/?q=idweb:${encodeURIComponent(r.idweb)}`,
      });
    }
    const dernier = res[res.length - 1];
    if (!res.length || (dernier && dernier.dateparution < depuis)) break;
  }
  return { depuis, resultats: trouves.filter((x) => x.parution >= depuis) };
}

// ---------------------------------------------------------------------------
// Réécriture d'un e-mail par une IA (Mistral, formule gratuite « Experiment »).
// La clé MISTRAL_API_KEY est un secret de fonction (jamais dans le code du site).
// Le nom de la personne n'est jamais envoyé : la page le remplace par {{CONTACT}}.
// ---------------------------------------------------------------------------
async function redaction(b: any) {
  const cle = (Deno.env.get("MISTRAL_API_KEY") || "").trim();
  if (!cle) throw new Error("L'IA n'est pas encore activée : il manque une clé Mistral gratuite. Le texte préparé reste utilisable tel quel.");
  const texte = String(b.texte || "").slice(0, 4000), objet = String(b.objet || "").slice(0, 200);
  if (!texte) throw new Error("Rien à réécrire.");
  const consigne = `Tu réécris un e-mail de prospection B2B en français pour Abdel, entreprise de ${String(b.activite || "sécurité privée et propreté").slice(0, 60)} sur Bordeaux Métropole (secteur du prospect : ${String(b.secteur || "non précisé").slice(0, 60)}).
Règles : ton professionnel, chaleureux et naturel, phrases courtes, 120 mots maximum hors signature ; garde EXACTEMENT les faits, dates, noms et la signature ; n'invente aucun prix, aucun délai, aucune garantie, aucune certification ni capacité ; aucun crochet ni champ à remplir ; garde le repère {{CONTACT}} tel quel s'il est présent ; garde la phrase de désinscription si elle existe.
Réponds uniquement en JSON : {"objet": "...", "texte": "..."}.`;
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("MISTRAL_MODEL") || "mistral-small-latest", temperature: 0.4, response_format: { type: "json_object" },
      messages: [{ role: "system", content: consigne }, { role: "user", content: `Objet : ${objet}\n\n${texte}` }],
    }),
  });
  if (r.status === 429) throw new Error("L'IA gratuite est très demandée en ce moment : réessaie dans une minute.");
  if (!r.ok) throw new Error("L'IA n'a pas répondu (" + r.status + "). Le texte préparé reste utilisable tel quel.");
  const d = await r.json();
  let sortie: any = {};
  try { sortie = JSON.parse(d.choices?.[0]?.message?.content || "{}"); } catch { throw new Error("Réponse de l'IA illisible : réessaie."); }
  return { objet: String(sortie.objet || objet).slice(0, 200), texte: String(sortie.texte || "").slice(0, 5000) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "Méthode non autorisée" }, 405);
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data, error } = await sb.from("abdel_parametres").select("id").limit(1);
  if (error || !data || !data.length) return json({ erreur: "Accès refusé" }, 403);
  let b: any;
  try { b = await req.json(); } catch { return json({ erreur: "Demande illisible" }, 400); }
  try {
    if (b.action === "entreprises") return json(await entreprises(b));
    if (b.action === "boamp") return json(await boamp(b));
    if (b.action === "redaction") return json(await redaction(b));
    return json({ erreur: "Action inconnue" }, 400);
  } catch (e) {
    const lent = e instanceof DOMException && e.name === "AbortError";
    return json({ erreur: lent ? "La source publique met trop de temps à répondre. Réessaie dans quelques minutes." : String((e as Error).message || e) }, 502);
  }
});
