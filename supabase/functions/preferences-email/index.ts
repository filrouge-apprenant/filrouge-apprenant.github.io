// =============================================================================
// Fil Rouge Apprenants — fonction PUBLIQUE « preferences-email » (19/11/2026)
// =============================================================================
// Page « Vos préférences » (preferences-email.html?t=jeton) : un centre accepte
// ou refuse que Fil Rouge sache quand il ouvre ses emails (recommandation CNIL
// du 12 mars 2026 : consentement libre, par une action positive ; refuser aussi
// simple qu'accepter ; retrait à tout moment ; preuve conservée).
// Sans connexion (verify_jwt = false) : le seul accès est le jeton aléatoire
// propre à chaque centre (UUID non devinable). Ne renvoie que le nom du centre
// et le choix en cours, rien d'autre.
//   { action: "lire", jeton }               -> { organisme, choix: true|false|null }
//   { action: "choisir", jeton, choix }     -> { ok, choix }
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
const reponse = (origine: string | null, statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: entetes(origine) });

Deno.serve(async (req: Request) => {
  const origine = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(origine) });
  if (req.method !== "POST") return reponse(origine, 405, { erreur: "Méthode non autorisée." });
  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return reponse(origine, 400, { erreur: "Demande illisible." }); }

  const jeton = String(d.jeton || "");
  if (!UUID.test(jeton)) return reponse(origine, 404, { erreur: "Lien inconnu." });
  const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: suivi } = await base.from("organismes_suivi_commercial")
    .select("organisme_id, suivi_ouverture, organismes(nom)").eq("jeton_preferences", jeton).maybeSingle();
  if (!suivi) return reponse(origine, 404, { erreur: "Lien inconnu ou expiré." });
  // deno-lint-ignore no-explicit-any
  const nom = String((suivi as any).organismes?.nom || "");

  if (d.action === "lire") return reponse(origine, 200, { organisme: nom, choix: suivi.suivi_ouverture });
  if (d.action === "choisir") {
    if (typeof d.choix !== "boolean") return reponse(origine, 400, { erreur: "Choix manquant." });
    const { error } = await base.from("organismes_suivi_commercial").update({
      suivi_ouverture: d.choix, suivi_ouverture_le: new Date().toISOString(), suivi_ouverture_source: "page preferences-email (lien dans un email)",
    }).eq("jeton_preferences", jeton);
    if (error) { console.error(error); return reponse(origine, 500, { erreur: "Enregistrement impossible. Réessayez." }); }
    await base.from("echanges_commerciaux").insert({
      organisme_id: suivi.organisme_id, date_echange: new Date().toISOString().slice(0, 10), canal: "email",
      resume: d.choix ? "Le centre accepte le suivi d'ouverture de nos emails (page de préférences)." : "Le centre refuse le suivi d'ouverture de nos emails (page de préférences).",
    });
    return reponse(origine, 200, { ok: true, choix: d.choix });
  }
  return reponse(origine, 400, { erreur: "Action inconnue." });
});
