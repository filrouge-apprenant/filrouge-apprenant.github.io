// =============================================================================
// Fil Rouge Apprenants — Scripts de vente (#/scripts-vente), administratrice
// =============================================================================
//   #/scripts-vente                         script de démarchage des organismes
//   #/scripts-vente/objections              traitement des objections (objections.js)
//   #/scripts-vente/<onglet>/<organisme>    même chose, ouvert depuis la fiche
//                                           d'un organisme : le nom du contact
//                                           remplace « Madame X » dans les phrases.
//
// Démarchage : script déroulé d'un trait, objections fixées à droite.
// Objections : chaque partie se déplie, et un bouton « Écouter » lit le texte à voix haute
// (voix du navigateur, gratuite, rien n'est envoyé ailleurs).
// Le contenu se modifie ici, dans DEMARCHAGE et OBJECTIONS, sans toucher au reste.
// Sécurité : tout le texte passe par h() (textContent), jamais innerHTML.
// =============================================================================

(function () {
  "use strict";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ---------------------------------------------------------------------------
  // Contenu. Chaque partie : un titre, puis des blocs.
  //   dire    : phrase à dire (affichée en citation) ; {contact} = nom du contact
  //   conseil : consigne pour toi
  //   liste   : liste de points (consignes)
  //   questions : liste numérotée de phrases à dire
  // ---------------------------------------------------------------------------
  const DEMARCHAGE = {
    titre: "Script de démarchage",
    chapo: "Objectif de l'appel : décrocher un rendez-vous de 15 minutes ou lancer l'essai de 30 jours sur ses apprenants à risque. Pas de vendre au téléphone. Tu poses des questions, le client parle plus que toi.",
    parties: [
      { titre: "Avant l'appel (2 minutes)", blocs: [
        { liste: [
          "Regarde le site du centre : formations à distance ? CAP, titres pro, CPF ? Certifié Qualiopi ?",
          "Note un détail précis (une formation, un chiffre, un avis).",
          "Sur la fiche : bouton « 🏢 Pappers » pour sa taille et son chiffre d'affaires, avis Google pour repérer les plaintes sur le suivi.",
          "Cible : directeur, responsable pédagogique ou référent Qualiopi.",
        ] },
      ] },
      { titre: "Passer le standard", blocs: [
        { dire: "Bonjour, Émilie Rachas, de Fil Rouge Apprenants. Je souhaiterais parler à la personne qui s'occupe du suivi des apprenants, c'est bien {contact} ?" },
        { conseil: "Si on te demande pourquoi :" },
        { dire: "C'est au sujet de l'abandon des apprenants en formation à distance. Qui est le mieux placé pour en parler ?" },
      ] },
      { titre: "L'accroche (20 secondes)", blocs: [
        { dire: "Bonjour {contact}, Émilie Rachas, de Fil Rouge Apprenants. J'aide les centres de formation à distance à garder leurs apprenants jusqu'à l'examen. Vous avez deux minutes, là, maintenant ?" },
        { variante: "Si ce n'est pas le moment : « Pas de souci. Je vous rappelle plutôt demain matin ou jeudi après-midi ? »" },
        { dire: "Merci. Je vous appelle parce que vous proposez des formations à distance, et c'est là que les apprenants décrochent le plus, souvent sans que personne ne s'en rende compte à temps. Aujourd'hui, chez vous, comment vous repérez un apprenant qui commence à décrocher ?" },
        { conseil: "Une phrase, un silence. Après la question, tais-toi et laisse-le parler. Si tu connais un détail sur le centre (ses formations, leur durée), glisse-le à la place de « vous proposez des formations à distance ». Ne dis jamais « je me permets de vous présenter »." },
      ] },
      { titre: "Les questions de découverte", blocs: [
        { questions: [
          "Vos apprenants arrivent plutôt par le CPF, France Travail ou vos entreprises ?",
          "Aujourd'hui, comment se passe le suivi de vos apprenants entre deux cours ?",
          "Vous avez une idée du nombre d'apprenants qui abandonnent ou ne se présentent pas à l'examen ?",
          "Qui s'en occupe chez vous, et est-ce que cette personne a le temps de tous les appeler ?",
          "Pour Qualiopi, comment vous prouvez la prévention des ruptures de parcours ?",
          "Qu'est-ce que ça vous coûte, un apprenant qui lâche en cours de route ?",
          "Là, aujourd'hui, combien de vos apprenants ne se sont pas connectés depuis deux ou trois semaines, à peu près ?",
        ] },
        { conseil: "Garde bien sa réponse à la dernière question : c'est le chiffre sur lequel tu vas proposer l'essai (« ces 20 apprenants-là »)." },
        { conseil: "Selon la réponse à la 1re question : France Travail = chaque heure d'absence n'est pas payée, parle d'heures perdues. CPF = le risque se joue avant 80 % de progression, demande quand les apprenants décrochent. N'explique jamais la règle : vise ta question." },
        { conseil: "Écoute jusqu'au bout sans couper, note ses mots exacts, puis reformule avec SES mots (pas les tiens) et fais-le valider :" },
        { dire: "Si je vous ai bien compris, aujourd'hui [ses mots : comment ça se passe], et ce qui vous gêne, c'est [ses mots : le problème]. C'est bien ça ?" },
        { variante: "Attends son « oui ». S'il corrige, reprends sa correction avant de présenter." },
      ] },
      { titre: "La présentation (30 secondes, seulement après les questions)", blocs: [
        { variante: "Commence par le bénéfice qui répond à ce qu'il t'a dit en premier (temps, abandons ou Qualiopi), avec ses mots : « Vous m'avez dit que… »." },
        { dire: "Justement, c'est mon métier. J'appelle chacun de vos apprenants une fois par mois : on fait le point sur où il en est, on repère ce qui le bloque, et on fixe un objectif précis jusqu'au prochain appel. Concrètement, ça vous apporte trois choses." },
        { dire: "Un, du temps : vous n'avez plus à relancer vous-même. Vous m'envoyez la liste de vos apprenants, et je m'occupe de tout, sans rien à installer ni à former." },
        { dire: "Deux, des apprenants qui vont au bout : dès qu'un apprenant commence à décrocher, vous avez une alerte et j'agis tout de suite, avant qu'il abandonne. Chaque formation menée jusqu'au bout, c'est du chiffre d'affaires que vous gardez." },
        { dire: "Trois, vos preuves pour Qualiopi : chaque appel est tracé avec un compte rendu daté. Le jour de l'audit, vos preuves d'accompagnement et de prévention des abandons sont prêtes, sans rien préparer." },
        { dire: "Et côté prix, vous ne payez que les appels réellement passés : pour 30 apprenants, c'est 15 € HT par apprenant et par mois, soit 450 € HT. Une seule formation sauvée, et c'est remboursé." },
        { dire: "Qu'est-ce que vous en pensez ?" },
      ] },
      { titre: "La conclusion : l'essai de 30 jours", blocs: [
        { dire: "Plutôt que de me croire sur parole, je vous propose de le mesurer sur vos propres apprenants. Vous m'avez dit que vous en aviez [son chiffre] qui ne se sont pas connectés depuis quelques semaines. Pendant 30 jours, j'en appelle 20, deux fois chacun, avec un email de relance quand ils ne répondent pas." },
        { dire: "Et pour que le résultat soit clair, on garde un petit groupe comparable que je n'appelle pas. Au bout de 30 jours, vous voyez noir sur blanc combien ont repris leur formation chez ceux que j'ai appelés, et chez les autres." },
        { dire: "Au démarrage, on fixe ensemble un objectif de reprise, adapté à votre plateforme. S'il est atteint, on continue au tarif normal pendant 3 mois. S'il ne l'est pas, vous ne me devez rien." },
        { dire: "On cale 15 minutes cette semaine pour choisir les apprenants ensemble, mardi ou jeudi ?" },
        { conseil: "Toujours proposer deux dates, jamais « quand vous voulez ». L'objectif ne se fixe pas au téléphone : il se fixe au rendez-vous de démarrage, une fois que tu as vu sa plateforme (connexions visibles, appli ou non). Si elle n'affiche pas les connexions, l'objectif peut porter sur la progression ou sur les élèves joints qui ont un objectif fixé." },
        { variante: "S'il demande « et si l'objectif n'est pas atteint ? » : « Alors on s'arrête là, vous ne payez rien, et vous gardez tous les comptes rendus. Je préfère être jugée sur des résultats. »" },
        { variante: "S'il trouve 30 jours longs : « C'est le temps minimum pour voir un apprenant reprendre vraiment : un appel ne suffit pas, c'est la relance au 15e jour qui fait la différence. »" },
        { variante: "Quand il a choisi, récapitule avant de raccrocher :" },
        { dire: "Parfait, je récapitule : on se parle [jour et heure], d'ici là vous m'envoyez la liste de vos apprenants qui ne se sont pas connectés depuis deux à quatre semaines, et on lance l'essai de 30 jours. C'est bon pour vous ?" },
      ] },
      { titre: "Si tu tombes sur la messagerie", blocs: [
        { dire: "Bonjour {contact}, Émilie Rachas, de Fil Rouge Apprenants. J'aide les centres de formation à distance à réduire les abandons avant l'examen, par un suivi téléphonique des apprenants. Je vous envoie un petit mail et je vous rappelle jeudi. Mon numéro : 06 17 75 56 17. Bonne journée !" },
      ] },
      { titre: "Après l'appel", blocs: [
        { liste: [
          "Mail dans l'heure avec le lien de l'offre d'essai de 30 jours et l'exemple de rapport mensuel.",
          "Note l'échange et la date de relance sur la fiche de l'organisme.",
        ] },
      ] },
    ],
  };

  // Les objections sont dans objections.js (bibliothèque complète, un bouton par thème).
  const OBJECTIONS = {
    titre: "Traitement des objections",
    chapo: "Un bouton par objection : la réponse s'ouvre en 4 temps (accueillir, creuser, répondre, relancer).",
    parties: [],
  };

  const ONGLETS = { demarchage: DEMARCHAGE, objections: OBJECTIONS };

  // Contenu lisible depuis les autres écrans (ex. simulateur d'appel prospect).
  window.FilRougeScriptDemarchage = DEMARCHAGE;

  window.FilRougeScriptsVente = function (ctx) {
    const { sb, h, afficher } = ctx;

    // --- Lecture à voix haute (voix du navigateur) ---
    const V = window.FilRougeVoix;
    const voixDispo = Boolean(V && V.dispo);
    let boutonEnCours = null;
    function arreterLecture() {
      if (voixDispo) V.arreter();
      if (boutonEnCours) boutonEnCours.textContent = "🔊 Écouter";
      boutonEnCours = null;
    }
    function lire(texte, bouton) {
      if (!voixDispo) return;
      const memeBouton = boutonEnCours === bouton;
      arreterLecture();
      if (memeBouton) return; // deuxième clic = stop
      boutonEnCours = bouton;
      bouton.textContent = "⏹ Arrêter";
      V.parler(texte).then(() => { if (boutonEnCours === bouton) arreterLecture(); });
    }
    window.addEventListener("hashchange", arreterLecture);

    const remplir = (texte, contact) => texte.replaceAll("{contact}", contact || "Madame X");

    // Texte lu à voix haute pour une partie.
    function texteParlé(partie, contact) {
      const morceaux = [partie.titre];
      for (const b of partie.blocs) {
        if (b.dire) morceaux.push(remplir(b.dire, contact));
        if (b.conseil) morceaux.push(b.conseil);
        if (b.variante) morceaux.push(b.variante);
        if (b.liste) morceaux.push(...b.liste);
        if (b.questions) morceaux.push(...b.questions.map((q, i) => `${i + 1}. ${remplir(q, contact)}`));
      }
      return morceaux.join(" \n");
    }

    function dessinerPartie(partie, ouverte, contact) {
      const ecouter = voixDispo ? h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "🔊 Écouter") : null;
      if (ecouter) ecouter.addEventListener("click", (e) => { e.preventDefault(); lire(texteParlé(partie, contact), ecouter); });
      const corps = partie.blocs.map((b) => {
        if (b.dire) return h("blockquote", { class: "sv-dire" }, `« ${remplir(b.dire, contact)} »`);
        if (b.conseil) return h("p", { class: "sv-conseil" }, b.conseil);
        if (b.variante) return h("p", { class: "sv-variante" }, b.variante);
        if (b.liste) return h("ul", { class: "sv-liste" }, b.liste.map((t) => h("li", {}, t)));
        if (b.questions) {
          return h("ol", { class: b.consignes ? "sv-liste" : "sv-questions" },
            b.questions.map((q) => h("li", {}, b.consignes ? q : `« ${remplir(q, contact)} »`)));
        }
        return null;
      });
      const d = h("details", { class: "sv-partie" },
        h("summary", {}, h("span", {}, partie.titre)),
        h("div", { class: "sv-corps" }, corps, ecouter ? h("div", { class: "actions-ligne" }, ecouter) : null));
      d.open = ouverte;
      return d;
    }

    // -------------------------------------------------------------------------
    // Démarchage : tout le script déroulé d'un trait (25/11/2026).
    // Pas de titres d'étapes, sauf « Les questions de découverte ».
    // « Avant l'appel », « Passer le standard » et « Après l'appel » ne sont pas
    // affichés ; la messagerie est un bouton dans la colonne de droite.
    // Les données (DEMARCHAGE) ne changent pas : le simulateur les utilise aussi.
    // -------------------------------------------------------------------------
    const PARTIES_MASQUEES = /avant l'appel|passer le standard|après l'appel|messagerie/i;
    const GARDER_TITRE = /découverte/i;

    function blocDeroule(b, contact) {
      if (b.dire) return h("p", { class: "sv-dire sv-dire-flux" }, `« ${remplir(b.dire, contact)} »`);
      if (b.conseil) return h("p", { class: "sv-conseil" }, b.conseil);
      if (b.variante) return h("p", { class: "sv-variante" }, remplir(b.variante, contact));
      if (b.liste) return h("ul", { class: "sv-liste" }, b.liste.map((t) => h("li", {}, t)));
      if (b.questions) return h("ol", { class: "sv-questions" }, b.questions.map((q) => h("li", {}, `« ${remplir(q, contact)} »`)));
      return null;
    }

    function scriptDeroule(contact) {
      const parties = DEMARCHAGE.parties.filter((p) => !PARTIES_MASQUEES.test(p.titre));
      return h("div", { class: "sv-flux" }, parties.map((p) => h("div", { class: "sv-flux-partie" },
        GARDER_TITRE.test(p.titre) ? h("h2", { class: "sv-flux-titre" }, p.titre) : null,
        p.blocs.map((b) => blocDeroule(b, contact)))));
    }

    // Colonne de droite : messagerie (déplier) + boutons d'objection, toujours visibles.
    function colonneDroite(org) {
      const contact = org && org.contact;
      const messagerie = DEMARCHAGE.parties.find((p) => /messagerie/i.test(p.titre));
      return h("aside", { class: "sv-cote", "aria-label": "Objections" },
        messagerie ? h("details", { class: "sv-partie sv-messagerie" },
          h("summary", {}, h("span", {}, "📞 Messagerie")),
          h("div", { class: "sv-corps" }, messagerie.blocs.map((b) => blocDeroule(b, contact)))) : null,
        window.FilRougeObjections
          ? window.FilRougeObjections.panneau({ h, contact, fonction: org && org.fonction, organisme: org && org.nom, titre: "Objections", compact: true })
          : h("p", { class: "aide" }, "Objections indisponibles."));
    }

    async function route(morceaux) {
      arreterLecture();
      const cle = ONGLETS[morceaux[0]] ? morceaux[0] : "demarchage";
      const orgId = morceaux.find((m) => UUID.test(m)) || null;
      const script = ONGLETS[cle];

      // Ouvert depuis la fiche d'un organisme : on reprend le nom du contact.
      let org = null;
      if (orgId) {
        const { data } = await sb.from("organismes")
          .select("id, nom, organismes_suivi_commercial ( contact_nom, contact_fonction )")
          .eq("id", orgId).maybeSingle();
        if (data) {
          const s = Array.isArray(data.organismes_suivi_commercial) ? data.organismes_suivi_commercial[0] : data.organismes_suivi_commercial;
          org = { id: data.id, nom: data.nom, contact: (s && s.contact_nom) || "", fonction: (s && s.contact_fonction) || "" };
        }
      }
      const suffixe = org ? `/${org.id}` : "";
      const onglet = (c, texte) =>
        h("a", { href: `#/scripts-vente/${c}${suffixe}`, class: "filtre", "aria-current": c === cle ? "true" : null }, texte);

      const avecObjections = cle === "objections" && window.FilRougeObjections;
      const parties = script.parties.map((p, i) => dessinerPartie(p, i === 0, org && org.contact));
      const toutOuvrir = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "Tout déplier");
      toutOuvrir.addEventListener("click", () => {
        const fermer = parties.every((d) => d.open);
        parties.forEach((d) => { d.open = !fermer; });
        toutOuvrir.textContent = fermer ? "Tout déplier" : "Tout replier";
      });

      if (cle === "demarchage") {
        const ecouterTout = voixDispo ? h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "🔊 Écouter") : null;
        if (ecouterTout) ecouterTout.addEventListener("click", () => lire(
          DEMARCHAGE.parties.filter((p) => !PARTIES_MASQUEES.test(p.titre)).map((p) => texteParlé(p, org && org.contact)).join(" \n"), ecouterTout));
        return afficher(
          h("div", { class: "pile sv-page" },
            h("div", { class: "entete-action" },
              h("div", {},
                h("p", { class: "surtitre" },
                  org
                    ? h("a", { href: `#/organisme/${org.id}`, class: "lien-interne" }, `← ${org.nom}`)
                    : h("a", { href: "#/prospection", class: "lien-interne" }, "← Prospection")),
                h("h1", {}, org && org.contact ? `Script · ${org.contact}` : "Script de démarchage"),
                h("p", { class: "chapo" }, script.chapo)),
              ecouterTout),
            h("div", { class: "filtres" },
              onglet("demarchage", "Démarchage"),
              onglet("objections", "Toutes les objections")),
            h("div", { class: "sv-deux-colonnes" },
              h("section", { class: "sv-script", "aria-label": script.titre }, scriptDeroule(org && org.contact)),
              colonneDroite(org))));
      }

      afficher(
        h("div", { class: "pile" },
          h("div", { class: "entete-action" },
            h("div", {},
              h("p", { class: "surtitre" },
                org
                  ? h("a", { href: `#/organisme/${org.id}`, class: "lien-interne" }, `← ${org.nom}`)
                  : h("a", { href: "#/prospection", class: "lien-interne" }, "← Prospection")),
              h("h1", {}, "Scripts de vente"),
              h("p", { class: "chapo" }, script.chapo)),
            avecObjections ? null : toutOuvrir),
          org && org.contact ? h("p", { class: "aide" }, `Les phrases sont adaptées pour ${org.contact} (${org.nom}).`) : null,
          h("div", { class: "filtres" },
            onglet("demarchage", "Démarchage"),
            onglet("objections", "Objections")),
          avecObjections
            ? h("section", { class: "sv-script", "aria-label": script.titre },
                window.FilRougeObjections.panneau({ h, contact: org && org.contact, fonction: org && org.fonction, organisme: org && org.nom, titre: "Toutes les objections" }))
            : h("section", { class: "sv-script", "aria-label": script.titre }, parties))
      );
    }

    return { route };
  };
})();
