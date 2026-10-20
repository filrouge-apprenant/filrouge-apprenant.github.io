-- =============================================================================
-- Fil Rouge Apprenants — Entraînement aux appels (simulateur avec IA)
-- =============================================================================
-- Les appelantes s'entraînent sur des apprenants FICTIFS joués par l'IA,
-- avant d'appeler de vrais apprenants. Aucune donnée réelle ne passe par l'IA.
--
--   entrainement_scenarios   ce que l'appelante voit avant l'appel (fiche
--                            fictive, objectif de l'appel, difficulté)
--   entrainement_personas    la « personnalité cachée » que joue l'IA (son
--                            vrai frein, son comportement) : jamais visible
--                            par l'appelante, lue seulement par la fonction
--                            serveur « simulation-appel »
--   entrainement_sessions    chaque appel d'entraînement : transcription,
--                            note sur 20, évaluation critère par critère
--
-- Droits :
--   - Émilie (double authentification) : voit et modifie tout.
--   - Appelante : lit les scénarios actifs, lit SES sessions. Elle ne peut
--     ni écrire une session ni modifier sa note : seule la fonction serveur
--     (clé de service) enregistre les appels et les évaluations.
-- =============================================================================

create table public.entrainement_scenarios (
  id                  uuid primary key default gen_random_uuid(),
  titre               text not null check (char_length(titre) between 1 and 120),
  difficulte          text not null default 'moyen' check (difficulte in ('facile', 'moyen', 'difficile')),
  -- Fiche fictive, telle que l'appelante la verrait sur la plateforme
  apprenant_nom       text not null check (char_length(apprenant_nom) between 1 and 80),
  formation           text not null check (char_length(formation) between 1 and 150),
  financement         text check (char_length(financement) <= 80),
  progression         integer check (progression between 0 and 100),
  derniere_connexion  text check (char_length(derniere_connexion) <= 120),
  contexte            text not null check (char_length(contexte) between 1 and 1500),
  objectif_appel      text not null check (char_length(objectif_appel) between 1 and 600),
  actif               boolean not null default true,
  ordre               integer not null default 100,
  cree_le             timestamptz not null default now(),
  modifie_le          timestamptz not null default now()
);

comment on table public.entrainement_scenarios is
  'Apprenants fictifs pour l''entraînement des appelantes : partie visible avant l''appel.';

create table public.entrainement_personas (
  scenario_id   uuid primary key references public.entrainement_scenarios (id) on delete cascade,
  personnage    text not null check (char_length(personnage) between 1 and 4000),
  modifie_le    timestamptz not null default now()
);

comment on table public.entrainement_personas is
  'Consigne cachée de l''IA (vrai frein, comportement). Admin et fonction serveur seulement.';

create table public.entrainement_sessions (
  id               uuid primary key default gen_random_uuid(),
  appelante_id     uuid not null references public.profils (id) on delete cascade,
  scenario_id      uuid references public.entrainement_scenarios (id) on delete set null,
  scenario_titre   text not null,
  mode             text not null default 'voix' check (mode in ('voix', 'ecrit')),
  statut           text not null default 'en_cours' check (statut in ('en_cours', 'terminee')),
  debut            timestamptz not null default now(),
  fin              timestamptz,
  duree_secondes   integer check (duree_secondes >= 0),
  -- [{ "qui": "appelante" | "apprenant", "texte": "…" }, …]
  transcription    jsonb not null default '[]'::jsonb,
  note_sur_20      integer check (note_sur_20 between 0 and 20),
  -- { criteres: [{ cle, nom, note (0-5), commentaire }], points_forts: [], a_ameliorer: [], conseil, frein_decouvert }
  evaluation       jsonb
);

create index entrainement_sessions_appelante on public.entrainement_sessions (appelante_id, debut desc);

comment on table public.entrainement_sessions is
  'Appels d''entraînement. Écrits uniquement par la fonction serveur simulation-appel.';

-- -----------------------------------------------------------------------------
-- Qui peut s'entraîner ? Administratrice (double authentification) ou
-- appelante active dans sa période d'accès. Utilisée par la fonction serveur.
-- -----------------------------------------------------------------------------
create or replace function public.je_peux_m_entrainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select prive.est_admin() or prive.est_appelante()
$$;

revoke all on function public.je_peux_m_entrainer() from public, anon;
grant execute on function public.je_peux_m_entrainer() to authenticated;

-- -----------------------------------------------------------------------------
-- Cloisonnement
-- -----------------------------------------------------------------------------
alter table public.entrainement_scenarios enable row level security;
alter table public.entrainement_personas  enable row level security;
alter table public.entrainement_sessions  enable row level security;

revoke all on public.entrainement_scenarios, public.entrainement_personas, public.entrainement_sessions from anon;

create policy scenarios_admin on public.entrainement_scenarios for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());
create policy scenarios_appelante_lecture on public.entrainement_scenarios for select to authenticated
  using (prive.est_appelante() and actif);

create policy personas_admin on public.entrainement_personas for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());

-- Sessions : lecture seulement (l'écriture passe par la fonction serveur).
-- L'administratrice peut supprimer une session (nettoyage).
create policy sessions_admin_lecture on public.entrainement_sessions for select to authenticated
  using (prive.est_admin());
create policy sessions_admin_suppression on public.entrainement_sessions for delete to authenticated
  using (prive.est_admin());
create policy sessions_appelante_lecture on public.entrainement_sessions for select to authenticated
  using (prive.est_appelante() and appelante_id = auth.uid());

-- Date de modification tenue à jour
create or replace function prive.entrainement_modifie()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.modifie_le := now();
  return new;
end;
$$;

create trigger entrainement_scenarios_modifie before update on public.entrainement_scenarios
  for each row execute function prive.entrainement_modifie();
create trigger entrainement_personas_modifie before update on public.entrainement_personas
  for each row execute function prive.entrainement_modifie();

-- -----------------------------------------------------------------------------
-- Scénarios de départ (100 % fictifs). Émilie peut les modifier ou en ajouter.
-- -----------------------------------------------------------------------------
with s as (
  insert into public.entrainement_scenarios
    (ordre, titre, difficulte, apprenant_nom, formation, financement, progression, derniere_connexion, contexte, objectif_appel)
  values
  (10, 'Pas encore inscrit à l''examen', 'facile', 'Kevin Morel', 'CAP Électricien (12 mois)', 'CPF', 72,
   'Il y a 4 jours',
   'Kevin avance bien et se connecte régulièrement. L''organisme signale qu''il n''est pas encore inscrit à l''examen : les inscriptions ferment dans 3 semaines.',
   'Vérifier où il en est, l''aider à faire son inscription à l''examen (ou fixer une date précise pour la faire) et faire un point rapide sur sa progression.'),

  (20, 'Ne se connecte plus depuis 3 semaines', 'moyen', 'Sarah Lemoine', 'CAP Accompagnant éducatif petite enfance (12 mois)', 'CPF', 35,
   'Il y a 22 jours',
   'Sarah était régulière les deux premiers mois, puis plus aucune connexion depuis 3 semaines. Elle est à 35 % alors qu''elle devrait être vers 55 %.',
   'Comprendre ce qui bloque, la remettre en mouvement avec un objectif précis et réaliste, et convenir du prochain appel.'),

  (30, 'Veut tout arrêter', 'difficile', 'Nadia Ferhat', 'Titre pro Secrétaire assistant (6 mois)', 'Transitions Pro', 58,
   'Hier',
   'Nadia a raté sa dernière évaluation en cours de formation (8/20). Le formateur signale qu''elle a parlé d''abandonner.',
   'Écouter, éviter l''abandon, l''aider à relativiser l''échec et repartir avec un petit objectif atteignable.'),

  (40, 'Pressé, au travail', 'difficile', 'Thomas Girard', 'CAP Pâtissier (12 mois)', 'CPF', 41,
   'Il y a 9 jours',
   'Thomas travaille en boulangerie. Il est un peu en retard sur le rythme attendu (il devrait être vers 50 %).',
   'Faire un point sur sa progression. S''il n''est pas disponible, savoir écourter l''appel et fixer un rappel précis.'),

  (50, 'Perdue avec l''ordinateur', 'moyen', 'Fatima Benali', 'Titre pro Assistant de vie aux familles (8 mois)', 'Pôle emploi / France Travail', 12,
   'Il y a 15 jours',
   'Madame Benali, 52 ans, a très peu avancé depuis son entrée en formation il y a 6 semaines. Elle s''est connectée 3 fois seulement.',
   'Comprendre la difficulté, la rassurer, lui expliquer simplement comment accéder à ses cours et fixer un premier petit objectif.'),

  (60, 'Mécontent de l''organisme', 'difficile', 'Mehdi Rouabah', 'BTS Négociation et digitalisation de la relation client (2 ans)', 'Autofinancement', 48,
   'Il y a 2 jours',
   'Mehdi a envoyé deux messages sans réponse à son formateur. Il a laissé un avis négatif sur la plateforme.',
   'Désamorcer son agacement, faire remonter son problème proprement, sans critiquer l''organisme, et garder sa motivation.'),

  (70, 'Doit trouver un stage', 'facile', 'Julie Marchand', 'CAP Esthétique cosmétique parfumerie (12 mois)', 'CPF', 64,
   'Il y a 3 jours',
   'Julie doit faire 4 semaines de stage avant l''examen. Sa convention de stage n''est toujours pas rendue, il reste 2 mois.',
   'Faire le point sur sa recherche de stage, lui donner des pistes concrètes et fixer une échéance pour la convention.')
  returning id, ordre
)
insert into public.entrainement_personas (scenario_id, personnage)
select s.id, p.personnage
from s
join (values
  (10, 'Tu es Kevin, 24 ans, sympathique, détendu, un peu tête en l''air. Tu travailles comme manœuvre sur des chantiers. Tu avances bien dans les cours. Tu n''es pas inscrit à l''examen parce que tu ne sais pas comment faire : tu croyais que l''organisme s''en occupait, et le site de l''académie te semble compliqué. Tu ne connais pas la date limite. Si l''appelante t''explique les étapes simplement et te propose de le faire ensemble ou à une date précise, tu acceptes volontiers. Tu as aussi une petite inquiétude sur la partie pratique de l''examen, que tu évoques seulement si on te demande comment tu te sens pour l''examen.'),
  (20, 'Tu es Sarah, 31 ans, maman de deux enfants. Ton vrai frein, que tu ne dis PAS tout de suite : tu as trouvé un nouveau travail il y a un mois, en horaires décalés dans une crèche, et tu es épuisée ; tu culpabilises de ne plus avancer et tu as un peu honte. Au début tu restes vague (« oui, j''ai été un peu prise », « je vais m''y remettre »). Tu ne t''ouvres que si l''appelante pose des questions ouvertes, ne te juge pas et montre de l''empathie. Si elle te propose un objectif trop gros (par exemple 3 modules cette semaine), tu dis oui mollement sans y croire. Si elle t''aide à trouver un créneau réaliste (par exemple 20 minutes le mercredi matin), tu es soulagée et motivée. Ton nouveau travail en crèche est en lien avec ta formation : si l''appelante le remarque, ça te remotive beaucoup.'),
  (30, 'Tu es Nadia, 38 ans, en reconversion après 15 ans comme caissière. Tu as eu 8/20 à ta dernière évaluation et tu te sens nulle : « je ne suis pas faite pour les études ». Tu es émue, tu as la voix qui tremble, tu dis que tu veux arrêter. Tu réagis mal si l''appelante minimise (« c''est rien ») ou te sermonne. Tu t''apaises si elle t''écoute vraiment, reformule ce que tu ressens et te rappelle que c''est une évaluation d''entraînement. Ton vrai frein : tu as peur d''échouer devant tes enfants qui te voient étudier. Tu ne le dis que si l''appelante crée un vrai climat de confiance. Tu acceptes de continuer si on te propose un petit objectif concret (revoir le module raté avec le formateur, par exemple). Tu ne t''engages jamais à « tout reprendre » d''un coup.'),
  (40, 'Tu es Thomas, 27 ans, tu travailles dans une boulangerie et tu décroches pendant ton service : on entend du bruit. Tu es pressé, tu réponds par phrases très courtes (« ouais », « ça va », « j''ai pas trop le temps là »). Si l''appelante insiste pour faire tout l''appel, tu t''agaces et tu finis par dire « bon je dois y aller ». Si elle comprend vite, s''excuse du dérangement et te propose de te rappeler à un moment précis (par exemple demain après 15 h, ta pause), tu acceptes avec plaisir et tu deviens plus aimable. Tu peux donner une seule information si on te la demande en une question courte : tu bloques un peu sur le module de calcul des recettes.'),
  (50, 'Tu es Fatima Benali, 52 ans, ancienne agente d''entretien, très gentille et polie, tu vouvoies et tu t''excuses souvent. Tu es stressée par l''ordinateur : tu ne retrouves jamais où sont les cours, tu as peur de « casser quelque chose », et ton mot de passe ne marche plus. Tu as honte de le dire et tu dis d''abord « oui oui ça va, j''avance doucement ». Tu ne parles de tes difficultés que si l''appelante est patiente et te met en confiance. Si elle utilise des mots techniques (navigateur, identifiant, onglet…), tu ne comprends pas et tu le dis timidement. Tu es très reconnaissante si elle t''explique pas à pas, simplement, et te propose une aide (contacter le support, faire ensemble). Ton petit-fils peut t''aider le samedi.'),
  (60, 'Tu es Mehdi, 22 ans, énervé. Tu commences l''appel sur un ton sec : tu as écrit deux fois à ton formateur sans réponse, tu paies ta formation toi-même et tu as l''impression d''être abandonné. Tu coupes la parole au début. Si l''appelante se justifie, défend l''organisme ou te contredit, tu t''énerves davantage. Si elle t''écoute sans t''interrompre, reconnaît que c''est frustrant, et s''engage concrètement (faire remonter ta question, avec un délai), tu te calmes et tu redeviens poli. Ta vraie question au formateur : tu ne comprends pas la consigne de ton dossier de fin d''année. Une fois calmé, tu reconnais que la formation te plaît.'),
  (70, 'Tu es Julie, 19 ans, motivée, souriante, mais timide pour démarcher. Tu as envoyé 2 CV par mail à des instituts sans réponse et tu n''oses pas appeler ni te présenter sur place. Tu ne sais pas exactement quels documents il faut pour la convention de stage. Tu réponds de façon positive mais un peu vague (« je cherche, je cherche »). Si l''appelante te donne des pistes concrètes (se présenter en personne avec un CV, viser les petits instituts du quartier, préparer une phrase d''accroche) et te fixe un objectif chiffré avec une date, tu t''engages avec enthousiasme.')
) as p(ordre, personnage) on p.ordre = s.ordre;
