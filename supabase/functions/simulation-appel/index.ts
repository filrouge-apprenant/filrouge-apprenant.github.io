// =============================================================================
// Fil Rouge Apprenants — fonction serveur « simulation-appel »
// =============================================================================
// Entraînement des appelantes : l'IA joue un apprenant FICTIF au téléphone,
// puis évalue l'appel selon la grille Fil Rouge.
//
// IA utilisée (choisie selon le secret présent dans Supabase) :
//   - MISTRAL_API_KEY -> Mistral (formule gratuite « Experiment »)
//   - GROQ_API_KEY    -> Groq (gratuit, clé « gsk_… »)
//   - GEMINI_API_KEY  -> Google Gemini (gratuit, clé « AIza… »)
//   - ANTHROPIC_API_KEY -> Claude (payant)
//   Une clé Groq, Gemini ou Claude est reconnue même rangée sous un autre nom.
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

// Grille de l'appel de VENTE (scénarios « prospect »), même barème.
const GRILLE_VENTE = [
  { cle: "accroche", nom: "Accroche et présentation", attendu: "Se présente clairement (prénom, Fil Rouge Apprenants), donne en une phrase une raison d'appeler qui concerne le prospect, vérifie que c'est le bon moment, ton naturel et assuré." },
  { cle: "decouverte", nom: "Découverte", attendu: "Pose des questions ouvertes sur sa situation : nombre d'apprenants, taux d'abandon, qui fait le suivi aujourd'hui, Qualiopi, ce que ça lui coûte." },
  { cle: "ecoute", nom: "Écoute et reformulation", attendu: "Laisse parler, reformule les besoins avec les mots du prospect, ne récite pas un discours." },
  { cle: "argumentation", nom: "Argumentation adaptée", attendu: "Relie l'offre aux besoins exprimés : suivi téléphonique des apprenants, moins d'abandons, preuves pour Qualiopi, tarif à l'appel, essai de 30 jours sur ses apprenants à risque (2 appels chacun, groupe témoin, bilan chiffré, objectif de reprise fixé ensemble au démarrage). Ne promet jamais de résultat garanti au téléphone." },
  { cle: "objections", nom: "Traitement des objections", attendu: "Accueille l'objection sans se braquer, creuse ce qu'il y a derrière, répond précisément, vérifie que la réponse convient." },
  { cle: "conclusion", nom: "Conclusion et engagement", attendu: "Propose une étape suivante concrète et datée (rendez-vous jour et heure, démarrage de l'essai, envoi du fichier), récapitule, termine poliment." },
];

const OFFRE_FIL_ROUGE = `Fil Rouge Apprenants : service de suivi téléphonique des apprenants en formation à distance, pour lutter contre les abandons. Des appelantes formées appellent chaque mois les apprenants confiés par l'organisme, font le point, repèrent les freins et remettent en mouvement ; l'organisme suit tout dans un tableau de bord et dispose de traces utiles pour Qualiopi (indicateurs sur l'accompagnement et la prévention des abandons). Tarif : de 20 € à 12 € HT par appel selon le nombre d'apprenants, seuls les appels réellement passés sont facturés, sans engagement. Pour commencer : essai de 30 jours sur 20 apprenants à risque (pas connectés depuis 2 à 4 semaines), 2 appels chacun et une relance par email après chaque appel manqué, un groupe comparable non appelé, bilan chiffré au 30e jour ; l'objectif de reprise est fixé avec le centre au démarrage selon sa plateforme : atteint, le suivi continue au tarif normal pendant 3 mois ; non atteint, rien à payer. Une seule fois par organisme. Fondatrice : Émilie Rachas, 10 ans de relation client à distance dont l'accompagnement d'apprenants.`;

// Prospection pour Abdel (domaine « abdel ») : sécurité privée et nettoyage.
const OFFRE_ABDEL = `Société d'Abdel, Bordeaux Métropole, deux activités. 1) Sécurité privée autorisée par le CNAPS : gardiennage, rondes, surveillance de nuit et week-end, chantiers, événements, intervention sur alarme ; argument fort face à un recrutement interne : coût complet d'un salarié (majorations de nuit et dimanche, congés, arrêts, remplacements) contre une prestation. 2) Nettoyage professionnel : bureaux, commerces, cabinets, parties communes ; 24 € HT de l'heure si le client fournit les produits, 27 € HT si la société les fournit, jamais en dessous ; visite gratuite et devis écrit sous 48 h. Règles : l'objectif de l'appel est d'obtenir une VISITE sur place (30 min sécurité, 15 min nettoyage) avec deux créneaux proposés ; jamais de prix de sécurité au téléphone ; jamais de délai, de nombre d'agents, de référence client ni de garantie promis sans l'accord d'Abdel ; ne jamais critiquer le prestataire en place. C'est Émilie qui appelle pour la société.`;

function grilleVente(domaine: unknown) {
  if (domaine !== "abdel") return GRILLE_VENTE;
  return GRILLE_VENTE.map((g) => g.cle === "argumentation"
    ? { ...g, attendu: "Relie l'offre aux besoins exprimés : coût complet d'un salarié face à une prestation, CNAPS et assurances, régularité, interlocuteur unique, remplacements assurés ; pour le nettoyage, défend le tarif (24 € / 27 € HT de l'heure) sans brader. Ne promet rien sans l'accord d'Abdel, ne critique jamais le prestataire en place." }
    : g.cle === "conclusion"
      ? { ...g, attendu: "Propose une visite sur place avec deux créneaux précis (ou l'envoi du dossier et une date de rappel), fait confirmer adresse et interlocuteur, termine poliment." }
      : g);
}

// -----------------------------------------------------------------------------
// Appel à l'IA : renvoie le texte produit. json = true : réponse en JSON.
// -----------------------------------------------------------------------------
// Trouve la clé d'IA disponible, quel que soit le nom du secret dans Supabase :
// on reconnaît les clés à leur début (gsk_ = Groq, AIza = Google Gemini, sk-ant- = Claude).
type Fournisseur = { nom: "mistral" | "groq" | "gemini" | "claude"; cle: string };
function fournisseurIA(): Fournisseur | null {
  const env = Deno.env.toObject();
  const valeurs = Object.values(env).map((v) => String(v || "").trim());
  const mistral = (env.MISTRAL_API_KEY || env.mistral_api_key || "").trim();
  if (mistral) return { nom: "mistral", cle: mistral };
  const groq = (env.GROQ_API_KEY || "").trim() || valeurs.find((v) => v.startsWith("gsk_"));
  if (groq) return { nom: "groq", cle: groq };
  const gemini = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "").trim() || valeurs.find((v) => v.startsWith("AIza"));
  if (gemini) return { nom: "gemini", cle: gemini };
  const claude = (env.ANTHROPIC_API_KEY || "").trim() || valeurs.find((v) => v.startsWith("sk-ant-"));
  if (claude) return { nom: "claude", cle: claude };
  return null;
}

// Mistral, Groq et Gemini parlent le même langage (format « chat completions »).
const COMPATIBLES = {
  mistral: { url: "https://api.mistral.ai/v1/chat/completions", modele: () => Deno.env.get("MISTRAL_MODEL") ?? "mistral-small-latest" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", modele: () => Deno.env.get("GROQ_MODEL") ?? "meta-llama/llama-4-maverick-17b-128e-instruct" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", modele: () => Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash" },
};

// Modèle choisi automatiquement quand celui par défaut n'existe plus chez le fournisseur.
const modeleTrouve: Record<string, string> = {};
const PREFERES = [/llama-4-maverick/i, /llama-4-scout/i, /llama.*70b/i, /mistral-small/i, /gemini-2\.5-flash$/i, /gemini.*flash/i, /gpt-oss-120b/i, /qwen/i, /llama/i];
async function choisirModele(nom: string, url: string, cle: string): Promise<string | null> {
  const r = await fetch(url.replace(/chat\/completions$/, "models"), { headers: { Authorization: `Bearer ${cle}` } });
  if (!r.ok) return null;
  const d = await r.json();
  const ids: string[] = (d.data ?? []).map((m: { id: string }) => String(m.id).replace(/^models\//, ""))
    .filter((id: string) => !/whisper|tts|guard|embed|vision|audio|image|orpheus|compound/i.test(id));
  for (const re of PREFERES) { const m = ids.find((id) => re.test(id)); if (m) return (modeleTrouve[nom] = m); }
  return ids[0] ? (modeleTrouve[nom] = ids[0]) : null;
}

async function appelerIA(systeme: string, messages: Message[], maxTokens: number, json = false): Promise<string> {
  const f = fournisseurIA();
  if (!f) throw new Error("CLE_ABSENTE");

  let r: Response;
  if (f.nom !== "claude") {
    const c = COMPATIBLES[f.nom];
    const envoyer = (modele: string) => {
      const raisonne = /gpt-oss|qwen3|deepseek-r1/i.test(modele);
      return fetch(c.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${f.cle}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          model: modele,
          max_tokens: raisonne ? Math.max(maxTokens * 4, 1200) : maxTokens,
          temperature: json ? 0.2 : 0.8,
          messages: [{ role: "system", content: systeme }, ...messages],
          ...(raisonne && f.nom === "groq" ? { reasoning_effort: "low" } : {}),
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    };
    r = await envoyer(modeleTrouve[f.nom] || c.modele());
    if (r.status === 404 || r.status === 400) {
      const detail = await r.text();
      if (/model/i.test(detail)) {
        console.error("Modèle indisponible", f.nom, detail);
        const autre = await choisirModele(f.nom, c.url, f.cle);
        if (autre) r = await envoyer(autre);
        else r = new Response(detail, { status: 404 });
      } else r = new Response(detail, { status: r.status });
    }
  } else {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": f.cle, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELE_CLAUDE, max_tokens: maxTokens, system: systeme, messages }),
    });
  }
  if (!r.ok) {
    console.error("Erreur IA", f.nom, r.status, await r.text());
    if (r.status === 401 || r.status === 403) throw new Error("CLE_INVALIDE");
    if (r.status === 429) throw new Error("IA_SATUREE");
    throw new Error("IA_INDISPONIBLE");
  }
  const d = await r.json();
  if (f.nom !== "claude") {
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
// Une seule réplique : certains modèles enchaînent plusieurs tours de parole collés
// (« …je vous écoute.Hm, vous dites… ») ou écrivent aussi la réponse d'Émilie.
function uneReplique(texte: string) {
  let t = texte.replace(/\[(?!RACCROCHE)[^\]]*\]/g, " ");
  const tour = t.search(/\n\s*(émilie|emilie|appelante|vous|moi)\s*:/i);
  if (tour > 0) t = t.slice(0, tour);
  const colle = t.search(/[.!?…](?=[A-ZÀ-Ý«])/);
  if (colle > 0) t = t.slice(0, colle + 1);
  return t;
}

function nettoyer(texte: string) {
  return uneReplique(texte)
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
- Tu ne dis QU'UNE seule réplique, la tienne, puis tu t'arrêtes et tu attends la réponse : n'écris jamais ce que dit la personne qui t'appelle, n'invente pas la suite de la conversation, n'écris jamais de crochets comme [Attente].
- Reste cohérent avec ce que tu as déjà dit.
- Si l'appelante dit quelque chose d'incompréhensible (erreur de dictée), demande-lui de répéter comme le ferait quelqu'un au téléphone.
- Quand l'appel se termine (au revoir échangé), ou si ton personnage raccroche, dis ta dernière phrase puis ajoute exactement ${FIN_APPEL} à la fin.`;
}

function consigne(scenario: Record<string, unknown>, personnage: string) {
  return scenario.type === "prospect" ? consigneProspect(scenario, personnage) : consignePersonnage(scenario, personnage);
}

function consigneProspect(scenario: Record<string, unknown>, personnage: string) {
  if (scenario.domaine === "abdel") return consigneProspectAbdel(scenario, personnage);
  return `Tu participes à un entraînement commercial au téléphone. Tu joues un interlocuteur FICTIF dans un organisme de formation à distance. La personne qui t'appelle s'appelle Émilie, de « Fil Rouge Apprenants » : elle s'entraîne à vendre son service. Ton rôle est de lui faire vivre un appel de vente réaliste, ni trop facile ni impossible.

Ta fiche :
- Toi : ${scenario.apprenant_nom}
- Organisme : ${scenario.formation}
- Taille : ${scenario.financement ?? "non précisée"}
- Situation : ${scenario.contexte}

Ton personnage :
${personnage}

Ce que tu sais du marché : tu connais le CPF, Qualiopi, les audits, les abandons en formation à distance. Tu ne connais pas Fil Rouge Apprenants : tu découvres l'offre pendant l'appel.

Règles du jeu :
- Tu parles comme une vraie personne au téléphone, en français oral naturel et vivant : 1 à 3 phrases courtes par réplique, avec les petits mots de l'oral (« alors », « bon », « écoutez », « d'accord », « hmm ») quand ça colle, et parfois une phrase interrompue. Jamais de liste, jamais de phrase longue et parfaite.
- Écris uniquement les paroles prononcées : jamais de didascalie, d'astérisque, d'emoji, de description entre parenthèses, ni ton nom devant ta réplique (le texte est lu à voix haute).
- Ne dis jamais que tu es une IA, ne sors jamais du rôle, ne donne jamais de conseil de vente à Émilie.
- Réagis à ce qu'elle dit vraiment : si elle t'écoute bien et répond juste, tu t'ouvres ; si elle récite, insiste lourdement ou promet un résultat garanti, tu te fermes.
- Garde tes objections : ne cède pas à la première réponse, mais ne bloque pas indéfiniment une vendeuse qui fait du bon travail.
- Quand ton téléphone sonne et que tu décroches, ta toute première réplique est seulement une formule de décroché courte, comme dans la vraie vie : « Oui, allô ? », le nom de ton organisme suivi de « bonjour », ou ton nom suivi de « j'écoute ». Tu ne sais pas encore qui appelle ni pourquoi : jamais d'objection, de question sur l'offre ou de reproche avant que la personne se soit présentée.
- Tu ne dis QU'UNE seule réplique, la tienne, puis tu t'arrêtes et tu attends la réponse : n'écris jamais ce que dit la personne qui t'appelle, n'invente pas la suite de la conversation, n'écris jamais de crochets comme [Attente].
- Reste cohérent avec ce que tu as déjà dit.
- Si une phrase est incompréhensible (erreur de dictée), demande de répéter comme au téléphone.
- Quand l'appel se termine (au revoir échangé), ou si tu raccroches, dis ta dernière phrase puis ajoute exactement ${FIN_APPEL} à la fin.`;
}

function consigneProspectAbdel(scenario: Record<string, unknown>, personnage: string) {
  return `Tu participes à un entraînement commercial au téléphone. Tu joues un interlocuteur FICTIF dans une entreprise de la région bordelaise. La personne qui t'appelle s'appelle Émilie : elle appelle pour une société de sécurité privée et de nettoyage professionnel de Bordeaux Métropole, et elle s'entraîne à prospecter. Ton rôle est de lui faire vivre un appel de prospection réaliste, ni trop facile ni impossible.

Ta fiche :
- Toi : ${scenario.apprenant_nom}
- Entreprise : ${scenario.formation}
- Taille : ${scenario.financement ?? "non précisée"}
- Situation : ${scenario.contexte}

Ton personnage :
${personnage}

Tu ne connais pas la société d'Émilie : tu la découvres pendant l'appel.

Règles du jeu :
- Tu parles comme une vraie personne au téléphone, en français oral naturel et vivant : 1 à 3 phrases courtes par réplique, avec les petits mots de l'oral (« alors », « bon », « écoutez », « d'accord », « hmm ») quand ça colle, et parfois une phrase interrompue. Jamais de liste, jamais de phrase longue et parfaite.
- Écris uniquement les paroles prononcées : jamais de didascalie, d'astérisque, d'emoji, de description entre parenthèses, ni ton nom devant ta réplique (le texte est lu à voix haute).
- Ne dis jamais que tu es une IA, ne sors jamais du rôle, ne donne jamais de conseil de vente à Émilie.
- Réagis à ce qu'elle dit vraiment : si elle t'écoute, pose de bonnes questions et reste concrète, tu t'ouvres ; si elle récite, insiste lourdement, critique ton prestataire ou promet n'importe quoi, tu te fermes.
- Garde tes objections : ne cède pas à la première réponse, mais ne bloque pas indéfiniment une vendeuse qui fait du bon travail.
- Quand ton téléphone sonne et que tu décroches, ta toute première réplique est seulement une formule de décroché courte, comme dans la vraie vie : « Oui, allô ? », le nom de ton organisme suivi de « bonjour », ou ton nom suivi de « j'écoute ». Tu ne sais pas encore qui appelle ni pourquoi : jamais d'objection, de question sur l'offre ou de reproche avant que la personne se soit présentée.
- Tu ne dis QU'UNE seule réplique, la tienne, puis tu t'arrêtes et tu attends la réponse : n'écris jamais ce que dit la personne qui t'appelle, n'invente pas la suite de la conversation, n'écris jamais de crochets comme [Attente].
- Reste cohérent avec ce que tu as déjà dit.
- Si une phrase est incompréhensible (erreur de dictée), demande de répéter comme au téléphone.
- Quand l'appel se termine (au revoir échangé), ou si tu raccroches, dis ta dernière phrase puis ajoute exactement ${FIN_APPEL} à la fin.`;
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
// Script de référence (ce qu'Émilie doit dérouler), pour noter par rapport à lui.
const SCRIPT_FIL_ROUGE = `Accroche courte : se présenter (prénom, Fil Rouge Apprenants), une phrase sur ce qu'elle fait, puis demander si c'est le bon moment (« Vous avez deux minutes ? »). Puis une question d'ouverture : « Comment vous repérez un apprenant qui commence à décrocher ? ». Découverte : questions ouvertes (origine des apprenants, suivi actuel, nombre d'abandons, qui s'en occupe, Qualiopi, coût d'un abandon). Reformulation avec les mots du prospect, validée par « C'est bien ça ? ». Présentation en 3 bénéfices : temps gagné, apprenants qui vont au bout (chiffre d'affaires gardé), preuves Qualiopi ; prix à l'appel avec un exemple chiffré. Conclusion : rebondir sur le nombre d'apprenants qui ne se connectent plus, proposer l'essai de 30 jours sur 20 apprenants à risque (2 appels chacun + relances email, un groupe comparable non appelé, bilan chiffré au 30e jour ; objectif de reprise fixé ensemble au rendez-vous de démarrage : atteint, le suivi continue 3 mois au tarif normal, sinon rien à payer), deux créneaux précis pour choisir les apprenants, puis récapitulatif. Objections : accueillir, creuser, répondre au vrai frein, relancer vers une date.`;
const SCRIPT_ABDEL = `Standard : demander la bonne personne et passer le barrage poliment. Accroche selon le signal (recrutement, chantier, prestataire). Découverte : organisation actuelle, incidents, horaires, surface, fréquence. Présenter seulement après avoir écouté. Conclure toujours avec deux créneaux de visite, puis verrouiller (adresse, interlocuteur, confirmation). Jamais de prix de sécurité au téléphone.`;

// Évaluation d'un appel : note de chaque critère selon ce qui s'est vraiment passé.
// Un critère que le prospect a empêché (barrage, refus d'écouter, appel écourté) n'est
// pas noté (note null) et ne compte pas dans la note sur 20.
// deno-lint-ignore no-explicit-any
async function evaluer(base: any, session: Record<string, any>, transcription: Replique[]) {
  const { data: scenario } = await base.from("entrainement_scenarios").select("*").eq("id", session.scenario_id).maybeSingle();
  const { data: persona } = await base.from("entrainement_personas").select("personnage").eq("scenario_id", session.scenario_id).maybeSingle();
  const vente = scenario?.type === "prospect";
  const grille = vente ? grilleVente(scenario?.domaine) : GRILLE;
  const abdel = scenario?.domaine === "abdel";
  const texteAppel = transcription.map((r) => `${r.qui === "appelante" ? (vente ? "ÉMILIE" : "APPELANTE") : (vente ? "PROSPECT" : "APPRENANT")} : ${r.texte}`).join("\n");
  const qui = vente ? "Émilie" : "l'appelante";
  const regleContexte = `Note selon le CONTEXTE RÉEL de l'appel et la difficulté du scénario (${scenario?.difficulte ?? "moyen"}) :
- Si le prospect a empêché une étape (barrage, refus d'écouter, « envoyez-moi un mail », appel écourté par lui), ce critère n'est PAS applicable : mets "note": null et explique en une phrase qu'il n'a pas pu être évalué. Ne pénalise jamais ${qui} pour une étape que l'interlocuteur n'a pas permise.
- Dans ce cas, juge plutôt comment ${qui} a géré le barrage, dans les critères concernés (accroche, objections, conclusion).
- Sur un scénario difficile, obtenir une étape suivante réaliste (rappel daté, envoi du mail avec un rendez-vous de rappel, mise en relation) est une vraie réussite : note la conclusion en conséquence.
- Note par rapport au script de référence, sans exiger de réciter mot pour mot : ce qui compte, c'est l'intention de chaque étape.
- Sois juste et cohérente : 3/5 = correct, 4/5 = bien, 5/5 = très bien.`;
  const systeme = vente
    ? `Tu es formatrice experte en vente B2B par téléphone (prospection, découverte, traitement des objections, closing) ${abdel ? "dans la sécurité privée et le nettoyage professionnel" : "auprès des organismes de formation"}. Tu évalues un appel d'entraînement d'Émilie${abdel ? ", qui prospecte pour une société de sécurité et de nettoyage" : ", fondatrice de Fil Rouge Apprenants"}, avec bienveillance mais exigence. Tu la tutoies et tu écris en français. Les transcriptions viennent parfois d'une dictée vocale : ignore les fautes de transcription. Note seulement ce qu'Émilie a dit. Tu réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour.`
    : "Tu es formatrice experte en relation client à distance et en suivi d'apprenants en formation à distance (lutte contre le décrochage, accompagnement jusqu'à l'examen). Tu évalues un appel d'entraînement d'une appelante débutante, avec bienveillance mais exigence. Tu tutoies l'appelante dans tes commentaires et tu écris en français. Les transcriptions viennent parfois d'une dictée vocale : ignore les fautes de transcription. Note seulement ce que l'appelante a dit. Tu réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour.";
  const contenu = vente
    ? `L'offre vendue : ${abdel ? OFFRE_ABDEL : OFFRE_FIL_ROUGE}

Script de référence : ${abdel ? SCRIPT_ABDEL : SCRIPT_FIL_ROUGE}

Scénario : ${scenario?.titre ?? session.scenario_titre} (difficulté : ${scenario?.difficulte ?? "?"})
Ce qu'Émilie savait avant l'appel : ${scenario?.apprenant_nom ?? ""}, ${scenario?.formation ?? ""} (${scenario?.financement ?? ""}). ${scenario?.contexte ?? ""}
Objectif de l'appel : ${scenario?.objectif_appel ?? ""}
Ce qu'Émilie ne savait pas (personnage joué) : ${persona?.personnage ?? ""}

${regleContexte}

Grille (chaque critère noté de 0 à 5, ou null s'il n'est pas applicable) :
${grille.map((g) => `- ${g.cle} — ${g.nom} : ${g.attendu}`).join("\n")}

Transcription :
${texteAppel}

Réponds avec un objet JSON de cette forme, avec exactement 6 critères (un par clé de la grille : ${grille.map((g) => g.cle).join(", ")}) :
{"criteres": [{"cle": "accroche", "note": 3, "commentaire": "1 à 2 phrases avec un exemple tiré de l'appel"}, {"cle": "decouverte", "note": null, "commentaire": "Pas évaluable : le prospect a refusé d'échanger."}],
 "points_forts": ["2 ou 3 points forts concrets"],
 "a_ameliorer": ["2 ou 3 axes d'amélioration concrets, sur ce qu'Émilie pouvait réellement faire dans cet appel"],
 "phrase_modele": "la phrase qu'Émilie aurait pu dire au moment le plus délicat de l'appel (souvent l'objection principale)",
 "frein_decouvert": true}
« frein_decouvert » = true si Émilie a obtenu l'étape suivante visée ou une étape réaliste vu le contexte (${abdel ? "visite datée, envoi du dossier avec date de rappel, ou mise en relation" : "rendez-vous daté, essai, rappel daté ou mise en relation"}).`
    : `Scénario : ${scenario?.titre ?? session.scenario_titre}
Fiche visible par l'appelante : ${scenario?.contexte ?? ""}
Objectif de l'appel : ${scenario?.objectif_appel ?? ""}
Ce que l'appelante ne savait pas (personnage joué) : ${persona?.personnage ?? ""}

${regleContexte}

Grille (chaque critère noté de 0 à 5, ou null s'il n'est pas applicable) :
${GRILLE.map((g) => `- ${g.cle} — ${g.nom} : ${g.attendu}`).join("\n")}

Transcription :
${texteAppel}

Réponds avec un objet JSON de cette forme, avec exactement 6 critères (un par clé de la grille : ${GRILLE.map((g) => g.cle).join(", ")}) :
{"criteres": [{"cle": "accueil", "note": 3, "commentaire": "1 à 2 phrases avec un exemple tiré de l'appel"}],
 "points_forts": ["2 ou 3 points forts concrets"],
 "a_ameliorer": ["2 ou 3 axes d'amélioration concrets"],
 "phrase_modele": "une phrase que l'appelante aurait pu dire au moment le plus délicat de l'appel",
 "frein_decouvert": true}`;
  const brut = lireJson(await appelerIA(systeme, [{ role: "user", content: contenu }], 1500, true));
  const notes = new Map<string, { note: number | null; commentaire: string }>();
  const criteresIA = Array.isArray(brut.criteres) ? brut.criteres as { cle: string; note: unknown; commentaire: string }[] : [];
  for (const c of criteresIA) {
    const n = c.note === null || c.note === undefined || c.note === "" ? null : Math.max(0, Math.min(5, Math.round(Number(c.note) || 0)));
    notes.set(String(c.cle), { note: n, commentaire: String(c.commentaire ?? "").slice(0, 600) });
  }
  if (!notes.size) throw new Error("IA_INDISPONIBLE");
  const criteres = grille.map((g) => ({ cle: g.cle, nom: g.nom, note: notes.has(g.cle) ? notes.get(g.cle)!.note : 0, commentaire: notes.get(g.cle)?.commentaire ?? "" }));
  const notees = criteres.filter((c) => c.note !== null) as { note: number }[];
  const noteSur20 = notees.length ? Math.round((notees.reduce((t, c) => t + c.note, 0) / (notees.length * 5)) * 20) : null;
  const liste = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 400)).slice(0, 4) : []);
  return {
    note_sur_20: noteSur20,
    evaluation: {
      criteres,
      points_forts: liste(brut.points_forts),
      a_ameliorer: liste(brut.a_ameliorer),
      phrase_modele: String(brut.phrase_modele ?? "").slice(0, 500),
      frein_decouvert: brut.frein_decouvert === true,
      non_evalues: criteres.filter((c) => c.note === null).length,
    },
  };
}

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
      if (scenario.type === "prospect") {
        // Réservé à l'administratrice : la base le vérifie avec SON jeton.
        const { data: visible } = await appelant.from("entrainement_scenarios").select("id").eq("id", scenarioId).maybeSingle();
        if (!visible) return reponse(origine, 403, { erreur: "Ce scénario est réservé à l'administratrice." });
      }

      // Le décroché : l'IA répond comme le personnage décroche
      const decroche = await appelerIA(consigne(scenario, persona.personnage), versMessages([]), 120);
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
    // Recalculer la note d'un appel déjà terminé (barème mis à jour).
    if (demande.action === "reevaluer") {
      if (session.statut !== "terminee") return reponse(origine, 409, { erreur: "Cet appel n'est pas encore terminé." });
      const resultat = await evaluer(base, session, (session.transcription ?? []) as Replique[]);
      const { error } = await base.from("entrainement_sessions").update(resultat).eq("id", sessionId);
      if (error) throw error;
      return reponse(origine, 200, resultat);
    }
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
      const brute = await appelerIA(consigne(scenario, persona.personnage), versMessages(transcription), 180);
      const raccroche = uneReplique(brute).includes(FIN_APPEL);
      const replique = nettoyer(brute) || "…";
      transcription.push({ qui: "apprenant", texte: replique });

      const { error } = await base.from("entrainement_sessions").update({ transcription }).eq("id", sessionId);
      if (error) throw error;
      return reponse(origine, 200, { reponse: replique, raccroche });
    }

    // ---------------------------------------------------------------- terminer / réévaluer
    if (demande.action === "terminer") {
      const duree = Math.max(0, Math.min(7200, Math.round(Number(demande.duree_secondes) || 0)));
      const parlees = transcription.filter((r) => r.qui === "appelante").length;
      if (parlees < 2) {
        await base.from("entrainement_sessions").delete().eq("id", sessionId);
        return reponse(origine, 200, { annule: true });
      }
      const resultat = await evaluer(base, session, transcription);
      const { error } = await base.from("entrainement_sessions").update({
        statut: "terminee", fin: new Date().toISOString(), duree_secondes: duree, ...resultat,
      }).eq("id", sessionId);
      if (error) throw error;
      return reponse(origine, 200, resultat);
    }

    return reponse(origine, 400, { erreur: "Action inconnue." });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    console.error("simulation-appel", e);
    if (code === "CLE_ABSENTE") return reponse(origine, 503, { erreur: "L'IA n'est pas encore branchée : aucune clé d'IA (Mistral, Groq ou Gemini) n'est installée dans Supabase." });
    if (code === "CLE_INVALIDE") return reponse(origine, 503, { erreur: "La clé de l'IA est refusée : vérifiez-la dans le compte du fournisseur (Mistral, Groq ou Gemini)." });
    if (code === "IA_SATUREE") return reponse(origine, 429, { erreur: "L'IA gratuite est très demandée en ce moment. Patientez quelques secondes, puis renvoyez votre phrase." });
    if (code === "IA_INDISPONIBLE") return reponse(origine, 502, { erreur: "L'IA ne répond pas pour le moment. Réessayez dans un instant." });
    return reponse(origine, 500, { erreur: "Erreur inattendue. Réessayez." });
  }
});
