// =============================================================================
// Fil Rouge Apprenants — Scripts de vente (#/scripts-vente), administratrice
// =============================================================================
//   #/scripts-vente                         script de démarchage des organismes
//   #/scripts-vente/objections              traitement des objections
//   #/scripts-vente/<onglet>/<organisme>    même chose, ouvert depuis la fiche
//                                           d'un organisme : le nom du contact
//                                           remplace « Madame X » dans les phrases.
//
// Chaque partie se déplie, et un bouton « Écouter » lit le texte à voix haute
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
    chapo: "Objectif de l'appel : décrocher un rendez-vous de 15 minutes ou lancer les 15 jours gratuits. Pas de vendre au téléphone. Tu poses des questions, le client parle plus que toi.",
    parties: [
      { titre: "Avant l'appel (2 minutes)", blocs: [
        { liste: [
          "Regarde le site du centre : formations à distance ? CAP, titres pro, CPF ? Certifié Qualiopi ?",
          "Note un détail précis (une formation, un chiffre, un avis).",
          "Cible : directeur, responsable pédagogique ou référent Qualiopi.",
        ] },
      ] },
      { titre: "Passer le standard", blocs: [
        { dire: "Bonjour, Émilie Rachas, de Fil Rouge Apprenants. Je souhaiterais parler à la personne qui s'occupe du suivi des apprenants, c'est bien {contact} ?" },
        { conseil: "Si on te demande pourquoi :" },
        { dire: "C'est au sujet de l'abandon des apprenants en formation à distance. Qui est le mieux placé pour en parler ?" },
      ] },
      { titre: "L'accroche (20 secondes)", blocs: [
        { dire: "Bonjour {contact}, Émilie Rachas, de Fil Rouge Apprenants. Je vous appelle parce que j'accompagne les apprenants à distance par téléphone, jusqu'à leur examen, pour éviter qu'ils décrochent. Je vous prends deux minutes, c'est bon pour vous ?" },
      ] },
      { titre: "Les questions de découverte", blocs: [
        { questions: [
          "Aujourd'hui, comment se passe le suivi de vos apprenants entre deux cours ?",
          "Vous avez une idée du nombre d'apprenants qui abandonnent ou ne se présentent pas à l'examen ?",
          "Qui s'en occupe chez vous, et est-ce que cette personne a le temps de tous les appeler ?",
          "Pour Qualiopi, comment vous prouvez la prévention des ruptures de parcours ?",
          "Qu'est-ce que ça vous coûte, un apprenant qui lâche en cours de route ?",
        ] },
        { conseil: "Écoute, puis reformule :" },
        { dire: "Si je comprends bien, vous avez… et ça vous pose problème pour…" },
      ] },
      { titre: "La présentation (30 secondes, seulement après les questions)", blocs: [
        { dire: "Justement, c'est exactement ce que je fais. J'appelle vos apprenants une fois par mois : point sur leur avancement, leurs freins, un objectif jusqu'au prochain appel. Vous voyez tout en direct sur une plateforme : comptes rendus, apprenants à risque, preuves pour Qualiopi. J'ai dix ans de relation client à distance, dont une partie à accompagner des apprenants." },
      ] },
      { titre: "La conclusion", blocs: [
        { dire: "Je vous propose de tester gratuitement pendant 15 jours, sur quelques apprenants, sans engagement. Vous jugez sur pièces. On cale un échange de 15 minutes cette semaine pour le mettre en place, mardi ou jeudi ?" },
        { conseil: "Toujours proposer deux dates, jamais « quand vous voulez »." },
      ] },
      { titre: "Si tu tombes sur la messagerie", blocs: [
        { dire: "Bonjour {contact}, Émilie Rachas, de Fil Rouge Apprenants. J'aide les centres de formation à distance à réduire les abandons avant l'examen, par un suivi téléphonique des apprenants. Je vous envoie un petit mail et je vous rappelle jeudi. Mon numéro : 06 17 75 56 17. Bonne journée !" },
      ] },
      { titre: "Après l'appel", blocs: [
        { liste: [
          "Mail dans l'heure avec le lien de l'offre pilote et l'exemple de rapport mensuel.",
          "Note l'échange et la date de relance sur la fiche de l'organisme.",
        ] },
      ] },
    ],
  };

  const OBJECTIONS = {
    titre: "Traitement des objections",
    chapo: "Ne réponds jamais du tac au tac : commence par creuser pour trouver le vrai frein.",
    parties: [
      { titre: "La méthode en 4 temps (pour toutes les objections)", blocs: [
        { questions: [
          "Accueillir : « Je comprends tout à fait. »",
          "Creuser : une question pour trouver le vrai frein.",
          "Répondre au vrai frein, court.",
          "Relancer : une question qui fait avancer.",
        ], consignes: true },
      ] },
      { titre: "« Je n'ai pas le temps. »", blocs: [
        { dire: "Je comprends, je serai brève. Justement, c'est le temps qui manque souvent pour rappeler les apprenants, non ? Je vous propose 15 minutes cette semaine, ou je vous rappelle à un moment plus calme : plutôt matin ou fin de journée ?" },
      ] },
      { titre: "« Envoyez-moi une documentation. »", blocs: [
        { dire: "Avec plaisir. Pour vous envoyer quelque chose d'utile, dites-moi : c'est plutôt l'abandon, la présence à l'examen ou Qualiopi qui vous préoccupe le plus ?" },
        { conseil: "Laisse répondre, puis :" },
        { dire: "Je vous l'envoie aujourd'hui et je vous rappelle jeudi pour en parler, ça vous va ?" },
      ] },
      { titre: "« C'est trop cher. »", blocs: [
        { dire: "Je comprends. Trop cher par rapport à quoi ?" },
        { conseil: "Laisse parler, puis :" },
        { dire: "Un apprenant qui abandonne, c'est un financement perdu, souvent plusieurs centaines d'euros, voire plus. Un appel, c'est entre 12 et 20 €. Si on évite un seul abandon, le suivi est déjà remboursé. Et vous pouvez d'abord tester 15 jours gratuitement." },
      ] },
      { titre: "« On fait déjà le suivi en interne. »", blocs: [
        { dire: "Très bien, c'est déjà une bonne chose. Comment ça se passe ? Vos équipes arrivent-elles à appeler tout le monde chaque mois ?" },
        { conseil: "Puis :" },
        { dire: "Je ne remplace pas vos équipes, je prends les appels qu'elles n'ont pas le temps de faire, et je vous laisse les comptes rendus." },
      ] },
      { titre: "« Nos apprenants sont autonomes, ils n'en ont pas besoin. »", blocs: [
        { dire: "Tant mieux ! Et ceux qui ne se connectent plus depuis quelques semaines, comment les repérez-vous ? C'est justement eux que je vise : je les appelle avant qu'ils décrochent, pas après." },
      ] },
      { titre: "« Ce n'est pas moi qui décide. »", blocs: [
        { dire: "Merci de me le dire. Qui prend ce genre de décision chez vous ? Est-ce que vous seriez d'accord pour qu'on lui présente ensemble ? Votre avis compte, vous connaissez les apprenants." },
      ] },
      { titre: "« Ça ne nous intéresse pas. »", blocs: [
        { dire: "Je l'entends. Juste par curiosité, c'est parce que vous n'avez pas d'abandons, ou parce que le moment n'est pas le bon ?" },
        { conseil: "Si ce n'est pas le moment :" },
        { dire: "Je vous rappelle dans trois mois, avant la prochaine rentrée ?" },
      ] },
      { titre: "« Vous êtes seule, et si vous êtes absente ? »", blocs: [
        { dire: "Bonne question. Je travaille avec des appelantes formées et tenues au secret, sur la même méthode et la même plateforme. Vos apprenants sont toujours suivis." },
      ] },
      { titre: "« Et nos données, le RGPD ? »", blocs: [
        { dire: "Les données sont hébergées à Paris, chaque organisme ne voit que ses apprenants, et le contrat inclut un accord de sous-traitance RGPD. Je vous l'envoie si vous voulez le faire relire." },
      ] },
      { titre: "« On a déjà essayé, ça n'a pas marché. »", blocs: [
        { dire: "Ah, intéressant. Qu'est-ce qui n'a pas marché, à votre avis ?" },
        { conseil: "Puis montre la différence : appels réguliers, objectif fixé à chaque appel, comptes rendus visibles en direct." },
      ] },
      { titre: "Les réflexes à garder", blocs: [
        { liste: [
          "Souris en parlant : ça s'entend.",
          "Silence après une question : laisse le client répondre.",
          "Utilise ses mots à lui dans tes réponses.",
          "Termine toujours par une prochaine étape datée.",
          "Note chaque nouvelle objection entendue : elle pourra être ajoutée ici.",
        ] },
      ] },
    ],
  };

  const ONGLETS = { demarchage: DEMARCHAGE, objections: OBJECTIONS };

  window.FilRougeScriptsVente = function (ctx) {
    const { sb, h, afficher } = ctx;

    // --- Lecture à voix haute (voix du navigateur) ---
    const voixDispo = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    let boutonEnCours = null;
    function arreterLecture() {
      if (voixDispo) window.speechSynthesis.cancel();
      if (boutonEnCours) boutonEnCours.textContent = "🔊 Écouter";
      boutonEnCours = null;
    }
    function lire(texte, bouton) {
      if (!voixDispo) return;
      const memeBouton = boutonEnCours === bouton;
      arreterLecture();
      if (memeBouton) return; // deuxième clic = stop
      const phrase = new SpeechSynthesisUtterance(texte);
      phrase.lang = "fr-FR";
      const voix = window.speechSynthesis.getVoices().find((v) => /^fr/i.test(v.lang));
      if (voix) phrase.voice = voix;
      phrase.rate = 0.95;
      phrase.onend = () => { if (boutonEnCours === bouton) arreterLecture(); };
      boutonEnCours = bouton;
      bouton.textContent = "⏹ Arrêter";
      window.speechSynthesis.speak(phrase);
    }
    window.addEventListener("hashchange", arreterLecture);

    const remplir = (texte, contact) => texte.replaceAll("{contact}", contact || "Madame X");

    // Texte lu à voix haute pour une partie.
    function texteParlé(partie, contact) {
      const morceaux = [partie.titre];
      for (const b of partie.blocs) {
        if (b.dire) morceaux.push(remplir(b.dire, contact));
        if (b.conseil) morceaux.push(b.conseil);
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

    async function route(morceaux) {
      arreterLecture();
      const cle = ONGLETS[morceaux[0]] ? morceaux[0] : "demarchage";
      const orgId = morceaux.find((m) => UUID.test(m)) || null;
      const script = ONGLETS[cle];

      // Ouvert depuis la fiche d'un organisme : on reprend le nom du contact.
      let org = null;
      if (orgId) {
        const { data } = await sb.from("organismes")
          .select("id, nom, organismes_suivi_commercial ( contact_nom )")
          .eq("id", orgId).maybeSingle();
        if (data) {
          const s = Array.isArray(data.organismes_suivi_commercial) ? data.organismes_suivi_commercial[0] : data.organismes_suivi_commercial;
          org = { id: data.id, nom: data.nom, contact: (s && s.contact_nom) || "" };
        }
      }
      const suffixe = org ? `/${org.id}` : "";
      const onglet = (c, texte) =>
        h("a", { href: `#/scripts-vente/${c}${suffixe}`, class: "filtre", "aria-current": c === cle ? "true" : null }, texte);

      const parties = script.parties.map((p, i) => dessinerPartie(p, i === 0, org && org.contact));
      const toutOuvrir = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "Tout déplier");
      toutOuvrir.addEventListener("click", () => {
        const fermer = parties.every((d) => d.open);
        parties.forEach((d) => { d.open = !fermer; });
        toutOuvrir.textContent = fermer ? "Tout déplier" : "Tout replier";
      });

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
            toutOuvrir),
          org && org.contact ? h("p", { class: "aide" }, `Les phrases sont adaptées pour ${org.contact} (${org.nom}).`) : null,
          h("div", { class: "filtres" },
            onglet("demarchage", "Démarchage"),
            onglet("objections", "Objections")),
          h("section", { class: "sv-script", "aria-label": script.titre }, parties))
      );
    }

    return { route };
  };
})();
