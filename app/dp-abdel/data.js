/* =====================================================================
 * CRM Abdel — données de référence
 * Sites de prospection, cibles, communes, scripts et objections.
 * Niveaux d'intégration (affichés honnêtement dans l'interface) :
 *   connecteur : interrogé directement depuis le CRM
 *   claude     : Claude peut l'interroger pour toi dans le projet Abdel
 *   lien       : simple lien, saisie ou import manuel
 *   payant     : service payant pour le prestataire
 * ===================================================================== */
(function (root) {
  'use strict';

  const SITE_CATEGORIES = [
    { id: 'A', label: 'Marchés publics et appels d\'offres' },
    { id: 'B', label: 'Annuaires d\'entreprises et recherche de prospects' },
    { id: 'C', label: 'Mise en relation, réseaux et sous-traitance' },
    { id: 'D', label: 'Signaux : ouvertures, chantiers, recrutements' },
  ];

  const SITES = [
    // A. Marchés publics
    { cat: 'A', name: 'BOAMP', url: 'https://www.boamp.fr', act: 'SN', auto: 'connecteur',
      info: 'Avis de marchés publics de l\'État et des collectivités, MAPA, résultats.',
      use: 'Source n°1 des appels d\'offres en Gironde. Branché au CRM : bouton « Lancer la veille BOAMP » dans Appels d\'offres (avis gardiennage, surveillance, nettoyage du département 33).' },
    { cat: 'A', name: 'Bordeaux Métropole — BM Achats publics', url: 'https://marchespublics.bordeaux-metropole.fr', act: 'SN', auto: 'lien',
      info: 'Profil d\'acheteur de Bordeaux Métropole et des villes mutualisées : consultations, dossiers (DCE), dépôt des offres.',
      use: 'Indispensable pour ta zone : c\'est ici que tu télécharges les dossiers et déposes les réponses de la Métropole.' },
    { cat: 'A', name: 'PLACE (marchés de l\'État)', url: 'https://www.marches-publics.gouv.fr', act: 'SN', auto: 'lien',
      info: 'Plateforme des achats de l\'État : ministères, préfectures, plateforme régionale des achats de Nouvelle-Aquitaine.',
      use: 'Marchés de gardiennage et de nettoyage des services de l\'État en Gironde.' },
    { cat: 'A', name: 'AWS-Achat (marches-publics.info)', url: 'https://www.marches-publics.info', act: 'SN', auto: 'lien',
      info: 'Plateforme de dématérialisation utilisée par de nombreuses communes et établissements publics.',
      use: 'Retrait des dossiers pour beaucoup de petites communes et d\'établissements de la métropole.' },
    { cat: 'A', name: 'Marchés Online', url: 'https://www.marchesonline.com', act: 'SN', auto: 'lien',
      info: 'Agrégateur d\'avis de marchés, filtrable par région et département. Alertes avancées payantes.',
      use: 'Recherche gratuite par mots-clés « gardiennage », « surveillance », « nettoyage » + Gironde.' },
    { cat: 'A', name: 'TED (Europe)', url: 'https://ted.europa.eu', act: 'SN', auto: 'lien',
      info: 'Journal officiel européen : marchés au-dessus des seuils européens.',
      use: 'Gros marchés pluriannuels de gardiennage (hôpitaux, universités, grandes collectivités).' },
    { cat: 'A', name: 'achatpublic.com', url: 'https://www.achatpublic.com', act: 'SN', auto: 'lien',
      info: 'Agrégateur et plateforme de dématérialisation.', use: 'Complément de veille, utile pour les acheteurs hospitaliers et les bailleurs sociaux.' },
    { cat: 'A', name: 'Maximilien', url: 'https://marches.maximilien.fr', act: 'SN', auto: 'lien',
      info: 'Plateforme des acheteurs publics d\'Île-de-France.', use: 'Hors zone : utile seulement si Abdel vise un jour l\'Île-de-France.' },

    // B. Annuaires
    { cat: 'B', name: 'Annuaire des Entreprises (État) — branché au CRM', url: 'https://annuaire-entreprises.data.gouv.fr', act: 'SN', auto: 'connecteur',
      info: 'Données officielles gratuites : établissements, effectifs, activité (NAF), dirigeants, opposition à la prospection.',
      use: 'Utilisé par « Recherche de prospects » (par commune, rayon, secteur, taille) et par « Compléter depuis le registre » dans chaque fiche.' },
    { cat: 'B', name: 'Google Maps', url: 'https://www.google.com/maps', act: 'SN', auto: 'lien',
      info: 'Établissements, téléphones, horaires, photos des sites.', use: 'Repérer entrepôts, zones d\'activités, parkings ; voir la taille réelle d\'un site.' },
    { cat: 'B', name: 'PagesJaunes', url: 'https://www.pagesjaunes.fr', act: 'SN', auto: 'lien',
      info: 'Téléphones et adresses des professionnels.', use: 'Numéro du standard pour les appels.' },
    { cat: 'B', name: 'Pappers', url: 'https://www.pappers.fr', act: 'SN', auto: 'lien',
      info: 'Dirigeants, comptes annuels, chiffre d\'affaires, établissements.', use: 'Estimer la taille et la solidité d\'un prospect avant l\'appel.' },
    { cat: 'B', name: 'Société.com', url: 'https://www.societe.com', act: 'SN', auto: 'lien',
      info: 'Fiches légales, dirigeants, chiffres clés.', use: 'Alternative à Pappers.' },
    { cat: 'B', name: 'Kompass', url: 'https://fr.kompass.com', act: 'SN', auto: 'lien',
      info: 'Annuaire B2B par secteur d\'activité ; contacts détaillés payants.', use: 'Lister les industriels et logisticiens d\'un secteur.' },
    { cat: 'B', name: 'LinkedIn', url: 'https://www.linkedin.com', act: 'SN', auto: 'lien',
      info: 'Profils des responsables services généraux, achats, sécurité, sites.', use: 'Trouver le nom du bon décideur avant d\'appeler le standard.' },

    // C. Mise en relation
    { cat: 'C', name: 'Indeed — offres d\'emploi', url: 'https://fr.indeed.com', act: 'SN', auto: 'claude',
      info: 'Offres « agent de sécurité », « agent de propreté » publiées par les entreprises.',
      use: 'Une entreprise qui recrute ses propres agents a un besoin réel : proposez-lui d\'externaliser.' },
    { cat: 'C', name: 'France Travail — offres', url: 'https://www.francetravail.fr', act: 'SN', auto: 'lien',
      info: 'Offres d\'emploi publiées par les employeurs locaux.', use: 'Même signal qu\'Indeed, souvent des PME locales.' },
    { cat: 'C', name: 'CCI Bordeaux Gironde', url: 'https://www.bordeauxgironde.cci.fr', act: 'SN', auto: 'lien',
      info: 'Événements, réseaux d\'entreprises, clubs de zones d\'activités.', use: 'Rencontrer des dirigeants en direct ; se faire recommander.' },
    { cat: 'C', name: 'Hellopro', url: 'https://www.hellopro.fr', act: 'SN', auto: 'payant',
      info: 'Place de marché B2B : demandes de devis d\'acheteurs professionnels.', use: 'Leads payants pour le prestataire : à tester seulement si un budget est validé.' },
    { cat: 'C', name: 'Companeo', url: 'https://www.companeo.com', act: 'SN', auto: 'payant',
      info: 'Demandes de devis d\'entreprises (nettoyage, gardiennage), revendues aux prestataires.', use: 'Payant : utile pour connaître les prix du marché via ses guides gratuits.' },

    // D. Signaux
    { cat: 'D', name: 'BODACC', url: 'https://www.bodacc.fr', act: 'SN', auto: 'lien',
      info: 'Annonces légales : créations, ouvertures d\'établissements, transferts, reprises.', use: 'Repérer les nouvelles implantations en Gironde : un nouveau site a besoin d\'un prestataire.' },
    { cat: 'D', name: 'Bordeaux Euratlantique', url: 'https://www.bordeaux-euratlantique.fr', act: 'SN', auto: 'lien',
      info: 'Grand projet urbain : chantiers, nouveaux bureaux et commerces.', use: 'Chantiers à sécuriser, puis bureaux neufs à nettoyer.' },
    { cat: 'D', name: 'Alertes Google', url: 'https://www.google.com/alerts', act: 'SN', auto: 'lien',
      info: 'Alerte e-mail sur des mots-clés.', use: 'Créer : « ouverture entrepôt Gironde », « nouvelle plateforme logistique Bordeaux », « chantier Mérignac ».' },
    { cat: 'D', name: 'Bordeaux Métropole — projets et aménagement', url: 'https://www.bordeaux-metropole.fr', act: 'SN', auto: 'lien',
      info: 'Projets urbains, zones d\'activités, équipements publics.', use: 'Anticiper les chantiers et les ouvertures de zones d\'activités.' },
  ];

  const AUTO_LABEL = {
    connecteur: 'Branché au CRM',
    claude: 'Lien direct (Claude peut faire la recherche pour toi)',
    lien: 'Lien direct, saisie manuelle',
    payant: 'Payant',
  };

  /* Cibles de recherche. q = mots-clés envoyés à Google Maps / PagesJaunes. */
  const SEGMENTS = [
    { id: 'logistique', act: 'secu', l: 'Entreprises de logistique', q: 'entreprise logistique', hot: true, api: { naf: ['52.10A','52.10B','52.29A','52.29B','49.41A','49.41B','53.20Z'] } },
    { id: 'entrepots', act: 'secu', l: 'Entrepôts', q: 'entrepôt', hot: true, api: { naf: ['52.10A','52.10B'] } },
    { id: 'plateformes', act: 'secu', l: 'Plateformes de distribution', q: 'plateforme logistique', hot: true, api: { naf: ['52.10B','52.29A','46.90Z','46.39B','46.73A'] } },
    { id: 'zi', act: 'secu', l: 'Zones industrielles', q: 'zone industrielle', hot: true, api: { section: 'C' } },
    { id: 'cc', act: 'secu', l: 'Centres commerciaux', q: 'centre commercial', hot: true, api: { q: 'centre commercial', naf: ['68.20B'] } },
    { id: 'gms', act: 'secu', l: 'Grandes surfaces', q: 'hypermarché', hot: true, api: { naf: ['47.11D','47.11F'] } },
    { id: 'hotels', act: 'both', l: 'Hôtels', q: 'hôtel', api: { naf: ['55.10Z'] } },
    { id: 'residences', act: 'secu', l: 'Résidences à surveiller', q: 'résidence services', api: { naf: ['87.30A','55.90Z'] } },
    { id: 'promoteurs', act: 'secu', l: 'Promoteurs immobiliers', q: 'promoteur immobilier', hot: true, api: { naf: ['41.10A','41.10B','41.10C','41.10D'] } },
    { id: 'btp', act: 'both', l: 'Entreprises du BTP', q: 'entreprise de construction', hot: true, api: { naf: ['41.20A','41.20B','43.99C','42.11Z','43.12A'] } },
    { id: 'chantiers', act: 'secu', l: 'Chantiers', q: 'chantier construction', hot: true, api: { naf: ['41.20A','41.20B','43.99C','43.12A','42.11Z'] } },
    { id: 'evenementiel', act: 'secu', l: 'Organisateurs d\'événements', q: 'organisateur événementiel', api: { naf: ['82.30Z','90.04Z','93.29Z'] } },
    { id: 'parkings', act: 'secu', l: 'Gestionnaires de parkings', q: 'parking', hot: true, api: { naf: ['52.21Z'] } },
    { id: 'industrie', act: 'both', l: 'Sites industriels', q: 'usine', hot: true, api: { section: 'C' } },
    { id: 'sante', act: 'secu', l: 'Santé et médico-social', q: 'clinique EHPAD', api: { naf: ['86.10Z','87.10A','87.10B'] } },
    { id: 'public', act: 'secu', l: 'Collectivités et établissements publics', q: 'mairie', api: { naf: ['84.11Z','84.12Z','84.13Z'] } },
    { id: 'bureaux', act: 'net', l: 'Entreprises avec bureaux', q: 'centre d\'affaires bureaux', api: { naf: ['70.10Z','69.20Z','69.10Z','62.02A','66.22Z','71.12B'] } },
    { id: 'syndics', act: 'net', l: 'Syndics', q: 'syndic de copropriété', hot: true, api: { naf: ['68.32A'] } },
    { id: 'coproprietes', act: 'net', l: 'Copropriétés', q: 'copropriété', api: { naf: ['68.32A','81.10Z'] } },
    { id: 'gestionnaires', act: 'net', l: 'Gestionnaires immobiliers', q: 'administrateur de biens', hot: true, api: { naf: ['68.31Z','68.32A'] } },
    { id: 'commerces', act: 'net', l: 'Commerces', q: 'magasin', api: { naf: ['47.71Z','47.19B','47.11B','47.11C','47.59B'] } },
  ];

  const COMMUNES = [
    ['Ambarès-et-Lagrave', '33440', 44.9256, -0.4861], ['Ambès', '33810', 45.0111, -0.5317], ['Artigues-près-Bordeaux', '33370', 44.8661, -0.4936], ['Bassens', '33530', 44.9022, -0.5167],
    ['Bègles', '33130', 44.8086, -0.5478], ['Blanquefort', '33290', 44.9106, -0.6364], ['Bordeaux', '33000', 44.8378, -0.5792], ['Bouliac', '33270', 44.8172, -0.5017], ['Bruges', '33520', 44.8836, -0.6106],
    ['Carbon-Blanc', '33560', 44.8956, -0.505], ['Cenon', '33150', 44.8578, -0.5317], ['Eysines', '33320', 44.8836, -0.6503], ['Floirac', '33270', 44.8372, -0.5281], ['Gradignan', '33170', 44.7725, -0.6156],
    ['Le Bouscat', '33110', 44.8653, -0.5986], ['Le Haillan', '33185', 44.8725, -0.6789], ['Le Taillan-Médoc', '33320', 44.9053, -0.6703], ['Lormont', '33310', 44.8792, -0.5217],
    ['Martignas-sur-Jalle', '33127', 44.8411, -0.7764], ['Mérignac', '33700', 44.8386, -0.6436], ['Parempuyre', '33290', 44.95, -0.5939], ['Pessac', '33600', 44.8067, -0.6311],
    ['Saint-Aubin-de-Médoc', '33160', 44.9114, -0.7247], ['Saint-Louis-de-Montferrand', '33440', 44.9547, -0.5397], ['Saint-Médard-en-Jalles', '33160', 44.8964, -0.7194],
    ['Saint-Vincent-de-Paul', '33440', 44.9533, -0.4681], ['Talence', '33400', 44.8086, -0.5885], ['Villenave-d\'Ornon', '33140', 44.7806, -0.5658],
  ];

  const SOURCES = ['BOAMP / appel d\'offres', 'Annuaire des Entreprises', 'Google Maps', 'PagesJaunes', 'LinkedIn',
    'Indeed / offre d\'emploi', 'BODACC / nouvelle implantation', 'Recommandation', 'Terrain', 'Import', 'Claude (recherche)', 'Autre'];

  const SIZES = ['TPE (< 10)', 'PME (10-249)', 'ETI (250-4999)', 'Grand groupe'];
  const TRANCHES = { '00': '0 salarié', '01': '1 à 2', '02': '3 à 5', '03': '6 à 9', '11': '10 à 19', '12': '20 à 49', '21': '50 à 99',
    '22': '100 à 199', '31': '200 à 249', '32': '250 à 499', '41': '500 à 999', '42': '1 000 à 1 999', '51': '2 000 à 4 999', '52': '5 000 à 9 999', '53': '10 000 et +', 'NN': 'non renseigné' };
  const TAILLES_RECHERCHE = [
    ['', 'Toutes les tailles', []],
    ['10', '10 salariés et plus', ['11', '12', '21', '22', '31', '32', '41', '42', '51', '52', '53']],
    ['50', '50 salariés et plus', ['21', '22', '31', '32', '41', '42', '51', '52', '53']],
    ['250', '250 salariés et plus', ['32', '41', '42', '51', '52', '53']],
  ];
  function sizeFromTranche(t) {
    if (!t || t === 'NN') return '';
    if (['00', '01', '02', '03'].includes(t)) return 'TPE (< 10)';
    if (['11', '12', '21', '22', '31'].includes(t)) return 'PME (10-249)';
    if (['32', '41', '42', '51'].includes(t)) return 'ETI (250-4999)';
    return 'Grand groupe';
  }

  const CALL_RESULTS = ['Pas de réponse', 'Messagerie', 'Barrage du standard', 'Décideur joint', 'À rappeler',
    'Intéressé', 'Rendez-vous pris', 'Devis demandé', 'Pas de besoin', 'Refus'];

  /* ---------- Scripts ---------- */
  // Scripts v2 (14/11/2026). « (Société) » = nom légal de la société de sécurité (Paramètres),
  // « (Entreprise) » = nom de la société de nettoyage (Paramètres). « Émilie » = prénom saisi.
  // Règles communes : objectif de l'appel = une visite sur place ; jamais de délai, de nombre
  // d'agents, de référence client ni de garantie sans l'accord d'Abdel ; nettoyage jamais sous
  // 24 € HT/h (produits fournis par le client) ou 27 € HT/h (produits fournis par nous).
  const SCRIPTS = {
    secu: [
      { t: '0. Avant de décrocher (30 secondes)', x: "• Relis le signal de la fiche : offre d'emploi, chantier, appel d'offres, événement, ouverture. C'est ton accroche.\n• Ton seul objectif : obtenir une visite du site de 30 minutes. Pas de vente, pas de prix au téléphone.\n• Prépare deux créneaux précis à proposer (ex. mardi 17 h, jeudi 9 h).\n• Meilleurs moments : 8 h 30 – 10 h et 16 h 30 – 18 h. Évite le lundi matin et le vendredi après-midi.\n• Debout, sourire, débit lent. Tu appelles pour aider, pas pour déranger." },
      { t: '1. Le standard', x: "« Bonjour, Émilie de (Société). Qui s'occupe de la sécurité du site chez vous : le directeur de site, les services généraux ou la direction ? »\n\nOn te donne un nom : « Merci. Vous pouvez me le passer, s'il vous plaît ? »\n\nChantier : demande le conducteur de travaux. Événement : l'organisateur ou le responsable logistique. Entrepôt : le responsable d'exploitation. Syndic : le gestionnaire de la résidence." },
      { t: '1 bis. Passer les barrages du standard', x: "« C'est à quel sujet ? »\n→ « C'est au sujet de la surveillance du site, notamment la nuit et le week-end. Je voudrais simplement parler à la bonne personne. »\n\n« Envoyez un mail à contact@… »\n→ « Avec plaisir. Pour qu'il arrive à la bonne personne, c'est à l'attention de qui ? » (note le nom, puis rappelle en le demandant directement)\n\n« Il n'est pas disponible. »\n→ « Pas de souci. À quel moment j'ai le plus de chances de le joindre ? Plutôt tôt le matin ou en fin de journée ? » Note la date de relance.\n\n« On n'est pas intéressés. »\n→ « Je comprends. Je ne veux pas vous faire perdre de temps : qui chez vous s'occupe de la sécurité, pour que je ne rappelle pas la mauvaise personne ? »" },
      { t: "2. Accroche — l'entreprise recrute un agent de sécurité (la plus efficace)", x: "« Bonjour M. (nom), Émilie de (Société), société de sécurité privée autorisée par le CNAPS, sur Bordeaux Métropole. J'ai vu que vous recrutez un agent de sécurité. Avant que vous engagiez un recrutement, je voulais vous poser une question : vous avez envisagé de confier le poste à une société ? Vous n'avez plus à gérer les absences, les congés ni les cartes professionnelles. Vous avez deux minutes ? »" },
      { t: '2 bis. Autres accroches (selon le signal de la fiche)', x: "Chantier : « J'appelle au sujet de votre chantier de (adresse). Sur les chantiers de la métropole, le problème numéro un, c'est le vol de matériel et de câbles la nuit. Comment vous êtes organisé sur ce site aujourd'hui ? »\n\nNouvelle implantation : « J'ai vu que vous ouvrez (site) à (ville). Bravo. Les premières semaines, c'est souvent là que le site est le plus exposé : la surveillance, c'est déjà calé ou c'est encore ouvert ? »\n\nAppel d'offres : « Nous préparons notre réponse à votre consultation pour (objet). J'ai une question pour vous répondre au plus juste : … » (si le règlement l'exige, poser la question par écrit sur le profil d'acheteur).\n\nÉvénement : « J'ai vu que vous organisez (événement) le (date). Le contrôle d'accès et la surveillance, c'est déjà calé, ou c'est encore ouvert ? »\n\nRenfort (ils ont déjà une société) : « Je ne vous appelle pas pour remplacer votre prestataire. Je voulais savoir : le jour où un agent ne vient pas ou qu'il vous faut un renfort pour un événement, vous faites comment ? »\n\nÀ froid : « Je ne sais pas si vous avez un besoin, alors une seule question : la nuit et le week-end, votre site est surveillé comment aujourd'hui ? »" },
      { t: '3. Découverte — il parle, tu notes', x: "1. « Aujourd'hui, la sécurité du site, c'est géré comment : en interne, une société, une alarme seule ? »\n2. « Vous avez déjà eu des incidents : vol, intrusion, dégradation, squat ? C'était quand ? »\n3. « Sur quels horaires vous vous sentez le plus exposé : la nuit, le week-end, à l'ouverture ? »\n4. « Quand l'alarme se déclenche la nuit, qui se déplace ? » (question clé : souvent, c'est le dirigeant lui-même)\n5. « Votre assureur vous demande-t-il quelque chose de particulier ? »\n6. « Si vous avez un prestataire : sur 10, vous lui mettez combien ? Qu'est-ce qui manque pour un 10 ? »\n7. « Le contrat actuel court jusqu'à quand ? »\n8. « Qui d'autre que vous participe à la décision ? »\n\nReformule avec ses mots : « Si je résume, c'est vous qui vous levez la nuit quand l'alarme sonne, et vous avez eu deux intrusions cette année. C'est ça ? »\nSon « oui » est ton feu vert pour présenter." },
      { t: "4. Présenter — seulement après l'avoir écouté", x: "« Ce que vous me décrivez, c'est exactement ce qu'on prend en charge. On étudie le site, on vous propose le bon dispositif — rondes, gardiennage de nuit ou intervention sur alarme selon les cas — avec des agents titulaires de leur carte professionnelle. Vous avez un interlocuteur unique, et vous n'avez plus à vous lever la nuit. »\n\nReprends toujours SON problème (ses mots, son incident, ses horaires), pas une liste de services.\nNe cite jamais un délai d'intervention, un nombre d'agents ou un client sans l'accord d'Abdel. Jamais de prix au téléphone : devis après visite." },
      { t: '5. Conclure — toujours deux créneaux', x: "Il recrute : « Je vous propose une chose simple : on vous fait une proposition chiffrée pour le même poste. Vous comparez avec le coût d'un salarié, charges, congés et remplacements compris, et vous décidez. On en parle 20 minutes sur place cette semaine ? »\n\nVisite classique : « Le plus utile, c'est qu'on vienne faire un tour du site 30 minutes : accès, clôtures, éclairage, points sensibles. Mardi 17 h ou jeudi 9 h, qu'est-ce qui vous arrange ? »\n\nIl est déjà équipé : « Je vous propose d'être votre solution de renfort : un événement, un agent absent. Je vous envoie notre autorisation CNAPS et notre attestation d'assurance ? »\n\nIl hésite : « Qu'est-ce qui vous retient ? » Puis tais-toi et écoute : c'est une objection, va la traiter." },
      { t: '6. Verrouiller le rendez-vous', x: "« Parfait. Je note jeudi 9 h. Pour que la visite soit utile :\n• l'adresse exacte du site, c'est bien … ?\n• qui sera présent de votre côté ?\n• il y a des consignes d'accès (badge, portail, accueil) ?\n• je peux vous envoyer la confirmation à quelle adresse e-mail ? »\n\n« Je vous envoie la confirmation tout de suite. À jeudi ! »\nDans le CRM : résultat « Rendez-vous pris », date du RDV, puis e-mail de suivi « Confirmation de rendez-vous »." },
      { t: 'Messagerie — message vocal (20 secondes)', x: "« Bonjour M. (nom), Émilie de (Société), sécurité privée sur Bordeaux Métropole. Je vous appelle au sujet de (votre recrutement d'agent de sécurité / votre chantier de … / la surveillance de votre site la nuit). J'ai une idée simple à vous proposer. Vous pouvez me joindre au (téléphone). Sinon, je vous rappelle (jour) en fin de matinée. Bonne journée. »\n\nUn seul message. Ensuite, rappelle sans laisser de message, à un autre moment de la journée." },
      { t: 'Après chaque appel', x: "1. Note le résultat tout de suite (une touche) et une date de relance précise.\n2. Écris l'objection entendue mot pour mot : c'est ce qui fait progresser le script.\n3. S'il a dit oui à quelque chose (plaquette, documents, visite) : envoie l'e-mail de suivi dans l'heure.\n4. Rythme conseillé : 3 essais d'appel sur des moments différents, puis un e-mail, puis une relance à 1 mois." },
    ],
    net: [
      { t: '0. Avant de décrocher (30 secondes)', x: "• Relis le signal de la fiche : offre d'emploi d'agent d'entretien, nouveaux locaux, déménagement, avis clients sur la propreté.\n• Ton seul objectif : une visite de 15 minutes pour voir les locaux et faire un devis juste.\n• Prépare deux créneaux précis.\n• Meilleurs moments : 9 h – 11 h et 14 h – 16 h 30. Pour les commerces, évite l'ouverture et l'heure du déjeuner." },
      { t: '1. Le standard', x: "« Bonjour, Émilie de (Entreprise). Qui s'occupe de l'entretien des locaux chez vous : les services généraux, l'office manager ou la direction ? »\n\nPetite structure (cabinet, agence, commerce) : demande directement le gérant ou le responsable.\nSyndic : le gestionnaire de la copropriété. Hôtel : la gouvernante générale ou le directeur." },
      { t: '1 bis. Passer les barrages du standard', x: "« C'est à quel sujet ? »\n→ « C'est au sujet de l'entretien de vos locaux. Je voudrais juste parler à la personne qui s'en occupe. »\n\n« Envoyez un mail. »\n→ « Avec plaisir. C'est à l'attention de qui, pour qu'il arrive à la bonne personne ? »\n\n« Elle n'est pas là. »\n→ « Pas de souci. Elle est plutôt joignable le matin ou l'après-midi ? »\n\n« On a déjà quelqu'un. »\n→ « Très bien, je ne cherche pas à bousculer ça. Qui gère le contrat, pour que je ne rappelle pas la mauvaise personne ? »" },
      { t: "2. Accroche — l'entreprise recrute un agent d'entretien (la plus efficace)", x: "« Bonjour M. / Mme (nom), Émilie de (Entreprise), entretien de locaux professionnels sur Bordeaux Métropole. J'ai vu que vous recrutez un agent d'entretien. Avant de lancer le recrutement : vous avez envisagé de confier l'entretien à une société ? Pas de contrat de travail, pas de gestion des absences ni des congés, et vous payez uniquement les heures prévues. Vous avez deux minutes ? »" },
      { t: '2 bis. Autres accroches (selon le signal)', x: "Ils ont un prestataire — la note sur 10 : « Je vais faire court : si vous deviez noter votre prestataire de ménage actuel sur 10, vous lui mettriez combien ? » → s'il dit 7 ou moins : « Qu'est-ce qui manque pour un 10 ? »\n\nNouveaux locaux / déménagement : « J'ai vu que vous vous installez à (adresse). L'entretien des nouveaux locaux, c'est déjà organisé ou c'est encore ouvert ? On peut aussi s'occuper du nettoyage avant l'emménagement. »\n\nSyndic / copropriété : « J'appelle au sujet de l'entretien des parties communes de vos résidences sur la métropole. Vous êtes satisfait du prestataire actuel, ou il y a des résidences où ça coince ? »\n\nÀ froid : « Une seule question : l'entretien de vos locaux, aujourd'hui, c'est géré comment ? En interne, une société, ou un peu chacun ? »" },
      { t: '3. Découverte — les questions du devis', x: "1. « Quel type de locaux : bureaux, commerce, cabinet, entrepôt, parties communes ? »\n2. « Quelle surface environ, et combien de pièces, de sanitaires ? »\n3. « Combien de personnes travaillent ou passent sur place chaque jour ? »\n4. « Vous l'imaginez à quelle fréquence : tous les jours, 2 ou 3 fois par semaine ? »\n5. « Sur quels horaires : tôt le matin, en journée, le soir après la fermeture ? »\n6. « Les produits et consommables (papier, savon, sacs), vous préférez les fournir ou que ce soit nous ? »\n7. « Comment on accède aux locaux : clés, badge, alarme ? »\n8. « Aujourd'hui, qu'est-ce qui ne va pas, ou qu'est-ce qui compte le plus pour vous ? »\n9. « Vous souhaiteriez démarrer quand ? »\n10. « Qui d'autre participe à la décision ? »\n\nReformule : « Si je résume : 200 m² de bureaux, 3 passages par semaine le soir, et ce qui vous agace, ce sont les sanitaires mal faits. C'est ça ? »" },
      { t: '4. Présenter — après l\'avoir écouté', x: "« Ce que vous me décrivez, c'est notre quotidien. On vient voir les locaux, on définit ensemble ce qui est fait à chaque passage, et vous avez un interlocuteur unique qui répond quand il y a un souci. Vous n'avez plus à vérifier derrière. »\n\nReprends SON irritant (sanitaires, poubelles, poussière, oublis) et dis comment la visite permet de le régler.\nNe promets ni remplacement garanti, ni contrôle qualité, ni produits écologiques, ni référence client sans l'accord d'Abdel." },
      { t: '5. Le prix (si on te le demande)', x: "« Le prix dépend surtout du nombre d'heures, et c'est la visite qui permet de le calculer juste. Pour vous donner un ordre d'idée : nous sommes à 24 € HT de l'heure quand vous fournissez les produits, 27 € HT quand c'est nous. Le devis vous dit exactement combien d'heures et ce qui est fait à chaque passage. »\n\nJamais en dessous sans l'accord d'Abdel. Un site éloigné peut avoir un tarif adapté : ne t'engage pas, dis que le devis le précisera." },
      { t: '6. Conclure — toujours deux créneaux', x: "« Le plus simple, c'est que je passe voir les locaux 15 minutes : je vous fais un devis précis sous 48 h, sans engagement. Mardi 10 h ou jeudi 14 h, qu'est-ce qui vous arrange ? »\n\nIl veut un devis sans visite : « Je peux vous faire une estimation, mais elle risque d'être fausse dans un sens ou dans l'autre. 15 minutes sur place, et vous avez un prix exact. Mardi ou jeudi ? »\n\nIl hésite : « Qu'est-ce qui vous retient ? » Puis écoute : c'est une objection." },
      { t: '7. Verrouiller le rendez-vous', x: "« Parfait, je note jeudi 14 h. Pour gagner du temps :\n• l'adresse exacte des locaux, c'est bien … ?\n• qui me reçoit ?\n• un code, un interphone, un parking ?\n• je vous envoie la confirmation à quelle adresse e-mail ? »\n\nDans le CRM : résultat « Rendez-vous pris », date du RDV, surface et fréquence notées dans la fiche, puis e-mail « Confirmation de rendez-vous »." },
      { t: 'Messagerie — message vocal (20 secondes)', x: "« Bonjour M. / Mme (nom), Émilie de (Entreprise), entretien de locaux professionnels sur Bordeaux Métropole. Je vous appelle au sujet de (votre recrutement d'agent d'entretien / l'entretien de vos locaux de …). J'ai une proposition simple à vous faire. Vous pouvez me joindre au (téléphone), sinon je vous rappelle (jour). Bonne journée. »" },
      { t: 'Après chaque appel', x: "1. Note le résultat et une date de relance précise.\n2. Note tout ce que tu as appris pour le devis (surface, fréquence, horaires, produits) dans la fiche : le calculateur s'en sert.\n3. Objection entendue : écris-la mot pour mot.\n4. Il a demandé quelque chose : e-mail de suivi dans l'heure." },
    ],
  };

  // Objections communes (sécurité et nettoyage), affichées après les objections du métier.
  const OBJECTIONS = [
    { o: '« Envoyez-moi une documentation. »', r: "« Avec plaisir. Pour vous envoyer quelque chose d'utile et pas une plaquette de plus : c'est pour quel site, et quel besoin en priorité ? … Je vous l'envoie aujourd'hui. Je vous rappelle jeudi pour en parler 5 minutes, ça vous va ? » Fixe la date de rappel avant de raccrocher." },
    { o: '« Nous n\'avons pas de budget. »', r: "« Je comprends. Justement, la visite est gratuite et sans engagement : vous saurez exactement combien ça coûterait. Et quand se décident les budgets chez vous ? Je vous prépare un chiffrage pour cette date-là. »" },
    { o: '« Nous n\'avons pas de besoin actuellement. »', r: "« D'accord. Votre contrat actuel se termine quand ? … Je note de vous rappeler deux mois avant, pour que vous puissiez comparer tranquillement. Ça vous va ? »" },
    { o: '« Nous travaillons uniquement avec des entreprises référencées. »', r: "« Très bien : quelle est la procédure de référencement, et qui la gère ? Nous préparons le dossier (Kbis, attestation URSSAF, assurances, autorisations). » Note le nom et la procédure dans la fiche." },
    { o: '« Rappelez-nous dans six mois. »', r: "« Je le note. Pour que l'appel soit utile : qu'est-ce qui aura changé dans six mois — fin de contrat, budget, déménagement ? … Je vous rappelle donc le (date précise). »" },
    { o: '« Je n\'ai pas le temps, là. »', r: "« Je comprends, je vous prends 30 secondes ou je vous rappelle ? … Plutôt demain 9 h ou 17 h ? » Ne force jamais : un bon rappel vaut mieux qu'un appel bâclé." },
    { o: '« C\'est combien ? » (dès le début)', r: "« Ça dépend vraiment du site, et je ne veux pas vous dire un prix faux. Pour vous répondre juste, deux questions : … » Puis reprends la découverte. Sécurité : jamais de prix au téléphone. Nettoyage : voir l'étape « Le prix »." },
    { o: '« Comment avez-vous eu mon numéro ? »', r: "« Votre entreprise est inscrite dans les registres publics et j'ai vu (votre annonce / votre ouverture / votre chantier). Si vous préférez que je ne vous rappelle pas, je le note tout de suite. » S'il refuse : coche « Ne plus contacter »." },
    { o: '« Ne m\'appelez plus. »', r: "« Entendu, je vous retire de ma liste dès maintenant. Bonne journée. » Puis coche « Ne plus contacter » sur la fiche. Toujours respecter un refus." },
  ];

  // Objections propres à la sécurité, affichées sur les fiches sécurité avant les objections communes.
  const OBJECTIONS_SECU = [
    { o: '« On a une alarme, ça suffit. »', r: "« C'est une bonne base. Quand elle sonne à 3 h du matin, qui se déplace, et en combien de temps ? … C'est là qu'on intervient : l'alarme prévient, mais quelqu'un doit aller voir. »" },
    { o: '« On a des caméras. »', r: "« Très bien. Les caméras enregistrent ce qui se passe, mais elles ne l'empêchent pas. Quand quelqu'un est sur les images à 2 h du matin, qui intervient ? … La présence d'un agent ou des rondes, c'est ce qui dissuade avant. »" },
    { o: '« On n\'a jamais eu de problème. »', r: "« Tant mieux, et c'est le meilleur moment pour en parler : après un vol, on décide dans l'urgence. Je vous propose juste un tour du site de 30 minutes pour vérifier que rien n'est exposé. »" },
    { o: '« La sécurité, c\'est trop cher. »', r: "« Trop cher par rapport à quoi : votre franchise d'assurance, un arrêt de chantier, le matériel à racheter ? … Souvent, il n'y a pas besoin d'un agent toute la nuit : des rondes à heures variables peuvent suffire. C'est justement ce qu'on regarde pendant la visite. »" },
    { o: '« On va recruter notre propre agent. »', r: "« C'est possible. Vous avez prévu qui le remplace pendant ses congés, ses arrêts, ses week-ends ? Et la vérification de sa carte professionnelle ? On vous fait une proposition pour le même poste, vous comparez le coût total et vous choisissez. »" },
    { o: '« On a déjà une société de sécurité. »', r: "« Très bien. Vous en êtes satisfait à combien sur 10 ? … Et quand un agent ne vient pas, vous l'apprenez comment ? » Si 9 ou 10 : propose d'être la solution de renfort. Si 7 ou moins : « Qu'est-ce qui manque pour un 10 ? » et propose la visite." },
    { o: '« Notre contrat court encore longtemps. »', r: "« Pas de souci. Il se termine quand ? … Je vous propose qu'on se voie trois mois avant : vous aurez une offre en main pour comparer ou négocier. Je note la date. »" },
    { o: '« Vous êtes une petite structure, on préfère une grosse société. »', r: "« Je comprends. La différence, c'est que chez nous vous avez le dirigeant en direct : quand il y a un souci la nuit, vous ne tombez pas sur une plateforme. Le mieux, c'est de vous faire votre avis pendant la visite. » Ne cite aucun client sans l'accord d'Abdel." },
    { o: '« Vous êtes autorisés ? Vous avez des références ? »', r: "C'est un signal d'achat. « Bien sûr, et vous avez raison de demander. Je vous envoie aujourd'hui notre numéro d'autorisation CNAPS, que vous pouvez vérifier en ligne, et notre attestation d'assurance. On en parle ensuite sur place ? » Références clients : seulement avec l'accord d'Abdel." },
    { o: '« Envoyez-moi une plaquette. »', r: "« Avec plaisir. Pour qu'elle vous soit utile : c'est plutôt pour la nuit, le week-end ou un événement ? Et quel type de site ? … Je vous l'envoie aujourd'hui et je vous rappelle jeudi. »" },
    { o: '« C\'est le siège qui décide. »', r: "« D'accord. Vous êtes le mieux placé pour savoir ce qui se passe sur le site. Si on fait le tour ensemble, je vous prépare un document à transmettre au siège. Qui est la bonne personne là-bas ? »" },
    { o: '« Rappelez-moi plus tard. »', r: "« Avec plaisir. Qu'est-ce qui va changer d'ici là : fin de contrat, ouverture, événement ? … Je vous rappelle donc le (date précise). »" },
  ];

  // Objections propres au nettoyage, affichées sur les fiches nettoyage avant les objections communes.
  const OBJECTIONS_NET = [
    { o: '« Nous avons déjà un prestataire. »', r: "« C'est normal, la plupart des entreprises en ont un. Sur 10, vous le noteriez combien ? » … « Qu'est-ce qui lui manquerait pour avoir 10 ? » Si 9 ou 10 : « Je vous propose d'être votre solution de secours le jour où il a un absent. Je vous envoie nos coordonnées ? »" },
    { o: '« Nous sommes satisfaits de notre entreprise actuelle. »', r: "« Tant mieux, c'est rare. Je ne vous demande pas de changer. Juste : le jour où votre prestataire a un absent ou que vous avez un besoin ponctuel (remise en état, vitres, après travaux), vous avez déjà quelqu'un sous la main. Je vous laisse nos coordonnées ? »" },
    { o: '« On le fait nous-mêmes / c\'est une salariée qui le fait. »', r: "« D'accord. Et quand elle est en congé ou malade, qui le fait ? … Avec une société, vous ne gérez ni contrat de travail ni absences, et vous payez seulement les heures prévues. On compare sur place ? »" },
    { o: '« Vos tarifs sont trop élevés. » / « On a moins cher. »', r: "« Par rapport à quoi ? … À combien d'heures et pour quelles tâches ? » Compare à périmètre égal : un prix bas cache souvent moins d'heures ou des tâches oubliées. « Le devis détaille ce qui est fait à chaque passage : vous comparez ligne par ligne. » Jamais sous 24 € HT / 27 € HT de l'heure sans l'accord d'Abdel." },
    { o: '« Envoyez-moi directement un devis. »', r: "« Volontiers. Pour qu'il soit juste et pas approximatif : quelle surface, combien de passages par semaine, et sur quels horaires ? … Le mieux reste 15 minutes sur place : mardi 10 h ou jeudi 14 h ? »" },
    { o: '« On a été déçus des sociétés de ménage. »', r: "« Je comprends, et merci de me le dire. Qu'est-ce qui s'est mal passé ? » Écoute jusqu'au bout. « C'est exactement ce qu'on cale à la visite : ce qui est fait à chaque passage, noir sur blanc, et un interlocuteur joignable. »" },
    { o: '« Nos locaux sont petits, ça ne vaut pas le coup. »', r: "« Au contraire : sur des petits locaux, quelques heures par semaine suffisent souvent. Vous avez combien de m² environ ? … On peut vous faire un devis pour 1 ou 2 passages par semaine. »" },
    { o: '« On a peur de confier nos clés / l\'accès aux locaux. »', r: "« C'est légitime. On définit ensemble qui a les clés ou le badge, sur quels horaires, et vous savez toujours qui intervient chez vous. On en parle pendant la visite pour que vous soyez à l'aise. »" },
    { o: '« Il nous faut des horaires très tôt / le week-end. »', r: "« Noté. Quels horaires exactement ? » Note-les dans la fiche et dis : « Je vérifie avec Abdel la disponibilité sur ces horaires et je vous le confirme avec le devis. » Ne promets pas toi-même." },
    { o: '« Vous utilisez des produits écologiques ? »', r: "« C'est un point qu'on cale avec vous : soit vous fournissez vos produits, soit on les fournit. Vous avez des exigences particulières (labels, allergies) ? » Note-les et fais confirmer par Abdel avant de promettre quoi que ce soit." },
  ];

  const api = { TRANCHES, TAILLES_RECHERCHE, sizeFromTranche, SITE_CATEGORIES, SITES, AUTO_LABEL, SEGMENTS, COMMUNES, SOURCES, SIZES, CALL_RESULTS, SCRIPTS, OBJECTIONS, OBJECTIONS_SECU, OBJECTIONS_NET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RefData = api;
})(typeof window !== 'undefined' ? window : globalThis);
