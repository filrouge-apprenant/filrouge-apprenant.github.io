// =============================================================================
// Fil Rouge Apprenants — Traitement des objections (vente aux organismes)
// =============================================================================
// Bibliothèque des objections entendues en démarchant les organismes de
// formation (fondateurs, directeurs, responsables Qualiopi, responsables
// pédagogiques), et le panneau « un bouton par thème » affiché :
//   - dans l'onglet « Objections » de la fiche d'un organisme ;
//   - dans la page Scripts de vente (#/scripts-vente/objections).
//
// Pour ajouter ou corriger une objection : modifier OBJECTIONS ci-dessous,
// rien d'autre. Champs :
//   id        identifiant court, unique
//   cat       catégorie (voir CATEGORIES)
//   bouton    texte du bouton (court)
//   profils   interlocuteurs qui la sortent le plus souvent
//   dit       la phrase telle que le prospect la dit
//   cache     ce qu'elle veut souvent dire (pour toi)
//   accueil   phrase d'accueil (sinon « Je comprends tout à fait. »)
//   creuser   question pour trouver le vrai frein
//   repondre  phrases de réponse, dans l'ordre
//   relancer  question qui fait avancer (prochaine étape)
//   eviter    erreur à ne pas faire
//   angles    variante selon l'interlocuteur { dirigeant, qualite, pedago }
//   mots      mots-clés pour la recherche
// {contact} = nom du contact, {organisme} = nom de l'organisme.
//
// Règles de contenu : aucune référence client inventée, aucun chiffre non
// vérifié, rien qui contredise le contrat (obligation de moyens, préavis
// 30 jours, pas de reconduction automatique, tarifs 20/15/12 € HT l'appel).
// Sécurité : tout le texte passe par h() (textContent), jamais innerHTML.
// =============================================================================

(function () {
  "use strict";

  const PROFILS = {
    tous: "Tout le monde",
    dirigeant: "Direction / fondateur",
    qualite: "Responsable Qualiopi",
    pedago: "Responsable pédagogique",
  };

  // Ce qui compte pour chaque interlocuteur, et ses objections les plus fréquentes.
  const ANGLES = {
    tous: {
      top: ["temps", "doc", "cher", "interne", "decideur", "interet"],
    },
    dirigeant: {
      compte: "Le chiffre d'affaires, les financements qui rentrent en entier, la réputation (avis, taux de réussite affichés), le temps de ses équipes.",
      cle: "Chaque abandon évité, c'est une formation menée au bout, un financement complet et un avis positif de plus. Un appel coûte entre 12 et 20 €.",
      mots: "rentabilité, financement, taux de réussite, avis, temps de vos équipes, sans engagement",
      top: ["cher", "budget", "roi", "interne", "embaucher", "references", "seule", "decideur"],
    },
    qualite: {
      compte: "Les preuves pour l'audit : indicateur 12 (engagement des bénéficiaires, prévention des ruptures de parcours), indicateur 2 (résultats publiés), indicateur 27 (sous-traitance), indicateurs 30 à 32 (avis, amélioration continue).",
      cle: "Chaque appel est daté et tracé, avec un compte rendu et la suite prévue : c'est une preuve prête à montrer à l'auditeur, consultable en direct sur la plateforme.",
      mots: "traçabilité, preuves, indicateur 12, ruptures de parcours, dossier prêt pour l'audit",
      top: ["certifies", "preuves", "soustraitance", "audit_loin", "rgpd", "dpo", "garantie_certif"],
    },
    pedago: {
      compte: "La réussite à l'examen, l'assiduité, la charge des formateurs et tuteurs, la qualité du lien avec l'apprenant.",
      cle: "Je ne fais pas de pédagogie : je m'occupe de la régularité et de la motivation entre deux cours, et je vous signale ceux qui décrochent avant qu'il soit trop tard.",
      mots: "assiduité, progression, examen, formateurs soulagés, alerte précoce",
      top: ["formateurs", "pedago_infos", "autonomes", "lms", "telephone", "harceles", "connaissez"],
    },
  };

  const CATEGORIES = [
    { cle: "barrage", titre: "Début d'appel" },
    { cle: "besoin", titre: "« On n'en a pas besoin »" },
    { cle: "prix", titre: "Prix et budget" },
    { cle: "confiance", titre: "Confiance en toi" },
    { cle: "qualiopi", titre: "Qualiopi" },
    { cle: "donnees", titre: "Données et RGPD" },
    { cle: "apprenants", titre: "Apprenants et image" },
    { cle: "contrat", titre: "Contrat et fonctionnement" },
    { cle: "decision", titre: "Décision et timing" },
  ];

  const METHODE = [
    "Accueillir : « Je comprends tout à fait. » Jamais « oui mais ».",
    "Creuser : une question pour trouver le vrai frein. Puis silence.",
    "Répondre au vrai frein, en deux ou trois phrases.",
    "Relancer : une question qui mène à une prochaine étape datée.",
  ];

  const OBJECTIONS = [
    // ------------------------------------------------------------ Début d'appel
    { id: "temps", cat: "barrage", bouton: "Pas le temps", profils: ["dirigeant", "pedago", "qualite"],
      dit: "Je n'ai pas le temps, là.",
      cache: "Tu déranges, ou il ne voit pas encore l'intérêt.",
      accueil: "Je comprends, je serai brève.",
      creuser: "Est-ce que je vous rappelle à un meilleur moment, ou est-ce que je vous dis en 20 secondes pourquoi j'appelle ?",
      repondre: [
        "J'aide les centres de formation à distance à garder leurs apprenants jusqu'à l'examen, en les appelant chaque mois. C'est justement le temps qui manque souvent aux équipes pour le faire.",
      ],
      relancer: "Je vous propose 15 minutes cette semaine : plutôt mardi matin ou jeudi en fin de journée ?",
      eviter: "Dérouler ton pitch quand même : tu perds le rendez-vous.",
      mots: "occupé rappeler plus tard" },

    { id: "doc", cat: "barrage", bouton: "Envoyez une doc", profils: ["dirigeant", "pedago", "qualite"],
      dit: "Envoyez-moi une documentation par mail.",
      cache: "Souvent une façon polie de raccrocher.",
      accueil: "Avec plaisir.",
      creuser: "Pour vous envoyer quelque chose d'utile : c'est plutôt l'abandon, la présence à l'examen ou les preuves Qualiopi qui vous préoccupe le plus ?",
      repondre: [
        "Très bien, je vous envoie la présentation et un exemple de compte rendu mensuel, centrés sur ce point-là.",
      ],
      relancer: "Je vous l'envoie aujourd'hui. On se cale 10 minutes jeudi pour en parler, une fois que vous l'aurez parcourue ?",
      eviter: "Envoyer la doc sans date de rappel fixée : elle finira à la corbeille.",
      mots: "plaquette mail brochure email" },

    { id: "interet", cat: "barrage", bouton: "Pas intéressé", profils: ["dirigeant", "pedago", "qualite"],
      dit: "Ça ne nous intéresse pas.",
      cache: "Réflexe de défense, ou vraie absence de besoin. Il faut savoir lequel.",
      accueil: "Je l'entends, et je ne vais pas insister.",
      creuser: "Juste par curiosité : c'est parce que vous n'avez pas d'abandons, ou parce que ce n'est pas le bon moment ?",
      repondre: [
        "Si vous n'avez pas d'abandons, bravo, c'est rare en formation à distance.",
        "Si c'est le moment, je comprends tout à fait.",
      ],
      relancer: "Je vous rappelle dans trois mois, avant la prochaine rentrée ?",
      eviter: "Argumenter avant de savoir pourquoi. Un « non » propre aujourd'hui peut devenir un « oui » dans trois mois.",
      mots: "non merci pas besoin" },

    { id: "objet", cat: "barrage", bouton: "C'est à quel sujet ?", profils: ["tous"],
      dit: "C'est à quel sujet ? (le standard ou l'assistante)",
      cache: "Barrage normal : on filtre les commerciaux.",
      accueil: "Bien sûr.",
      creuser: "Qui s'occupe chez vous du suivi des apprenants à distance et de leur présence à l'examen ?",
      repondre: [
        "C'est au sujet de l'abandon des apprenants en formation à distance. J'accompagne les apprenants par téléphone jusqu'à leur examen pour le compte des organismes.",
      ],
      relancer: "C'est bien {contact} qui s'en occupe ? Quel est le meilleur moment pour le ou la joindre ?",
      eviter: "Dire « c'est commercial » ou « c'est personnel ».",
      mots: "standard secrétaire assistante barrage" },

    { id: "demarches", cat: "barrage", bouton: "On est démarchés tous les jours", profils: ["dirigeant"],
      dit: "On reçoit dix appels comme le vôtre par jour.",
      cache: "Lassitude : il te range avec les vendeurs de logiciels.",
      accueil: "Je m'en doute, et je vous remercie de m'avoir répondu.",
      creuser: "La plupart vous proposent des logiciels, j'imagine ?",
      repondre: [
        "Moi je ne vends pas de logiciel. Je prends le téléphone et j'appelle vos apprenants, un par un, tous les mois. Vous ne changez rien à vos outils.",
      ],
      relancer: "Combien d'apprenants à distance avez-vous en ce moment, à peu près ?",
      mots: "sollicité démarchage commerciaux" },

    { id: "prestataire", cat: "barrage", bouton: "On a déjà un prestataire", profils: ["dirigeant", "qualite"],
      dit: "On travaille déjà avec un prestataire pour ça.",
      cache: "Il peut être satisfait… ou pas tout à fait.",
      accueil: "Très bien, c'est que le sujet compte pour vous.",
      creuser: "Qu'est-ce qui vous plaît dans ce qu'il fait ? Et s'il y avait une chose à améliorer, ce serait laquelle ?",
      repondre: [
        "Je ne vous demande pas de changer. Si un jour vous avez un pic d'inscriptions ou une formation qu'il ne couvre pas, je peux prendre une partie des apprenants, et vous comparez sur pièces.",
      ],
      relancer: "Ça vous irait que je vous rappelle avant votre prochaine rentrée ?",
      eviter: "Critiquer le concurrent.",
      mots: "concurrent déjà quelqu'un" },

    // ------------------------------------------------------------ Pas de besoin
    { id: "interne", cat: "besoin", bouton: "On le fait en interne", profils: ["dirigeant", "pedago", "qualite"],
      dit: "On fait déjà le suivi en interne.",
      cache: "C'est fait… en théorie. Souvent pas pour tout le monde, pas tous les mois.",
      accueil: "Très bien, c'est déjà une bonne chose.",
      creuser: "Comment ça se passe concrètement ? Vos équipes arrivent-elles à appeler chaque apprenant tous les mois, y compris ceux qui ne répondent pas ?",
      repondre: [
        "Je ne remplace pas vos équipes : je prends les appels qu'elles n'ont pas le temps de faire, souvent les apprenants les plus durs à joindre.",
        "Elles se concentrent sur ce qu'elles font le mieux, et vous gardez tous les comptes rendus.",
      ],
      relancer: "Si on testait 15 jours gratuitement sur les apprenants que vos équipes n'arrivent pas à joindre ?",
      angles: {
        dirigeant: "Une heure de salarié chargé coûte plus cher qu'un appel à 12-20 € : vos équipes gagnent ce temps pour l'admission ou la pédagogie.",
        qualite: "Vos appels internes sont-ils tous tracés et datés ? Les miens le sont, automatiquement.",
        pedago: "Vos formateurs gardent la pédagogie, je prends la relance et la motivation.",
      },
      mots: "équipe salariés déjà suivi coach" },

    { id: "pasabandons", cat: "besoin", bouton: "Pas d'abandons chez nous", profils: ["dirigeant", "pedago"],
      dit: "On n'a pas vraiment de problème d'abandon.",
      cache: "Parfois vrai, souvent pas mesuré.",
      accueil: "Tant mieux, c'est rare en formation à distance.",
      creuser: "Vous le mesurez comment ? Sur la dernière session, combien d'apprenants se sont présentés à l'examen par rapport aux inscrits ?",
      repondre: [
        "L'abandon à distance est souvent silencieux : l'apprenant ne dit pas qu'il arrête, il ne se connecte plus, et on s'en rend compte au moment de l'examen.",
        "C'est ce moment-là que je vise : avant qu'il décroche.",
      ],
      relancer: "Et ceux qui ne se sont pas connectés depuis trois semaines, vous savez combien il y en a aujourd'hui ?",
      eviter: "Contredire. Laisse-le découvrir le chiffre lui-même.",
      mots: "taux abandon décrochage aucun" },

    { id: "autonomes", cat: "besoin", bouton: "Apprenants autonomes", profils: ["pedago", "dirigeant"],
      dit: "Nos apprenants sont adultes et autonomes, ils n'ont pas besoin qu'on les appelle.",
      cache: "Il craint d'infantiliser, ou il pense aux meilleurs apprenants.",
      accueil: "Vous avez raison, la plupart le sont.",
      creuser: "Et les autres, ceux qui ne se connectent plus depuis quelques semaines, comment les repérez-vous ?",
      repondre: [
        "Je n'appelle pas pour surveiller. Je fais le point sur l'avancement, on fixe un objectif ensemble jusqu'au prochain appel. Les apprenants autonomes le vivent comme un service, pas comme un contrôle.",
        "Et pour ceux qui commencent à lâcher, ça change tout.",
      ],
      relancer: "On teste 15 jours sur les apprenants les moins actifs, pour voir ce que ça donne ?",
      mots: "adultes autonomie infantiliser" },

    { id: "formateurs", cat: "besoin", bouton: "Les formateurs le font", profils: ["pedago"],
      dit: "Nos formateurs et tuteurs s'en occupent déjà.",
      cache: "Il protège son équipe, ou il ne sait pas combien d'appels sont vraiment passés.",
      accueil: "C'est très bien que vos formateurs soient impliqués.",
      creuser: "Ils ont combien d'apprenants chacun ? Et le temps de rappeler ceux qui ne répondent pas, en plus de leurs cours et corrections ?",
      repondre: [
        "Je ne touche pas à la pédagogie. Je m'occupe de la régularité, de la motivation et des démarches (inscription à l'examen, stage), et je remonte aux formateurs ce qui relève de leur domaine.",
        "Ils gagnent du temps pour enseigner.",
      ],
      relancer: "Qu'est-ce que vos formateurs aimeraient ne plus avoir à faire, si on leur demandait ?",
      eviter: "Laisser entendre que les formateurs font mal leur travail.",
      mots: "tuteurs tutorat enseignants profs" },

    { id: "lms", cat: "besoin", bouton: "Notre plateforme relance", profils: ["pedago", "dirigeant"],
      dit: "Notre plateforme envoie déjà des relances automatiques.",
      cache: "Il compte sur les emails automatiques.",
      accueil: "C'est un bon début.",
      creuser: "Et ces emails, vous savez combien sont ouverts ? Que se passe-t-il quand un apprenant ne réagit pas à trois relances ?",
      repondre: [
        "Un email automatique, ça s'ignore facilement. Une voix au téléphone qui connaît votre parcours et fixe un objectif avec l'apprenant, beaucoup moins.",
        "Je prends le relais justement là où les relances automatiques ne suffisent plus.",
      ],
      relancer: "Vous pourriez me sortir les apprenants qui n'ont pas réagi aux dernières relances ? On commence par eux, gratuitement.",
      mots: "lms automatique email relance outil" },

    { id: "peu", cat: "besoin", bouton: "Trop peu d'apprenants", profils: ["dirigeant"],
      dit: "On a trop peu d'apprenants pour que ça vaille le coup.",
      cache: "Il pense que c'est une offre pour les gros.",
      accueil: "Je comprends.",
      creuser: "Combien en avez-vous en ce moment ? Et pour vous, un seul abandon, ça représente quoi ?",
      repondre: [
        "Justement, avec peu d'apprenants, chaque abandon pèse lourd dans votre taux de réussite.",
        "Il n'y a pas de minimum : vous payez à l'appel, seulement pour les apprenants que vous me confiez.",
      ],
      relancer: "On démarre avec les 5 ou 10 qui vous inquiètent le plus ?",
      mots: "petit organisme minimum volume" },

    { id: "beaucoup", cat: "besoin", bouton: "Trop d'apprenants", profils: ["dirigeant", "pedago"],
      dit: "On a des centaines d'apprenants, vous ne pourrez pas suivre.",
      cache: "Doute sur ta capacité.",
      accueil: "C'est une vraie question.",
      creuser: "Parmi eux, combien sont vraiment à risque en ce moment, ceux qui ne se connectent plus ou qui sont en retard ?",
      repondre: [
        "La plateforme classe vos apprenants : à risque, à surveiller, assidus. On commence par ceux qui en ont le plus besoin.",
        "Je travaille avec des appelantes formées à la même méthode, et la montée en charge se fait par étapes, au rythme que vous choisissez.",
      ],
      relancer: "Si on commençait par une formation ou une session, pour voir le résultat avant d'élargir ?",
      mots: "volume capacité grand nombre" },

    { id: "alternance", cat: "besoin", bouton: "Alternants suivis par l'entreprise", profils: ["pedago"],
      dit: "Nos apprenants sont en alternance, l'entreprise et le tuteur les suivent.",
      cache: "Le suivi entreprise ne couvre pas la partie cours à distance.",
      accueil: "Effectivement, ils ont un tuteur en entreprise.",
      creuser: "Et pour la partie cours à distance, qui vérifie qu'ils avancent ? Ceux qui rompent leur contrat, vous les voyez venir ?",
      repondre: [
        "Le tuteur suit le travail en entreprise ; moi je suis l'avancement dans les cours, les échéances et l'examen, et je vous alerte quand un apprenant montre des signes de rupture.",
      ],
      relancer: "On teste sur les alternants qui ont le plus de retard dans leurs cours ?",
      mots: "apprentissage alternance tuteur entreprise contrat pro" },

    { id: "presentiel", cat: "besoin", bouton: "On est en présentiel", profils: ["pedago", "dirigeant"],
      dit: "Nos formations sont surtout en présentiel.",
      cache: "Peut-être hors cible… ou hybride.",
      accueil: "D'accord, merci de me le préciser.",
      creuser: "Vous avez une partie à distance, ou des périodes entre deux sessions où les apprenants travaillent seuls ?",
      repondre: [
        "C'est souvent entre deux sessions, ou pendant la préparation de l'examen, que les apprenants lâchent. C'est là que j'interviens.",
      ],
      relancer: "Si vous ouvrez une formation à distance ou hybride, je peux vous rappeler à ce moment-là ?",
      eviter: "Forcer : si c'est 100 % présentiel avec un suivi quotidien, note-le et passe au suivant.",
      mots: "salle hybride sur place" },

    // ------------------------------------------------------------ Prix et budget
    { id: "cher", cat: "prix", bouton: "C'est trop cher", profils: ["dirigeant"],
      dit: "C'est trop cher.",
      cache: "Il ne voit pas encore ce que ça rapporte, ou il compare à autre chose.",
      accueil: "Je comprends.",
      creuser: "Trop cher par rapport à quoi ?",
      repondre: [
        "Un appel, c'est entre 12 et 20 € HT selon le nombre d'apprenants. Combien vous rapporte une formation menée jusqu'au bout ?",
        "Un apprenant qui abandonne, c'est un financement qui ne rentre pas en entier, un avis en moins et un taux de réussite qui baisse. Si j'évite un seul abandon, le suivi est souvent remboursé.",
        "Et vous testez d'abord 15 jours gratuitement.",
      ],
      relancer: "On fait le calcul ensemble sur une de vos formations ?",
      eviter: "Baisser ton prix tout de suite. Fais d'abord parler de la valeur.",
      mots: "prix tarif coût onéreux" },

    { id: "budget", cat: "prix", bouton: "Pas de budget", profils: ["dirigeant"],
      dit: "On n'a pas de budget pour ça cette année.",
      cache: "Vrai blocage, ou priorité pas encore établie.",
      accueil: "Je comprends, les budgets sont serrés.",
      creuser: "Si le budget n'était pas un sujet, est-ce que ce suivi vous intéresserait ?",
      repondre: [
        "Il n'y a pas d'investissement de départ : vous payez à l'appel, chaque mois, pour les apprenants que vous me confiez. Vous pouvez commencer petit.",
        "Et un abandon évité, c'est du chiffre d'affaires conservé : le suivi se finance en partie tout seul.",
      ],
      relancer: "On commence par le test gratuit de 15 jours, et vous décidez ensuite avec des résultats en main ?",
      mots: "budget enveloppe année prochaine" },

    { id: "roi", cat: "prix", bouton: "Combien ça rapporte ?", profils: ["dirigeant"],
      dit: "Qu'est-ce que ça va me rapporter concrètement ?",
      cache: "Bon signe : il réfléchit en investissement.",
      accueil: "C'est la bonne question.",
      creuser: "Combien coûte une de vos formations, et combien d'apprenants ne vont pas au bout sur une session ?",
      repondre: [
        "Faisons le calcul : 30 apprenants suivis, c'est 30 appels à 15 € HT, soit 450 € HT par mois. Combien de formations faut-il sauver pour que ce soit rentable chez vous ?",
        "Et vous suivez le résultat en direct sur la plateforme : qui a été joint, qui avance, qui est à risque.",
      ],
      relancer: "On mesure ça pendant 15 jours gratuits, sur vos propres apprenants ?",
      eviter: "Promettre un taux d'abandon : je m'engage sur les moyens, pas sur un résultat chiffré.",
      mots: "rentabilité retour investissement gain" },

    { id: "injoignable", cat: "prix", bouton: "Payer si pas de réponse ?", profils: ["dirigeant"],
      dit: "Et si l'apprenant ne répond pas, je paie quand même ?",
      cache: "Peur de payer pour rien.",
      accueil: "Bonne question, je vous explique.",
      creuser: "Chez vous, combien de tentatives faites-vous avant de laisser tomber un apprenant qui ne répond pas ?",
      repondre: [
        "Un appel est facturé quand l'apprenant est joint et qu'on a échangé.",
        "S'il reste injoignable, je fais plusieurs tentatives à des jours et heures différents, avec un SMS ou un email à chaque fois. C'est seulement après ces tentatives, toutes tracées sur la plateforme, que l'appel est compté. Le nombre est écrit dans le contrat.",
        "Et un apprenant injoignable, c'est justement l'information qui vous alerte.",
      ],
      relancer: "Ça vous rassure ? On regarde ensemble le contrat ?",
      mots: "répondeur injoignable facturé messagerie" },

    { id: "resultat", cat: "prix", bouton: "Payée au résultat ?", profils: ["dirigeant"],
      dit: "Pourquoi vous ne seriez pas payée au résultat, par apprenant qui réussit ?",
      cache: "Il veut partager le risque.",
      accueil: "Je comprends l'idée.",
      creuser: "Qu'est-ce qui vous ferait dire, au bout d'un mois, que ça fonctionne ?",
      repondre: [
        "La réussite dépend de beaucoup de choses : la formation, l'apprenant, sa vie. Je m'engage sur ce que je maîtrise : chaque apprenant appelé, chaque mois, avec un compte rendu et des alertes.",
        "C'est pour ça que je propose 15 jours gratuits : vous jugez le travail avant de payer quoi que ce soit.",
      ],
      relancer: "On fixe ensemble ces critères de réussite pour le test ?",
      eviter: "Accepter un paiement au résultat : tu porterais un risque que tu ne contrôles pas.",
      mots: "succès commission performance garantie" },

    { id: "remise", cat: "prix", bouton: "Vous faites une remise ?", profils: ["dirigeant"],
      dit: "Vous pouvez faire un geste sur le prix ?",
      cache: "Il est presque décidé, il teste ta marge.",
      accueil: "Je comprends que vous posiez la question.",
      creuser: "Si on trouve un accord sur ce point, on peut démarrer quand ?",
      repondre: [
        "Le prix baisse déjà avec le volume : 20 € sous 20 apprenants, 15 € jusqu'à 150, 12 € au-delà.",
        "Si vous me confiez plus d'apprenants, vous passez au palier suivant. Je préfère ça à une remise, c'est plus juste pour vous comme pour moi.",
      ],
      relancer: "On part sur combien d'apprenants ?",
      eviter: "Lâcher une remise sans contrepartie (volume, durée, date de démarrage).",
      mots: "réduction ristourne négocier geste" },

    { id: "financeur", cat: "prix", bouton: "Pas financé par le CPF/OPCO", profils: ["dirigeant"],
      dit: "Ce coût n'est pas pris en charge par le financeur.",
      cache: "Il cherche à le refacturer, ou il voit un coût pur.",
      accueil: "Effectivement, c'est un coût interne.",
      creuser: "Aujourd'hui, ce suivi, quand il est fait, il est payé comment ? Par le temps de vos salariés ?",
      repondre: [
        "Le suivi fait déjà partie de votre prestation, il est donc déjà dans vos coûts. Je vous propose de le faire faire à l'appel, sans recruter.",
        "Et chaque formation menée au bout sécurise justement le financement que vous touchez.",
      ],
      relancer: "On compare avec ce que vous coûte le suivi aujourd'hui ?",
      mots: "cpf opco france travail financement prise en charge" },

    { id: "embaucher", cat: "prix", bouton: "Plutôt embaucher", profils: ["dirigeant"],
      dit: "Je préfère embaucher quelqu'un ou prendre un alternant.",
      cache: "Il veut garder la main.",
      accueil: "C'est une option, bien sûr.",
      creuser: "Qui le formerait et l'encadrerait ? Et pendant ses congés ou s'il part ?",
      repondre: [
        "Avec moi, pas de recrutement, pas de formation, pas de charges : vous payez seulement les appels réalisés, et vous arrêtez avec 30 jours de préavis.",
        "J'ai dix ans de relation client à distance : vous avez quelqu'un d'opérationnel dès le premier jour.",
      ],
      relancer: "Pourquoi ne pas tester 15 jours, le temps de décider si vous recrutez ?",
      mots: "recruter salarié alternant stagiaire interne" },

    // ------------------------------------------------------------ Confiance
    { id: "references", cat: "confiance", bouton: "Vos références ?", profils: ["dirigeant", "qualite"],
      dit: "Vous travaillez avec qui ? Vous avez des références ?",
      cache: "Besoin d'être rassuré.",
      accueil: "C'est normal de le demander.",
      creuser: "Qu'est-ce qui vous rassurerait le plus : un retour d'expérience, ou voir le travail sur vos propres apprenants ?",
      repondre: [
        "Fil Rouge Apprenants démarre, je vous le dis franchement. Derrière, il y a dix ans de relation client à distance, dont l'accompagnement d'apprenants en formation.",
        "C'est pour ça que je propose 15 jours gratuits : vous jugez sur vos apprenants, avec les comptes rendus sous les yeux, sans rien payer.",
      ],
      relancer: "On choisit ensemble les apprenants du test ?",
      eviter: "Inventer un client ou citer ton employeur actuel.",
      mots: "clients preuve recul exemples" },

    { id: "nouvelle", cat: "confiance", bouton: "Structure trop petite", profils: ["dirigeant"],
      dit: "Vous êtes une petite structure, et si vous arrêtez dans six mois ?",
      cache: "Peur de la dépendance.",
      accueil: "C'est une question légitime.",
      creuser: "Qu'est-ce qui se passerait pour vous si le suivi s'arrêtait ?",
      repondre: [
        "Vous ne dépendez pas de moi : tous les comptes rendus sont sur la plateforme, et à la fin du contrat vous récupérez un export complet de vos données.",
        "Pas d'engagement long ni de reconduction automatique. Vous restez parce que ça marche, pas parce que vous êtes coincé.",
      ],
      relancer: "On démarre par le test gratuit, sans risque pour vous ?",
      mots: "auto-entrepreneur micro petite pérennité" },

    { id: "seule", cat: "confiance", bouton: "Et si vous êtes absente ?", profils: ["dirigeant", "pedago"],
      dit: "Vous êtes seule : et si vous êtes malade ou en congés ?",
      cache: "Peur de la continuité du service.",
      accueil: "Bonne question.",
      creuser: "Sur quelle période ce serait le plus gênant pour vous ? Avant les examens ?",
      repondre: [
        "Je travaille avec des appelantes formées à la même méthode, tenues au secret par écrit, sur la même plateforme. Vos apprenants restent suivis.",
        "Et les appels sont planifiés : je cale mes congés en dehors de vos périodes d'examen.",
      ],
      relancer: "Vous pouvez me donner vos dates d'examen pour qu'on organise le suivi autour ?",
      mots: "congés maladie continuité remplaçante" },

    { id: "connaissez", cat: "confiance", bouton: "Vous ne connaissez pas nos formations", profils: ["pedago"],
      dit: "Vous ne connaissez pas nos formations ni notre pédagogie.",
      cache: "Peur que tu dises des bêtises aux apprenants.",
      accueil: "Vous avez raison, c'est vous les experts.",
      creuser: "Qu'est-ce qu'il faudrait absolument que je sache sur vos parcours pour bien accompagner vos apprenants ?",
      repondre: [
        "Avant de commencer, je prends le temps de découvrir vos parcours : étapes, échéances, examen, démarches. Je vous demande un accès en consultation à votre plateforme pour voir la progression.",
        "Pour tout ce qui est pédagogique, je renvoie vers vos formateurs. Moi je m'occupe de la régularité et de la motivation.",
      ],
      relancer: "On prévoit 30 minutes de présentation de vos parcours au démarrage du test ?",
      mots: "pédagogie formations métier expertise" },

    { id: "essaye", cat: "confiance", bouton: "Déjà essayé, ça n'a pas marché", profils: ["dirigeant", "pedago"],
      dit: "On a déjà essayé ce genre de suivi, ça n'a rien donné.",
      cache: "Mauvaise expérience : il a besoin de voir la différence.",
      accueil: "Ah, intéressant.",
      creuser: "Qu'est-ce qui n'a pas marché, à votre avis ? Les apprenants ne répondaient pas, ou le suivi n'était pas régulier ?",
      repondre: [
        "Ce qui fait la différence : un appel régulier chaque mois, un objectif fixé avec l'apprenant à chaque fois, une relance s'il ne le tient pas, et des comptes rendus que vous voyez en direct.",
        "Et vous jugez en 15 jours, gratuitement.",
      ],
      relancer: "Si on évite précisément ce qui n'avait pas marché, on teste ?",
      eviter: "Dire « avec moi ce sera différent » sans expliquer pourquoi.",
      mots: "échec expérience passée raté" },

    { id: "garantie", cat: "confiance", bouton: "Vous garantissez quoi ?", profils: ["dirigeant", "qualite"],
      dit: "Vous me garantissez combien d'abandons en moins ?",
      cache: "Il veut un engagement chiffré.",
      accueil: "Je comprends que vous vouliez un chiffre.",
      creuser: "Aujourd'hui, vous connaissez votre taux d'abandon et de présence à l'examen ? C'est notre point de départ.",
      repondre: [
        "Je ne vous promettrai pas un chiffre que je ne maîtrise pas, ce serait malhonnête. Je garantis le travail : chaque apprenant appelé, un objectif fixé, un compte rendu, des alertes sur ceux qui décrochent.",
        "On mesure ensemble l'évolution de votre taux, mois après mois, sur la plateforme.",
      ],
      relancer: "On note votre taux actuel et on fait le point après le test ?",
      eviter: "Promettre un résultat : le contrat est une obligation de moyens.",
      mots: "garantie engagement résultat promesse" },

    // ------------------------------------------------------------ Qualiopi
    { id: "certifies", cat: "qualiopi", bouton: "On est déjà certifiés", profils: ["qualite", "dirigeant"],
      dit: "On est certifiés Qualiopi, l'audit s'est très bien passé.",
      cache: "Il ne voit pas ce que tu ajoutes.",
      accueil: "Félicitations, ce n'est pas rien.",
      creuser: "Pour l'indicateur 12, prévention des ruptures de parcours, qu'avez-vous montré à l'auditeur ? Et ce sera aussi simple à prouver au prochain audit ?",
      repondre: [
        "Le prochain audit regardera ce que vous avez réellement fait depuis. Avec moi, chaque action de suivi est datée, tracée, avec un compte rendu : votre dossier de preuves se construit tout seul.",
      ],
      relancer: "Je vous montre à quoi ressemble ce dossier de preuves sur la plateforme ?",
      mots: "certification audit réussi indicateur" },

    { id: "preuves", cat: "qualiopi", bouton: "On a déjà nos preuves", profils: ["qualite"],
      dit: "On a déjà nos preuves : emails, relances, feuilles d'émargement.",
      cache: "Il est organisé, mais ça lui prend du temps.",
      accueil: "C'est très bien.",
      creuser: "Combien de temps ça vous prend de les rassembler avant un audit ? Et les preuves d'échanges individuels avec chaque apprenant, vous les avez pour tous ?",
      repondre: [
        "Je ne remplace pas vos preuves, je les complète : un échange individuel tracé chaque mois pour chaque apprenant, avec la suite prévue. Vous les consultez et les exportez quand vous voulez.",
      ],
      relancer: "On regarde ensemble ce qui manque le plus souvent dans votre dossier ?",
      mots: "traçabilité émargement dossier" },

    { id: "soustraitance", cat: "qualiopi", bouton: "Sous-traiter complique l'audit", profils: ["qualite"],
      dit: "Si on sous-traite, l'auditeur va nous demander des comptes.",
      cache: "Il connaît l'indicateur 27.",
      accueil: "Vous avez raison, c'est l'indicateur 27.",
      creuser: "Qu'est-ce que l'auditeur vous demande habituellement pour vos sous-traitants ?",
      repondre: [
        "Je vous fournis tout ce qu'il faut : le contrat qui décrit la prestation, l'accord RGPD, la méthode d'appel, et la traçabilité complète de chaque action sur la plateforme.",
        "Vous gardez la main : vous voyez tout en direct.",
      ],
      relancer: "Je vous envoie le contrat type pour que vous le regardiez avec votre référent ?",
      mots: "indicateur 27 sous-traitant conformité" },

    { id: "audit_loin", cat: "qualiopi", bouton: "Audit dans longtemps", profils: ["qualite", "dirigeant"],
      dit: "Notre prochain audit est dans deux ans, on verra à ce moment-là.",
      cache: "Il pense Qualiopi = moment de l'audit.",
      accueil: "C'est vrai, vous avez le temps.",
      creuser: "L'auditeur regardera la période écoulée depuis le dernier audit, non ? Les preuves, il faudra les avoir accumulées d'ici là.",
      repondre: [
        "Les preuves de suivi ne se créent pas la veille de l'audit. En commençant maintenant, vous arrivez avec deux ans d'historique.",
        "Et surtout, Qualiopi n'est qu'un bonus : le premier intérêt, c'est de garder vos apprenants.",
      ],
      relancer: "On démarre doucement, avec une session ?",
      mots: "surveillance renouvellement plus tard" },

    { id: "garantie_certif", cat: "qualiopi", bouton: "Ça garantit Qualiopi ?", profils: ["qualite"],
      dit: "Donc avec vous on est sûrs de garder la certification ?",
      cache: "Il veut une assurance.",
      accueil: "Je vais être honnête avec vous.",
      creuser: "Sur quels indicateurs avez-vous eu des remarques au dernier audit ?",
      repondre: [
        "La certification dépend de l'organisme certificateur et de l'ensemble de vos pratiques, je ne peux pas la garantir.",
        "Ce que je vous apporte, ce sont des preuves solides pour l'engagement des apprenants et la prévention des ruptures (indicateur 12), et les avis des apprenants pour l'amélioration continue.",
      ],
      relancer: "On regarde ensemble les preuves que vous auriez à la fin du test ?",
      eviter: "Promettre la certification.",
      mots: "certificateur assurance non-conformité" },

    { id: "avis_q", cat: "qualiopi", bouton: "On a déjà nos questionnaires", profils: ["qualite"],
      dit: "On envoie déjà des questionnaires de satisfaction.",
      cache: "Il pense aux indicateurs 30 à 32.",
      accueil: "Très bien.",
      creuser: "Vous avez combien de réponses en général ? Et que faites-vous des apprenants qui ne répondent pas ?",
      repondre: [
        "Je recueille les avis au fil des appels, en plus du questionnaire. Les apprenants s'expriment plus facilement à quelqu'un qui les accompagne. Ça nourrit votre amélioration continue.",
      ],
      relancer: "On regarde ensemble le récapitulatif mensuel que je vous enverrais ?",
      mots: "satisfaction questionnaire avis indicateur 30" },

    // ------------------------------------------------------------ Données et RGPD
    { id: "rgpd", cat: "donnees", bouton: "Et le RGPD ?", profils: ["qualite", "dirigeant"],
      dit: "Et nos données, le RGPD ?",
      cache: "Inquiétude légitime, souvent celle de la direction ou du DPO.",
      accueil: "C'est une très bonne question.",
      creuser: "Qu'est-ce qui vous préoccupe le plus : où sont stockées les données, ou qui y a accès ?",
      repondre: [
        "Les données sont hébergées en France, à Paris. Chaque organisme ne voit que ses apprenants, et les accès sont nominatifs.",
        "Le contrat comprend un accord de sous-traitance RGPD : je ne traite les données que pour votre suivi, je n'en garde aucune après la fin du contrat.",
      ],
      relancer: "Je vous envoie l'accord pour le faire relire par votre référent RGPD ?",
      mots: "données personnelles protection cnil hébergement" },

    { id: "dpo", cat: "donnees", bouton: "Mon DPO doit valider", profils: ["qualite", "dirigeant"],
      dit: "Il faut que notre DPO valide.",
      cache: "Étape normale, pas un refus.",
      accueil: "C'est tout à fait normal.",
      creuser: "Qu'est-ce que votre DPO va vouloir voir en premier ?",
      repondre: [
        "Je vous envoie l'accord de sous-traitance (article 28 du RGPD), la liste des sous-traitants et les mesures de sécurité. Tout est prêt.",
      ],
      relancer: "Je peux échanger directement avec lui si ça accélère. Je vous rappelle mardi pour savoir où ça en est ?",
      mots: "dpo délégué validation juridique" },

    { id: "transmettre", cat: "donnees", bouton: "Les données ne sortent pas", profils: ["dirigeant", "qualite"],
      dit: "On ne transmet pas les coordonnées de nos apprenants à l'extérieur.",
      cache: "Règle interne, ou peur de perdre la main.",
      accueil: "Je comprends, c'est une bonne règle.",
      creuser: "C'est une règle de principe, ou une question d'encadrement ? Un sous-traitant avec un contrat RGPD, ça vous pose problème ?",
      repondre: [
        "Je n'ai besoin que du strict nécessaire : nom, téléphone, email, formation et avancement. Aucune donnée sensible.",
        "Je me présente aux apprenants comme chargée de suivi pour votre compte, et un modèle de message les prévient avant le premier appel.",
      ],
      relancer: "On commence le test sur quelques apprenants volontaires ?",
      mots: "coordonnées confidentiel extérieur" },

    { id: "acces_lms", cat: "donnees", bouton: "Pas d'accès à notre plateforme", profils: ["pedago", "qualite"],
      dit: "On ne peut pas vous donner accès à notre plateforme de formation.",
      cache: "Question de sécurité ou de licence.",
      accueil: "Pas de souci.",
      creuser: "Vous pourriez m'envoyer un export de la progression chaque mois, à la place ?",
      repondre: [
        "Un accès en consultation seule est plus simple, mais un export suffit : je l'importe sur la plateforme et je supprime le fichier dès qu'il est intégré.",
      ],
      relancer: "Quel format vous est le plus simple à sortir ?",
      mots: "lms accès export progression" },

    { id: "ia", cat: "donnees", bouton: "Vous utilisez l'IA ?", profils: ["qualite", "dirigeant"],
      dit: "Vous passez nos données dans une intelligence artificielle ?",
      cache: "Méfiance récente, très fréquente.",
      accueil: "Bonne question, je vous réponds clairement.",
      creuser: "C'est une règle chez vous, ou une inquiétude ?",
      repondre: [
        "Les appels, c'est moi, en vrai, au téléphone. Le classement des apprenants à risque est calculé par la plateforme, sans IA.",
        "Le contrat n'autorise qu'un seul outil d'IA, Claude d'Anthropic, pour l'aide à la rédaction et l'analyse, avec l'entraînement des modèles désactivé. Aucune autre IA ne reçoit vos données.",
      ],
      relancer: "Je vous envoie la liste des sous-traitants pour vérification ?",
      mots: "intelligence artificielle chatgpt automatisation robot" },

    // ------------------------------------------------------------ Apprenants et image
    { id: "telephone", cat: "apprenants", bouton: "Ils ne décrochent pas", profils: ["pedago", "dirigeant"],
      dit: "Nos apprenants ne répondent jamais au téléphone.",
      cache: "Ses équipes ont essayé et abandonné.",
      accueil: "C'est vrai, beaucoup ne répondent pas du premier coup.",
      creuser: "Combien de fois vos équipes essaient-elles, et à quelles heures ?",
      repondre: [
        "J'appelle à des jours et des heures différents, y compris le samedi, et j'envoie un SMS ou un email à chaque tentative. Les apprenants finissent par rappeler.",
        "Et un apprenant qui ne répond plus du tout, c'est une alerte que je vous remonte tout de suite.",
      ],
      relancer: "Donnez-moi vos 10 apprenants les plus durs à joindre pour le test ?",
      mots: "joignable répondeur messagerie samedi" },

    { id: "harceles", cat: "apprenants", bouton: "Ils vont se sentir harcelés", profils: ["pedago", "dirigeant"],
      dit: "Nos apprenants vont se sentir harcelés.",
      cache: "Peur des plaintes et des mauvais avis.",
      accueil: "Je comprends la crainte.",
      creuser: "Vous avez déjà eu des retours négatifs sur des relances ?",
      repondre: [
        "Un appel par mois, sur rendez-vous quand c'est possible, pour faire le point et aider. Les apprenants le vivent comme un accompagnement.",
        "Un apprenant qui demande à ne plus être appelé ne l'est plus, et vous êtes prévenu sous 48 heures.",
      ],
      relancer: "On regarde ensemble leurs retours dans le questionnaire de satisfaction à la fin du test ?",
      mots: "plainte trop d'appels intrusif" },

    { id: "image", cat: "apprenants", bouton: "Image de marque / tiers", profils: ["dirigeant"],
      dit: "Je ne veux pas qu'un prestataire extérieur parle à nos apprenants en notre nom.",
      cache: "Peur pour sa marque.",
      accueil: "Votre image, c'est essentiel, je le comprends.",
      creuser: "Qu'est-ce qui vous inquiète le plus : le ton, les informations données, ou que l'apprenant ne sache pas qui l'appelle ?",
      repondre: [
        "Je me présente comme chargée de suivi pour le compte de {organisme}. On cale ensemble le discours, les mots à utiliser et ceux à éviter.",
        "Dix ans de relation client à distance : la qualité du contact au téléphone, c'est mon métier. Et vous lisez chaque compte rendu.",
      ],
      relancer: "On écrit ensemble la présentation que je ferai aux apprenants ?",
      mots: "marque réputation ton nom extérieur" },

    { id: "pedago_infos", cat: "apprenants", bouton: "Mauvaises infos pédagogiques", profils: ["pedago"],
      dit: "Et si vous donnez de mauvaises informations aux apprenants ?",
      cache: "Peur de devoir rattraper des erreurs.",
      accueil: "C'est une vraie question.",
      creuser: "Quelles sont les questions des apprenants qui reviennent le plus ?",
      repondre: [
        "Je ne réponds jamais sur le fond pédagogique : je renvoie vers vos formateurs et je le note dans le compte rendu.",
        "Pour les démarches (inscription à l'examen, convention de stage), je suis vos procédures, validées avec vous au démarrage.",
      ],
      relancer: "Vous me préparez la liste de vos contacts référents par sujet ?",
      mots: "erreur information formateur procédure" },

    { id: "equipe_mal", cat: "apprenants", bouton: "L'équipe va mal le prendre", profils: ["pedago"],
      dit: "Mon équipe va le vivre comme un désaveu.",
      cache: "Il protège ses collaborateurs.",
      accueil: "Je comprends, c'est important de les embarquer.",
      creuser: "Qu'est-ce que votre équipe aimerait qu'on lui enlève de la charge ?",
      repondre: [
        "Je viens en renfort, pas en remplacement : je prends les relances répétitives et les apprenants injoignables, et je leur remonte ce qui relève de leur expertise.",
        "On peut présenter la démarche ensemble à l'équipe.",
      ],
      relancer: "On organise 15 minutes avec eux au démarrage du test ?",
      mots: "collègues désaveu remplacement" },

    // ------------------------------------------------------------ Contrat et fonctionnement
    { id: "engagement", cat: "contrat", bouton: "Peur de s'engager", profils: ["dirigeant"],
      dit: "Je ne veux pas m'engager sur un an.",
      cache: "Peur d'être coincé si ça ne marche pas.",
      accueil: "Je comprends, et vous n'aurez pas à le faire.",
      creuser: "Qu'est-ce qui vous ferait arrêter, si vous deviez arrêter ?",
      repondre: [
        "Le suivi dure le temps que vous choisissez, sans reconduction automatique. Vous pouvez arrêter avant, avec 30 jours de préavis.",
        "Et vous commencez par 15 jours gratuits.",
      ],
      relancer: "On démarre le test lundi ?",
      mots: "durée contrat préavis résiliation" },

    { id: "test_court", cat: "contrat", bouton: "15 jours, c'est court", profils: ["dirigeant", "pedago"],
      dit: "Quinze jours, ce n'est pas assez pour juger.",
      cache: "Il est intéressé, il veut un test sérieux.",
      accueil: "Vous avez raison, on ne voit pas tout en 15 jours.",
      creuser: "Qu'est-ce qu'il faudrait voir à la fin pour vous décider ?",
      repondre: [
        "En 15 jours, vous voyez déjà : combien d'apprenants j'ai joints, ce qu'ils m'ont dit, qui est à risque, et la qualité des comptes rendus.",
        "Le résultat sur les abandons se voit ensuite, mois après mois, et vous pouvez arrêter à tout moment avec 30 jours de préavis.",
      ],
      relancer: "On fixe ensemble ces critères et un rendez-vous de bilan à J+15 ?",
      mots: "essai période test pilote" },

    { id: "prelevement", cat: "contrat", bouton: "Pas de prélèvement automatique", profils: ["dirigeant"],
      dit: "On ne fait pas de prélèvement automatique.",
      cache: "Habitude de gestion, rarement bloquant.",
      accueil: "Pas de problème.",
      creuser: "Vous préférez le virement sur facture ?",
      repondre: [
        "Le virement est possible aussi : une facture en début de mois pour les appels du mois précédent, payable sous 15 jours.",
      ],
      relancer: "Je le note comme ça dans le contrat ?",
      mots: "paiement virement facture sepa" },

    { id: "methode", cat: "contrat", bouton: "On fera nous-mêmes", profils: ["dirigeant", "pedago"],
      dit: "Merci pour les idées, on va le faire nous-mêmes.",
      cache: "Il a vu la valeur, il veut l'économiser.",
      accueil: "C'est une bonne idée de s'y mettre, quelle que soit la solution.",
      creuser: "Qui le fera concrètement, et combien de temps par semaine pourra-t-il y consacrer ?",
      repondre: [
        "Le plus dur, ce n'est pas la méthode, c'est la régularité : appeler tout le monde, tous les mois, même ceux qui ne répondent pas.",
        "Si un jour vos équipes sont débordées, je peux prendre une partie des apprenants.",
      ],
      relancer: "Je vous rappelle dans deux mois pour voir comment ça se passe ?",
      eviter: "Donner gratuitement ta méthode détaillée par téléphone.",
      mots: "interne seuls copier faire soi-même" },

    { id: "concurrents", cat: "contrat", bouton: "Vous suivez nos concurrents ?", profils: ["dirigeant"],
      dit: "Vous travaillez aussi pour nos concurrents ?",
      cache: "Peur de fuite d'informations ou de débauchage d'apprenants.",
      accueil: "Question légitime.",
      creuser: "Qu'est-ce qui vous inquiéterait précisément ?",
      repondre: [
        "Chaque organisme ne voit que ses propres apprenants, c'est cloisonné dans la base. Et le contrat m'impose la confidentialité, pendant et cinq ans après la fin.",
        "Je n'utilise jamais vos données pour autre chose que votre suivi.",
      ],
      relancer: "Vous voulez qu'on regarde ensemble l'article confidentialité ?",
      mots: "confidentialité concurrence exclusivité" },

    { id: "plateforme_compliquee", cat: "contrat", bouton: "Encore un outil à apprendre", profils: ["pedago", "dirigeant"],
      dit: "On n'a pas le temps d'apprendre un nouvel outil.",
      cache: "Saturation d'outils.",
      accueil: "Je comprends, vous en avez déjà beaucoup.",
      creuser: "Qu'est-ce que vous aimeriez voir d'un coup d'œil, sans chercher ?",
      repondre: [
        "Vous n'avez rien à faire sur la plateforme : c'est moi qui la remplis. Vous vous connectez quand vous voulez pour voir vos apprenants, les comptes rendus et les alertes. Elle s'installe aussi sur téléphone.",
      ],
      relancer: "Je vous montre l'espace client en 5 minutes ?",
      mots: "logiciel outil connexion compliqué" },

    // ------------------------------------------------------------ Décision et timing
    { id: "decideur", cat: "decision", bouton: "Pas moi qui décide", profils: ["pedago", "qualite"],
      dit: "Ce n'est pas moi qui décide.",
      cache: "Vrai, ou façon de se dégager.",
      accueil: "Merci de me le dire.",
      creuser: "Qui prend ce genre de décision chez vous ? Et vous, qu'en pensez-vous ?",
      repondre: [
        "Votre avis compte : c'est vous qui connaissez les apprenants. Si le sujet vous parle, on peut présenter la démarche ensemble à la direction.",
      ],
      relancer: "Vous seriez d'accord pour qu'on cale un échange à trois, la semaine prochaine ?",
      eviter: "Le contourner pour appeler directement le décideur : tu perds ton allié.",
      mots: "direction chef supérieur validation" },

    { id: "associe", cat: "decision", bouton: "J'en parle à mon associé", profils: ["dirigeant"],
      dit: "Je dois en parler à mon associé.",
      cache: "Vrai, ou besoin de temps.",
      accueil: "Bien sûr, c'est normal.",
      creuser: "À votre avis, quelle question va-t-il vous poser en premier ?",
      repondre: [
        "Je vous envoie un résumé d'une page : le principe, le prix, le test gratuit. Comme ça vous avez tout en main pour lui en parler.",
      ],
      relancer: "Vous lui en parlez quand ? Je vous rappelle juste après, jeudi ?",
      mots: "cofondateur associé conseil" },

    { id: "reflechir", cat: "decision", bouton: "Je vais réfléchir", profils: ["dirigeant", "pedago", "qualite"],
      dit: "Je vais réfléchir.",
      cache: "Il reste un frein qu'il n'a pas dit.",
      accueil: "Bien sûr, c'est une vraie décision.",
      creuser: "Pour vous aider à réfléchir : qu'est-ce qui vous fait encore hésiter ? Le prix, le fonctionnement, ou le moment ?",
      repondre: [
        "Réponds au frein qu'il nomme, avec le bouton correspondant.",
      ],
      relancer: "On se rappelle quand pour en reparler : mardi ou jeudi ?",
      eviter: "Raccrocher sur « je vais réfléchir » sans date de rappel.",
      mots: "hésitation penser décider" },

    { id: "six_mois", cat: "decision", bouton: "Rappelez dans 6 mois", profils: ["dirigeant", "pedago"],
      dit: "Rappelez-moi dans six mois.",
      cache: "Report poli, ou vrai calendrier.",
      accueil: "Avec plaisir, je le note.",
      creuser: "Qu'est-ce qui aura changé dans six mois ? Une nouvelle session, un audit ?",
      repondre: [
        "Si c'est la rentrée de vos apprenants, l'idéal est de commencer le suivi dès leurs premières semaines : c'est là que tout se joue.",
      ],
      relancer: "Je vous rappelle un mois avant, pour qu'on soit prêts le jour J ?",
      mots: "plus tard report calendrier" },

    { id: "moment", cat: "decision", bouton: "Pas le bon moment", profils: ["dirigeant", "pedago", "qualite"],
      dit: "Ce n'est pas le moment, on est en pleine rentrée.",
      cache: "Débordé : c'est souvent justement le moment.",
      accueil: "Je comprends, la rentrée c'est intense.",
      creuser: "Pendant cette période, qui a le temps d'appeler les apprenants qui démarrent doucement ?",
      repondre: [
        "Justement, je peux vous soulager maintenant : je prends le suivi des nouveaux apprenants sans que vous ayez rien à gérer, à part m'envoyer la liste.",
      ],
      relancer: "On démarre le test gratuit avec quelques apprenants, sans mobiliser votre équipe ?",
      mots: "rentrée période chargée débordé" },

    { id: "rappelle", cat: "decision", bouton: "Je vous rappelle", profils: ["dirigeant", "pedago", "qualite"],
      dit: "C'est noté, je vous rappelle.",
      cache: "Il ne rappellera probablement pas.",
      accueil: "Avec plaisir.",
      creuser: "Pour être sûre de ne pas vous manquer, vous êtes plus disponible en début ou en fin de semaine ?",
      repondre: [
        "Je sais que vos journées sont chargées, je vous propose de garder la main sur l'agenda : je vous rappelle moi-même.",
      ],
      relancer: "Mardi à 10 h ou jeudi à 16 h ?",
      eviter: "Laisser la prochaine étape entre ses mains.",
      mots: "rappeler recontacter" },
  ];

  // ---------------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------------

  // Devine l'interlocuteur à partir de sa fonction (fiche organisme).
  function profilDepuisFonction(fonction) {
    const f = (fonction || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!f) return "tous";
    if (/qualit|qualiopi|certif|conformit|audit/.test(f)) return "qualite";
    if (/pedago|formateur|tuteur|coordinat|responsable de formation|responsable des formations|suivi/.test(f)) return "pedago";
    if (/fondat|dirig|direct|gerant|president|ceo|pdg|dg\b|co-?fond|associe|admin/.test(f)) return "dirigeant";
    return "tous";
  }

  // « Responsable Qualiopi » → « responsable Qualiopi » (garde les noms propres).
  const minuscule = (t) => t.charAt(0).toLowerCase() + t.slice(1);

  const normaliser = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function remplir(texte, contexte) {
    return (texte || "")
      .replaceAll("{contact}", (contexte && contexte.contact) || "Madame X")
      .replaceAll("{organisme}", (contexte && contexte.organisme) || "votre organisme");
  }

  // Texte complet d'une réponse (écouter / copier).
  function texteReponse(o, profil, contexte) {
    const r = (t) => remplir(t, contexte);
    const lignes = [
      `Objection : ${r(o.dit)}`,
      `1. Accueillir : ${r(o.accueil || "Je comprends tout à fait.")}`,
      `2. Creuser : ${r(o.creuser)}`,
      `3. Répondre : ${o.repondre.map(r).join(" ")}`,
    ];
    if (o.angles && o.angles[profil]) lignes.push(`Pour ${PROFILS[profil]} : ${r(o.angles[profil])}`);
    lignes.push(`4. Relancer : ${r(o.relancer)}`);
    return lignes.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Panneau « un bouton par thème »
  //   options : { h, contact, organisme, fonction, titre }
  // ---------------------------------------------------------------------------
  function panneau(options) {
    const h = options.h;
    const contexte = { contact: options.contact || "", organisme: options.organisme || "" };
    let profil = profilDepuisFonction(options.fonction);

    // --- Lecture à voix haute (voix du navigateur, rien n'est envoyé ailleurs) ---
    const voixDispo = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    function arreterLecture() { if (voixDispo) window.speechSynthesis.cancel(); }
    function lire(texte, bouton) {
      if (!voixDispo) return;
      if (window.speechSynthesis.speaking) { arreterLecture(); bouton.textContent = "🔊 Écouter"; return; }
      const phrase = new SpeechSynthesisUtterance(texte);
      phrase.lang = "fr-FR";
      const voix = window.speechSynthesis.getVoices().find((v) => /^fr/i.test(v.lang));
      if (voix) phrase.voice = voix;
      phrase.rate = 0.95;
      phrase.onend = () => { bouton.textContent = "🔊 Écouter"; };
      bouton.textContent = "⏹ Arrêter";
      window.speechSynthesis.speak(phrase);
    }
    window.addEventListener("hashchange", arreterLecture);

    // --- Fenêtre de réponse ---
    const dialogue = h("dialog", { class: "obj-dialogue", "aria-labelledby": "obj-dialogue-titre" });
    dialogue.addEventListener("close", arreterLecture);
    // Clic sur le voile (en dehors de la carte) = fermer.
    dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });

    function ouvrir(o) {
      arreterLecture();
      const r = (t) => remplir(t, contexte);
      const etape = (num, titre, contenu) =>
        h("div", { class: "obj-etape" },
          h("p", { class: "obj-etape-titre" }, h("span", { class: "obj-num" }, String(num)), titre),
          contenu);
      const dire = (t) => h("blockquote", { class: "sv-dire" }, `« ${r(t)} »`);

      const angle = o.angles && o.angles[profil] ? o.angles[profil] : null;
      const ecouter = voixDispo ? h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "🔊 Écouter") : null;
      if (ecouter) ecouter.addEventListener("click", () => lire(texteReponse(o, profil, contexte), ecouter));
      const copier = navigator.clipboard ? h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "📋 Copier") : null;
      if (copier) copier.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(texteReponse(o, profil, contexte)); copier.textContent = "✓ Copié"; }
        catch (_) { copier.textContent = "Copie impossible"; }
        setTimeout(() => { copier.textContent = "📋 Copier"; }, 1800);
      });
      const fermer = h("button", { type: "button", class: "obj-fermer", "aria-label": "Fermer" }, "✕");
      fermer.addEventListener("click", () => dialogue.close());

      dialogue.replaceChildren(
        h("div", { class: "obj-carte" },
          h("div", { class: "obj-carte-haut" },
            h("p", { class: "surtitre" }, (CATEGORIES.find((c) => c.cle === o.cat) || {}).titre || "Objection"),
            fermer),
          h("h2", { id: "obj-dialogue-titre", class: "obj-dit" }, `« ${r(o.dit)} »`),
          o.cache ? h("p", { class: "sv-conseil" }, `Ce que ça cache souvent : ${o.cache}`) : null,
          etape(1, "Accueillir", dire(o.accueil || "Je comprends tout à fait.")),
          etape(2, "Creuser, puis te taire", dire(o.creuser)),
          etape(3, "Répondre au vrai frein", o.repondre.map(dire)),
          angle ? h("div", { class: "obj-angle" }, h("strong", {}, `Avec ${minuscule(PROFILS[profil])} : `), r(angle)) : null,
          etape(4, "Relancer vers une date", dire(o.relancer)),
          o.eviter ? h("p", { class: "obj-eviter" }, h("strong", {}, "À éviter : "), o.eviter) : null,
          h("div", { class: "actions-ligne" }, ecouter, copier)));
      if (typeof dialogue.showModal === "function") dialogue.showModal();
      else dialogue.setAttribute("open", "");
      fermer.focus();
    }

    // --- Boutons ---
    const boutonObjection = (o, vedette) => {
      const b = h("button", { type: "button", class: `obj-bouton${vedette ? " obj-bouton-vedette" : ""}`, "data-objection": o.id }, o.bouton);
      b.addEventListener("click", () => ouvrir(o));
      return b;
    };

    const zoneProfil = h("div", { class: "obj-profils", role: "group", "aria-label": "Je parle à" });
    const zoneAngle = h("div", {});
    const zoneFrequentes = h("section", { class: "obj-groupe obj-frequentes" });
    const recherche = h("input", { type: "search", class: "obj-recherche", placeholder: "Chercher : prix, RGPD, formateurs…", "aria-label": "Chercher une objection" });
    const aucune = h("p", { class: "aide", hidden: true }, "Aucune objection trouvée. Note-la dans les échanges : elle pourra être ajoutée.");

    const groupes = CATEGORIES.map((c) => {
      const liste = OBJECTIONS.filter((o) => o.cat === c.cle);
      const boutons = liste.map((o) => boutonObjection(o, false));
      const section = h("section", { class: "obj-groupe" },
        h("h3", { class: "obj-groupe-titre" }, c.titre),
        h("div", { class: "obj-grille" }, boutons));
      return { section, liste, boutons };
    });

    function dessinerProfil() {
      zoneProfil.replaceChildren(
        h("span", { class: "obj-profils-libelle" }, "Je parle à :"),
        ...Object.entries(PROFILS).map(([cle, libelle]) => {
          const b = h("button", { type: "button", class: "filtre", "aria-pressed": String(cle === profil) }, libelle);
          b.addEventListener("click", () => { profil = cle; dessinerProfil(); });
          return b;
        }));
      const a = ANGLES[profil];
      zoneAngle.replaceChildren(a && a.compte
        ? h("details", { class: "sv-partie obj-angle-profil" },
            h("summary", {}, h("span", {}, `Ce qui compte pour ${minuscule(PROFILS[profil])}`)),
            h("div", { class: "sv-corps" },
              h("p", {}, h("strong", {}, "Ses priorités : "), a.compte),
              h("blockquote", { class: "sv-dire" }, `« ${a.cle} »`),
              h("p", { class: "sv-conseil" }, `Ses mots : ${a.mots}`)))
        : "");
      const top = (a && a.top) || [];
      zoneFrequentes.replaceChildren(
        h("h3", { class: "obj-groupe-titre" }, profil === "tous" ? "⭐ Les plus fréquentes" : `⭐ Les plus fréquentes · ${PROFILS[profil]}`),
        h("div", { class: "obj-grille" }, top.map((id) => OBJECTIONS.find((o) => o.id === id)).filter(Boolean).map((o) => boutonObjection(o, true))));
    }

    function filtrer() {
      const q = normaliser(recherche.value.trim());
      zoneFrequentes.hidden = !!q;
      let total = 0;
      for (const g of groupes) {
        let visibles = 0;
        g.liste.forEach((o, i) => {
          const texte = normaliser([o.bouton, o.dit, o.mots, o.cache].join(" "));
          const ok = !q || q.split(/\s+/).every((m) => texte.includes(m));
          g.boutons[i].hidden = !ok;
          if (ok) visibles++;
        });
        g.section.hidden = visibles === 0;
        total += visibles;
      }
      aucune.hidden = total > 0;
    }
    recherche.addEventListener("input", filtrer);

    dessinerProfil();

    return h("div", { class: "obj-panneau pile" },
      h("div", { class: "section-titre" }, h("h2", {}, options.titre || "Traitement d'objection")),
      h("p", { class: "aide" }, `Un bouton = une objection. Clique : la réponse s'ouvre, en 4 temps. ${OBJECTIONS.length} objections.`),
      h("details", { class: "sv-partie" },
        h("summary", {}, h("span", {}, "La méthode en 4 temps (pour toutes les objections)")),
        h("div", { class: "sv-corps" }, h("ol", { class: "sv-liste" }, METHODE.map((t) => h("li", {}, t))))),
      zoneProfil,
      zoneAngle,
      recherche,
      zoneFrequentes,
      groupes.map((g) => g.section),
      aucune,
      dialogue);
  }

  window.FilRougeObjections = { panneau, OBJECTIONS, CATEGORIES, PROFILS, profilDepuisFonction };
})();
