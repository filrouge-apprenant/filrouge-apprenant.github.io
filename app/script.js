// =============================================================================
// Fil Rouge Apprenants — Script d'appel guidé (#/script)
// =============================================================================
//   #/script              choisir l'apprenant à appeler (+ chiffres d'usage pour l'admin)
//   #/script/<apprenant>  le script : une étape par bouton, des réponses à cliquer
//                         (QCM), des champs libres, puis le commentaire
//
// À la fin de l'appel, deux choix :
//   - « Générer le commentaire »        → texte rédigé à partir des réponses ;
//   - « Garder les réponses seulement » → la liste brute question / réponse.
// Le texte reste modifiable avant d'enregistrer. L'appel est enregistré comme
// depuis l'onglet Statut (historique, compteur remis à zéro, suite prévue).
// Les réponses sont conservées (table appels_script) pour comparer le script
// à la saisie classique ; si la table n'existe pas encore, l'appel est quand
// même enregistré normalement.
//
// Le brouillon est gardé dans le navigateur (sessionStorage) : un rechargement
// de page ne fait rien perdre. Il est effacé à l'enregistrement.
// Sécurité : tout le texte passe par h() (textContent), jamais innerHTML.
// =============================================================================

(function () {
  "use strict";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ---------------------------------------------------------------------------
  // Le contenu du script : modifiable ici sans toucher au reste.
  //   type "un"    : une seule réponse
  //   type "plusieurs" : plusieurs réponses
  //   type "texte" : champ libre
  //   type "date"  : date
  // Le libellé court (court) sert dans « réponses seulement ».
  // ---------------------------------------------------------------------------
  const ETAPES = [
    {
      cle: "preparation", titre: "Avant l'appel", duree: "2 min",
      intro: "Regardez la fiche avant de composer le numéro.",
      questions: [
        { cle: "objectif_precedent", court: "Objectif précédent", texte: "L'objectif fixé au dernier appel a-t-il été tenu ?", type: "un",
          options: ["Oui", "En partie", "Non", "Pas d'objectif fixé"] },
        { cle: "echeances", court: "Échéances proches", texte: "Une échéance arrive bientôt ?", type: "plusieurs",
          options: ["Date d'examen", "Inscription à l'examen", "Stage", "Fin de formation", "Fin des droits CPF"] },
      ],
    },
    {
      cle: "ouverture", titre: "1. Ouverture", duree: "1 min",
      phrases: [
        "Bonjour {prenom}, c'est {moi}, votre référente de suivi pour la formation {formation}{chez}. Je vous appelle pour faire le point avec vous, vous avez quelques minutes ?",
        "Avant tout, comment allez-vous en ce moment ?",
      ],
      questions: [
        { cle: "humeur", court: "Comment il/elle va", texte: "Comment va l'apprenant ?", type: "un",
          options: ["Bien", "Moyen", "Difficile"] },
        { cle: "humeur_detail", court: "Précisions (moral)", texte: "Précisions", type: "texte", placeholder: "Ce qu'il/elle confie…" },
      ],
      conseil: "En cas de difficulté personnelle : écouter, reformuler, puis « On va voir ensemble comment adapter la formation à cette période. »",
    },
    {
      cle: "situation", titre: "2. Ce qui se passe", duree: "2 à 3 min",
      phrases: [
        "Je vois que votre dernière connexion date du {derniere_connexion}{depuis}. Qu'est-ce qui s'est passé depuis ?",
        "Vous êtes à {avancement} de progression{attendu}. Qu'est-ce qui vous freine en ce moment ?",
      ],
      questions: [
        { cle: "constat", court: "Constat", texte: "Situation constatée", type: "un",
          options: ["Pas connecté depuis longtemps", "Retard de progression", "Les deux", "À jour"] },
        { cle: "causes", court: "Causes", texte: "Pourquoi ?", type: "plusieurs",
          options: ["Manque de temps", "Travail / emploi du temps", "Motivation en baisse", "Difficulté sur le contenu", "Problème technique ou d'accès", "Raison personnelle ou santé", "Démarches administratives"] },
        { cle: "causes_detail", court: "Précisions (causes)", texte: "Précisions", type: "texte", placeholder: "Depuis quand, ce qui bloque exactement…" },
      ],
      conseil: "Relances : « C'est plutôt un manque de temps, de motivation, ou une difficulté sur le contenu ? » · « Depuis quand vous sentez que c'est plus difficile ? »",
    },
    {
      cle: "dernier_travail", titre: "3. Dernier travail", duree: "1 à 2 min",
      phrases: [
        "La dernière fois que vous vous êtes connecté, sur quoi avez-vous travaillé ? Quel module, quel cours ?",
        "Qu'est-ce que vous en avez retenu, en deux mots ?",
      ],
      questions: [
        { cle: "module", court: "Dernier module", texte: "Module ou cours travaillé", type: "texte", ligne: true, placeholder: "Ex. : Module 4 — la relation client" },
        { cle: "retenu", court: "Ce qu'il/elle a retenu", texte: "Ce qu'il/elle en a retenu", type: "un",
          options: ["Bien", "Partiellement", "Ne s'en souvient plus"] },
        { cle: "quiz", court: "Exercices / quiz", texte: "Exercices ou quiz de fin de module", type: "un",
          options: ["Faits et réussis", "Faits, à revoir", "Pas faits"] },
      ],
      conseil: "S'il/elle ne se souvient plus : c'est le signe que la méthode est à revoir. Passez à l'étape 4.",
    },
    {
      cle: "methode", titre: "4. Méthode", duree: "3 min",
      phrases: ["Racontez-moi comment vous travaillez un cours, concrètement. Vous faites comment ?"],
      questions: [
        { cle: "methode_actuelle", court: "Méthode actuelle", texte: "Ce qu'il/elle fait aujourd'hui", type: "plusieurs",
          options: ["Écoute les vidéos", "Lit les supports", "Prend des notes", "Fait des fiches de synthèse", "Retravaille les cours", "Fait les exercices"] },
        { cle: "pistes", court: "Pistes proposées", texte: "Pistes proposées (une ou deux suffisent)", type: "plusieurs",
          options: ["Pause toutes les 10 min et 3 idées clés", "Une fiche de synthèse par module", "Relire sa fiche le lendemain puis 7 jours après", "Quiz avant le module suivant (80 % minimum)", "S'expliquer le cours à voix haute"] },
        { cle: "methode_detail", court: "Précisions (méthode)", texte: "Précisions", type: "texte" },
      ],
      conseil: "Mieux vaut une habitude tenue que cinq conseils oubliés.",
    },
    {
      cle: "organisation", titre: "5. Organisation", duree: "2 min",
      phrases: [
        "Aujourd'hui, comment vous organisez votre temps pour la formation ? Vous avez des moments fixes ?",
        "Si on dit {creneau}, c'est tenable pour vous ?",
      ],
      questions: [
        { cle: "orga_actuelle", court: "Organisation actuelle", texte: "Organisation jusqu'ici", type: "un",
          options: ["Créneaux fixes", "Au feeling", "Aucune"] },
        { cle: "temps", court: "Temps par jour", texte: "Temps choisi par jour", type: "un",
          options: ["20 min", "30 min", "1 h", "Plus d'1 h"] },
        { cle: "jours", court: "Jours", texte: "Jours choisis", type: "plusieurs",
          options: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] },
        { cle: "moment", court: "Moment", texte: "Moment de la journée", type: "un",
          options: ["Matin", "Midi", "Après-midi", "Soir"] },
        { cle: "heure", court: "Heure précise", texte: "Heure précise", type: "texte", ligne: true, placeholder: "Ex. : 20 h – 21 h" },
        { cle: "conseils_orga", court: "Conseils donnés", texte: "Conseils donnés", type: "plusieurs",
          options: ["Créneau dans l'agenda ou alarme", "Même lieu, téléphone en silencieux", "Mieux vaut peu chaque jour", "Rattraper sous 48 h"] },
      ],
    },
    {
      cle: "encouragements", titre: "6. Encourager", duree: "1 min",
      phrases: [
        "Vous aviez dit {objectif_avant}, et vous l'avez fait. Bravo, c'est exactement comme ça qu'on arrive au bout.",
        "Le plus important, c'est que vous avez déjà fait {avancement} du chemin. On ne repart pas de zéro.",
        "Pensez au moment où vous aurez votre {formation} en main.",
      ],
      questions: [
        { cle: "reussites", court: "Réussites soulignées", texte: "Réussites soulignées", type: "plusieurs",
          options: ["Progression", "Objectif tenu", "Reprise de contact", "Module terminé", "Persévérance malgré les difficultés"] },
        { cle: "ressenti_fin", court: "Ressenti en fin d'appel", texte: "En fin d'appel, l'apprenant semble", type: "un",
          options: ["Remotivé·e", "Rassuré·e", "Toujours en difficulté"] },
      ],
    },
    {
      cle: "objectif", titre: "7. Objectif et rappel", duree: "2 min",
      phrases: [
        "D'ici notre prochain appel, qu'est-ce que vous vous fixez comme objectif ?",
        "Je vous propose qu'on se rappelle dans un mois, le {date_rappel}. Ça vous convient ?",
        "Je récapitule : votre objectif, c'est {objectif}, avec votre créneau {creneau}. Je vous rappelle le {date_rappel}. Bon courage, {prenom}, je compte sur vous !",
      ],
      questions: [
        { cle: "type_objectif", court: "Type d'objectif", texte: "Type d'objectif", type: "plusieurs",
          options: ["Terminer des modules", "Atteindre un % de progression", "Se connecter au moins 4 jours par semaine", "Réussir un quiz", "S'inscrire à l'examen", "Démarche de stage"] },
        { cle: "objectif", court: "Objectif fixé", texte: "Objectif formulé par l'apprenant", type: "texte", ligne: true, obligatoire: true,
          placeholder: "Ex. : terminer les modules 5 et 6 et atteindre 50 %" },
        { cle: "date_rappel", court: "Date de rappel", texte: "Date de rappel", type: "date", obligatoire: true },
        { cle: "alerte", court: "Alerte organisme", texte: "Faut-il alerter l'organisme ?", type: "un",
          options: ["Non", "Souhaite arrêter", "Souci technique", "Difficulté sur le contenu", "Autre"] },
        { cle: "alerte_detail", court: "Précisions (alerte)", texte: "Précisions pour l'alerte", type: "texte" },
      ],
    },
  ];

  // Les situations fréquentes : un bouton chacune, la réponse s'affiche au clic.
  const SITUATIONS = [
    ["Je n'ai pas le temps", "Je comprends. Si on part sur 20 minutes par jour, à quel moment ça pourrait rentrer ?"],
    ["Je n'ai plus envie", "Qu'est-ce qui vous avait donné envie de faire cette formation au départ ? (puis rappeler le but final)"],
    ["Je ne comprends pas le cours", "Notez le module précis, proposez la fiche de synthèse, et signalez le besoin à l'organisme."],
    ["Souci technique", "Notez le problème exact (message d'erreur, appareil) et transmettez-le à l'organisme le jour même."],
    ["Je veux arrêter", "Ne validez pas tout de suite : « Avant de décider, qu'est-ce qui se passe exactement ? » Puis alertez l'organisme."],
    ["Rappelez-moi plus tard", "Fixez tout de suite un jour et une heure précis, jamais un « plus tard » vague."],
    ["Difficulté personnelle lourde", "Écoutez sans jouer le psychologue, allégez l'objectif, prévenez l'organisme si besoin."],
  ];

  // Issues possibles quand l'appel n'aboutit pas.
  const NON_JOINT = {
    repondeur: { libelle: "Répondeur : message laissé", statuts: ["repondeur"], suite: "Rappeler", jours: 2 },
    injoignable: { libelle: "Pas de réponse", statuts: ["injoignable"], suite: "Rappeler", jours: 2 },
    plus_tard: { libelle: "Pas disponible : rappel convenu", statuts: ["joint", "rendez_vous"], suite: "Rappel convenu", jours: 1 },
  };
  const MESSAGE_VOCAL = "Bonjour {prenom}, c'est {moi}, votre référente de suivi pour la formation {formation}. Je vous appelais pour faire le point sur votre avancée. Je vous rappelle {quand}, ou vous pouvez me joindre à ce numéro. Belle journée !";

  window.FilRougeScript = function (outils) {
    const { sb, h, afficher, message, texteErreur, signaler, occupe, pastille, aujourdhui, ajouterJours, dateLisible, nomApprenant } = outils;
    const estAdmin = () => outils.role() === "admin";
    let chrono = null;

    function lien(chemin, ...enfants) { return h("a", { href: `#/${chemin}`, class: "lien-interne" }, ...enfants); }
    function joursDepuis(iso) {
      if (!iso) return null;
      return Math.round((new Date(`${aujourdhui()}T12:00:00Z`) - new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)) / 86400000);
    }
    function dateFr(iso) { return iso ? dateLisible(String(iso).slice(0, 10)) : ""; }
    function dateCourte(iso) {
      if (!iso) return "";
      const [a, m, j] = String(iso).slice(0, 10).split("-");
      return `${j}/${m}/${a}`;
    }
    function lireBrouillon(id) {
      try { return JSON.parse(window.sessionStorage.getItem(`script-${id}`) || "null"); } catch { return null; }
    }
    function ecrireBrouillon(id, valeur) {
      try {
        if (valeur) window.sessionStorage.setItem(`script-${id}`, JSON.stringify(valeur));
        else window.sessionStorage.removeItem(`script-${id}`);
      } catch { /* navigateur privé : pas de brouillon */ }
    }
    // replaceChildren sans les vides, listes aplaties (comme h()).
    function remplacer(el, ...enfants) {
      el.replaceChildren(...enfants.flat(Infinity).filter((e) => e !== null && e !== undefined && e !== false));
    }
    function arreterChrono() { if (chrono) { clearInterval(chrono); chrono = null; } }

    // -------------------------------------------------------------------------
    // #/script : choisir l'apprenant
    // -------------------------------------------------------------------------
    async function ecranChoix() {
      arreterChrono();
      afficher(h("p", { class: "chargement" }, "Chargement…"));
      const [liste, stats] = await Promise.all([
        sb.from("vue_qui_rappeler")
          .select("id, prenom, nom, identifiant_externe, organisme_nom, parcours, jours_sans_contact, alerte, avancement_pct, derniere_connexion")
          .order("jours_sans_contact", { ascending: false, nullsFirst: true }).limit(500),
        estAdmin() ? chargerStats() : Promise.resolve(null),
      ]);
      if (liste.error) return afficher(message("erreur", texteErreur(liste.error)));

      const recherche = h("input", { type: "search", placeholder: "Rechercher un apprenant ou un organisme…", "aria-label": "Rechercher", class: "scr-recherche" });
      const ul = h("ul", { class: "liste" });
      const dessiner = () => {
        const q = recherche.value.trim().toLowerCase();
        const lignes = liste.data.filter((a) => !q || `${nomApprenant(a)} ${a.organisme_nom || ""}`.toLowerCase().includes(q));
        ul.replaceChildren(...(lignes.length ? lignes.slice(0, 80).map((a) =>
          h("li", { class: "ligne" },
            h("a", { href: `#/script/${a.id}`, class: "ligne-titre lien-interne" }, nomApprenant(a)),
            h("span", { class: "pastilles" },
              pastille(a.alerte || "neutre", a.jours_sans_contact === null ? "jamais contacté·e" : `${a.jours_sans_contact} j sans contact`),
              a.avancement_pct === null || a.avancement_pct === undefined ? null : pastille("neutre", `${Math.round(a.avancement_pct)} %`)),
            h("span", { class: "ligne-detail" }, [a.organisme_nom, a.parcours].filter(Boolean).join(" · ")))) : [h("li", { class: "aide" }, "Aucun apprenant trouvé.")]));
      };
      recherche.addEventListener("input", dessiner);
      dessiner();

      afficher(h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Appels"),
          h("h1", {}, "Script d'appel"),
          h("p", { class: "chapo" }, "Le déroulé de l'appel de suivi, étape par étape : vous cliquez les réponses, le commentaire se rédige tout seul.")),
        stats,
        h("section", { class: "pile-serree" },
          h("div", { class: "section-titre" }, h("h2", {}, "Qui appeler ?"), h("p", {}, "Les plus urgents en premier")),
          recherche, ul)));
    }

    // Chiffres d'usage pour comparer script et saisie classique (administratrice).
    async function chargerStats() {
      const depuis = new Date(Date.now() - 30 * 86400000).toISOString();
      const [script, tous] = await Promise.all([
        sb.from("appels_script").select("mode, duree_secondes, reponses").gte("cree_le", depuis).limit(2000),
        sb.from("appels").select("id", { count: "exact", head: true }).gte("date_appel", depuis).contains("statuts", ["joint"]),
      ]);
      if (script.error) {
        return h("div", { class: "message message-info" },
          "Les réponses du script ne sont pas encore conservées (mise à jour de la base à faire). Les appels faits avec le script sont quand même enregistrés.");
      }
      const s = script.data;
      const total = tous.error ? null : tous.count || 0;
      const durees = s.map((x) => x.duree_secondes).filter((d) => Number.isFinite(d) && d > 0);
      const moyenne = durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length / 60) : null;
      const tenus = s.map((x) => x.reponses?.objectif_precedent).filter((v) => ["Oui", "En partie", "Non"].includes(v));
      const tauxTenu = tenus.length ? Math.round((tenus.filter((v) => v === "Oui").length / tenus.length) * 100) : null;
      const compteur = (valeur, libelle) => h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, valeur), h("span", { class: "compteur-libelle" }, libelle));
      return h("section", { class: "pile-serree" },
        h("div", { class: "section-titre" }, h("h2", {}, "Le script fonctionne-t-il ?"), h("p", {}, "30 derniers jours")),
        h("div", { class: "compteurs" },
          compteur(String(s.length), total === null ? "appels avec le script" : `appels avec le script sur ${total} joints`),
          compteur(`${s.filter((x) => x.mode === "commentaire").length} / ${s.filter((x) => x.mode === "reponses").length}`, "commentaires générés / réponses seules"),
          compteur(moyenne === null ? "—" : `${moyenne} min`, "durée moyenne"),
          compteur(tauxTenu === null ? "—" : `${tauxTenu} %`, "objectifs tenus d'un mois sur l'autre")),
        h("p", { class: "aide" }, "« Objectifs tenus » : réponse à la première question du script, pour les apprenants rappelés avec un objectif fixé."));
    }

    // -------------------------------------------------------------------------
    // #/script/<id> : le script
    // -------------------------------------------------------------------------
    async function ecranScript(id) {
      arreterChrono();
      afficher(h("p", { class: "chargement" }, "Chargement du script…"));
      const [apprenant, dernierAppel, moi] = await Promise.all([
        sb.from("apprenants")
          .select("id, organisme_id, prenom, nom, identifiant_externe, telephone, parcours, avancement_pct, derniere_connexion, date_dernier_contact, date_entree_formation, date_sortie_formation, date_examen, statut, organismes ( nom )")
          .eq("id", id).maybeSingle(),
        sb.from("appels").select("date_appel, prochaine_action, date_prochaine_action, statuts")
          .eq("apprenant_id", id).contains("statuts", ["joint"]).order("date_appel", { ascending: false }).limit(1),
        sb.from("profils").select("nom_affiche, email").eq("id", outils.monId()).maybeSingle(),
      ]);
      const erreur = apprenant.error || dernierAppel.error;
      if (erreur) return afficher(message("erreur", texteErreur(erreur)));
      if (!apprenant.data) return afficher(message("info", "Cet apprenant n'existe pas ou ne vous est pas accessible."), lien("script", "← Choisir un autre apprenant"));

      const a = apprenant.data;
      const precedent = (dernierAppel.data || [])[0] || null;
      const prenomMoi = String(moi.data?.nom_affiche || "").trim().split(/\s+/)[0] || "votre référente";
      // Tout l'état de l'appel en cours, gardé dans le navigateur à chaque clic.
      const brouillon = lireBrouillon(id) || {};
      const reponses = brouillon.reponses || {};
      const debut = brouillon.debut || Date.now();
      const situationsVues = new Set(brouillon.situations || []);
      let etapeActive = brouillon.etape || "preparation";
      let issue = brouillon.issue || "joint"; // joint | repondeur | injoignable | plus_tard
      let modeTexte = brouillon.mode || null;  // commentaire | reponses
      let texteRedige = brouillon.texte || "";
      if (!reponses.date_rappel) reponses.date_rappel = ajouterJours(aujourdhui(), 30);
      const sauver = () => ecrireBrouillon(id, {
        reponses, debut, etape: etapeActive, issue, situations: [...situationsVues], mode: modeTexte, texte: texteRedige,
      });

      // Données utiles aux phrases
      const jConnexion = joursDepuis(a.derniere_connexion);
      const attendu = window.FilRougeAssiduite ? window.FilRougeAssiduite.avancementAttendu(a, aujourdhui()) : null;
      const avancement = a.avancement_pct === null || a.avancement_pct === undefined ? null : Math.round(a.avancement_pct);
      const formation = a.parcours || "votre formation";
      const creneauTexte = () => {
        const t = [reponses.temps, (reponses.jours || []).length ? (reponses.jours || []).join(", ").toLowerCase() : null,
          reponses.moment ? `le ${String(reponses.moment).toLowerCase()}` : null, reponses.heure].filter(Boolean);
        return t.length ? t.join(", ") : "[jours] de [heure] à [heure]";
      };
      const remplir = (modele) => modele
        .replaceAll("{prenom}", a.prenom || "")
        .replaceAll("{moi}", prenomMoi)
        .replaceAll("{formation}", formation)
        .replaceAll("{chez}", a.organismes?.nom ? ` chez ${a.organismes.nom}` : "")
        .replaceAll("{derniere_connexion}", a.derniere_connexion ? dateFr(a.derniere_connexion) : "[date inconnue]")
        .replaceAll("{depuis}", jConnexion === null ? "" : `, soit ${jConnexion} jours`)
        .replaceAll("{avancement}", avancement === null ? "[X %]" : `${avancement} %`)
        .replaceAll("{attendu}", attendu === null ? "" : `, alors qu'à ce stade on vise plutôt ${Math.round(attendu)} %`)
        .replaceAll("{objectif_avant}", precedent?.prochaine_action ? `« ${precedent.prochaine_action} »` : "[objectif]")
        .replaceAll("{objectif}", reponses.objectif ? `« ${reponses.objectif} »` : "[objectif]")
        .replaceAll("{creneau}", creneauTexte())
        .replaceAll("{date_rappel}", reponses.date_rappel ? dateFr(reponses.date_rappel) : "[date]")
        .replaceAll("{quand}", "dans deux jours");

      // --- En-tête : qui, et ce qu'on sait déjà ---
      const tempsEcoule = h("span", { class: "scr-chrono", "aria-live": "off" });
      const majChrono = () => {
        const s = Math.max(0, Math.round((Date.now() - debut) / 1000));
        tempsEcoule.textContent = `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
      };
      majChrono();
      chrono = setInterval(() => { if (!document.body.contains(tempsEcoule)) arreterChrono(); else majChrono(); }, 1000);

      const infos = h("div", { class: "compteurs" },
        compteur(avancement === null ? "—" : `${avancement} %`, attendu === null ? "avancement" : `avancement (attendu ${Math.round(attendu)} %)`),
        compteur(a.derniere_connexion ? `${jConnexion} j` : "—", a.derniere_connexion ? `sans connexion (le ${dateFr(a.derniere_connexion)})` : "dernière connexion inconnue"),
        compteur(a.date_dernier_contact ? dateFr(a.date_dernier_contact) : "—", "dernier contact"),
        compteur(a.date_examen ? dateFr(a.date_examen) : "—", "examen"));
      const objectifAvant = precedent?.prochaine_action
        ? h("p", { class: "message message-info" }, "Objectif fixé au dernier appel", precedent.date_appel ? ` (${dateFr(precedent.date_appel)})` : "", " : ", h("strong", {}, precedent.prochaine_action))
        : null;

      // --- Barre des étapes : un bouton par étape ---
      const barre = h("div", { class: "scr-etapes", role: "tablist", "aria-label": "Étapes du script" });
      const panneau = h("div", { class: "scr-panneau" });

      function compteur(valeur, libelle) {
        return h("div", { class: "compteur" }, h("span", { class: "compteur-valeur compteur-valeur-date" }, valeur), h("span", { class: "compteur-libelle" }, libelle));
      }

      const ORDRE = [...ETAPES.map((e) => e.cle), "situations", "commentaire"];
      const TITRES = Object.fromEntries([...ETAPES.map((e) => [e.cle, e.titre]), ["situations", "Situations"], ["commentaire", "Commentaire"]]);
      function aller(cle) {
        etapeActive = cle;
        sauver();
        dessinerBarre();
        dessinerPanneau();
        panneau.scrollIntoView({ block: "nearest" });
      }
      // Une étape est « faite » dès qu'une réponse y est donnée (l'étape 7 : l'objectif).
      function etapeRemplie(cle) {
        if (cle === "objectif") return Boolean(String(reponses.objectif || "").trim());
        if (cle === "situations") return situationsVues.size > 0;
        if (cle === "commentaire") return Boolean(texteRedige.trim());
        const e = ETAPES.find((x) => x.cle === cle);
        if (!e) return false;
        return e.questions.some((q) => q.type !== "date" && (Array.isArray(reponses[q.cle]) ? reponses[q.cle].length : String(reponses[q.cle] || "").trim()));
      }
      function dessinerBarre() {
        barre.replaceChildren(...ORDRE.map((cle) => h("button", {
          type: "button", role: "tab", class: `scr-etape${etapeRemplie(cle) ? " scr-etape-faite" : ""}`,
          "aria-selected": etapeActive === cle ? "true" : "false", onclick: () => aller(cle),
        }, TITRES[cle])));
      }

      // Une question : boutons cliquables (QCM) ou champ libre.
      function question(q) {
        const id = `scr-${q.cle}`;
        if (q.type === "texte" || q.type === "date") {
          const champ = h(q.type === "texte" && !q.ligne ? "textarea" : "input", {
            id, type: q.type === "date" ? "date" : null, rows: q.type === "texte" ? "2" : null, placeholder: q.placeholder || null,
          });
          champ.value = reponses[q.cle] || "";
          champ.addEventListener("input", () => { reponses[q.cle] = champ.value; sauver(); dessinerBarre(); });
          const extra = q.type === "date"
            ? h("div", { class: "raccourcis" }, h("span", { class: "aide" }, "Dans :"),
                [["15 j", 15], ["1 mois", 30], ["2 mois", 60]].map(([t, n]) => h("button", { type: "button", class: "puce", onclick: () => {
                  champ.value = ajouterJours(aujourdhui(), n); reponses[q.cle] = champ.value; sauver();
                } }, t)))
            : null;
          return h("div", { class: "scr-question" }, h("label", { for: id, class: "etiquette" }, q.texte, q.obligatoire ? " *" : ""), champ, extra);
        }
        const multiple = q.type === "plusieurs";
        const groupe = h("div", { class: "scr-choix", role: multiple ? "group" : "radiogroup", "aria-label": q.texte });
        const dessiner = () => groupe.replaceChildren(...q.options.map((opt) => {
          const actif = multiple ? (reponses[q.cle] || []).includes(opt) : reponses[q.cle] === opt;
          return h("button", {
            type: "button", class: `scr-option${actif ? " scr-option-active" : ""}`,
            "aria-pressed": actif ? "true" : "false",
            onclick: () => {
              if (multiple) {
                const v = new Set(reponses[q.cle] || []);
                v.has(opt) ? v.delete(opt) : v.add(opt);
                reponses[q.cle] = q.options.filter((o) => v.has(o));
              } else {
                reponses[q.cle] = actif ? null : opt;
              }
              sauver(); dessiner(); dessinerBarre();
              // La phrase de l'étape 5 et le récapitulatif se mettent à jour.
              if (["temps", "jours", "moment"].includes(q.cle)) dessinerPhrases();
            },
          }, opt);
        }));
        dessiner();
        return h("div", { class: "scr-question" }, h("p", { class: "etiquette" }, q.texte, multiple ? h("span", { class: "aide" }, " · plusieurs réponses possibles") : null), groupe);
      }

      let dessinerPhrases = () => {};
      function dessinerPanneau() {
        dessinerPhrases = () => {};
        if (etapeActive === "situations") return remplacer(panneau, ...panneauSituations());
        if (etapeActive === "commentaire") return remplacer(panneau, ...panneauCommentaire());
        const e = ETAPES.find((x) => x.cle === etapeActive) || ETAPES[0];
        const zonePhrases = h("div", { class: "pile-serree" });
        dessinerPhrases = () => zonePhrases.replaceChildren(...(e.phrases || []).map((p) => h("blockquote", { class: "scr-phrase" }, remplir(p))));
        dessinerPhrases();
        const index = ORDRE.indexOf(e.cle);
        remplacer(panneau, 
          h("div", { class: "section-titre" }, h("h2", {}, e.titre), h("p", {}, e.duree)),
          e.intro ? h("p", { class: "aide" }, e.intro) : null,
          e.cle === "preparation" ? [infos, objectifAvant] : null,
          e.cle === "ouverture" ? blocNonJoint() : null,
          zonePhrases,
          e.questions.map(question),
          e.conseil ? h("p", { class: "scr-conseil" }, e.conseil) : null,
          h("div", { class: "actions-ligne" },
            index > 0 ? h("button", { type: "button", class: "bouton bouton-secondaire", onclick: () => aller(ORDRE[index - 1]) }, "← Précédent") : null,
            h("button", { type: "button", class: "bouton", onclick: () => aller(ORDRE[index + 1]) }, index + 1 < ETAPES.length ? "Étape suivante →" : "Rédiger le commentaire →")));
      }

      // Appel qui n'aboutit pas : un bouton par cas, on file au commentaire.
      function blocNonJoint() {
        return h("div", { class: "scr-non-joint" },
          h("p", { class: "etiquette" }, "L'apprenant ne répond pas ou ne peut pas parler ?"),
          h("div", { class: "scr-choix" },
            Object.entries(NON_JOINT).map(([cle, n]) => h("button", {
              type: "button", class: `scr-option${issue === cle ? " scr-option-active" : ""}`,
              onclick: () => { issue = issue === cle ? "joint" : cle; sauver(); if (issue !== "joint") aller("commentaire"); else dessinerPanneau(); },
            }, n.libelle))));
      }

      function panneauSituations() {
        const zone = h("div", { class: "scr-situations" });
        const dessiner = () => zone.replaceChildren(...SITUATIONS.map(([titre, reponse]) => {
          const ouvert = situationsVues.has(titre);
          return h("div", { class: `scr-situation${ouvert ? " scr-situation-ouverte" : ""}` },
            h("button", { type: "button", class: "scr-option", "aria-expanded": ouvert ? "true" : "false",
              onclick: () => { ouvert ? situationsVues.delete(titre) : situationsVues.add(titre); sauver(); dessiner(); } }, `« ${titre} »`),
            ouvert ? h("p", { class: "scr-phrase" }, reponse) : null);
        }));
        dessiner();
        return [
          h("div", { class: "section-titre" }, h("h2", {}, "Situations fréquentes"), h("p", {}, "À ouvrir quand l'apprenant le dit")),
          h("p", { class: "aide" }, "Cliquez sur ce que dit l'apprenant : la réponse s'affiche, et la situation est notée dans le compte rendu."),
          zone,
          h("div", { class: "actions-ligne" }, h("button", { type: "button", class: "bouton", onclick: () => aller("commentaire") }, "Rédiger le commentaire →")),
        ];
      }

      // -----------------------------------------------------------------------
      // Rédaction : commentaire généré, ou réponses seules
      // -----------------------------------------------------------------------
      const liste = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).toLowerCase());
      const phraseListe = (v) => {
        const l = liste(v);
        return l.length <= 1 ? (l[0] || "") : `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}`;
      };
      const ajoutPrecision = (t) => (t && t.trim() ? ` ${t.trim().replace(/([^.!?])$/, "$1.")}` : "");
      const duree = () => Math.max(0, Math.round((Date.now() - debut) / 1000));

      function genererCommentaire() {
        const r = reponses;
        if (issue !== "joint") {
          const n = NON_JOINT[issue];
          return [`${n.libelle}.`, issue === "plus_tard" ? `Rappel convenu le ${dateCourte(r.date_rappel)}.` : null].filter(Boolean).join(" ");
        }
        const L = [];
        L.push(`Appel de suivi : apprenant joint (${Math.max(1, Math.round(duree() / 60))} min).${r.humeur ? ` Moral : ${r.humeur.toLowerCase()}.` : ""}${ajoutPrecision(r.humeur_detail)}`);
        if (r.objectif_precedent && r.objectif_precedent !== "Pas d'objectif fixé") {
          L.push(`Objectif du dernier appel${precedent?.prochaine_action ? ` (« ${precedent.prochaine_action} »)` : ""} : ${r.objectif_precedent === "Oui" ? "tenu" : r.objectif_precedent === "En partie" ? "tenu en partie" : "non tenu"}.`);
        }
        const constat = [
          avancement === null ? null : `avancement ${avancement} %${attendu === null ? "" : ` (attendu ${Math.round(attendu)} %)`}`,
          a.derniere_connexion ? `dernière connexion le ${dateCourte(a.derniere_connexion)} (${jConnexion} j)` : null,
        ].filter(Boolean).join(", ");
        if (r.constat || constat || liste(r.causes).length) {
          L.push(`Constat : ${[r.constat ? r.constat.toLowerCase() : null, constat].filter(Boolean).join(" ; ")}.${liste(r.causes).length ? ` Cause${liste(r.causes).length > 1 ? "s" : ""} : ${phraseListe(r.causes)}.` : ""}${ajoutPrecision(r.causes_detail)}`);
        }
        if (r.module || r.retenu || r.quiz) {
          L.push(`Dernier travail : ${[r.module ? r.module.trim() : null, r.retenu ? `retenu ${r.retenu === "Ne s'en souvient plus" ? "— ne s'en souvient plus" : r.retenu.toLowerCase()}` : null, r.quiz ? `exercices ${r.quiz.toLowerCase()}` : null].filter(Boolean).join(", ")}.`);
        }
        if (liste(r.methode_actuelle).length || liste(r.pistes).length) {
          L.push(`Méthode : ${liste(r.methode_actuelle).length ? phraseListe(r.methode_actuelle) : "non précisée"}.${liste(r.pistes).length ? ` Piste${liste(r.pistes).length > 1 ? "s" : ""} proposée${liste(r.pistes).length > 1 ? "s" : ""} : ${phraseListe(r.pistes)}.` : ""}${ajoutPrecision(r.methode_detail)}`);
        }
        const creneau = [r.temps, liste(r.jours).length ? phraseListe(r.jours) : null, r.moment ? `le ${r.moment.toLowerCase()}` : null, r.heure].filter(Boolean).join(", ");
        if (r.orga_actuelle || creneau) {
          L.push(`Organisation : ${r.orga_actuelle ? `jusqu'ici ${r.orga_actuelle.toLowerCase()}` : "non précisée"}.${creneau ? ` Créneau convenu : ${creneau}.` : ""}${liste(r.conseils_orga).length ? ` Conseils : ${phraseListe(r.conseils_orga)}.` : ""}`);
        }
        if (liste(r.reussites).length || r.ressenti_fin) {
          L.push(`${liste(r.reussites).length ? `Points positifs soulignés : ${phraseListe(r.reussites)}. ` : ""}${r.ressenti_fin ? `En fin d'appel : ${r.ressenti_fin.toLowerCase()}.` : ""}`.trim());
        }
        if (situationsVues.size) L.push(`Situations rencontrées : ${[...situationsVues].map((s) => `« ${s} »`).join(", ")}.`);
        L.push(`Objectif d'ici le prochain appel : ${r.objectif ? r.objectif.trim() : "à définir"}.${liste(r.type_objectif).length ? ` (${phraseListe(r.type_objectif)})` : ""}`);
        if (r.date_rappel) L.push(`Rappel prévu le ${dateCourte(r.date_rappel)}.`);
        if (liste(r.echeances).length) L.push(`Échéances à surveiller : ${phraseListe(r.echeances)}.`);
        if (r.alerte && r.alerte !== "Non") L.push(`À signaler à l'organisme : ${r.alerte.toLowerCase()}.${ajoutPrecision(r.alerte_detail)}`);
        return L.join("\n");
      }

      function reponsesSeules() {
        if (issue !== "joint") return `Issue de l'appel : ${NON_JOINT[issue].libelle}`;
        const L = [];
        for (const e of ETAPES) {
          for (const q of e.questions) {
            const v = reponses[q.cle];
            const texte = Array.isArray(v) ? v.join(", ") : q.type === "date" && v ? dateCourte(v) : (v || "").trim();
            if (texte) L.push(`${q.court} : ${texte}`);
          }
        }
        if (situationsVues.size) L.push(`Situations : ${[...situationsVues].join(", ")}`);
        return L.join("\n") || "Aucune réponse saisie.";
      }

      // Version pour l'organisme : sans moral, causes personnelles ni précisions confiées.
      function compteRenduOrganisme() {
        const r = reponses;
        const causes = liste(r.causes).filter((c) => !c.includes("personnelle"));
        const L = [`Appel de suivi le ${dateCourte(aujourdhui())} : apprenant joint.`];
        const etat = [avancement === null ? null : `avancement ${avancement} %`, a.derniere_connexion ? `dernière connexion le ${dateCourte(a.derniere_connexion)}` : null].filter(Boolean);
        if (etat.length) L.push(`Situation : ${etat.join(", ")}.`);
        if (causes.length) L.push(`Frein identifié : ${phraseListe(causes)}.`);
        const actions = [liste(r.pistes).length ? `méthode de travail conseillée (${phraseListe(r.pistes)})` : null,
          r.temps || liste(r.jours).length ? "créneau de travail régulier fixé avec l'apprenant" : null].filter(Boolean);
        if (actions.length) L.push(`Actions : ${actions.join(" ; ")}.`);
        if (r.objectif) L.push(`Objectif fixé : ${r.objectif.trim()}.`);
        if (r.date_rappel) L.push(`Prochain point prévu le ${dateCourte(r.date_rappel)}.`);
        if (r.alerte && r.alerte !== "Non") L.push(`Point d'attention : ${r.alerte.toLowerCase()}.`);
        return L.join("\n");
      }

      function statutsAppel() {
        if (issue !== "joint") return NON_JOINT[issue].statuts;
        const ecart = reponses.date_rappel ? joursDepuis(aujourdhui()) - joursDepuis(reponses.date_rappel) : null;
        if (ecart !== null && ecart >= 25 && ecart <= 35) return ["joint", "suivi_30"];
        if (ecart !== null && ecart >= 10 && ecart <= 20) return ["joint", "suivi_15"];
        return ecart ? ["joint", "rendez_vous"] : ["joint"];
      }

      function panneauCommentaire() {
        const zone = h("div");
        const nonJoint = issue !== "joint";
        const texte = h("textarea", { id: "scr-texte", rows: "12", placeholder: "Choisissez ci-dessus : générer le commentaire, ou garder les réponses seulement." });
        texte.value = texteRedige;
        texte.addEventListener("input", () => { texteRedige = texte.value; sauver(); dessinerBarre(); });

        const boutonGenerer = h("button", { type: "button", class: "bouton" }, "Générer le commentaire");
        const boutonReponses = h("button", { type: "button", class: "bouton bouton-secondaire" }, "Garder les réponses seulement");
        const majModes = () => {
          boutonGenerer.setAttribute("aria-pressed", modeTexte === "commentaire" ? "true" : "false");
          boutonReponses.setAttribute("aria-pressed", modeTexte === "reponses" ? "true" : "false");
          boutonGenerer.className = modeTexte === "reponses" ? "bouton bouton-secondaire" : "bouton";
          boutonReponses.className = modeTexte === "reponses" ? "bouton" : "bouton bouton-secondaire";
        };
        const choisir = (m) => {
          modeTexte = m;
          texte.value = m === "commentaire" ? genererCommentaire() : reponsesSeules();
          texteRedige = texte.value;
          sauver();
          majModes();
          dessinerBarre();
          texte.focus();
        };
        boutonGenerer.addEventListener("click", () => choisir("commentaire"));
        boutonReponses.addEventListener("click", () => choisir("reponses"));
        majModes();

        // Message vocal à lire si répondeur.
        const vocal = issue === "repondeur" ? h("blockquote", { class: "scr-phrase" }, remplir(MESSAGE_VOCAL)) : null;

        // Suite prévue
        const suite = h("input", { id: "scr-suite", type: "text" });
        suite.value = nonJoint ? NON_JOINT[issue].suite : (reponses.objectif ? `Objectif : ${reponses.objectif.trim()}` : "Point d'étape");
        const dateSuite = h("input", { id: "scr-date-suite", type: "date" });
        dateSuite.value = nonJoint && issue !== "plus_tard" ? ajouterJours(aujourdhui(), NON_JOINT[issue].jours) : (reponses.date_rappel || "");
        dateSuite.addEventListener("change", () => { if (!nonJoint || issue === "plus_tard") { reponses.date_rappel = dateSuite.value; sauver(); } });

        // Compte rendu organisme (optionnel)
        const avecCR = h("input", { type: "checkbox", id: "scr-avec-cr" });
        const texteCR = h("textarea", { id: "scr-cr", rows: "6", hidden: true });
        avecCR.addEventListener("change", () => {
          texteCR.hidden = !avecCR.checked;
          if (avecCR.checked && !texteCR.value) texteCR.value = compteRenduOrganisme();
        });

        const boutonEnregistrer = h("button", { type: "button", class: "bouton" }, "Enregistrer l'appel");
        const boutonHistorique = h("button", { type: "button", class: "bouton bouton-secondaire", title: "Range l'appel dans l'historique sans le publier dans les commentaires" }, "Historique seulement");

        async function enregistrer(publier, bouton) {
          if (!nonJoint && !String(reponses.objectif || "").trim()) {
            return signaler(zone, "erreur", "Fixez l'objectif avec l'apprenant (étape 7) avant d'enregistrer.");
          }
          if (!modeTexte && !texte.value.trim()) {
            return signaler(zone, "erreur", "Choisissez « Générer le commentaire » ou « Garder les réponses seulement ».");
          }
          signaler(zone);
          occupe(bouton, true, "Enregistrement…");
          const commun = {
            p_apprenant: a.id,
            p_statuts: statutsAppel(),
            p_commentaire: texte.value,
            p_prochaine_action: suite.value,
            p_date_prochaine_action: dateSuite.value || null,
            p_publier: publier,
          };
          const reponsesJson = { ...reponses, issue, situations: [...situationsVues] };
          let r = await sb.rpc("enregistrer_appel_script", { ...commun, p_mode: modeTexte || "commentaire", p_reponses: reponsesJson, p_duree_secondes: duree() });
          // Base pas encore à jour : enregistrement classique, l'appel n'est pas perdu.
          if (r.error && (r.error.code === "PGRST202" || /enregistrer_appel_script/.test(r.error.message || ""))) {
            r = await sb.rpc("enregistrer_appel", { ...commun, p_canal: "telephone", p_date_appel: new Date().toISOString() });
          }
          if (r.error) { occupe(bouton, false); return signaler(zone, "erreur", texteErreur(r.error)); }
          if (avecCR.checked && texteCR.value.trim()) {
            const cr = await sb.from("comptes_rendus").insert({ apprenant_id: a.id, organisme_id: a.organisme_id, contenu: texteCR.value.trim() });
            if (cr.error) { occupe(bouton, false); return signaler(zone, "erreur", `Appel enregistré, mais pas le compte rendu : ${texteErreur(cr.error)}`); }
          }
          ecrireBrouillon(id, null);
          arreterChrono();
          occupe(bouton, false);
          afficher(h("div", { class: "pile" },
            message("info", publier ? "Appel enregistré et publié dans les commentaires. Le compteur repart à zéro." : "Appel rangé dans l'historique. Le compteur repart à zéro."),
            h("div", { class: "actions-ligne" },
              h("a", { class: "bouton", href: `#/apprenant/${a.id}` }, "Voir la fiche"),
              h("a", { class: "bouton bouton-secondaire", href: "#/script" }, "Appeler un autre apprenant"))));
        }
        boutonEnregistrer.addEventListener("click", () => enregistrer(true, boutonEnregistrer));
        boutonHistorique.addEventListener("click", () => enregistrer(false, boutonHistorique));

        return [
          h("div", { class: "section-titre" }, h("h2", {}, "Commentaire de l'appel"), h("p", {}, nonJoint ? NON_JOINT[issue].libelle : "À relire avant d'enregistrer")),
          nonJoint ? h("p", { class: "message message-info" }, "Appel non abouti. ",
            h("button", { type: "button", class: "bouton-lien", onclick: () => { issue = "joint"; sauver(); aller("ouverture"); } }, "Finalement joint·e ? Reprendre le script")) : null,
          vocal,
          h("div", { class: "actions-ligne scr-modes" }, boutonGenerer, boutonReponses),
          h("p", { class: "aide" }, "« Générer le commentaire » rédige un texte à partir de vos réponses. « Garder les réponses seulement » conserve la liste des réponses, sans rédaction. Dans les deux cas, vous pouvez modifier le texte."),
          h("label", { for: "scr-texte", class: "etiquette" }, "Commentaire (interne, jamais visible par l'organisme)"),
          texte,
          h("div", { class: "deux-colonnes" },
            h("label", { for: "scr-suite" }, "Suite prévue", suite),
            h("label", { for: "scr-date-suite" }, "Date de rappel", dateSuite)),
          nonJoint ? null : h("label", { class: "scr-case" }, avecCR, " Créer aussi un compte rendu pour l'organisme (visible par le client, sans les éléments personnels)"),
          texteCR,
          zone,
          h("div", { class: "actions-ligne" }, boutonEnregistrer, boutonHistorique),
          h("p", { class: "aide" }, "L'historique d'appels garde la date, l'heure et le statut. Le commentaire va dans l'onglet « Notes internes » de la fiche. « Enregistrer l'appel » le publie aussi dans le fil de commentaires, « Historique seulement » non."),
        ];
      }

      dessinerBarre();
      dessinerPanneau();
      afficher(h("div", { class: "pile scr-page" },
        h("div", { class: "scr-haut" },
          h("p", { class: "surtitre" }, lien("script", "← Choisir un autre apprenant"), " · ", lien(`apprenant/${a.id}`, "Fiche de l'apprenant")),
          h("div", { class: "scr-titre" },
            h("h1", {}, nomApprenant(a)),
            h("span", { class: "scr-chrono-bloc", title: "Temps écoulé depuis l'ouverture du script" }, "⏱ ", tempsEcoule)),
          h("p", { class: "chapo" }, [a.organismes?.nom, a.parcours].filter(Boolean).join(" · "),
            a.telephone ? [" · ", h("a", { href: `tel:${a.telephone.replace(/[^\d+]/g, "")}` }, a.telephone)] : null),
          barre),
        panneau));
    }

    return {
      route(morceaux) {
        const id = (morceaux || []).find((m) => UUID.test(m));
        return id ? ecranScript(id) : ecranChoix();
      },
      quitter: arreterChrono,
    };
  };
})();
