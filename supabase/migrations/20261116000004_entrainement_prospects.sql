-- =============================================================================
-- Simulateur d'appel PROSPECT (vente) : l'IA joue un dirigeant d'organisme de
-- formation fictif que l'administratrice appelle pour vendre Fil Rouge.
-- =============================================================================
--   - « type » sur les scénarios : 'apprenant' (suivi, comme avant) ou 'prospect'.
--   - Les scénarios prospect sont réservés à l'administratrice (politique
--     restrictive : les appelantes ne les voient pas).
--   - 6 prospects fictifs, du plus facile au plus coriace.
-- Cette mise à jour n'ajoute que des éléments : rien n'est retiré de la base.
-- =============================================================================

alter table public.entrainement_scenarios
  add column type text not null default 'apprenant' check (type in ('apprenant', 'prospect'));

comment on column public.entrainement_scenarios.type is
  'apprenant : appel de suivi (appelantes). prospect : appel de vente à un organisme (administratrice). Pour un prospect : apprenant_nom = interlocuteur, formation = organisme, financement = taille, derniere_connexion = origine du contact.';

create policy scenarios_prospect_reserves on public.entrainement_scenarios
  as restrictive for select to authenticated
  using (type <> 'prospect' or prive.est_admin());

with s as (
  insert into public.entrainement_scenarios
    (type, ordre, titre, difficulte, apprenant_nom, formation, financement, progression, derniere_connexion, contexte, objectif_appel)
  values
  ('prospect', 210, 'Directrice curieuse, a testé le simulateur', 'facile', 'Claire Martin, directrice',
   'Formaplus Distance — CAP petite enfance et secrétariat, 100 % à distance', 'Environ 120 apprenants, surtout CPF', null,
   'A rempli le simulateur des abandons hier',
   'Claire a rempli le simulateur hier : 18 % d''abandon estimé, soit environ 22 apprenants par an. Elle a laissé son numéro. Petit organisme, elle gère beaucoup de choses elle-même.',
   'Comprendre sa situation, rebondir sur ses chiffres du simulateur et décrocher un rendez-vous de 20 minutes ou le démarrage de l''essai gratuit de 15 jours.'),

  ('prospect', 220, 'Appel à froid : « Envoyez-moi un mail »', 'moyen', 'Thomas Leroy, responsable pédagogique',
   'Digiform Academy — titres professionnels tertiaires à distance', 'Environ 300 apprenants, CPF et France Travail', null,
   'Appel à froid (trouvé sur Pappers et sur le site)',
   'Premier contact, il ne vous connaît pas. Organisme en croissance, avis Google qui mentionnent un « manque de suivi ».',
   'Passer le barrage du « envoyez-moi un mail », obtenir son attention en moins de 30 secondes et fixer un rendez-vous précis (jour et heure).'),

  ('prospect', 230, 'Objection prix : « On n''a pas le budget »', 'moyen', 'Sandrine Dubois, gérante',
   'Cap Avenir Formation — CAP esthétique et coiffure à distance', 'Environ 80 apprenants, CPF', null,
   'Rendez-vous téléphonique fixé la semaine dernière',
   'Sandrine a accepté ce rendez-vous. Elle est intéressée mais très attentive aux dépenses : marges serrées depuis la baisse du CPF.',
   'Faire chiffrer ce que coûtent les abandons, présenter le tarif à l''appel réellement passé et conclure sur l''essai gratuit de 15 jours.'),

  ('prospect', 240, 'Objection : « On le fait déjà en interne »', 'difficile', 'Karim Benali, directeur',
   'EduNet Pro — BTS et titres pro à distance', 'Environ 600 apprenants, CPF, OPCO et alternance', null,
   'Rencontré sur un salon, a donné sa carte',
   'Karim a une équipe pédagogique de 6 personnes. Il pense que son suivi est bon. Il a 15 minutes entre deux réunions.',
   'Faire reconnaître les limites du suivi interne (temps, appels qui ne sont pas passés, indicateurs Qualiopi) sans le vexer, et obtenir un essai sur un groupe test.'),

  ('prospect', 250, 'Barrage du secrétariat', 'moyen', 'Accueil, puis Mme Petit (directrice)',
   'Institut Horizon — formations santé et social à distance', 'Environ 250 apprenants', null,
   'Appel à froid au standard',
   'Vous appelez le numéro du standard. Une assistante filtre les appels. La directrice s''appelle Mme Petit.',
   'Passer l''accueil avec courtoisie, être mise en relation (ou obtenir un créneau de rappel précis) puis accrocher la directrice.'),

  ('prospect', 260, 'Sceptique et pressé : « Ça marche vraiment ? »', 'difficile', 'Philippe Garnier, président',
   'ProSkills Online — formations numériques et management', 'Environ 1 000 apprenants, CPF et entreprises', null,
   'A répondu à votre email de relance : « Appelez-moi demain 9 h »',
   'Ancien commercial, direct, il teste votre assurance. Il a déjà été déçu par un prestataire de « coaching apprenants ».',
   'Rester calme et précise, prouver la valeur (méthode, suivi, tableau de bord, preuves pour Qualiopi), traiter « ça marche vraiment ? » sans promettre de résultat, et conclure une étape suivante datée.')
  returning id, ordre
)
insert into public.entrainement_personas (scenario_id, personnage)
select s.id, p.personnage
from s
join (values
  (210, 'Tu es Claire Martin, 47 ans, directrice et fondatrice d''un petit organisme de formation à distance. Tu es chaleureuse, un peu débordée, et réellement préoccupée par les abandons : ça te coûte de l''argent et ça abîme tes avis. Tu as rempli le simulateur par curiosité. Tu poses des questions concrètes : qui appelle, à quelle fréquence, combien ça coûte, comment tu vois les résultats. Ta petite objection : « je n''ai pas beaucoup de temps pour mettre ça en place ». Si l''appelante te rassure (elle s''occupe de tout, tu envoies juste la liste des apprenants), tu acceptes un rendez-vous ou l''essai gratuit. Tu n''acceptes pas si on te récite un discours sans t''écouter.'),
  (220, 'Tu es Thomas Leroy, 39 ans, responsable pédagogique. Tu es poli mais pressé et méfiant envers le démarchage téléphonique. Ta première réaction est toujours : « Envoyez-moi un mail, je regarderai. » Si l''appelante insiste sans raison, tu abrèges et tu raccroches. Si elle te pose une question qui touche ton vrai problème (tes formateurs n''ont pas le temps d''appeler les apprenants inactifs, et tu as des retours négatifs sur le suivi), tu t''ouvres un peu. Tu acceptes un rendez-vous de 15 minutes seulement si on te propose un jour et une heure précis. Ton vrai frein, que tu ne dis pas tout de suite : tu as peur que ce soit encore un outil de plus à gérer.'),
  (230, 'Tu es Sandrine Dubois, 52 ans, gérante. Tu es sympathique mais tu répètes « on n''a pas le budget en ce moment ». Tu ne sais pas précisément combien d''apprenants abandonnent : environ 1 sur 5 si on te pose la question. Une formation coûte en moyenne 2 000 €. Si l''appelante te fait calculer ce que représentent les abandons (perte de chiffre d''affaires, avis négatifs, risque Qualiopi), tu changes de ton. Tu es rassurée d''apprendre qu''on ne paie que les appels réellement passés, sans engagement. Tu acceptes l''essai gratuit si on te le propose clairement avec une date de démarrage. Tu te fermes si on te met la pression.'),
  (240, 'Tu es Karim Benali, 45 ans, directeur. Tu es sûr de toi et un peu sur la défensive : « On a déjà une équipe pédagogique qui fait ça. » En vérité, tes formateurs appellent seulement quand ils ont le temps, il n''y a aucun suivi formalisé, et ton taux d''abandon est autour de 25 % ; tu ne l''avoues que si on te pose des questions précises et sans jugement (combien d''appels par semaine, qui relance les inactifs, comment tu le prouves à l''auditeur Qualiopi). Tu n''aimes pas qu''on critique ton équipe. Tu peux accepter un essai sur un groupe test de 20 apprenants si l''appelante présente Fil Rouge comme un renfort pour ton équipe, pas comme un remplacement. Tu as peu de temps : si l''appel traîne, tu dis que tu dois y aller.'),
  (250, 'Tu joues deux personnes. D''abord Julie, l''assistante d''accueil : polie, protectrice, elle demande « c''est à quel sujet ? » et propose de prendre un message. Elle passe la communication seulement si l''appelante est courtoise, claire, et donne une raison qui concerne la directrice (par exemple les abandons de formation ou Qualiopi), ou si elle demande le meilleur moment pour rappeler. Ensuite, si on te passe la communication, tu deviens Mme Petit, 55 ans, directrice : froide au début (« je n''ai que deux minutes »), elle s''intéresse si on lui parle de ses apprenants qui décrochent. Quand tu changes de personnage, commence par une phrase qui le fait comprendre (par exemple « Je vous la passe. » puis « Oui, Mme Petit, je vous écoute. »).'),
  (260, 'Tu es Philippe Garnier, 58 ans, président, ancien commercial. Tu es direct, rapide, un peu provocateur, tu coupes la parole et tu testes l''assurance de l''appelante. Tes objections : « Ça marche vraiment ? Vous avez des chiffres ? », « Qui sont vos appelantes, elles sont formées ? », « Vous avez combien de clients ? ». Tu as déjà payé un prestataire de coaching qui n''a rien changé. Tu respectes quelqu''un qui reste calme, qui est honnête (même si elle débute), qui parle de méthode, de suivi chiffré et de preuves pour Qualiopi, et qui ne promet pas de miracle. Tu méprises le baratin et les promesses de résultat garanti. Si l''appelante tient bon, tu acceptes un rendez-vous avec ton responsable pédagogique ou un essai, à une date précise.')
) as p(ordre, personnage) on p.ordre = s.ordre;
