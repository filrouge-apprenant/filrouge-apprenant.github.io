// =============================================================================
// Fil Rouge Apprenants — fonction serveur « simulation-appel »
// =============================================================================
// Entraînement des appelantes : l'IA (Claude) joue un apprenant FICTIF au
// téléphone, puis évalue l'appel selon la grille Fil Rouge.
//
// Sécurité :
//   1. Supabase refuse tout appel sans jeton de connexion (verify_jwt).
//   2. La base dit si la personne peut s'entraîner (je_peux_m_entrainer :
//      administratrice avec double authentification, ou appelante active).
//   3. La clé de l'IA (secret ANTHROPIC_API_KEY) reste ici, jamais dans le site.
//   4. Seule cette fonction écrit les sessions : une appelante ne peut pas
//      modifier sa transcription ni sa note.
//   5. Garde-fous de coût : 25 appels d'entraînement par jour et par personne,
//      40 répliques par appel, 600 caractères par réplique.
//
// Appels (POST, JSON) :
//   { action: "demarrer", scenario_id, mode: "voix" | "ecrit" } -> { session_id, reponse }
//   { action: "repondre", session_id, texte }                  -> { reponse, raccroche }
//   { action: "terminer", session_id, duree_secondes }         -> { note_sur_20, evaluation }
// =============================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGINES_AUTORISEES = ["https://filrouge-apprenant.github.io"];
const MODELE = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5";
const MAX_APPELS_PAR_JOUR = 25;
const MAX_REPLIQUES = 40;
const MAX_CARACTERES = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIN_APPEL = "[RACCROCHE]";

type Replique = { qui: "appelante" | "apprenant"; texte: string };

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
// Appel à l'IA
// -----------------------------------------------------------------------------
async function appelerIA(corps: Record<string, unknown>) {
  const cle = Deno.env.get("ANTHROPIC_API_KEY");
  if (!cle) throw new Error("CLE_ABSENTE");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cle, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELE, ...corps }),
  });
  if (!r.ok) {
    console.error("Erreur IA", r.status, await r.text());
    throw new Error(r.status === 401 ? "CLE_INVALIDE" : r.status === 400 ? "IA_REFUS" : "IA_INDISPONIBLE");
  }
  return await r.json();
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
- Ne fais jamais de didascalie, d'astérisque, d'emoji ni de description entre parenthèses : seulement les paroles prononcées (le texte est lu à voix haute).
- Ne dis jamais que tu es une IA, ne sors jamais du rôle, ne donne jamais de conseil à l'appelante.
- Ne révèle pas ton vrai frein trop tôt : il faut que l'appelante le mérite par ses questions et son écoute.
- Reste cohérent avec ce que tu as déjà dit.
- Si l'appelante dit quelque chose d'incompréhensible (erreur de dictée), demande-lui de répéter comme le ferait quelqu'un au téléphone.
- Quand l'appel se termine (au revoir échangé), ou si ton personnage raccroche, dis ta dernière phrase puis ajoute exactement ${FIN_APPEL} à la fin.`;
}

function versMessages(transcription: Replique[]) {
  // L'appelante = « user », l'apprenant joué par l'IA = « assistant ».
  // L'API attend un premier message « user » : on ouvre par le décroché.
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: "(Ton téléphone sonne. Tu décroches.)" }];
  for (const r of transcription) {
    const role = r.qui === "appelante" ? "user" : "assistant";
    const dernier = messages[messages.length - 1];
    if (dernier.role === role) dernier.content += `\n${r.texte}`;
    else messages.push({ role, content: r.texte });
  }
  return messages;
}

function texteDe(resultat: { content?: { type: string; text?: string }[] }) {
  return (resultat.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();
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
      const resultat = await appelerIA({
        max_tokens: 120,
        system: consignePersonnage(scenario, persona.personnage),
        messages: versMessages([]),
      });
      const premier = texteDe(resultat).replace(FIN_APPEL, "").trim() || "Allô ?";

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
      const resultat = await appelerIA({
        max_tokens: 250,
        system: consignePersonnage(scenario, persona.personnage),
        messages: versMessages(transcription),
      });
      let replique = texteDe(resultat);
      const raccroche = replique.includes(FIN_APPEL);
      replique = replique.replace(FIN_APPEL, "").trim() || "…";
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
      const resultat = await appelerIA({
        max_tokens: 1500,
        system: `Tu es formatrice experte en relation client à distance et en suivi d'apprenants en formation à distance (lutte contre le décrochage, accompagnement jusqu'à l'examen). Tu évalues un appel d'entraînement d'une appelante débutante, avec bienveillance mais exigence. Tu tutoies l'appelante dans tes commentaires. Les transcriptions viennent parfois d'une dictée vocale : ignore les fautes de transcription. Note seulement ce que l'appelante a dit.`,
        tools: [{
          name: "enregistrer_evaluation",
          description: "Enregistre l'évaluation de l'appel.",
          input_schema: {
            type: "object",
            properties: {
              criteres: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    cle: { type: "string", enum: GRILLE.map((g) => g.cle) },
                    note: { type: "integer", minimum: 0, maximum: 5 },
                    commentaire: { type: "string", description: "1 à 2 phrases, avec un exemple tiré de l'appel." },
                  },
                  required: ["cle", "note", "commentaire"],
                },
              },
              points_forts: { type: "array", items: { type: "string" }, description: "2 ou 3 points forts concrets." },
              a_ameliorer: { type: "array", items: { type: "string" }, description: "2 ou 3 axes d'amélioration concrets." },
              phrase_modele: { type: "string", description: "Une phrase que l'appelante aurait pu dire au moment le plus délicat de l'appel." },
              frein_decouvert: { type: "boolean", description: "L'appelante a-t-elle découvert le vrai frein caché de l'apprenant ?" },
            },
            required: ["criteres", "points_forts", "a_ameliorer", "phrase_modele", "frein_decouvert"],
          },
        }],
        tool_choice: { type: "tool", name: "enregistrer_evaluation" },
        messages: [{
          role: "user",
          content: `Scénario : ${scenario?.titre ?? session.scenario_titre}
Fiche visible par l'appelante : ${scenario?.contexte ?? ""}
Objectif de l'appel : ${scenario?.objectif_appel ?? ""}
Ce que l'appelante ne savait pas (personnage joué) : ${persona?.personnage ?? ""}

Grille (chaque critère de 0 à 5) :
${GRILLE.map((g) => `- ${g.cle} — ${g.nom} : ${g.attendu}`).join("\n")}

Transcription :
${texteAppel}`,
        }],
      });

      const bloc = (resultat.content ?? []).find((b: { type: string }) => b.type === "tool_use");
      const brut = (bloc?.input ?? {}) as Record<string, unknown>;
      const notes = new Map<string, { note: number; commentaire: string }>();
      for (const c of (brut.criteres as { cle: string; note: number; commentaire: string }[] | undefined) ?? []) {
        notes.set(c.cle, { note: Math.max(0, Math.min(5, Math.round(Number(c.note) || 0))), commentaire: String(c.commentaire ?? "").slice(0, 600) });
      }
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
    if (code === "CLE_ABSENTE") return reponse(origine, 503, { erreur: "L'IA n'est pas encore branchée : la clé Anthropic n'est pas installée dans Supabase." });
    if (code === "CLE_INVALIDE") return reponse(origine, 503, { erreur: "La clé de l'IA est refusée (clé invalide ou crédit épuisé). Vérifiez le compte Anthropic." });
    if (code === "IA_INDISPONIBLE" || code === "IA_REFUS") return reponse(origine, 502, { erreur: "L'IA ne répond pas pour le moment. Réessayez dans un instant." });
    return reponse(origine, 500, { erreur: "Erreur inattendue. Réessayez." });
  }
});
