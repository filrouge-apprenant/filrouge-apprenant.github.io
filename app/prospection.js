// =============================================================================
// Fil Rouge Apprenants — Machine de prospection (#/acquisition), administratrice
// =============================================================================
//   #/acquisition                       accueil : top 10 + méthode du jour
//   #/acquisition/simulateur[/<org>]    simulateur d'économies + lien à envoyer
//   #/acquisition/priorites             notation des prospects sur 100 (A / B / C)
//   #/acquisition/plan                  plan de prospection sur 30 jours (cases à cocher)
//   #/acquisition/scripts               approches selon le problème du centre
//   #/acquisition/methodes              les 25 méthodes, top 10 en premier
//   #/acquisition/avance                coûts, potentiel, 3 stratégies d'avance
//
// Règle d'or : distinguer les faits vérifiés des hypothèses commerciales.
// La notation compte « vérifié » plein pot, « probable » à moitié, et affiche
// toujours combien de critères restent à vérifier.
// Contenu modifiable ici (METHODES, CRITERES, PLAN, APPROCHES, AVANCE).
// Sécurité : tout le texte passe par h() (textContent), jamais innerHTML.
// Sources vérifiées le 16/11/2026 : décret n° 2026-728 du 1er août 2026
// (Qualiopi, indicateurs 12 et 19, en vigueur le 1er novembre 2026) ; loi
// n° 2026-534 du 25 juin 2026, art. 59 (CPF et absence à l'examen, motifs
// légitimes renvoyés à un décret) ; liste publique des organismes de formation
// (data.gouv.fr, DGEFP).
// =============================================================================

(function () {
  "use strict";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ---------------------------------------------------------------------------
  // Grille de notation sur 100 (alignée sur l'ICP du 8 novembre 2026)
  // ---------------------------------------------------------------------------
  const CRITERES = [
    { cle: "distance", pts: 15, titre: "Formations 100 % à distance", ou: "Site du centre, fiches formation, Mon Compte Formation (modalité « à distance »)." },
    { cle: "volume", pts: 15, titre: "50 à 500 apprenants par an", ou: "Liste publique des organismes de formation (data.gouv.fr) : nombre de stagiaires déclaré ; sinon chiffres affichés sur le site." },
    { cle: "duree", pts: 10, titre: "Parcours de 4 mois ou plus", ou: "Durée des formations sur le site (CAP, titre pro, BTS = long ; formation de 2 jours = court)." },
    { cle: "financement", pts: 10, titre: "Financé CPF, OPCO ou France Travail", ou: "Mon Compte Formation, mentions CPF/OPCO sur le site." },
    { cle: "croissance", pts: 10, titre: "Signe de croissance", ou: "Nouvelles formations, nouvelles sessions, chiffre d'affaires en hausse sur Pappers, levée de fonds, nouveaux locaux." },
    { cle: "recrute", pts: 10, titre: "Recrute pour le suivi des apprenants", ou: "Offres d'emploi (Indeed, France Travail, Welcome to the Jungle, LinkedIn) : chargé de suivi, conseiller pédagogique, référent apprenants, chargé de relation apprenants." },
    { cle: "avis", pts: 10, titre: "Avis qui parlent du manque de suivi", ou: "Avis Google, Trustpilot, Avis Vérifiés : « personne ne répond », « laissé seul », « aucun suivi ». Signal seulement s'il y en a plusieurs et récents." },
    { cle: "equipe", pts: 5, titre: "Pas d'équipe de suivi dédiée visible", ou: "Page équipe, LinkedIn de l'entreprise : moins de 2 personnes sur le suivi." },
    { cle: "finances", pts: 10, titre: "Capacité à payer", ou: "Pappers : société active, pas de procédure collective, chiffre d'affaires publié en hausse ou stable." },
    { cle: "decideur", pts: 5, titre: "Décideur identifié et joignable", ou: "Dirigeant sur Pappers, fondateur ou responsable pédagogique sur LinkedIn, numéro direct." },
  ];
  const EXCLUSIONS = [
    { cle: "youschool", titre: "Formations du catalogue YouSchool (concurrent direct de ton employeur)" },
    { cle: "gros", titre: "Gros groupe avec sa propre équipe de suivi" },
    { cle: "court", titre: "Formations courtes uniquement (moins de 1 mois)" },
    { cle: "ferme", titre: "Société fermée ou en procédure collective" },
  ];
  const ETATS = [
    ["oui", "✓ Vérifié", 1],
    ["probable", "≈ Probable", 0.5],
    ["non", "✗ Non", 0],
  ];

  function noter(sc) {
    const s = sc || {};
    let total = 0, aVerifier = 0, hypotheses = 0;
    for (const c of CRITERES) {
      const etat = s[c.cle];
      const coef = (ETATS.find((e) => e[0] === etat) || [null, null, 0])[2];
      total += c.pts * coef;
      if (!etat) aVerifier += 1;
      if (etat === "probable") hypotheses += 1;
    }
    const exclu = EXCLUSIONS.find((x) => s.exclu && s.exclu[x.cle]);
    const priorite = exclu ? "X" : total >= 70 ? "A" : total >= 50 ? "B" : "C";
    return { total: Math.round(total), aVerifier, hypotheses, priorite, exclu };
  }
  const LIBELLE_PRIORITE = {
    A: ["vert", "Priorité A · besoin potentiel fort"],
    B: ["orange", "Priorité B · opportunité intéressante"],
    C: ["neutre", "Priorité C · potentiel à vérifier"],
    X: ["rouge", "Exclu"],
  };

  // ---------------------------------------------------------------------------
  // Les 25 méthodes. top = rang dans le top 10 (null sinon).
  // diff : 1 facile, 2 moyen, 3 difficile. conv : potentiel de conversion.
  // ---------------------------------------------------------------------------
  const METHODES = [
    { top: 1, nom: "Le levier Qualiopi 19 et 12", famille: "Signal réglementaire",
      comment: "Depuis le 1er novembre 2026, l'indicateur 19 oblige à vérifier que le suivi des modules à distance a réellement lieu, et l'indicateur 12 à prouver les mesures contre les ruptures de parcours. Tu appelles les centres à distance avec une seule question : « Pour votre prochain audit, comment vous allez prouver l'effectivité du suivi ? ». Tes comptes rendus d'appel sont des preuves.",
      interet: "Le besoin n'est plus « confort », il devient une obligation d'audit. C'est l'argument le plus fort que tu aies.", cout: "0 €", diff: 1, conv: "Fort",
      outils: "Plateforme (preuves Qualiopi), script, liste publique des organismes (filtre : certifiés Qualiopi).",
      exemple: "« Votre audit de surveillance tombe quand ? Depuis le 1er novembre, l'auditeur va vous demander comment vous vérifiez que vos apprenants à distance suivent vraiment. »",
      auto: "Claude classe chaque semaine les centres certifiés à distance ; l'accroche Qualiopi est pré-écrite dans les scripts (onglet Approches)." },
    { top: 2, nom: "Le simulateur d'économies envoyé au prospect", famille: "Outil de vente",
      comment: "Après un premier contact (ou à la place d'une plaquette), tu envoies le lien du simulateur pré-rempli avec le nom du centre. Le dirigeant y met ses vrais chiffres et voit le coût des abandons et le point d'équilibre.",
      interet: "Le prospect se convainc lui-même avec ses chiffres. Remplace « envoyez-moi une doc » par un outil.", cout: "0 €", diff: 1, conv: "Fort",
      outils: "Onglet Simulateur de cette page, Gmail Fil Rouge.",
      exemple: "« Plutôt qu'une plaquette, je vous envoie un calcul d'une minute : vous mettez vos chiffres, vous voyez si ça vaut le coup. »",
      auto: "Lien et e-mail générés en un clic depuis la fiche du centre." },
    { top: 3, nom: "Les offres d'emploi « suivi des apprenants »", famille: "Signal de besoin",
      comment: "Un centre qui recrute un chargé de suivi, un conseiller pédagogique ou un référent apprenants a le besoin, le budget, et un poste vide pendant des semaines. Tu proposes de couvrir le suivi pendant le recrutement, puis en renfort.",
      interet: "Le besoin est prouvé noir sur blanc (fait vérifié, pas une hypothèse).", cout: "0 €", diff: 1, conv: "Fort",
      outils: "Indeed (connecteur Claude disponible), France Travail, Welcome to the Jungle, LinkedIn Emplois.",
      exemple: "Offre « Chargé(e) de suivi pédagogique à distance – CDI » publiée depuis 3 semaines → appel au responsable : « En attendant votre recrutement, je peux prendre le suivi de vos apprenants dès la semaine prochaine. »",
      auto: "Recherche hebdomadaire par Claude sur Indeed avec les mots-clés suivi apprenants / conseiller pédagogique / formation à distance, ajout au CRM avec le lien de l'offre (à activer quand tu le décides)." },
    { top: 4, nom: "Les consultants Qualiopi apporteurs d'affaires", famille: "Partenariat",
      comment: "Les consultants qui préparent les centres à Qualiopi voient chaque jour des centres en difficulté sur les indicateurs 12 et 19. Tu leur proposes une commission (ex. 10 % des 3 premiers mois) pour chaque client recommandé.",
      interet: "Un partenaire = des dizaines de centres. Recommandation = confiance immédiate.", cout: "Commission seulement si client signé", diff: 2, conv: "Fort",
      outils: "LinkedIn, Google « consultant Qualiopi » + ta région, contrat d'apporteur simple.",
      exemple: "« Vos clients ont du mal à prouver le suivi à distance depuis le 1er novembre ? Je fournis des comptes rendus d'appel utilisables en audit. Je vous reverse 10 % sur les clients que vous m'envoyez. »",
      auto: "Liste de consultants dans le CRM avec une étape « partenaire » ; séquence de 3 messages." },
    { top: 5, nom: "Le relais examen (loi CPF du 25 juin 2026)", famille: "Signal réglementaire",
      comment: "La loi prévoit qu'un apprenant absent sans motif légitime à l'examen ne peut plus payer avec son CPF et doit rembourser l'organisme. Les centres CPF vont devoir réclamer de l'argent à des apprenants, ce qui crée litiges et impayés. Ton offre : relancer chaque apprenant avant l'examen (inscription, convocation, présence).",
      interet: "Argument financier direct pour les centres CPF, encore très peu exploité. Prudence : les motifs légitimes dépendent d'un décret à venir, ne promets rien sur l'application.", cout: "0 €", diff: 1, conv: "Moyen à fort",
      outils: "Script, simulateur, onglet Relances d'examen de la plateforme.",
      exemple: "« Avec la nouvelle règle CPF, un apprenant qui ne se présente pas à l'examen devra vous rembourser. Vous préférez le relancer avant, ou lui courir après ensuite ? »",
      auto: "Accroche prête dans les scripts ; filtre « CPF » dans la notation." },
    { top: 6, nom: "Le radar des centres en croissance", famille: "Détection précoce",
      comment: "Repérer les centres qui ajoutent des formations, ouvrent des sessions ou affichent un chiffre d'affaires en hausse. Plus d'apprenants avec la même équipe = suivi qui craque dans 3 à 6 mois.",
      interet: "Tu arrives avant qu'ils cherchent un prestataire.", cout: "0 €", diff: 2, conv: "Moyen",
      outils: "Pappers (comptes publiés), Mon Compte Formation, liste publique data.gouv.fr (nombre de stagiaires d'une année sur l'autre), annonces légales.",
      exemple: "Chiffre d'affaires passé de 400 k€ à 900 k€ sur Pappers + 3 nouveaux titres pro → note « croissance : vérifié ».",
      auto: "Comparaison annuelle automatique du nombre de stagiaires déclarés dans la liste publique (à brancher quand l'accès réseau aux données publiques sera ouvert)." },
    { top: 7, nom: "La séquence LinkedIn du dirigeant", famille: "Contact direct",
      comment: "Invitation sans message vendeur, puis 2 à 3 semaines de contenu utile (abandons, Qualiopi 19), puis un message court qui propose le simulateur. Jamais de message automatique en masse.",
      interet: "Les fondateurs de petits centres lisent LinkedIn eux-mêmes.", cout: "0 € (compte gratuit)", diff: 2, conv: "Moyen",
      outils: "LinkedIn (compte déjà rouvert), tes posts.",
      exemple: "J+0 invitation · J+7 commentaire sur son post · J+14 « Je vous ai préparé une simulation pour [centre], je vous l'envoie ? »",
      auto: "Rappels de relance dans le CRM. Pas d'outil d'automatisation LinkedIn : interdit par leurs conditions et risque de blocage du compte." },
    { top: 8, nom: "Les éditeurs de plateformes de formation", famille: "Partenariat",
      comment: "Les logiciels utilisés par les centres (LMS, logiciels de gestion d'organisme) ont des clients qui leur demandent comment améliorer l'engagement. Tu deviens le service humain qu'ils recommandent.",
      interet: "Un seul accord ouvre l'accès à un portefeuille de centres déjà équipés pour le distanciel.", cout: "0 €", diff: 3, conv: "Moyen",
      outils: "LinkedIn (responsables partenariats), annuaires de marketplaces des éditeurs.",
      exemple: "Proposition : article invité sur leur blog « Indicateur 19 : prouver le suivi à distance », avec le simulateur en lien.",
      auto: "Liste des éditeurs dans le CRM, étape « partenaire »." },
    { top: 9, nom: "L'essai de 30 jours sur les apprenants à risque comme porte d'entrée", famille: "Conversion",
      comment: "Tout appel se termine par une seule proposition : 30 jours sur 20 apprenants à risque (2 appels chacun), un groupe témoin non appelé, puis un bilan chiffré. Objectif de reprise fixé ensemble : atteint, 3 mois au tarif normal ; sinon, rien à payer. Pas de devis au premier appel.",
      interet: "Risque zéro pour le centre ; les comptes rendus vendent à ta place.", cout: "Ton temps (40 appels, environ 13 h)", diff: 1, conv: "Fort",
      outils: "Page offre-pilote.html, tunnel déjà en place sur la plateforme.",
      exemple: "« On fait simple : je prends 20 de vos apprenants qui ne se connectent plus, pendant 30 jours, et on compare avec ceux que je n'appelle pas. »",
      auto: "Demande, contrat et bascule en payant déjà automatisés." },
    { top: 10, nom: "Le contenu « baromètre de l'abandon »", famille: "Attirer",
      comment: "À partir de tes appels (données anonymisées, agrégées), publier chaque trimestre ce qui fait décrocher les apprenants à distance : freins, moments critiques, ce qui marche. Diffusion LinkedIn, puis article SEO.",
      interet: "Tu deviens la référence du sujet ; les centres viennent à toi. Plus tu as d'appels, plus c'est fort (personne d'autre n'a ces données).", cout: "0 €", diff: 2, conv: "Faible au début, fort à 6 mois",
      outils: "Plateforme (statistiques), LinkedIn, page du site.",
      exemple: "« Sur 300 appels, 1 apprenant sur 3 qui décroche n'était pas inscrit à l'examen à 2 mois de la date. »",
      auto: "Chiffres extraits de la plateforme ; Claude rédige le brouillon." },
    { nom: "La liste publique des organismes de formation", famille: "Base de données",
      comment: "Fichier officiel (data.gouv.fr) de tous les organismes déclarés : nom, SIREN, certification Qualiopi, spécialités, nombre de stagiaires déclaré. Base parfaite pour filtrer l'ICP.",
      interet: "Exhaustif, gratuit, légal, mis à jour en continu.", cout: "0 €", diff: 2, conv: "— (source)",
      outils: "data.gouv.fr, tableur ou Claude.", exemple: "Filtre : certifié Qualiopi + 50 à 500 stagiaires + spécialités tertiaires.",
      auto: "Import et notation automatique par Claude (nécessite l'accès réseau aux données publiques)." },
    { nom: "Mon Compte Formation comme radar", famille: "Base de données",
      comment: "Rechercher les formations certifiantes à distance (CAP, titres pro) et noter les organismes qui en proposent beaucoup.",
      interet: "Voit directement la dépendance au CPF et la modalité à distance.", cout: "0 €", diff: 1, conv: "— (source)",
      outils: "moncompteformation.gouv.fr.", exemple: "« Titre pro assistant de vie aux familles · à distance » → 30 organismes à noter.", auto: "Saisie manuelle, notation dans l'onglet Priorités." },
    { nom: "Les avis négatifs sur le suivi", famille: "Signal de besoin",
      comment: "Repérer les avis récurrents « personne ne répond », « aucun suivi ». À utiliser comme indice, jamais comme argument d'attaque.",
      interet: "Moyen seulement : un centre très critiqué est parfois déjà en difficulté financière. Ne jamais citer les avis au prospect (effet procès).", cout: "0 €", diff: 1, conv: "Moyen",
      outils: "Google Maps, Trustpilot, Avis Vérifiés.", exemple: "4 avis en 3 mois sur l'absence de réponse → critère « avis : vérifié », puis approche « expérience apprenant » (pas « vous avez de mauvais avis »).",
      auto: "Relevé par Claude lors de la recherche d'un centre." },
    { nom: "Les changements de direction", famille: "Signal de besoin",
      comment: "Un nouveau directeur ou responsable pédagogique veut marquer son arrivée et revoit les prestataires dans ses 100 premiers jours.",
      interet: "Fenêtre d'ouverture rare.", cout: "0 €", diff: 2, conv: "Moyen",
      outils: "LinkedIn (« nouveau poste »), annonces légales sur Pappers.", exemple: "Message de félicitations + « je peux vous montrer en 15 minutes comment d'autres centres suivent leurs apprenants à distance ».", auto: "Alerte LinkedIn sur les comptes suivis." },
    { nom: "Les centres qui sous-traitent déjà", famille: "Signal de besoin",
      comment: "Un centre qui externalise déjà sa hotline, son marketing ou ses formateurs est habitué à acheter un service extérieur.",
      interet: "Moins de résistance à l'idée d'externaliser.", cout: "0 €", diff: 2, conv: "Moyen",
      outils: "Site du centre (mentions de partenaires), offres de freelance.", exemple: "Formateurs freelances recrutés sur Malt → culture de la sous-traitance.", auto: "Critère noté à la main." },
    { nom: "Les salons et événements du secteur", famille: "Événements",
      comment: "Visiter (pas exposer) : Learning Technologies France, Porte de Versailles, les 20 et 21 janvier 2027 selon les annonces publiées. Liste des exposants et intervenants = liste de prospects.",
      interet: "Rencontres en face à face ; la liste des exposants est publique même si tu n'y vas pas.", cout: "Transport (visite souvent gratuite)", diff: 2, conv: "Moyen",
      outils: "Site du salon, LinkedIn des intervenants.", exemple: "Avant le salon : message « je passe au salon le 20, 10 minutes sur le suivi à distance ? ».", auto: "Import de la liste des exposants dans le CRM." },
    { nom: "Les réseaux et fédérations de la formation", famille: "Réseaux",
      comment: "Fédérations professionnelles, clubs d'organismes, groupes régionaux : intervenir sur le thème de l'abandon et de l'indicateur 19.",
      interet: "Une intervention = des dizaines de dirigeants qualifiés.", cout: "Adhésion éventuelle (à vérifier)", diff: 3, conv: "Moyen",
      outils: "LinkedIn, sites des fédérations.", exemple: "Proposer un webinaire gratuit « Prouver le suivi à distance en audit ».", auto: "—" },
    { nom: "Les groupes Facebook et LinkedIn de formateurs", famille: "Communautés",
      comment: "Groupes de créateurs d'organismes et de formateurs indépendants : répondre aux questions sur Qualiopi et l'engagement, sans vendre.",
      interet: "Visibilité auprès de petits centres en création ou en croissance.", cout: "0 €", diff: 1, conv: "Faible à moyen",
      outils: "Facebook, LinkedIn.", exemple: "Réponse utile à « comment prouver l'indicateur 12 ? » + lien vers le simulateur si on te le demande.", auto: "—" },
    { nom: "Les experts-comptables spécialisés formation", famille: "Partenariat",
      comment: "Ils voient les comptes des centres (impayés, abandons, remboursements) et conseillent les dirigeants.",
      interet: "Prescripteur de confiance, mais long à convaincre.", cout: "0 €", diff: 3, conv: "Faible à moyen",
      outils: "Google, LinkedIn.", exemple: "« Vos clients organismes de formation ont des impayés liés aux abandons ? »", auto: "—" },
    { nom: "Les OPCO et financeurs (veille)", famille: "Veille",
      comment: "Suivre les appels à projets et exigences des financeurs sur l'accompagnement des apprenants : ce qu'ils exigent, les centres doivent le prouver.",
      interet: "Arguments à jour, pas une source directe de clients.", cout: "0 €", diff: 1, conv: "Indirect",
      outils: "Sites des OPCO, Centre Inffo.", exemple: "—", auto: "Veille mensuelle par Claude." },
    { nom: "Le SEO sur les questions des centres", famille: "Attirer",
      comment: "Pages simples qui répondent aux recherches des dirigeants : « indicateur 19 Qualiopi formation à distance », « réduire l'abandon formation CPF », avec le simulateur au bout.",
      interet: "Prospects entrants à coût nul, mais 3 à 6 mois avant les résultats.", cout: "0 €", diff: 2, conv: "Moyen à 6 mois",
      outils: "Site GitHub Pages actuel.", exemple: "Page « Indicateur 19 : 5 preuves de suivi à distance acceptées en audit ».", auto: "Claude rédige, tu valides." },
    { nom: "Le courrier papier aux dirigeants", famille: "Contact direct",
      comment: "Lettre courte et personnalisée, avec le calcul du simulateur déjà fait pour leur centre (estimation à partir des chiffres publics).",
      interet: "Personne n'en envoie : on la lit. À réserver aux 20 meilleurs prospects (A).", cout: "Environ 2 € par lettre (timbre + impression)", diff: 1, conv: "Moyen",
      outils: "Simulateur, adresse du siège sur Pappers.", exemple: "« Pour un centre de votre taille, les abandons représentent environ X € par an. »", auto: "Lettre générée par Claude." },
    { nom: "Les vidéos courtes", famille: "Attirer",
      comment: "Sketchs courts sur le décrochage (déjà prévu) : notoriété auprès des responsables pédagogiques.",
      interet: "Visibilité, peu de ventes directes.", cout: "0 €", diff: 2, conv: "Faible",
      outils: "TikTok, Reels, Shorts, LinkedIn.", exemple: "« L'apprenant qui dit qu'il s'y met lundi. Depuis 4 lundis. »", auto: "Génération par IA." },
    { nom: "Le parrainage client", famille: "Fidélisation",
      comment: "Chaque client satisfait recommande un autre centre contre un mois offert.",
      interet: "Le canal le moins cher dès les premiers clients.", cout: "1 mois offert par client gagné", diff: 1, conv: "Fort",
      outils: "Questionnaire de satisfaction, bilan de fin d'essai.", exemple: "Au bilan des 30 jours : « Vous connaissez un autre centre qui aurait le même besoin ? »", auto: "Question ajoutée au bilan." },
    { nom: "Acheter des fichiers ou envoyer en masse", famille: "À éviter",
      comment: "Fichiers de contacts achetés, e-mails en masse, robots LinkedIn.",
      interet: "Mauvaise méthode : délivrabilité détruite, image abîmée dans un petit milieu, risque RGPD et blocage de comptes. Une petite liste bien notée vaut mieux.", cout: "50 à 500 €", diff: 1, conv: "Très faible",
      outils: "—", exemple: "—", auto: "—" },
  ];

  // ---------------------------------------------------------------------------
  // Plan sur 30 jours (démarrage avant la facturation du 1er janvier 2027)
  // ---------------------------------------------------------------------------
  const PLAN = [
    { semaine: "Semaine 1 · Préparer la machine", taches: [
      "Noter tes 67 centres déjà dans le CRM avec la grille sur 100 (onglet Priorités), 15 par jour.",
      "Repérer 10 offres d'emploi « suivi des apprenants » sur Indeed et France Travail, ajouter les centres.",
      "Préparer 3 liens de simulateur pour tes 3 meilleurs prospects A.",
      "S'entraîner 3 fois au simulateur d'appels (objection « on le fait en interne »).",
      "Publier 1 post LinkedIn sur l'indicateur 19 (suivi à distance).",
    ] },
    { semaine: "Semaine 2 · Premiers appels", taches: [
      "Appeler 10 prospects A par jour (accroche Qualiopi ou examen selon le centre).",
      "Envoyer le simulateur à chaque prospect qui dit « envoyez-moi une doc ».",
      "Contacter 5 consultants Qualiopi pour un partenariat apporteur d'affaires.",
      "Relancer les messages vocaux à J+2.",
      "Objectif de la semaine : 3 rendez-vous ou essais de 30 jours.",
    ] },
    { semaine: "Semaine 3 · Élargir", taches: [
      "Appeler les prospects B (10 par jour).",
      "Envoyer 10 lettres papier aux meilleurs A qui n'ont pas répondu.",
      "Démarrer les premiers essais de 30 jours sur les apprenants à risque.",
      "Contacter 2 éditeurs de plateformes de formation.",
      "Préparer la visite de Learning Technologies France (liste des exposants).",
    ] },
    { semaine: "Semaine 4 · Convertir", taches: [
      "Faire le bilan chiffré des premiers essais et proposer le contrat.",
      "Demander une recommandation à chaque centre satisfait.",
      "Mesurer : appels, rendez-vous, essais, signatures. Garder ce qui marche.",
      "Re-noter les prospects avec ce que tu as appris.",
      "Objectif du mois : 2 à 4 essais lancés, 1 à 2 contrats prêts pour janvier 2027.",
    ] },
  ];

  // ---------------------------------------------------------------------------
  // Approches selon le problème du centre
  // ---------------------------------------------------------------------------
  const APPROCHES = [
    { titre: "Le centre manque de personnel", signal: "Offre d'emploi ouverte (suivi, conseiller pédagogique), équipe réduite, réponses lentes.",
      accroche: "J'ai vu que vous recrutez un chargé de suivi. En attendant la bonne personne, qui appelle vos apprenants ?",
      argument: "Fil Rouge prend le suivi tout de suite, sans recrutement, sans période d'essai, et s'arrête avec 30 jours de préavis si votre recrue arrive.",
      question: "Combien de temps le poste est vide en général chez vous ?",
      eviter: "Laisser entendre que tu remplaces leur futur salarié : tu es un renfort." },
    { titre: "Beaucoup d'apprenants inactifs", signal: "Formations longues à distance, CPF, pas d'équipe de suivi visible.",
      accroche: "Combien de vos apprenants ne se sont pas connectés depuis 15 jours ?",
      argument: "Un appel par mois, des objectifs fixés avec l'apprenant, et un signalement immédiat à votre référent quand l'un d'eux décroche.",
      question: "Aujourd'hui, comment vous repérez un apprenant qui commence à décrocher ?",
      eviter: "Promettre un taux de réussite : tu as une obligation de moyens." },
    { titre: "Le centre reçoit des avis négatifs", signal: "Plusieurs avis récents sur le manque de réponse.",
      accroche: "Je travaille sur l'expérience des apprenants à distance : qu'est-ce qui revient le plus quand ils sont mécontents chez vous ?",
      argument: "Chaque apprenant a quelqu'un qui l'appelle, l'écoute et fait remonter ce qui coince, avant que ça finisse en avis.",
      question: "Qui répond aux apprenants quand ils ont une question en dehors des cours ?",
      eviter: "Citer leurs mauvais avis : le dirigeant se braque. Laisse-le en parler lui-même." },
    { titre: "Le centre grandit vite", signal: "Nouvelles formations, nouvelles sessions, chiffre d'affaires en hausse.",
      accroche: "Vous avez lancé plusieurs formations cette année : le suivi suit le même rythme ?",
      argument: "Le suivi grandit avec vous sans embaucher : vous payez à l'appel, de 20 à 12 € selon le volume.",
      question: "Si vous avez 2 fois plus d'apprenants l'an prochain, qui les appelle ?",
      eviter: "Parler de problème : parle de capacité à absorber la croissance." },
    { titre: "Améliorer l'expérience apprenant", signal: "Centre soigné, bonne image, veut se démarquer.",
      accroche: "Vos apprenants vous recommandent pour quoi, aujourd'hui ?",
      argument: "Un appel humain chaque mois, c'est ce dont les apprenants à distance se souviennent. Et les comptes rendus vous servent de preuves Qualiopi (indicateurs 12 et 19).",
      question: "Qu'est-ce qui manque à vos apprenants pour aller au bout ?",
      eviter: "Le discours « abandon » trop dramatique : reste sur la satisfaction." },
    { titre: "Le centre veut optimiser ses coûts", signal: "Petite structure, marges serrées, dirigeant très financier.",
      accroche: "Je vous propose un calcul d'une minute : ce que les abandons vous coûtent, comparé au prix d'un suivi.",
      argument: "Le simulateur montre le point d'équilibre avec ses chiffres. Le suivi est variable (à l'appel), sans salaire fixe ni charges.",
      question: "Un apprenant qui abandonne, ça vous coûte combien à peu près ?",
      eviter: "Baisser ton prix sous la grille : propose plutôt moins d'apprenants ou l'essai de 30 jours." },
    { titre: "Accroche Qualiopi (indicateurs 12 et 19)", signal: "Centre certifié Qualiopi avec des modules à distance.",
      accroche: "Depuis le 1er novembre, l'auditeur Qualiopi demande de prouver que le suivi des modules à distance a vraiment lieu. Vous êtes prêts pour votre prochain audit ?",
      argument: "Chaque appel donne un compte rendu daté, consultable en ligne et exportable pour l'audit.",
      question: "Votre prochain audit tombe quand ?",
      eviter: "Faire peur ou annoncer une non-conformité : tu n'es pas auditrice." },
    { titre: "Accroche examen CPF (loi du 25 juin 2026)", signal: "Centre très CPF, formations certifiantes avec examen.",
      accroche: "Avec la nouvelle règle, un apprenant CPF absent à l'examen sans motif légitime devra vous rembourser. Vous avez prévu comment gérer ça ?",
      argument: "Je relance chaque apprenant avant l'examen : inscription, convocation, présence. Moins d'absents, moins de sommes à réclamer.",
      question: "Combien d'apprenants ne se présentent pas à l'examen, sur une session ?",
      eviter: "Affirmer la date d'application : les motifs légitimes dépendent d'un décret à venir." },
  ];

  // ---------------------------------------------------------------------------
  // Coûts, potentiel et stratégies d'avance
  // ---------------------------------------------------------------------------
  const COUTS = [
    ["Plateforme, simulateur, CRM, scripts", "0 € (déjà en place)"],
    ["Gmail, Brevo (offre gratuite), LinkedIn gratuit", "0 €"],
    ["Liste publique des organismes, Mon Compte Formation, Pappers (consultation)", "0 €"],
    ["Recherche d'offres d'emploi par Claude (connecteur Indeed)", "0 € en plus de ton abonnement"],
    ["Lettres papier aux 20 meilleurs prospects", "environ 40 €"],
    ["Visite d'un salon à Paris", "transport (à décider)"],
    ["Commissions apporteurs d'affaires", "seulement sur clients signés"],
  ];
  const AVANCE = [
    { titre: "1. Devenir « la preuve de l'indicateur 19 »",
      texte: "Le décret du 1er août 2026 a déplacé le besoin : les centres à distance doivent maintenant prouver que leurs apprenants suivent vraiment. Tes comptes rendus d'appel sont exactement cette preuve. Positionne Fil Rouge comme « le suivi qui se présente à l'audit », avec un export Qualiopi propre, et fais-toi recommander par les consultants Qualiopi. Les concurrents vendent du téléconseil ; toi, tu vends une conformité." },
    { titre: "2. Un radar de signaux qui remplit le CRM tout seul",
      texte: "Chaque semaine : offres d'emploi « suivi apprenants » (Indeed), centres certifiés à distance de la liste publique, croissance sur Pappers. Claude note chaque centre sur 100 avec la grille de cette page, sépare les faits des hypothèses, prépare l'accroche selon le signal, et te présente seulement les A. Tu appelles des centres qui ont un besoin daté, pas un annuaire. À activer quand tu le décides (tu as demandé qu'aucune tâche récurrente ne tourne sans ton accord)." },
    { titre: "3. Le simulateur + le baromètre : vendre avec des chiffres",
      texte: "Le simulateur fait calculer au dirigeant ce que lui coûtent les abandons ; le baromètre trimestriel, tiré de tes propres appels anonymisés, montre ce qui fait décrocher. Personne d'autre n'a ces données de terrain. Au bout de 6 mois, ce sont les centres qui te trouvent." },
  ];

  // ---------------------------------------------------------------------------
  window.FilRougeProspection = function (outils) {
    const { sb, h, afficher, message, texteErreur, modeles, noterEchange } = outils;
    const lienVierge = (nom) => {
      const q = new URLSearchParams();
      if (nom) q.set("o", nom);
      q.set("vierge", "1");
      return new URL(`simulateur.html?${q}`, window.location.href).href.replace(/#.*$/, "");
    };
    const C = window.FilRougeCalculAbandons;
    const remplacer = (el, ...enfants) => el.replaceChildren(...enfants.flat().filter((x) => x !== null && x !== undefined && x !== false));

    const ONGLETS = [
      ["", "Accueil"], ["simulateur", "🧮 Simulateur"], ["priorites", "🎯 Priorités /100"], ["plan", "📅 Plan 30 jours"],
      ["scripts", "🗣️ Approches"], ["methodes", "🧭 25 méthodes"], ["avance", "🚀 Coûts et avance"],
    ];
    const DIFF = { 1: "Facile", 2: "Moyen", 3: "Difficile" };

    function cadre(cle, chapo, ...corps) {
      return h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, h("a", { href: "#/prospection", class: "lien-interne" }, "← Prospection")),
          h("h1", {}, "Machine de prospection"),
          chapo ? h("p", { class: "chapo" }, chapo) : null),
        h("div", { class: "filtres" }, ONGLETS.map(([c, t]) =>
          h("a", { href: `#/acquisition${c ? "/" + c : ""}`, class: "filtre", "aria-current": c === cle ? "true" : null }, t))),
        ...corps);
    }
    const partie = (titre, ouverte, ...corps) => {
      const d = h("details", { class: "sv-partie" }, h("summary", {}, h("span", {}, titre)), h("div", { class: "sv-corps" }, ...corps));
      d.open = !!ouverte;
      return d;
    };
    const ligne = (libelle, texte) => texte ? h("p", { class: "pr-ligne" }, h("strong", {}, libelle + " : "), texte) : null;

    function carteMethode(m, ouverte) {
      const titre = `${m.top ? "#" + m.top + " · " : ""}${m.nom}`;
      return partie(titre, ouverte,
        h("p", { class: "pr-etiquettes" },
          h("span", { class: "pastille pastille-neutre" }, m.famille),
          h("span", { class: "pastille pastille-neutre" }, `Coût : ${m.cout}`),
          h("span", { class: "pastille pastille-neutre" }, `Difficulté : ${DIFF[m.diff]}`),
          h("span", { class: `pastille ${/Fort/.test(m.conv) ? "pastille-vert" : /Très faible/.test(m.conv) ? "pastille-rouge" : "pastille-neutre"}` }, `Conversion : ${m.conv}`)),
        ligne("Comment ça marche", m.comment),
        ligne("Intérêt", m.interet),
        ligne("Outils", m.outils),
        m.exemple !== "—" ? ligne("Exemple", m.exemple) : null,
        m.auto !== "—" ? ligne("Automatisation", m.auto) : null);
    }

    // --- Accueil ------------------------------------------------------------
    function accueil() {
      const debut = lirePlan().debut;
      const jour = debut ? Math.floor((Date.now() - new Date(debut).getTime()) / 86400000) + 1 : null;
      const semaine = jour ? Math.min(4, Math.max(1, Math.ceil(jour / 7))) : 1;
      afficher(cadre("", "Trouver les centres qui ont besoin de Fil Rouge avant qu'ils cherchent un prestataire. Tout est ici : le simulateur à envoyer, la notation des prospects, le plan du mois et les approches.",
        h("section", { class: "carte carte-large pile-serree" },
          h("h2", {}, jour ? `Jour ${Math.min(jour, 30)} du plan · ${PLAN[semaine - 1].semaine}` : "Le plan n'a pas encore démarré"),
          h("ul", { class: "sv-liste" }, PLAN[semaine - 1].taches.map((t) => h("li", {}, t))),
          h("div", { class: "actions-ligne" }, h("a", { class: "bouton", href: "#/acquisition/plan" }, jour ? "Voir le plan" : "Démarrer le plan"))),
        h("section", { class: "pile-serree" },
          h("h2", {}, "Les 10 méthodes les plus prometteuses pour Fil Rouge"),
          METHODES.filter((m) => m.top).sort((a, b) => a.top - b.top).map((m, i) => carteMethode(m, i === 0)),
          h("p", { class: "aide" }, "Les 15 autres méthodes, avec ce qu'il faut éviter, sont dans l'onglet « 25 méthodes »."))));
    }

    // --- Simulateur ---------------------------------------------------------
    async function simulateur(orgId) {
      const { data: liste } = await sb.from("organismes")
        .select("id, nom, organismes_suivi_commercial ( etape, contact_nom, contact_email )").order("nom");
      const orgs = (liste || []).map((o) => {
        const s = Array.isArray(o.organismes_suivi_commercial) ? o.organismes_suivi_commercial[0] : o.organismes_suivi_commercial;
        return { id: o.id, nom: o.nom, etape: s && s.etape, contact: (s && s.contact_nom) || "", email: (s && s.contact_email) || "" };
      }).filter((o) => o.etape !== "client");
      const choix = h("select", { id: "acq-org" }, h("option", { value: "" }, "— Aucun centre (simulation libre) —"),
        orgs.map((o) => h("option", { value: o.id, selected: o.id === orgId ? true : null }, o.nom)));
      const champ = (id, libelle, valeur, aide) => h("label", { class: "sim-champ" }, libelle,
        h("input", { id, type: "number", inputmode: "decimal", min: "0", value: String(valeur) }), aide ? h("span", { class: "sim-aide" }, aide) : null);
      const form = h("form", { class: "sim-form" },
        h("label", { class: "sim-champ" }, "Centre", choix),
        champ("acq-n", "Apprenants inscrits par an", 150, "Estimation : liste publique (nombre de stagiaires) ou ce que le centre t'a dit."),
        champ("acq-p", "Prix moyen d'une formation (€)", 2500),
        champ("acq-d", "Durée moyenne d'un parcours (mois)", 6),
        champ("acq-t", "Taux d'abandon ou d'absence à l'examen (%)", 20, "Si tu ne le connais pas, laisse 20 % : le prospect mettra le sien."),
        h("label", { class: "sim-champ" }, "Financement des formations",
          h("select", { id: "acq-f" },
            h("option", { value: "autre" }, "Surtout hors CPF (OPCO, entreprise…) : 50 % du prix perdu par abandon"),
            h("option", { value: "cpf" }, "Surtout CPF : règles de paiement Mon Compte Formation"))),
        h("label", { class: "sim-champ", id: "acq-bloc-a", hidden: true }, "Avancement moyen de l'apprenant quand il abandonne (%)",
          h("input", { id: "acq-a", type: "number", inputmode: "decimal", min: "0", max: "100", value: "20" }),
          h("span", { class: "sim-aide" }, "CPF : sous 25 % d'avancement le centre touche 25 % du prix, de 25 à 80 % le prorata, au-delà de 80 % la totalité.")),
        h("label", { class: "sim-champ" }, "Apprenants suivis",
          h("select", { id: "acq-s" },
            h("option", { value: "risque" }, "Seulement les apprenants à risque (recommandé)"),
            h("option", { value: "tous" }, "Tous les apprenants, pendant tout le parcours"))),
        h("label", { class: "sim-champ", id: "acq-bloc-r" }, "Part des apprenants à risque (%)",
          h("input", { id: "acq-r", type: "number", inputmode: "decimal", min: "1", max: "100", value: "25" }),
          h("span", { class: "sim-aide" }, "Au moins le taux d'abandon, souvent le double (pas connectés depuis 2 à 4 semaines, en retard).")),
        h("label", { class: "sim-champ", id: "acq-bloc-ds" }, "Durée du suivi d'un apprenant à risque (mois)",
          h("input", { id: "acq-ds", type: "number", inputmode: "numeric", min: "1", max: "36", value: "3" })));
      const res = h("div", { class: "pile-serree", "aria-live": "polite" });
      const actions = h("div", { class: "actions-ligne" });
      const zone = h("div", {});
      const val = (id) => form.querySelector("#" + id).value;

      function maj() {
        const org = orgs.find((o) => o.id === choix.value) || null;
        const cpf = val("acq-f") === "cpf";
        form.querySelector("#acq-bloc-a").hidden = !cpf;
        const risque = val("acq-s") === "risque";
        form.querySelector("#acq-bloc-r").hidden = !risque; form.querySelector("#acq-bloc-ds").hidden = !risque;
        const r = C.calculer({ apprenantsAn: val("acq-n"), prixFormation: val("acq-p"), dureeMois: val("acq-d"), tauxAbandon: val("acq-t"), pertePart: 50,
          financement: val("acq-f"), assiduiteAbandon: val("acq-a"), suivi: val("acq-s"), risquePct: val("acq-r"), dureeSuiviMois: val("acq-ds") });
        remplacer(res,
          h("div", { class: "sim-cartes" },
            h("div", { class: "sim-carte sim-carte-rouge" }, h("p", { class: "sim-chiffre" }, C.euros(r.coutAbandonsAn)), h("p", { class: "sim-legende" }, `abandons par an (${C.nombre(r.abandonsAn)} × ${C.euros(r.coutUnAbandon)})`)),
            h("div", { class: "sim-carte" }, h("p", { class: "sim-chiffre" }, C.euros(r.coutFilRougeAn)), h("p", { class: "sim-legende" }, r.risque
              ? `Fil Rouge par an : ${C.nombre(r.suivisAn)} apprenants à risque × ${C.nombre(r.dureeSuivi)} mois (${C.euros(r.tarif)} l'appel, ${C.euros(r.coutFilRougeMois)} / mois)`
              : `Fil Rouge par an (${C.euros(r.tarif)} l'appel, ${C.euros(r.coutFilRougeMois)} / mois)`)),
            h("div", { class: "sim-carte sim-carte-verte" }, h("p", { class: "sim-chiffre" }, Number.isFinite(r.equilibreAbandons) ? C.nombre(Math.ceil(r.equilibreAbandons)) : "—"), h("p", { class: "sim-legende" }, "abandons évités pour être remboursé"))),
          r.cpf && r.coutAbandonsSansPlancher > r.coutAbandonsAn + 0.5
            ? h("p", { class: "aide" }, `Argument CPF : sans système de relance prouvable, la Caisse des dépôts peut retirer le forfait de 25 % ; les abandons coûteraient alors ${C.euros(r.coutAbandonsSansPlancher)} par an au centre.`) : null,
          h("p", { class: "aide" }, `Chiffre d'affaires pour toi si le centre signe : environ ${C.euros(r.coutFilRougeMois)} par mois.`));
        const params = new URLSearchParams();
        if (org) params.set("o", org.nom);
        params.set("n", val("acq-n")); params.set("p", val("acq-p")); params.set("d", val("acq-d")); params.set("t", val("acq-t"));
        if (cpf) { params.set("f", "cpf"); params.set("a", val("acq-a")); }
        if (risque) { params.set("r", val("acq-r")); params.set("ds", val("acq-ds")); } else params.set("s", "tous");
        const lien = new URL(`simulateur.html?${params}`, window.location.href).href.replace(/#.*$/, "");
        majEmail(org, lien);
        const copierVierge = h("button", { type: "button", class: "bouton bouton-secondaire" }, "📋 Copier le lien vierge");
        copierVierge.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(lienVierge(org ? org.nom : "")); signalEmail.replaceChildren(message("info", "Lien vierge copié : le centre remplit ses chiffres lui-même.")); }
          catch (e) { signalEmail.replaceChildren(message("erreur", "Copie impossible.")); }
        });
        const copier = h("button", { type: "button", class: "bouton bouton-secondaire" }, "📋 Copier le lien pré-rempli");
        copier.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(lien); signalEmail.replaceChildren(message("info", "Lien copié.")); }
          catch (e) { signalEmail.replaceChildren(message("erreur", "Copie impossible : sélectionne le lien ci-dessous.")); }
        });
        remplacer(actions, copier, copierVierge,
          h("a", { class: "bouton bouton-secondaire", href: lien, target: "_blank", rel: "noopener" }, "👁️ Voir la page du prospect"),
          org ? h("a", { class: "bouton bouton-secondaire", href: `#/organisme/${org.id}` }, "Fiche du centre") : null);
        remplacer(zone, h("p", { class: "aide pr-lien" }, lien));
      }

      // --- E-mail : modèles « Prospection » de la page Modèles d'emails ---
      // Le modèle choisi est rempli avec {contact}, {organisme}, {lien_simulateur}.
      // Si les chiffres changent après une retouche du texte, seul le lien est remplacé.
      const champObjetMail = h("input", { id: "acq-objet", type: "text" });
      const champTexteMail = h("textarea", { id: "acq-texte", rows: "14" });
      const signalEmail = h("div", {});
      const boutonsEmail = h("div", { class: "actions-ligne" });
      let modeleCourant = null, dernierLien = "", dernierOrg = undefined, orgCourant = null, lienCourant = "";
      const MODELE_SECOURS = { objet: "Ce que vous coûtent les abandons — {organisme}", texte: "Bonjour {contact},\n\nComme promis, voici un calcul d'une minute préparé pour {organisme} : vous mettez vos propres chiffres et vous voyez ce que les abandons vous coûtent, et à partir de combien d'abandons évités un suivi téléphonique est remboursé.\n\n{lien_simulateur}\n\nVos chiffres restent dans votre navigateur, rien n'est enregistré.\n\nSi le résultat vous parle, on peut le vérifier sur vos vrais apprenants : 30 jours d'essai sur 20 apprenants à risque, avec un bilan chiffré à la fin.\n\nBelle journée,\nÉmilie Rachas\nFil Rouge Apprenants" };
      function appliquerModele() {
        const Ct = window.FilRougeContact;
        const r = Ct.remplirModeleEmail(modeleCourant || MODELE_SECOURS, {
          moi: "Émilie", organisme: orgCourant ? orgCourant.nom : "", contact: orgCourant ? orgCourant.contact : "", lien_simulateur: lienCourant,
          lien_simulateur_vierge: lienVierge(orgCourant ? orgCourant.nom : ""),
        });
        champObjetMail.value = r.objet.replace("votre organisme de formation", "votre organisme");
        champTexteMail.value = r.texte;
        dernierLien = lienCourant;
        majBoutonsEmail();
      }
      function majEmail(org, lien) {
        orgCourant = org; lienCourant = lien;
        if (dernierOrg !== (org && org.id)) { dernierOrg = org && org.id; appliquerModele(); return; }
        if (dernierLien && dernierLien !== lien) {
          champTexteMail.value = champTexteMail.value.split(dernierLien).join(lien);
          dernierLien = lien;
        }
        majBoutonsEmail();
      }
      function majBoutonsEmail() {
        const boite = (window.FIL_ROUGE_CONFIG || {}).emailFilRouge || "";
        const Ct = window.FilRougeContact;
        const gmail = orgCourant && orgCourant.email ? Ct.lienGmail(orgCourant.email, champObjetMail.value, champTexteMail.value, boite) : null;
        const copierMail = h("button", { type: "button", class: gmail ? "bouton bouton-secondaire" : "bouton" }, "📝 Copier l'e-mail");
        copierMail.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(`${champObjetMail.value}\n\n${champTexteMail.value}`); signalEmail.replaceChildren(message("info", "E-mail copié.")); }
          catch (e) { signalEmail.replaceChildren(message("erreur", "Copie impossible.")); }
        });
        remplacer(boutonsEmail,
          gmail ? h("a", { class: "bouton", href: gmail, target: "_blank", rel: "noopener" }, `📧 Envoyer à ${orgCourant.email} (Gmail Fil Rouge)`) : null,
          copierMail);
        remplacer(signalEmail,
          orgCourant && !orgCourant.email ? h("p", { class: "aide" }, "Pas d'e-mail sur la fiche du centre : copie l'e-mail et colle-le dans ta messagerie, ou complète le contact dans l'onglet Suivi commercial.") : null,
          !orgCourant ? h("p", { class: "aide" }, "Choisis un centre pour que son nom et son contact s'écrivent dans l'e-mail.") : null);
      }
      for (const c of [champObjetMail, champTexteMail]) c.addEventListener("input", majBoutonsEmail);
      const blocMenus = h("div", {}, h("p", { class: "aide" }, "Chargement des e-mails tout prêts…"));
      const M = modeles ? modeles() : null;
      if (M) {
        M.charger().then((liste) => {
          const dispo = liste.filter((m) => m.actif && m.destinataire === "organisme");
          if (!dispo.length) { remplacer(blocMenus, h("p", { class: "aide" }, "Aucun e-mail de prospection dans « Modèles d'emails » : un texte de base est utilisé.")); return; }
          const menus = M.menus(liste, "acq-email", (m) => { modeleCourant = m; appliquerModele(); }, { destinataire: "organisme", initial: (dispo.find((m) => /\{lien_simulateur\}/.test(m.texte)) || dispo[0]).id });
          modeleCourant = menus.modeleChoisi();
          appliquerModele();
          remplacer(blocMenus, menus.bloc);
        }).catch(() => remplacer(blocMenus, h("p", { class: "aide" }, "E-mails tout prêts indisponibles : un texte de base est utilisé.")));
      } else remplacer(blocMenus);
      const sectionEmail = h("section", { class: "carte carte-large pile-serree" },
        h("h2", {}, "📧 Envoyer le simulateur"),
        blocMenus,
        h("label", { class: "sim-champ", for: "acq-objet" }, "Objet", champObjetMail),
        h("label", { class: "sim-champ", for: "acq-texte" }, "Message", champTexteMail),
        boutonsEmail, signalEmail,
        h("p", { class: "aide" }, h("a", { href: "#/modeles-email", class: "lien-interne" }, "Modifier ces e-mails"), " dans la page Modèles d'emails, catégorie « Prospection — envoi du simulateur »."));

      form.addEventListener("input", maj);
      form.addEventListener("change", maj);
      form.addEventListener("submit", (e) => e.preventDefault());
      afficher(cadre("simulateur", "Le prospect calcule lui-même ce que lui coûtent les abandons. Prépare la simulation ici, puis envoie-lui le lien : ses chiffres sont pré-remplis, il peut les changer.",
        h("section", { class: "carte carte-large" }, form),
        res, sectionEmail, actions, zone,
        h("p", { class: "aide" }, "Le calcul est le même que sur la page publique (hypothèse : 50 % du prix perdu par abandon, réglable par le prospect). Ne présente jamais le résultat comme une garantie : c'est une estimation.")));
      maj();
    }

    // --- Priorités /100 -----------------------------------------------------
    async function priorites() {
      afficher(cadre("priorites", null, message("info", "Chargement des prospects…")));
      let avecScore = true;
      let { data, error } = await sb.from("organismes")
        .select("id, nom, organismes_suivi_commercial ( etape, contact_nom, contact_fonction, score_criteres, score_maj )").order("nom");
      if (error) {
        avecScore = false;
        ({ data, error } = await sb.from("organismes").select("id, nom, organismes_suivi_commercial ( etape, contact_nom, contact_fonction )").order("nom"));
      }
      if (error) return afficher(cadre("priorites", null, message("erreur", texteErreur(error))));
      const lignes = (data || []).map((o) => {
        const s = (Array.isArray(o.organismes_suivi_commercial) ? o.organismes_suivi_commercial[0] : o.organismes_suivi_commercial) || {};
        return { id: o.id, nom: o.nom, etape: s.etape, contact: s.contact_nom, fonction: s.contact_fonction, sc: s.score_criteres || {}, maj: s.score_maj };
      }).filter((l) => l.etape !== "client" && l.etape !== "perdu");
      const filtre = { prio: "" };
      const liste = h("div", { class: "pile-serree" });
      const compteurs = h("p", { class: "pr-etiquettes" });

      let majCompteurs = () => {};
      function dessiner() {
        const notes = lignes.map((l) => ({ l, n: noter(l.sc) }))
          .sort((a, b) => (a.n.priorite === "X") - (b.n.priorite === "X") || b.n.total - a.n.total || a.l.nom.localeCompare(b.l.nom));
        const nb = (p) => notes.filter((x) => x.n.priorite === p).length;
        const nonNotes = notes.filter((x) => x.n.aVerifier === CRITERES.length && !x.n.exclu).length;
        majCompteurs = () => {
          const ns = lignes.map((l) => noter(l.sc));
          compteurs.querySelectorAll("button").forEach((b, i) => {
            const p = ["", "A", "B", "C", "X"][i];
            b.textContent = p ? `${p === "X" ? "Exclus" : p} (${ns.filter((x) => x.priorite === p).length})` : `Tous (${ns.length})`;
          });
          const span = compteurs.querySelector(".aide");
          if (span) span.textContent = ` · ${ns.filter((x) => x.aVerifier === CRITERES.length && !x.exclu).length} pas encore notés`;
        };
        compteurs.replaceChildren(
          ...["", "A", "B", "C", "X"].map((p) => {
            const b = h("button", { type: "button", class: "filtre", "aria-current": filtre.prio === p ? "true" : null },
              p ? `${p === "X" ? "Exclus" : p} (${nb(p)})` : `Tous (${notes.length})`);
            b.addEventListener("click", () => { filtre.prio = p; dessiner(); });
            return b;
          }),
          h("span", { class: "aide" }, ` · ${nonNotes} pas encore notés`));
        liste.replaceChildren(...notes.filter((x) => !filtre.prio || x.n.priorite === filtre.prio).map(({ l, n }) => carteProspect(l, n)));
      }

      function carteProspect(l, n) {
        const corps = h("div", { class: "pile-serree" });
        const badge = h("span", {});
        const majBadge = () => {
          const m = noter(l.sc);
          remplacer(badge,
            h("span", { class: `pastille pastille-${LIBELLE_PRIORITE[m.priorite][0]}` }, m.exclu ? "Exclu" : `${m.total}/100 · ${m.priorite}`),
            m.aVerifier && !m.exclu ? h("span", { class: "aide" }, ` ${m.aVerifier} à vérifier`) : null);
        };
        majBadge();
        const d = h("details", { class: "sv-partie" },
          h("summary", {}, h("span", { class: "pr-titre" }, h("strong", {}, l.nom), " ", badge)),
          corps);
        d.addEventListener("toggle", () => { if (d.open && !corps.childElementCount) remplir(); });
        function remplir() {
          const zone = h("div", {});
          const resume = h("p", {});
          const majResume = () => {
            const m = noter(l.sc);
            const [c2, t2] = LIBELLE_PRIORITE[m.priorite];
            remplacer(resume, h("span", { class: `pastille pastille-${c2}` }, t2), " ",
              m.exclu ? `Raison : ${m.exclu.titre}.` : `${m.total}/100. ${m.aVerifier ? m.aVerifier + " critère(s) pas encore vérifié(s). " : ""}${m.hypotheses ? m.hypotheses + " hypothèse(s) comptée(s) à moitié." : "Tout ce qui est noté est vérifié."}`);
          };
          async function enregistrer() {
            if (!avecScore) { zone.replaceChildren(message("erreur", "La notation n'est pas encore activée dans la base. Rien n'est enregistré.")); return; }
            const maj = { score_criteres: l.sc, score_maj: new Date().toISOString().slice(0, 10) };
            const { error: e } = await sb.from("organismes_suivi_commercial").update(maj).eq("organisme_id", l.id);
            zone.replaceChildren(e ? message("erreur", texteErreur(e)) : message("info", "Enregistré."));
            if (!e) { l.maj = maj.score_maj; majBadge(); majCompteurs(); }
          }
          const lignesCriteres = CRITERES.map((c) => {
            const boutons = ETATS.map(([v, t]) => {
              const b = h("button", { type: "button", class: "bouton bouton-petit bouton-secondaire pr-etat", "aria-pressed": l.sc[c.cle] === v ? "true" : "false" }, t);
              b.addEventListener("click", () => {
                l.sc = { ...l.sc, [c.cle]: l.sc[c.cle] === v ? undefined : v };
                if (!l.sc[c.cle]) delete l.sc[c.cle];
                b.parentElement.querySelectorAll("button").forEach((x, i) => x.setAttribute("aria-pressed", l.sc[c.cle] === ETATS[i][0] ? "true" : "false"));
                majResume(); enregistrer();
              });
              return b;
            });
            return h("div", { class: "pr-critere" },
              h("p", {}, h("strong", {}, `${c.titre} (${c.pts} pts)`), h("br"), h("span", { class: "aide" }, `Où vérifier : ${c.ou}`)),
              h("div", { class: "actions-ligne" }, boutons));
          });
          const exclusions = EXCLUSIONS.map((x) => {
            const cb = h("input", { type: "checkbox", checked: l.sc.exclu && l.sc.exclu[x.cle] ? true : null });
            cb.addEventListener("change", () => {
              const ex = { ...(l.sc.exclu || {}) };
              if (cb.checked) ex[x.cle] = true; else delete ex[x.cle];
              l.sc = { ...l.sc, exclu: ex };
              majResume(); enregistrer();
            });
            return h("label", { class: "pr-exclu" }, cb, " ", x.titre);
          });
          majResume();
          remplacer(corps, resume,
            l.contact ? h("p", { class: "aide" }, `Contact : ${l.contact}${l.fonction ? " · " + l.fonction : ""}`) : null,
            h("p", { class: "aide" }, "« Vérifié » = tu l'as vu toi-même (site, offre, Pappers). « Probable » = hypothèse, comptée à moitié. Rien = pas encore regardé."),
            ...lignesCriteres,
            h("p", {}, h("strong", {}, "Exclure si :")), ...exclusions,
            h("div", { class: "actions-ligne" },
              h("a", { class: "bouton bouton-secondaire bouton-petit", href: `#/organisme/${l.id}` }, "Fiche du centre"),
              h("a", { class: "bouton bouton-secondaire bouton-petit", href: `#/acquisition/simulateur/${l.id}` }, "🧮 Simulateur"),
              h("a", { class: "bouton bouton-secondaire bouton-petit", href: `#/scripts-vente/demarchage/${l.id}` }, "📋 Script")),
            l.maj ? h("p", { class: "aide" }, `Notation mise à jour le ${l.maj.split("-").reverse().join("/")}.`) : null,
            zone);
        }
        return d;
      }

      afficher(cadre("priorites", "Chaque prospect noté sur 100 avec 10 critères tirés de ton profil de client idéal. A = 70 et plus (appeler cette semaine), B = 50 à 69, C = moins de 50 ou pas encore vérifié.",
        !avecScore ? message("erreur", "La notation n'est pas encore activée dans la base : tu peux consulter la grille, mais rien ne sera enregistré.") : null,
        compteurs, liste,
        partie("La grille complète", false,
          h("ul", { class: "sv-liste" }, CRITERES.map((c) => h("li", {}, `${c.titre} : ${c.pts} pts. ${c.ou}`))),
          h("p", { class: "aide" }, "Priorité A : 70 et plus · B : 50 à 69 · C : moins de 50. Un centre qui coche une exclusion sort du classement."))));
      dessiner();
    }

    // --- Plan 30 jours ------------------------------------------------------
    const CLE_PLAN = "filrouge-plan-prospection";
    function lirePlan() {
      try { return JSON.parse(localStorage.getItem(CLE_PLAN) || "{}") || {}; } catch (e) { return {}; }
    }
    function ecrirePlan(p) { try { localStorage.setItem(CLE_PLAN, JSON.stringify(p)); } catch (e) { /* stockage indisponible */ } }

    function plan() {
      const p = lirePlan();
      p.faites = p.faites || {};
      const total = PLAN.reduce((s, w) => s + w.taches.length, 0);
      const avance = h("p", { class: "chapo" });
      const majAvance = () => {
        const nb = Object.values(p.faites).filter(Boolean).length;
        avance.textContent = p.debut
          ? `Démarré le ${new Date(p.debut).toLocaleDateString("fr-FR")} · ${nb} tâche(s) sur ${total} faite(s).`
          : "Le plan n'a pas encore démarré : clique sur « Démarrer aujourd'hui ».";
      };
      const demarrer = h("button", { type: "button", class: "bouton" }, p.debut ? "Recommencer le plan aujourd'hui" : "Démarrer aujourd'hui");
      demarrer.addEventListener("click", () => {
        if (p.debut && !window.confirm("Recommencer le plan ? Les cases cochées seront décochées.")) return;
        p.debut = new Date().toISOString(); p.faites = {}; ecrirePlan(p); plan();
      });
      const semaines = PLAN.map((w, i) => partie(w.semaine, i === 0 || (p.debut && Math.ceil(((Date.now() - new Date(p.debut)) / 86400000 + 1) / 7) === i + 1),
        h("ul", { class: "pr-taches" }, w.taches.map((t, j) => {
          const cle = `${i}-${j}`;
          const cb = h("input", { type: "checkbox", checked: p.faites[cle] ? true : null });
          cb.addEventListener("change", () => { p.faites[cle] = cb.checked; ecrirePlan(p); majAvance(); });
          return h("li", {}, h("label", {}, cb, " ", t));
        }))));
      majAvance();
      afficher(cadre("plan", null, avance, h("div", { class: "actions-ligne" }, demarrer), ...semaines,
        h("p", { class: "aide" }, "Les cases cochées sont gardées sur cet appareil seulement. Objectif réaliste du mois : 2 à 4 essais de 30 jours lancés, pour facturer à partir de janvier 2027.")));
    }

    // --- Approches ----------------------------------------------------------
    function approches() {
      afficher(cadre("scripts", "Une approche par situation. Repère d'abord le signal (vérifié, pas supposé), puis choisis l'accroche. Les scripts complets et les 57 objections restent dans « Scripts de vente ».",
        ...APPROCHES.map((a, i) => partie(a.titre, i === 0,
          ligne("Signal à vérifier", a.signal),
          h("blockquote", { class: "sv-dire" }, `« ${a.accroche} »`),
          ligne("Question de découverte", `« ${a.question} »`),
          ligne("Argument", a.argument),
          h("p", { class: "sv-conseil" }, `À éviter : ${a.eviter}`))),
        h("div", { class: "actions-ligne" },
          h("a", { class: "bouton bouton-secondaire", href: "#/scripts-vente" }, "📋 Scripts de vente complets"),
          h("a", { class: "bouton bouton-secondaire", href: "#/entrainement" }, "🎧 S'entraîner aux appels"))));
    }

    // --- 25 méthodes --------------------------------------------------------
    function methodes() {
      const tri = [...METHODES].sort((a, b) => (a.top || 99) - (b.top || 99));
      afficher(cadre("methodes", "Les 25 méthodes, les 10 meilleures pour Fil Rouge en premier. La dernière est volontairement une méthode à éviter.",
        h("h2", {}, "Top 10"), ...tri.filter((m) => m.top).map((m) => carteMethode(m, false)),
        h("h2", {}, "Les 15 autres"), ...tri.filter((m) => !m.top).map((m) => carteMethode(m, false))));
    }

    // --- Coûts, potentiel, avance -------------------------------------------
    function avance() {
      const ex = C.calculer({ apprenantsAn: 150, prixFormation: 2500, dureeMois: 6, tauxAbandon: 20, pertePart: 50, suivi: "tous" });
      afficher(cadre("avance", null,
        h("section", { class: "pile-serree" },
          h("h2", {}, "Les 3 stratégies qui peuvent te donner de l'avance"),
          ...AVANCE.map((a) => h("div", { class: "carte carte-large" }, h("h3", {}, a.titre), h("p", {}, a.texte)))),
        partie("Estimation des coûts", true,
          h("ul", { class: "sv-liste" }, COUTS.map(([q, c]) => h("li", {}, h("strong", {}, q), ` : ${c}`))),
          h("p", { class: "aide" }, "Total pour démarrer : 0 à 50 € le premier mois. Rien de payant n'est nécessaire avant les premiers clients.")),
        partie("Estimation du potentiel commercial", true,
          h("p", {}, `Un client type (150 apprenants par an, parcours de 6 mois) = ${C.nombre(ex.appelsAn)} appels par an à ${C.euros(ex.tarif)}, soit environ ${C.euros(ex.coutFilRougeAn)} par an (${C.euros(ex.coutFilRougeMois)} par mois).`),
          h("ul", { class: "sv-liste" },
            h("li", {}, `3 clients de cette taille : environ ${C.euros(ex.coutFilRougeAn * 3)} par an.`),
            h("li", {}, `10 clients : environ ${C.euros(ex.coutFilRougeAn * 10)} par an, avec des appelantes à recruter.`)),
          h("p", {}, "Entonnoir de départ (hypothèses à corriger avec tes vrais chiffres après 30 jours) : 200 centres appelés → 40 vraies conversations → 10 à 12 essais de 30 jours → 3 à 4 clients."),
          h("p", { class: "aide" }, "Ces montants sont des estimations, pas des prévisions : ils dépendent du nombre d'apprenants réellement confiés.")),
        partie("Ce que j'ai écarté, et pourquoi", false,
          h("ul", { class: "sv-liste" },
            h("li", {}, "Les avis négatifs comme signal principal : souvent des centres sans budget. Bon indice, mauvais critère de tri."),
            h("li", {}, "L'achat de fichiers et l'envoi en masse : risque RGPD, mauvaise image dans un milieu où tout le monde se connaît."),
            h("li", {}, "Les robots LinkedIn : interdits par les conditions d'utilisation, risque de perdre ton compte."),
            h("li", {}, "Exposer sur un salon : trop cher pour démarrer ; la visite suffit."))),
        partie("Règles à respecter", false,
          h("ul", { class: "sv-liste" },
            h("li", {}, "Prospection B2B par e-mail : écrire à une adresse professionnelle, sur un sujet lié au métier de la personne, avec un moyen simple de ne plus recevoir de message."),
            h("li", {}, "Ne jamais inventer un chiffre ou un contact : ce qui n'est pas vérifié reste « probable »."),
            h("li", {}, "Obligation de moyens : jamais de garantie de résultat sur les abandons."),
            h("li", {}, "Clause d'exclusivité YouSchool : pas de démarchage des formations de leur catalogue, et activité lancée seulement avec leur accord.")))));
    }

    // -------------------------------------------------------------------------
    // Fenêtre « Écrire un email » d'une fiche organisme : deux menus (catégorie,
    // puis email) avec les modèles « organisme » de la page Modèles d'emails.
    // {lien_simulateur} et {lien_simulateur_vierge} donnent ici le lien vide :
    // pour pré-remplir les chiffres, passer par « 🧮 Envoyer le simulateur ».
    // org = { id, nom, contact, email }
    // -------------------------------------------------------------------------
    function fenetreEmail(org) {
      const Ct = window.FilRougeContact;
      const boite = (window.FIL_ROUGE_CONFIG || {}).emailFilRouge || "";
      const lien = lienVierge(org.nom);
      const objet = h("input", { id: "org-email-objet", type: "text", value: `Fil Rouge Apprenants — ${org.nom}` });
      const texte = h("textarea", { id: "org-email-texte", rows: "12" });
      texte.value = `Bonjour${org.contact ? " " + org.contact : ""},\n\n\n\nBelle journée,\nÉmilie Rachas\nFil Rouge Apprenants`;
      const rdv = h("input", { id: "org-email-rdv", type: "text", placeholder: "Ex. : jeudi 20 novembre à 10 h" });
      const blocRdv = h("label", { class: "sim-champ", hidden: true }, "Date du rendez-vous à écrire dans l'email", rdv);
      const zone = h("div", {});
      let titre = "Email libre", modele = null;
      const majRdv = () => { blocRdv.hidden = !Ct.variablesRestantes(objet.value + texte.value).includes("date_rdv"); };
      function appliquer(m) {
        modele = m;
        if (!m) return;
        titre = m.titre;
        const r = Ct.remplirModeleEmail(m, { moi: "Émilie", organisme: org.nom, contact: org.contact || "", lien_simulateur: lien, lien_simulateur_vierge: lien, date_rdv: rdv.value });
        objet.value = r.objet; texte.value = r.texte;
        majRdv();
      }
      rdv.addEventListener("change", () => {
        const v = rdv.value.trim();
        if (!v) return;
        objet.value = objet.value.split("{date_rdv}").join(v);
        texte.value = texte.value.split("{date_rdv}").join(v);
        majRdv();
      });
      const zoneMenus = h("div", {}, h("p", { class: "aide" }, "Chargement des emails tout prêts…"));
      const M = modeles ? modeles() : null;
      if (M) M.charger().then((liste) => {
        if (!liste.some((m) => m.actif && m.destinataire === "organisme")) { remplacer(zoneMenus, h("p", { class: "aide" }, "Aucun email tout prêt pour les organismes : écris librement.")); return; }
        const menus = M.menus(liste, "org-email", appliquer, { destinataire: "organisme", libre: true });
        remplacer(zoneMenus, menus.bloc);
      }).catch(() => remplacer(zoneMenus, h("p", { class: "aide" }, "Emails tout prêts indisponibles : écris librement.")));

      const envoyer = h("button", { type: "submit", class: "bouton" }, org.email ? "Envoyer avec Gmail Fil Rouge" : "Copier l'email");
      const fermer = h("button", { type: "button", class: "bouton bouton-secondaire" }, "Fermer");
      const formulaire = h("form", { class: "formulaire", method: "dialog", novalidate: true },
        h("div", { class: "email-entete" },
          h("p", {}, h("span", { class: "compteur-libelle" }, "De : "), boite),
          h("p", {}, h("span", { class: "compteur-libelle" }, "À : "), org.email ? `${org.contact || org.nom} <${org.email}>` : "pas d'adresse sur la fiche")),
        zoneMenus,
        h("label", { class: "sim-champ" }, "Objet", objet),
        h("label", { class: "sim-champ" }, "Message", texte),
        blocRdv, zone,
        h("div", { class: "actions-ligne" }, envoyer, fermer),
        h("p", { class: "aide" }, "Simulateur : le lien envoyé d'ici est vide, le centre remplit ses chiffres. Pour les remplir à sa place : bouton « 🧮 Envoyer le simulateur »."));
      const dialogue = h("dialog", { class: "dialogue", "aria-label": "Écrire un email" },
        h("div", { class: "dialogue-titre" }, h("h2", {}, `Email à ${org.nom}`),
          h("button", { type: "button", class: "dialogue-fermer", "aria-label": "Fermer" }, "×")),
        formulaire);
      const fin = () => { dialogue.close(); dialogue.remove(); };
      dialogue.querySelector(".dialogue-fermer").addEventListener("click", fin);
      fermer.addEventListener("click", fin);
      dialogue.addEventListener("cancel", () => setTimeout(() => dialogue.remove(), 0));
      formulaire.addEventListener("submit", async (e) => {
        e.preventDefault();
        const reste = Ct.variablesRestantes(objet.value + texte.value);
        if (reste.length) { remplacer(zone, message("erreur", `Il reste à compléter : {${reste.join("}, {")}}.`)); return; }
        if (org.email) {
          window.open(Ct.lienGmail(org.email, objet.value, texte.value, boite), "_blank", "noopener");
        } else {
          try { await navigator.clipboard.writeText(`${objet.value}\n\n${texte.value}`); } catch (err) { remplacer(zone, message("erreur", "Copie impossible.")); return; }
        }
        let note = false;
        try {
          const r = noterEchange ? await noterEchange(org.id, `Email « ${titre} » ${org.email ? "préparé dans Gmail" : "copié"} : ${objet.value}`) : null;
          note = !!r && !r.error;
        } catch (err) { note = false; }
        remplacer(zone, message("info", (org.email
          ? "Gmail est ouvert avec l'email tout prêt : clique « Envoyer » là-bas."
          : "Email copié : colle-le dans ta messagerie.") + (note ? " C'est noté dans l'historique du centre." : " (Pas pu le noter dans l'historique : ajoute-le à la main si besoin.)")));
      });
      document.body.append(dialogue);
      dialogue.showModal();
      return dialogue;
    }

    async function route(morceaux) {
      const cle = morceaux[0] || "";
      const orgId = morceaux.find((m) => UUID.test(m)) || null;
      if (cle === "simulateur") return simulateur(orgId);
      if (cle === "priorites") return priorites();
      if (cle === "plan") return plan();
      if (cle === "scripts") return approches();
      if (cle === "methodes") return methodes();
      if (cle === "avance") return avance();
      return accueil();
    }

    return { route, noter, fenetreEmail };
  };

  window.FilRougeProspection.noter = noter;
  window.FilRougeProspection.CRITERES = CRITERES;
  window.FilRougeProspection.METHODES = METHODES;
})();
