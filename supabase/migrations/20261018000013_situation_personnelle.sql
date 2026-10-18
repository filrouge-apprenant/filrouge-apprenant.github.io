-- =============================================================================
-- Situation personnelle de l'apprenant (en haut de la fiche)
-- =============================================================================
-- Âge (via la date de naissance), situation professionnelle, heures de travail
-- par semaine, situation familiale, nombre d'enfants, contraintes.
--
-- Données personnelles : visibles UNIQUEMENT par l'équipe Fil Rouge.
--   - administratrice : tout ;
--   - appelante       : lit et complète la fiche des apprenants qui lui sont confiés ;
--   - client          : AUCUN accès (pas de règle de lecture pour lui).
-- =============================================================================

create type public.situation_pro as enum (
  'demandeur_emploi',  -- inscrit ou non à France Travail, sans emploi
  'salarie',           -- en emploi salarié
  'independant',       -- indépendant, auto-entrepreneur
  'etudiant',          -- étudiant, alternant
  'sans_activite',     -- au foyer, congé parental, sans activité
  'autre'
);

create type public.situation_familiale as enum (
  'celibataire', 'en_couple', 'marie_pacse', 'separe_divorce', 'veuf'
);

create table public.situation_personnelle (
  apprenant_id          uuid primary key references public.apprenants (id) on delete cascade,
  organisme_id          uuid not null references public.organismes (id) on delete cascade,
  date_naissance        date check (date_naissance between '1920-01-01' and '2015-12-31'),
  situation_pro         public.situation_pro,
  heures_travail        smallint check (heures_travail between 0 and 70),
  situation_familiale   public.situation_familiale,
  nombre_enfants        smallint check (nombre_enfants between 0 and 15),
  contraintes           text check (char_length(contraintes) <= 500),
  modifie_le            timestamptz not null default now()
);

comment on table public.situation_personnelle is
  'Situation personnelle de l''apprenant. Équipe Fil Rouge uniquement : jamais visible par un client.';
comment on column public.situation_personnelle.heures_travail is 'Heures travaillées par semaine (si en emploi).';
comment on column public.situation_personnelle.contraintes is 'Contraintes utiles au suivi (garde d''enfants, horaires décalés…).';

create index situation_personnelle_organisme_idx on public.situation_personnelle (organisme_id);

-- Organisme recopié depuis l'apprenant (même automatisme que le coaching).
create trigger situation_personnelle_fixe_organisme
  before insert or update on public.situation_personnelle
  for each row execute function prive.coaching_fixe_organisme();

create or replace function prive.apprenant_maj_situation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.situation_personnelle set organisme_id = new.organisme_id where apprenant_id = new.id;
  return null;
end;
$$;

create trigger apprenants_maj_situation
  after update of organisme_id on public.apprenants
  for each row execute function prive.apprenant_maj_situation();

create trigger journal_situation_personnelle after insert or update or delete on public.situation_personnelle
  for each row execute function prive.journaliser();

-- Droits et cloisonnement
revoke all on public.situation_personnelle from anon;
grant select, insert, update, delete on public.situation_personnelle to authenticated;
alter table public.situation_personnelle enable row level security;

create policy situation_admin on public.situation_personnelle
  for all to authenticated
  using (prive.est_admin())
  with check (prive.est_admin());

create policy situation_appelante_lecture on public.situation_personnelle
  for select to authenticated
  using (prive.apprenant_confie(apprenant_id));

create policy situation_appelante_creation on public.situation_personnelle
  for insert to authenticated
  with check (prive.apprenant_confie(apprenant_id));

create policy situation_appelante_modification on public.situation_personnelle
  for update to authenticated
  using (prive.apprenant_confie(apprenant_id))
  with check (prive.apprenant_confie(apprenant_id));
