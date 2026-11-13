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
  const SCRIPTS = {
    // Script sécurité v1 (11/11/2026). « (Société) » est remplacé par le nom légal saisi dans Paramètres.
    secu: [
      { t: '1. Le standard', x: "« Bonjour, Émilie de (Société). Qui s'occupe de la sécurité du site chez vous : le directeur de site, les services généraux, ou la direction ? »\n\nSi on te demande l'objet : « C'est au sujet de la surveillance du site, notamment la nuit et le week-end. Je voudrais simplement parler à la bonne personne. »\n\nChantier : demande le conducteur de travaux. Événement : l'organisateur ou le responsable logistique. Syndic : le gestionnaire de la résidence." },
      { t: "2. Accroche — l'entreprise recrute un agent de sécurité (la plus efficace)", x: "« Bonjour M. (nom), Émilie de (Société), société de sécurité privée autorisée par le CNAPS, sur Bordeaux Métropole. J'ai vu que vous recrutez un agent de sécurité. Avant que vous engagiez un recrutement, je voulais vous poser une question : vous avez envisagé de confier le poste à une société ? Vous n'avez plus à gérer les absences, les congés ni les cartes professionnelles. Vous avez deux minutes ? »" },
      { t: '3. Découverte — il parle, tu notes', x: "1. « Aujourd'hui, la sécurité du site, c'est géré comment : en interne, une société, une alarme seule ? »\n2. « Vous avez déjà eu des incidents : vol, intrusion, dégradation, squat ? C'était quand ? »\n3. « Sur quels horaires vous vous sentez le plus exposé : la nuit, le week-end, à l'ouverture ? »\n4. « Quand l'alarme se déclenche la nuit, qui se déplace ? » (question clé : souvent, c'est le dirigeant lui-même)\n5. « Votre assureur vous demande-t-il quelque chose de particulier ? »\n6. « Si vous avez un prestataire : sur 10, vous lui mettez combien ? Qu'est-ce qui manque pour un 10 ? »\n7. « Le contrat actuel court jusqu'à quand ? »\n8. « Qui d'autre que vous participe à la décision ? »\n\nReformule avec ses mots : « Si je résume, c'est vous qui vous levez la nuit quand l'alarme sonne, et vous avez eu deux intrusions cette année. C'est ça ? »" },
      { t: "4. Présenter — seulement après l'avoir écouté", x: "« Ce que vous me décrivez, c'est exactement ce qu'on prend en charge. On étudie le site, on vous propose le bon dispositif — rondes, gardiennage de nuit ou intervention sur alarme selon les cas — avec des agents titulaires de leur carte professionnelle. Vous avez un interlocuteur unique, et vous n'avez plus à vous lever la nuit. »\n\nNe cite jamais un délai d'intervention ni un nombre d'agents sans l'accord d'Abdel. Jamais de prix au téléphone : devis après visite." },
      { t: '5. Conclure — toujours deux créneaux', x: "Il recrute : « Je vous propose une chose simple : on vous fait une proposition chiffrée pour le même poste. Vous comparez avec le coût d'un salarié, charges, congés et remplacements compris, et vous décidez. On en parle 20 minutes sur place cette semaine ? »\n\nVisite classique : « Le plus utile, c'est qu'on vienne faire un tour du site 30 minutes : accès, clôtures, éclairage, points sensibles. Mardi 17 h ou jeudi 9 h, qu'est-ce qui vous arrange ? »\n\nIl est déjà équipé : « Je vous propose d'être votre solution de renfort : un événement, un agent absent. Je vous envoie notre autorisation CNAPS et notre attestation d'assurance ? »\n\nToujours finir par une date précise, puis « Enregistrer l'appel » avec la date de relance." },
      { t: 'Autres accroches (selon le signal de la fiche)', x: "Chantier : « J'appelle au sujet de votre chantier de (adresse). Sur les chantiers de la métropole, le problème numéro un, c'est le vol de matériel et de câbles la nuit. Comment vous êtes organisé sur ce site aujourd'hui ? »\n\nAppel d'offres : « Nous préparons notre réponse à votre consultation pour (objet). J'ai une question pour vous répondre au plus juste : … » (si le règlement l'exige, poser la question par écrit sur le profil d'acheteur).\n\nÉvénement : « J'ai vu que vous organisez (événement) le (date). Le contrôle d'accès et la surveillance, c'est déjà calé, ou c'est encore ouvert ? »\n\nÀ froid : « Je ne sais pas si vous avez un besoin, alors une seule question : la nuit et le week-end, votre site est surveillé comment aujourd'hui ? »" },
    ],
    net: [
      { t: 'Passer le standard', x: '« Bonjour, Émilie, je cherche la personne qui gère l\'entretien des locaux, c\'est bien M. / Mme … ? »' },
      { t: 'Accroche (la note sur 10)', x: '« Bonjour M. …, Émilie de Abdel, entretien de locaux professionnels. Je vais faire court : si vous deviez noter votre prestataire de ménage actuel sur 10, vous lui mettriez combien ? »' },
      { t: 'Découverte (fiche devis)', x: 'Type de locaux, surface, fréquence, heures souhaitées, horaires, produits fournis par qui, accès, date de démarrage.' },
      { t: 'Proposition de valeur', x: '« Avec nous, vous n\'avez plus à vérifier si le ménage a été fait : remplacement garanti et contrôle qualité. »' },
      { t: 'Conclusion', x: '« Je vous propose une visite de 15 minutes pour voir les surfaces et vous faire un devis juste. Mardi ou jeudi ? »' },
    ],
  };

  const OBJECTIONS = [
    { o: 'Nous avons déjà un prestataire.', r: '« C\'est normal, la plupart de nos clients en avaient un. Sur 10, vous le noteriez combien ? » Puis : « Qu\'est-ce qui lui manquerait pour avoir 10 ? »' },
    { o: 'Nous sommes satisfaits de notre entreprise actuelle.', r: '« Tant mieux. Je vous propose d\'être votre solution de secours : le jour où votre prestataire a un absent ou un besoin ponctuel, vous avez déjà un prestataire référencé. Je vous envoie nos documents ? »' },
    { o: 'Envoyez-nous une documentation.', r: '« Avec plaisir. Pour vous envoyer quelque chose d\'utile et pas une plaquette de plus : combien de sites et quelles plages horaires ? » Puis fixer une date de rappel.' },
    { o: 'Nous n\'avons pas de budget.', r: '« Je comprends. Quand se décident les budgets chez vous ? Je vous prépare un chiffrage pour cette date-là, sans engagement. »' },
    { o: 'Nous n\'avons pas de besoin actuellement.', r: '« D\'accord. Quand se termine votre contrat actuel ? Je note de vous rappeler deux mois avant pour que vous puissiez comparer. »' },
    { o: 'Vos tarifs sont trop élevés.', r: '« Par rapport à quoi ? » Puis comparer à périmètre égal (remplacements, encadrement, réactivité). Ne jamais baisser le tarif sans l\'accord d\'Abdel.' },
    { o: 'Nous travaillons uniquement avec des entreprises référencées.', r: '« Très bien : quelle est la procédure de référencement et qui la gère ? Nous préparons le dossier (Kbis, URSSAF, assurances, autorisations). »' },
    { o: 'Rappelez-nous dans six mois.', r: '« Je le note. Pour que l\'appel soit utile : qu\'est-ce qui aura changé dans six mois ? » Créer la relance datée dans le CRM.' },
  ];

  // Objections propres à la sécurité, affichées sur les fiches sécurité avant les objections générales.
  const OBJECTIONS_SECU = [
    { o: '« On a une alarme, ça suffit. »', r: "« C'est une bonne base. Quand elle sonne à 3 h du matin, qui se déplace, et en combien de temps ? … C'est là qu'on intervient : l'alarme prévient, mais quelqu'un doit aller voir. »" },
    { o: '« On n\'a jamais eu de problème. »', r: "« Tant mieux, et c'est le meilleur moment pour en parler : après un vol, on décide dans l'urgence. Je vous propose juste un tour du site de 30 minutes pour vérifier que rien n'est exposé. »" },
    { o: '« La sécurité, c\'est trop cher. »', r: "« Trop cher par rapport à quoi : votre franchise d'assurance, un arrêt de chantier, le matériel à racheter ? … Souvent, il n'y a pas besoin d'un agent toute la nuit : des rondes à heures variables peuvent suffire. C'est justement ce qu'on regarde pendant la visite. »" },
    { o: '« On va recruter notre propre agent. »', r: "« C'est possible. Vous avez prévu qui le remplace pendant ses congés, ses arrêts, ses week-ends ? Et la vérification de sa carte professionnelle ? On vous fait une proposition pour le même poste, vous comparez le coût total et vous choisissez. »" },
    { o: '« On a déjà une société de sécurité. »', r: "« Très bien. Vous en êtes satisfait à combien sur 10 ? … Et quand un agent ne vient pas, vous l'apprenez comment ? » Si 9 ou 10 : propose d'être la solution de renfort." },
    { o: '« Vous êtes autorisés ? Vous avez des références ? »', r: "C'est un signal d'achat. « Bien sûr, et vous avez raison de demander. Je vous envoie aujourd'hui notre numéro d'autorisation CNAPS, que vous pouvez vérifier en ligne, et notre attestation d'assurance. On en parle ensuite sur place ? » Références clients : seulement avec l'accord d'Abdel." },
    { o: '« Envoyez-moi une plaquette. »', r: "« Avec plaisir. Pour qu'elle vous soit utile : c'est plutôt pour la nuit, le week-end ou un événement ? Et quel type de site ? … Je vous l'envoie aujourd'hui et je vous rappelle jeudi. »" },
    { o: '« C\'est le siège qui décide. »', r: "« D'accord. Vous êtes le mieux placé pour savoir ce qui se passe sur le site. Si on fait le tour ensemble, je vous prépare un document à transmettre au siège. Qui est la bonne personne là-bas ? »" },
    { o: '« Rappelez-moi plus tard. »', r: "« Avec plaisir. Qu'est-ce qui va changer d'ici là : fin de contrat, ouverture, événement ? … Je vous rappelle donc le (date précise). »" },
  ];

  const api = { TRANCHES, TAILLES_RECHERCHE, sizeFromTranche, SITE_CATEGORIES, SITES, AUTO_LABEL, SEGMENTS, COMMUNES, SOURCES, SIZES, CALL_RESULTS, SCRIPTS, OBJECTIONS, OBJECTIONS_SECU };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RefData = api;
})(typeof window !== 'undefined' ? window : globalThis);
