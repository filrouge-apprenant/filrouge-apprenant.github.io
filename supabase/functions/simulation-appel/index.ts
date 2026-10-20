// =============================================================================
// Fil Rouge Apprenants — fonction serveur « simulation-appel »
// =============================================================================
// Entraînement des appelantes : l'IA joue un apprenant FICTIF au téléphone,
// puis évalue l'appel selon la grille Fil Rouge.
//
// IA utilisée (choisie selon le secret présent dans Supabase) :
//   - MISTRAL_API_KEY   -> Mistral, formule gratuite « Experiment » (par défaut)
//   - ANTHROPIC_API_KEY -> Claude (payant), seulement si Mistral n'est pas configuré
// Seules des données fictives sont envoyées : jamais un vrai apprenant.
//
// Sécurité :
//   1. Supabase refuse tout appel sans jeton de connexion (verify_jwt).
//   2. La base dit si la personne peut s'entraîner (je_peux_m_entrainer :
//      administratrice avec double authentification, ou appelante active).
//   3. La clé de l'IA (secret Supabase) reste ici, jamais dans le site.
//   4. Seule cette fonction écrit les sessions : une appelante ne peut pas
//      modifier sa transcription ni sa note.
//   5. Garde-fous d'usage : 25 appels d'entraînement par jour et par personne,
//      40 répliques par appel, 600 caractères par réplique.
//
// Appels (POST, JSON) :
//   { action: "demarrer", scenario_id, mode: "voix" | "ecrit" } -> { session_id, reponse }
//   { action: "repondre", session_id, texte }                  -> { reponse, raccroche }
//   { action: "terminer", session_id, duree_secondes }         -> { note_sur_20, evaluation }
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES_AUTORISEES = ["https://filrouge-apprenant.github.io"];
const MODELE_MISTRAL = Deno.env.get("MISTRAL_MODEL") ?? "mistral-small-latest";
const MODELE_CLAUDE = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5";
const MAX_APPELS_PAR_JOUR = 25;
const MAX_REPLIQUES = 40;
const MAX_CARACTERES = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIN_APPEL = "[RACCROCHE]";

type Replique = { qui: "appelante" | "apprenant"; texte: string };
type Message = { role: "user" | "assistant"; content: string };

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

// -----------------------------------------------------------------------------
// La grille d'évaluation Fil Rouge (chaque critère noté de 0 à 5, total /30 -> /20)
// -----------------------------------------------------------------------------
const GRILLE = [
  { cle: "accueil", nom: "Accueil et présentation", attendu: "Se présente (prénom, Fil Rouge Apprenants, de la part de l'organisme), vérifie qu'elle parle à la bonne personne et que c'est un bon moment, annonce le motif de l'appel." },
  { cle: "progression", nom: "Point sur la progression", attendu: "Fait le point sur l'avancement en s'appuyant sur la fiche, avec des questions ouvertes plutôt que fermées." },
  { cle: "ecoute", nom: "Écoute et empathie", attendu: "Laisse parler, reformule, ne juge pas, ne minimise pas, s'adapte à l'émotion et au rythme de l'apprenant." },
  { cle: "frein", nom: "Découverte du vrai frein", attendu: "Creuse au-delà des réponses vagues pour comprendre ce qui bloque vraiment." },
  { cle: "solution", nom: "Solutions concrètes", attendu: "Propose des solutions adaptées et réalistes (étapes de l'examen, CPF, stage, technique, contact formateur…), explique simplement." },
  { cle: "conclusion", nom: "Objectif et conclusion", attendu: "Fixe un objectif précis, réaliste et daté, récapitule, annonce le prochain appel, termine sur une note positive." },
];

// -----------------------------------------------------------------------------
// Appel à l'IA : renvoie le texte produit. json = true : réponse en JSON.
// -----------------------------------------------------------------------------
async function appelerIA(systeme: string, messages: Message[], maxTokens: number, json = false): Promise<string> {
  const cleMistral = Deno.env.get("MISTRAL_API_KEY");
  const cleClaude = Deno.env.get("ANTHROPIC_API_KEY");
  if (!cleMistral && !cleClaude) throw new Error("CLE_ABSENTE");

  let r: Response;
  if (cleMistral) {
    r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cleMistral}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        model: MODELE_MISTRAL,
        max_tokens: maxTokens,
        temperature: json ? 0.2 : 0.8,
        messages: [{ role: "system", content: systeme }, ...messages],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } else {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": cleClaude!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELE_CLAUDE, max_tokens: maxTokens, system: systeme, messages }),
    });
  }
  if (!r.ok) {
    console.error("Erreur IA", r.status, await r.text());
    if (r.status === 401 || r.status === 403) throw new Error("CLE_INVALIDE");
    if (r.status === 429) throw new Error("IA_SATUREE");
    throw new Error("IA_INDISPONIBLE");
  }
  const d = await r.json();
  if (cleMistral) {
    const c = d.choices?.[0]?.message?.content;
    return (Array.isArray(c) ? c.map((x: { text?: string }) => x.text ?? "").join("") : String(c ?? "")).trim();
  }
  return (d.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text?: string }) => b.text ?? "").join(" ").trim();
}

// Lit le premier objet JSON d'une réponse (même entouré de texte).
function lireJson(texte: string): Record<string, unknown> {
  try { return JSON.parse(texte); } catch { /* on cherche l'objet dans le texte */ }
  const a = texte.indexOf("{"), b = texte.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(texte.slice(a, b + 1)); } catch { /* illisible */ }
  }
  return {};
}

// Garde seulement les paroles : sans balise de fin, didascalies, astérisques ni « Sarah : ».
function nettoyer(texte: string) {
  return texte
    .replace(FIN_APPEL, "")
    .replace(/\*[^*]*\*/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/^\s*(apprenant|apprenante|[A-ZÀ-Ý][a-zà-ÿ]+(\s[A-ZÀ-Ý][a-zà-ÿ]+)?)\s*:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function consignePersonnage(scenario: Record<string, unknown>, personnage: string) {
  return `Tu participes à un entraînement téléphonique. Tu joues un apprenant fictif en formation à distance, qui reçoit un appel de suivi de la part de « Fil Rouge Apprenants », un service mandaté par son organisme de formation. La personne qui t'appelle est une appelante en formation : ton rôle est de lui faire vivre un appel réaliste.

Ta fiche :
- Nom : ${scenario.apprenant_nom}
- Formation : ${scenario.formation}
- Financement : ${scenario.financement ?? "non précisé"}
- Progression sur la plateforme : ${scenario.progression ?? "?"} %
- Dernière connexion : ${scenario.derniere_connexion ?? "non précisée"}

Ton personnage :
${personnage}

Règles du jeu :
- Tu parles comme au téléphone, en français oral naturel : 1 à 3 phrases courtes par réplique, avec des hésitations si ça colle au personnage (« euh », « bah »…).
- Écris uniquement les paroles prononcées : jamais de didascalie, d'astérisque, d'emoji, de description entre parenthèses, ni ton nom devant ta réplique (le texte est lu à voix haute).
- Ne dis jamais que tu es une IA, ne sors jamais du rôle, ne donne jamais de conseil à l'appelante.
- Ne révèle pas ton vrai frein trop tôt : il faut que l'appelante le mérite par ses questions et son écoute.
- Reste cohérent avec ce que tu as déjà dit.
- Si l'appelante dit quelque chose d'incompréhensible (erreur de dictée), demande-lui de répéter comme le ferait quelqu'un au téléphone.
- Quand l'appel se termine (au revoir échangé), ou si ton personnage raccroche, dis ta dernière phrase puis ajoute exactement ${FIN_APPEL} à la fin.`;
}

function versMessages(transcription: Replique[]): Message[] {
  // L'appelante = « user », l'apprenant joué par l'IA = « assistant ».
  // On ouvre par le décroché, pour que la conversation commence par « user ».
  const messages: Message[] = [{ role: "user", content: "(Ton téléphone sonne. Tu décroches.)" }];
  for (const r of transcription) {
    const role = r.qui === "appelante" ? "user" : "assistant";
    const dernier = messages[messages.length - 1];
    if (dernier.role === role) dernier.content += `\n${r.texte}`;
    else messages.push({ role, content: r.texte });
  }
  return messages;
}

// -----------------------------------------------------------------------------
// Serveur
// -----------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const origine = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: entetes(origine) });
  if (req.method !== "POST") return reponse(origine, 405, { erreur: "Méthode non autorisée." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const jeton = req.headers.get("Authorization") ?? "";

  // 1. Qui appelle ? (avec SON jeton : les règles de la base s'appliquent)
  const appelant = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: jeton } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: autorise }, { data: utilisateur }] = await Promise.all([
    appelant.rpc("je_peux_m_entrainer"),
    appelant.auth.getUser(jeton.replace(/^Bearer\s+/i, "")),
  ]);
  const moi = utilisateur?.user?.id;
  if (autorise !== true || !moi) {
    return reponse(origine, 403, { erreur: "L'entraînement est réservé aux appelantes et à l'administratrice connectées." });
  }

  // 2. Accès complet pour écrire les sessions (clé de service, jamais envoyée au site)
  const base = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let demande: Record<string, unknown>;
  try {
    demande = await req.json();
  } catch {
    return reponse(origine, 400, { erreur: "Demande illisible." });
  }

  try {
    // ---------------------------------------------------------------- démarrer
    if (demande.action === "demarrer") {
      const scenarioId = String(demande.scenario_id ?? "");
      if (!UUID.test(scenarioId)) return reponse(origine, 400, { erreur: "Scénario inconnu." });
      const mode = demande.mode === "ecrit" ? "ecrit" : "voix";

      const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await base.from("entrainement_sessions").select("id", { count: "exact", head: true })
        .eq("appelante_id", moi).gte("debut", depuis);
      if ((count ?? 0) >= MAX_APPELS_PAR_JOUR) {
        return reponse(origine, 429, { erreur: `Limite de ${MAX_APPELS_PAR_JOUR} appels d'entraînement par jour atteinte. Reprenez demain !` });
      }

      const { data: scenario } = await base.from("entrainement_scenarios").select("*").eq("id", scenarioId).eq("actif", true).maybeSingle();
      const { data: persona } = await base.from("entrainement_personas").select("personnage").eq("scenario_id", scenarioId).maybeSingle();
      if (!scenario || !persona) return reponse(origine, 404, { erreur: "Ce scénario n'est pas disponible." });

      // Le décroché : l'IA répond comme le personnage décroche
      const decroche = await appelerIA(consignePersonnage(scenario, persona.personnage), versMessages([]), 120);
      const premier = nettoyer(decroche) || "Allô ?";

      const { data: session, error } = await base.from("entrainement_sessions").insert({
        appelante_id: moi, scenario_id: scenarioId, scenario_titre: scenario.titre, mode,
        transcription: [{ qui: "apprenant", texte: premier }],
      }).select("id").single();
      if (error) throw error;
      return reponse(origine, 200, { session_id: session.id, reponse: premier });
    }

    // Les deux actions suivantes portent sur une session de la personne connectée
    const sessionId = String(demande.session_id ?? "");
    if (!UUID.test(sessionId)) return reponse(origine, 400, { erreur: "Appel inconnu." });
    const { data: session } = await base.from("entrainement_sessions").select("*").eq("id", sessionId).eq("appelante_id", moi).maybeSingle();
    if (!session) return reponse(origine, 404, { erreur: "Appel introuvable." });
    if (session.statut !== "en_cours") return reponse(origine, 409, { erreur: "Cet appel est déjà terminé." });
    const transcription = (session.transcription ?? []) as Replique[];

    // ---------------------------------------------------------------- répondre
    if (demande.action === "repondre") {
      const texte = String(demande.texte ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES);
      if (!texte) return reponse(origine, 400, { erreur: "Rien à dire ?" });
      if (transcription.length >= MAX_REPLIQUES * 2) {
        return reponse(origine, 409, { erreur: "Appel trop long : raccrochez pour obtenir votre évaluation." });
      }
      const { data: scenario } = await base.from("entrainement_scenarios").select("*").eq("id", session.scenario_id).maybeSingle();
      const { data: persona } = await base.from("entrainement_personas").select("personnage").eq("scenario_id", session.scenario_id).maybeSingle();
      if (!scenario || !persona) return reponse(origine, 404, { erreur: "Ce scénario n'existe plus." });

      transcription.push({ qui: "appelante", texte });
      const brute = await appelerIA(consignePersonnage(scenario, persona.personnage), versMessages(transcription), 250);
      const raccroche = brute.includes(FIN_APPEL);
      const replique = nettoyer(brute) || "…";
      transcription.push({ qui: "apprenant", texte: replique });

      const { error } = await base.from("entrainement_sessions").update({ transcription }).eq("id", sessionId);
      if (error) throw error;
      return reponse(origine, 200, { reponse: replique, raccroche });
    }

    // ---------------------------------------------------------------- terminer
    if (demande.action === "terminer") {
      const duree = Math.max(0, Math.min(7200, Math.round(Number(demande.duree_secondes) || 0)));
      const parlees = transcription.filter((r) => r.qui === "appelante").length;
      if (parlees < 2) {
        await base.from("entrainement_sessions").delete().eq("id", sessionId);
        return reponse(origine, 200, { annule: true });
      }

      const { data: scenario } = await base.from("entrainement_scenarios").select("*").eq("id", session.scenario_id).maybeSingle();
      const { data: persona } = await base.from("entrainement_personas").select("personnage").eq("scenario_id", session.scenario_id).maybeSingle();

      const texteAppel = transcription.map((r) => `${r.qui === "appelante" ? "APPELANTE" : "APPRENANT"} : ${r.texte}`).join("\n");
      const reponseIA = await appelerIA(
        "Tu es formatrice experte en relation client à distance et en suivi d'apprenants en formation à distance (lutte contre le décrochage, accompagnement jusqu'à l'examen). Tu évalues un appel d'entraînement d'une appelante débutante, avec bienveillance mais exigence. Tu tutoies l'appelante dans tes commentaires et tu écris en français. Les transcriptions viennent parfois d'une dictée vocale : ignore les fautes de transcription. Note seulement ce que l'appelante a dit. Tu réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour.",
        [{
          role: "user",
          content: `Scénario : ${scenario?.titre ?? session.scenario_titre}
Fiche visible par l'appelante : ${scenario?.contexte ?? ""}
Objectif de l'appel : ${scenario?.objectif_appel ?? ""}
Ce que l'appelante ne savait pas (personnage joué) : ${persona?.personnage ?? ""}

Grille (chaque critère noté de 0 à 5) :
${GRILLE.map((g) => `- ${g.cle} — ${g.nom} : ${g.attendu}`).join("\n")}

Transcription :
${texteAppel}

Réponds avec un objet JSON de cette forme, avec exactement 6 critères (un par clé de la grille : ${GRILLE.map((g) => g.cle).join(", ")}) :
{"criteres": [{"cle": "accueil", "note": 3, "commentaire": "1 à 2 phrases avec un exemple tiré de l'appel"}],
 "points_forts": ["2 ou 3 points forts concrets"],
 "a_ameliorer": ["2 ou 3 axes d'amélioration concrets"],
 "phrase_modele": "une phrase que l'appelante aurait pu dire au moment le plus délicat de l'appel",
 "frein_decouvert": true}`,
        }],
        1500,
        true,
      );
      const brut = lireJson(reponseIA);

      const notes = new Map<string, { note: number; commentaire: string }>();
      const criteresIA = Array.isArray(brut.criteres) ? brut.criteres as { cle: string; note: number; commentaire: string }[] : [];
      for (const c of criteresIA) {
        notes.set(String(c.cle), { note: Math.max(0, Math.min(5, Math.round(Number(c.note) || 0))), commentaire: String(c.commentaire ?? "").slice(0, 600) });
      }
      if (!notes.size) throw new Error("IA_INDISPONIBLE");
      const criteres = GRILLE.map((g) => ({ cle: g.cle, nom: g.nom, note: notes.get(g.cle)?.note ?? 0, commentaire: notes.get(g.cle)?.commentaire ?? "" }));
      const total = criteres.reduce((s, c) => s + c.note, 0);
      const noteSur20 = Math.round((total / (GRILLE.length * 5)) * 20);
      const liste = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 400)).slice(0, 4) : []);
      const evaluation = {
        criteres,
        points_forts: liste(brut.points_forts),
        a_ameliorer: liste(brut.a_ameliorer),
        phrase_modele: String(brut.phrase_modele ?? "").slice(0, 500),
        frein_decouvert: brut.frein_decouvert === true,
      };

      const { error } = await base.from("entrainement_sessions").update({
        statut: "terminee", fin: new Date().toISOString(), duree_secondes: duree, note_sur_20: noteSur20, evaluation,
      }).eq("id", sessionId);
      if (error) throw error;
      return reponse(origine, 200, { note_sur_20: noteSur20, evaluation });
    }

    return reponse(origine, 400, { erreur: "Action inconnue." });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    console.error("simulation-appel", e);
    if (code === "CLE_ABSENTE") return reponse(origine, 503, { erreur: "L'IA n'est pas encore branchée : la clé Mistral n'est pas installée dans Supabase." });
    if (code === "CLE_INVALIDE") return reponse(origine, 503, { erreur: "La clé de l'IA est refusée. Vérifiez la clé dans le compte Mistral." });
    if (code === "IA_SATUREE") return reponse(origine, 429, { erreur: "L'IA gratuite est très demandée en ce moment. Patientez quelques secondes, puis renvoyez votre phrase." });
    if (code === "IA_INDISPONIBLE") return reponse(origine, 502, { erreur: "L'IA ne répond pas pour le moment. Réessayez dans un instant." });
    return reponse(origine, 500, { erreur: "Erreur inattendue. Réessayez." });
  }
});
