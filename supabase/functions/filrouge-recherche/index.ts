// =============================================================================
// Fil Rouge Apprenants — fonction serveur « filrouge-recherche »
// =============================================================================
// Recherche de centres de formation à démarcher, à partir de l'API publique et
// gratuite « Recherche d'entreprises » de l'État (données SIRENE, RNE et liste
// publique des organismes de formation : déclaration d'activité, Qualiopi).
// Pourquoi côté serveur : la page n'a le droit de parler qu'à Supabase.
// Accès : uniquement l'administratrice connectée avec la double authentification
// (vérifié par la fonction je_suis_admin(), avec SON jeton).
// =============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const API = "https://recherche-entreprises.api.gouv.fr/search";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Formation continue d'adultes, autres enseignements, enseignement à distance inclus.
const NAF_DEFAUT = ["85.59A", "85.59B"];
const nafOk = (s: string) => /^\d{2}\.\d{2}[A-Z]$/.test(s);
const trancheOk = (s: string) => /^\d{2}$/.test(s);
const regionOk = (s: string) => /^\d{2}$/.test(s);

function compacte(r: any) {
  const c = r.complements || {};
  const fin = r.finances || {};
  const annee = Object.keys(fin).sort().pop();
  return {
    siren: r.siren,
    nom: r.nom_complet,
    naf: r.activite_principale,
    effectif: r.tranche_effectif_salarie,
    categorie: r.categorie_entreprise,
    creation: r.date_creation,
    etablissements: r.nombre_etablissements_ouverts,
    ville: r.siege?.libelle_commune || null,
    cp: r.siege?.code_postal || null,
    qualiopi: !!c.est_qualiopi,
    organismeFormation: !!c.est_organisme_formation,
    nda: (c.liste_id_organisme_formation || [])[0] || null,
    ca: annee && fin[annee] && typeof fin[annee].ca === "number" ? { annee, montant: fin[annee].ca } : null,
    opposition: !!r.opposition_diffusion_commerciale,
    dirigeants: (r.dirigeants || [])
      .filter((d: any) => d.type_dirigeant === "personne physique" && !/commissaire/i.test(d.qualite || ""))
      .slice(0, 3)
      .map((d: any) => `${(d.prenoms || "").split(" ")[0]} ${d.nom || ""}`.trim() + (d.qualite ? ` (${d.qualite})` : "")),
  };
}

async function organismes(b: any) {
  const p = new URLSearchParams();
  p.set("est_organisme_formation", "true");
  if (b.qualiopi !== false) p.set("est_qualiopi", "true");
  const naf = (Array.isArray(b.naf) && b.naf.length ? b.naf : NAF_DEFAUT).filter(nafOk).slice(0, 10);
  if (naf.length) p.set("activite_principale", naf.join(","));
  const tranches = (Array.isArray(b.tranches) ? b.tranches : []).filter(trancheOk).slice(0, 15);
  if (tranches.length) p.set("tranche_effectif_salarie", tranches.join(","));
  if (typeof b.region === "string" && regionOk(b.region)) p.set("region", b.region);
  if (typeof b.q === "string" && b.q.trim()) p.set("q", b.q.trim().slice(0, 100));
  p.set("etat_administratif", "A");
  p.set("per_page", "25");
  p.set("page", String(Math.min(Math.max(parseInt(b.page) || 1, 1), 40)));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${API}?${p}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (r.status === 429) throw new Error("La source publique limite le nombre de recherches : réessaie dans une minute.");
    if (!r.ok) throw new Error("La source publique a répondu " + r.status + ".");
    const d = await r.json();
    return { total: d.total_results ?? 0, page: d.page ?? 1, pages: d.total_pages ?? 1, resultats: (d.results || []).map(compacte) };
  } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "Méthode non autorisée." }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: estAdmin, error } = await sb.rpc("je_suis_admin");
  if (error || estAdmin !== true) return json({ erreur: "Recherche réservée à l'administratrice connectée avec la double authentification." }, 403);
  let b: any;
  try { b = await req.json(); } catch { return json({ erreur: "Demande illisible." }, 400); }
  try {
    if (b.action === "organismes") return json(await organismes(b));
    return json({ erreur: "Action inconnue." }, 400);
  } catch (e) {
    const lent = e instanceof DOMException && e.name === "AbortError";
    return json({ erreur: lent ? "La source publique met trop de temps à répondre. Réessaie dans quelques minutes." : String((e as Error).message || e) }, 502);
  }
});
