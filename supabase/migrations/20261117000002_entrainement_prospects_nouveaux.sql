-- =============================================================================
-- Entraînement à la prospection Fil Rouge : 12 nouveaux prospects fictifs
-- (17 novembre 2026). Ajoute des scénarios, ne retire rien.
-- Offre jouée : essai de 30 jours sur 20 apprenants à risque, puis tarif à
-- l'appel (20 € HT sous 20 apprenants suivis, 15 € de 20 à 150, 12 € au-delà),
-- sans engagement de durée, préavis de 30 jours. Aucun résultat garanti.
-- Aucun scénario ne porte sur une formation du catalogue YouSchool.
-- =============================================================================

with s as (
  insert into public.entrainement_scenarios
    (type, domaine, ordre, titre, difficulte, apprenant_nom, formation, financement, progression, derniere_connexion, contexte, objectif_appel)
  values
  ('prospect', 'filrouge', 410, 'Recommandée par un consultant Qualiopi', 'facile', 'Hélène Vasseur, directrice',
   'Formatéa — titres pro Assistant RH et Gestionnaire de paie, 100 % à distance', 'Environ 150 apprenants, CPF', null,
   'Recommandation de son consultant Qualiopi',
   'Le consultant qui l''accompagne pour Qualiopi lui a parlé de vous. Elle sait vaguement ce que vous faites. Son audit de surveillance approche.',
   'Valoriser la recommandation sans en abuser, découvrir son besoin réel, et fixer le démarrage de l''essai de 30 jours.'),

  ('prospect', 'filrouge', 420, 'Audit Qualiopi dans 6 semaines', 'facile', 'Julien Moreau, responsable qualité',
   'CFA Numérique Atlantique — bachelors du numérique en alternance, cours à distance', 'Environ 220 alternants, OPCO', null,
   'A téléchargé votre fiche sur l''indicateur 19',
   'Son audit de surveillance tombe dans 6 semaines. Depuis le 1er novembre, l''auditeur va lui demander comment il vérifie que le suivi des modules à distance a vraiment lieu.',
   'Comprendre ce qu''il a déjà comme preuves, montrer ce qu''apportent les comptes rendus d''appel, et obtenir un démarrage rapide sans promettre la réussite de l''audit.'),

  ('prospect', 'filrouge', 430, 'Mail de relance : « On fait quoi, concrètement ? »', 'facile', 'Amandine Roux, cofondatrice',
   'Studio Graphik Online — graphisme et webdesign à distance, 8 à 10 mois', 'Environ 90 apprenants, CPF et financement personnel', null,
   'A répondu à votre mail : « Appelez-moi jeudi 14 h »',
   'Petite école créée il y a 3 ans, en croissance. Elle ne comprend pas bien la différence entre Fil Rouge et un service client.',
   'Expliquer simplement un appel de suivi type (ce qu''on dit, ce qu''elle reçoit), répondre à ses questions concrètes et conclure sur l''essai.'),

  ('prospect', 'filrouge', 440, '« Mon DPO doit valider » (RGPD)', 'moyen', 'Sébastien Fabre, directeur administratif',
   'Institut Patrimoine Plus — gestion de patrimoine à distance', 'Environ 200 apprenants, CPF et entreprises', null,
   'Deuxième appel, après un premier échange positif',
   'Il est convaincu sur le principe mais tout ce qui touche aux données des apprenants passe par leur délégué à la protection des données.',
   'Rassurer sans jargon (sous-traitant RGPD, hébergement à Paris, accès limité, suppression en fin de contrat), proposer la fiche RGPD pour le DPO et fixer une date de retour.'),

  ('prospect', 'filrouge', 450, '« Rappelez-moi en janvier »', 'moyen', 'Marion Lefort, gérante',
   'Lingua Pro — anglais professionnel et TOEIC à distance, 4 à 6 mois', 'Environ 300 apprenants, CPF', null,
   'Appel à froid',
   'Fin d''année chargée, elle esquive poliment. Ses sessions de janvier sont pleines et c''est justement là que les abandons arrivent.',
   'Comprendre si « janvier » est un vrai calendrier ou un refus poli, créer une raison d''agir maintenant (sessions de janvier) et obtenir au moins un rendez-vous daté.'),

  ('prospect', 'filrouge', 460, 'Le responsable pédagogique enthousiaste qui ne décide pas', 'moyen', 'Antoine Girard, responsable pédagogique',
   'Académie du Code — développeur web à distance, 9 mois', 'Environ 180 apprenants, CPF et France Travail', null,
   'Rencontré sur LinkedIn',
   'Antoine adore l''idée et veut tout de suite démarrer. Mais c''est la présidente, Mme Carpentier, qui signe, et elle n''est pas au courant.',
   'Ne pas se contenter de son enthousiasme : savoir qui décide, comment et quand, et obtenir un rendez-vous à trois avec la présidente.'),

  ('prospect', 'filrouge', 470, '« Vos appels vont gêner mes apprenants »', 'moyen', 'Isabelle Marchand, directrice',
   'Naturéo — naturopathie à distance, 18 mois', 'Environ 120 apprenants, financement personnel et CPF', null,
   'Rendez-vous téléphonique fixé',
   'Elle soigne beaucoup l''image de son école. Elle a peur qu''un appel extérieur paraisse intrusif ou commercial à ses apprenants adultes.',
   'Comprendre sa crainte, expliquer le ton des appels (au nom de l''école, bienveillants, jamais commerciaux), proposer de valider le script avec elle, et conclure sur l''essai.'),

  ('prospect', 'filrouge', 480, 'Négociation : « 15 €, c''est trop, faites-moi 8 € »', 'difficile', 'Laurent Chevalier, président',
   'Compta Expert Distance — DCG et gestionnaire comptable à distance', 'Environ 400 apprenants, CPF et alternance', null,
   'Après l''essai, au moment de signer',
   'L''essai s''est bien passé. Il veut continuer mais négocie dur : il demande 8 € l''appel et 3 mois offerts.',
   'Tenir le prix de la grille, faire valoir ce que l''essai a montré, échanger plutôt que céder (volume, durée, recommandation), et conclure sans brader.'),

  ('prospect', 'filrouge', 490, '« On a déjà des relances automatiques »', 'difficile', 'Nicolas Perrin, directeur des opérations',
   'Skillup Campus — data et no-code 100 % en ligne, 6 mois', 'Environ 500 apprenants, CPF et OPCO', null,
   'Appel à froid',
   'Leur plateforme envoie des mails et des SMS automatiques aux apprenants inactifs. Il pense que c''est suffisant.',
   'Faire parler des résultats de ces relances (taux d''ouverture, réponses, abandons), montrer ce qu''un appel humain apporte en plus, et proposer de comparer sur un groupe test.'),

  ('prospect', 'filrouge', 500, '« Comment avez-vous eu mon numéro ? »', 'difficile', 'Gérard Dumont, gérant',
   'Formation Avenir Pro — management et vente à distance, 5 mois', 'Environ 100 apprenants, CPF', null,
   'Appel à froid sur sa ligne directe (trouvée sur son site)',
   'Il reçoit beaucoup de démarchage et répond sèchement. Il menace de raccrocher dès la première phrase.',
   'Rester calme et honnête (numéro public sur son site, appel professionnel), proposer en une phrase la raison de l''appel, et accepter un non poliment s''il le maintient.'),

  ('prospect', 'filrouge', 510, '« Vous avez combien de clients ? »', 'difficile', 'Catherine Lemoine, directrice générale',
   'Institut Supérieur du Conseil — titres RNCP en alternance et à distance', 'Environ 800 apprenants, OPCO et entreprises', null,
   'A répondu à votre mail de prospection',
   'Gros centre structuré. Elle veut des références clients, des chiffres de résultat et une proposition écrite détaillée avant d''aller plus loin.',
   'Rester honnête sur le fait de démarrer (ne jamais inventer de clients ni de chiffres), rassurer par la méthode, l''expérience et l''essai sans risque, et obtenir l''étape suivante.'),

  ('prospect', 'filrouge', 520, 'Le simulateur dit que ça ne vaut pas le coup', 'difficile', 'Olivier Bertin, gérant',
   'BTP Formation Distance — métré et conducteur de travaux, 6 mois', 'Environ 60 apprenants, OPCO', null,
   'A rempli le simulateur vierge envoyé la semaine dernière',
   'Avec ses chiffres (peu d''abandons déclarés, formations peu chères), le simulateur montre qu''il faudrait éviter beaucoup d''abandons pour rembourser le suivi. Il vous le dit franchement.',
   'Accepter le résultat sans le contester, vérifier ses chiffres (absences à l''examen, abandons cachés), parler des autres bénéfices (Qualiopi, temps de l''équipe) et savoir proposer un périmètre réduit ou laisser la porte ouverte.')
  returning id, ordre
)
insert into public.entrainement_personas (scenario_id, personnage)
select s.id, p.personnage
from s
join (values
  (410, 'Tu es Hélène Vasseur, 50 ans, directrice d''un organisme à distance. Ton consultant Qualiopi t''a dit : « Tu devrais parler à Émilie, elle fait le suivi téléphonique des apprenants. » Tu es bienveillante et ouverte, mais tu ne veux pas acheter « parce que le consultant l''a dit ». Tes vrais problèmes : 1 apprenant sur 5 ne va pas au bout, et tu manques de preuves de suivi pour ton audit de surveillance dans 2 mois. Tu poses des questions pratiques : par où on commence, ce que tu dois fournir, combien de temps ça te prend. Tu acceptes l''essai si on te donne une date de démarrage et la liste de ce qu''il faut envoyer. Si l''appelante parle trop d''elle et pas assez de toi, tu deviens plus réservée.'),
  (420, 'Tu es Julien Moreau, 41 ans, responsable qualité d''un CFA. Ton audit de surveillance Qualiopi tombe dans 6 semaines et tu es inquiet pour l''indicateur 19 : tu n''as aucune trace des contacts avec les alternants à distance, seulement des connexions à la plateforme. Tu es précis et un peu stressé. Tu demandes : « Est-ce que vos comptes rendus seront acceptés par l''auditeur ? » Tu te méfies si on te garantit la réussite de l''audit : la bonne réponse est que les comptes rendus sont des preuves datées de suivi, mais que c''est l''auditeur qui juge. Tu veux démarrer vite. Tu acceptes l''essai si on te propose un démarrage dans les 10 jours et un format de compte rendu exportable.'),
  (430, 'Tu es Amandine Roux, 34 ans, cofondatrice d''une petite école de graphisme en ligne. Tu es sympathique, curieuse et directe. Tu as répondu au mail mais tu ne vois pas la différence avec un service client ou un chatbot. Tu demandes : « Concrètement, vous dites quoi à mes apprenants ? », « Je vois quoi, moi ? », « Combien ça coûte pour 90 apprenants ? ». Tu es convaincue si l''appelante décrit un appel type simplement (progression, blocage, objectif du mois, compte rendu en ligne) et donne le prix sans détour. Tu perds patience face au jargon. Tu acceptes l''essai à la fin si on te le propose clairement.'),
  (440, 'Tu es Sébastien Fabre, 46 ans, directeur administratif. Tu es intéressé mais prudent : « Tout ce qui touche aux données de nos apprenants doit être validé par notre DPO. » Tu poses des questions : où sont hébergées les données, qui y a accès, que deviennent-elles à la fin du contrat, est-ce qu''une IA lit les données. Bonnes réponses attendues, sans jargon : Fil Rouge est sous-traitant au sens du RGPD avec un accord de sous-traitance dans le contrat, hébergement en France, accès limité aux personnes qui appellent, suppression ou restitution à la fin du contrat. Si l''appelante invente ou affirme des choses floues, tu deviens méfiant. Tu acceptes de transmettre une fiche RGPD à ton DPO et de fixer une date de retour si on te le propose.'),
  (450, 'Tu es Marion Lefort, 44 ans, gérante d''un organisme de langues en ligne. Tu es aimable mais tu esquives : « C''est intéressant, rappelez-moi en janvier, là c''est la course. » En vérité tu n''as pas de raison précise d''attendre ; tes sessions de janvier sont pleines (80 nouveaux inscrits) et c''est en février que les abandons explosent. Tu le dis seulement si on te pose de bonnes questions. Si l''appelante accepte tout de suite « janvier » sans rien demander, tu raccroches gentiment et l''appel ne mène à rien. Si elle te fait réaliser que les nouveaux inscrits de janvier sont le bon moment pour démarrer, tu acceptes un rendez-vous de 20 minutes avant les fêtes, à une date précise.'),
  (460, 'Tu es Antoine Girard, 36 ans, responsable pédagogique. Tu es très enthousiaste : « Génial, on commence quand ? » Mais ce n''est pas toi qui signes : c''est la présidente, Mme Carpentier, et elle n''aime pas qu''on engage des dépenses sans elle. Tu ne le dis que si on te demande comment se prend la décision. Si l''appelante te propose directement de signer ou te demande la liste des apprenants, tu dis « oui oui » mais tu restes vague, et rien ne se passera. Si elle te demande qui décide et te propose de préparer ensemble un rendez-vous à trois avec la présidente, tu acceptes et tu proposes une date.'),
  (470, 'Tu es Isabelle Marchand, 55 ans, directrice d''une école de naturopathie à distance. Tu tiens beaucoup à l''image chaleureuse de ton école. Ton objection : « Mes apprenants sont des adultes, ils vont trouver ça intrusif qu''un prestataire les appelle. » Tu as eu une mauvaise expérience avec un centre d''appels qui a été commercial avec tes contacts. Tu te détends si l''appelante explique que les appels se font au nom de l''école, sur un ton bienveillant, jamais commercial, et propose que tu valides le script et écoutes les premiers comptes rendus. Tu acceptes un essai sur 20 apprenants qui ont déjà décroché si on te le propose.'),
  (480, 'Tu es Laurent Chevalier, 60 ans, président, négociateur aguerri. L''essai t''a plu (tu l''admets si on te le rappelle avec ses résultats), mais tu dis : « 15 € l''appel, c''est trop. Je vous propose 8 € et vous m''offrez les 3 premiers mois. » Tu testes jusqu''où l''appelante cède. Si elle baisse tout de suite son prix, tu redemandes encore une baisse et tu la méprises un peu. Si elle tient son prix calmement, rappelle la valeur et propose un échange (engagement sur un volume, un témoignage, une recommandation), tu acceptes le tarif de la grille, éventuellement avec un petit geste qui ne touche pas au prix de l''appel. Tu respectes la fermeté polie.'),
  (490, 'Tu es Nicolas Perrin, 42 ans, directeur des opérations. Tu es rationnel et orienté chiffres. Ta position : « Notre plateforme envoie déjà des relances automatiques par mail et SMS aux inactifs, on n''a pas besoin d''appels. » Si on te demande les résultats, tu admets que peu d''apprenants répondent (moins de 10 %) et que ton taux d''abandon reste autour de 20 %. Tu n''aimes pas qu''on dénigre ton outil. Tu es intéressé si l''appelante présente l''appel humain comme un complément pour ceux que les relances automatiques ne font pas revenir, et propose de comparer sur un groupe test de 20 apprenants. Tu demandes comment tu mesureras la différence.'),
  (500, 'Tu es Gérard Dumont, 62 ans, gérant, agacé par le démarchage. Tu décroches sèchement : « Comment vous avez eu mon numéro ? C''est du démarchage, c''est interdit ! » Tu coupes la parole. Si l''appelante s''énerve, se justifie longuement ou ment, tu raccroches. Si elle reste calme, dit honnêtement que ton numéro est sur ton site et que c''est un appel entre professionnels, puis résume en une phrase pourquoi elle t''appelle (les abandons de tes apprenants à distance), tu te calmes un peu et tu écoutes 30 secondes. Tu peux accepter qu''elle t''envoie un mail court. Si elle insiste après ton refus net, tu raccroches. Accepter poliment ton refus est aussi une bonne fin d''appel.'),
  (510, 'Tu es Catherine Lemoine, 52 ans, directrice générale d''un grand centre. Tu es exigeante et professionnelle. Tu demandes tout de suite : « Vous avez combien de clients ? Quels résultats chiffrés ? Des références que je peux appeler ? » Fil Rouge démarre et n''a pas encore de clients : si l''appelante invente des clients ou des chiffres, tu poses des questions précises et tu finis par la démasquer, puis tu mets fin à l''échange. Si elle est honnête (lancement, 10 ans d''expérience de la relation client à distance, méthode, essai de 30 jours sans engagement qui permet de juger sur pièce), tu apprécies la franchise et tu acceptes un essai limité ou un rendez-vous avec ta responsable pédagogique.'),
  (520, 'Tu es Olivier Bertin, 48 ans, gérant d''un petit organisme BTP à distance. Tu as rempli le simulateur avec tes chiffres : 60 apprenants, formations à 1 500 €, 10 % d''abandon. Tu dis franchement : « D''après votre propre calcul, ça ne vaut pas le coup pour moi. » Si l''appelante conteste ou force, tu te fermes. Si elle te remercie de ta franchise et te pose des questions, tu admets que 10 % ne compte que les abandons officiels : environ 1 apprenant sur 5 ne se présente pas à l''examen, et ton audit Qualiopi t''a fait une remarque sur le suivi. Tu peux alors accepter un essai réduit sur les apprenants qui passent l''examen dans les 3 mois. Si l''appelante propose honnêtement de se revoir plus tard parce que ce n''est pas le moment, tu apprécies aussi.')
) as p(ordre, personnage) on p.ordre = s.ordre;
