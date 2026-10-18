-- =============================================================================
-- Fil de commentaires de la fiche élève (bandeau de droite)
-- =============================================================================
-- Un fil par apprenant, du plus récent au plus ancien :
--   - commentaires écrits à la main (source « manuel ») ;
--   - ajoutés automatiquement :
--       « appel »        : chaque appel ou message noté (résultat, compte rendu, suite) ;
--       « note_interne » : chaque note interne écrite ou modifiée ;
--       « coaching »     : chaque champ du coaching rempli ou modifié (stage,
--                          projet, organisation) et chaque info d'examen.
--
-- Données internes : équipe Fil Rouge uniquement.
--   - administratrice : tout ;
--   - appelante       : lit le fil de ses apprenants confiés et y écrit ;
--   - client          : AUCUN accès.
-- =============================================================================

create type public.source_commentaire as enum ('manuel', 'appel', 'note_interne', 'coaching');

create table public.commentaires (
  id            uuid primary key default gen_random_uuid(),
  apprenant_id  uuid not null references public.apprenants (id) on delete cascade,
  organisme_id  uuid not null references public.organismes (id) on delete cascade,
  auteur_id     uuid default auth.uid(),
  auteur_nom    text,
  source        public.source_commentaire not null default 'manuel',
  contenu       text not null check (char_length(trim(contenu)) between 1 and 4000),
  cree_le       timestamptz not null default now()
);

comment on table public.commentaires is
  'Fil de commentaires de la fiche élève. Équipe Fil Rouge uniquement : jamais visible par un client.';

create index commentaires_apprenant_idx on public.commentaires (apprenant_id, cree_le desc);
create index commentaires_organisme_idx on public.commentaires (organisme_id);

-- Organisme recopié depuis l'apprenant, auteur et nom de l'auteur posés par la base.
create or replace function prive.commentaire_preparer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select a.organisme_id into new.organisme_id from public.apprenants a where a.id = new.apprenant_id;
  if new.organisme_id is null then
    raise exception 'Apprenant introuvable : %', new.apprenant_id;
  end if;
  if tg_op = 'INSERT' then
    -- Un commentaire écrit à la main porte toujours l'auteur réel.
    if new.source = 'manuel' then
      new.auteur_id := auth.uid();
      new.cree_le := now();
    end if;
    if new.auteur_nom is null and new.auteur_id is not null then
      select coalesce(nullif(trim(p.nom_affiche), ''), p.email) into new.auteur_nom from public.profils p where p.id = new.auteur_id;
    end if;
  end if;
  new.contenu := trim(new.contenu);
  return new;
end;
$$;

create trigger commentaires_preparer
  before insert or update on public.commentaires
  for each row execute function prive.commentaire_preparer();

create or replace function prive.apprenant_maj_commentaires()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.commentaires set organisme_id = new.organisme_id where apprenant_id = new.id;
  return null;
end;
$$;

create trigger apprenants_maj_commentaires
  after update of organisme_id on public.apprenants
  for each row execute function prive.apprenant_maj_commentaires();

create trigger journal_commentaires after insert or update or delete on public.commentaires
  for each row execute function prive.journaliser();

-- -----------------------------------------------------------------------------
-- Libellés lisibles (mêmes textes que la plateforme)
-- -----------------------------------------------------------------------------

create or replace function prive.libelle(p_valeur text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_valeur
    -- résultats d'appel
    when 'joint' then 'Joint·e'
    when 'messagerie' then 'Message laissé'
    when 'injoignable' then 'Injoignable'
    when 'refuse_suivi' then 'Refuse le suivi'
    -- canaux
    when 'telephone' then 'Appel'
    when 'sms' then 'SMS'
    when 'email' then 'Email'
    when 'whatsapp' then 'WhatsApp'
    when 'visio' then 'Visio'
    -- stage
    when 'non_concerne' then 'Pas de stage dans ce parcours'
    when 'a_chercher' then 'Stage à trouver'
    when 'structure_trouvee' then 'Structure trouvée'
    when 'convention_envoyee' then 'Convention envoyée, en attente de signature'
    when 'convention_signee' then 'Convention signée'
    when 'en_cours' then 'En stage'
    when 'termine' then 'Stage terminé'
    -- situation du projet
    when 'reconversion' then 'En reconversion'
    when 'en_emploi' then 'En emploi'
    when 'en_recherche' then 'En recherche d''emploi'
    when 'creation_activite' then 'Création d''activité'
    when 'autre' then 'Autre situation'
    -- examen
    when 'present' then 'Présent·e'
    when 'absent' then 'Absent·e'
    when 'reussi' then 'Réussi'
    when 'echoue' then 'Échoué'
    else p_valeur
  end;
$$;

-- Valeur lisible d'un champ : date en JJ/MM/AAAA, sinon libellé, vide = « effacé ».
create or replace function prive.valeur_lisible(p_valeur jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_valeur is null or p_valeur = 'null'::jsonb or p_valeur #>> '{}' = '' then 'effacé'
    when p_valeur #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$' then to_char((p_valeur #>> '{}')::date, 'DD/MM/YYYY')
    else prive.libelle(p_valeur #>> '{}')
  end;
$$;

-- Lignes « Libellé : valeur » pour les champs qui ont changé.
create or replace function prive.champs_modifies(p_ancien jsonb, p_nouveau jsonb, p_libelles jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(l.value #>> '{}' || ' : ' || prive.valeur_lisible(p_nouveau -> l.key), E'\n' order by l.ordinality)
  from jsonb_each(p_libelles) with ordinality as l(key, value, ordinality)
  where (p_nouveau -> l.key) is distinct from (coalesce(p_ancien, '{}'::jsonb) -> l.key)
    and not (p_ancien is null and (p_nouveau -> l.key = 'null'::jsonb or p_nouveau -> l.key is null));
$$;

-- -----------------------------------------------------------------------------
-- Commentaires automatiques
-- -----------------------------------------------------------------------------

-- Appel ou message noté
create or replace function prive.commenter_appel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texte text;
begin
  v_texte := concat_ws(E'\n',
    prive.libelle(new.canal::text) || ' · ' || prive.libelle(new.resultat::text),
    nullif(new.note_client, ''),
    case when new.prochaine_action is not null or new.date_prochaine_action is not null
      then 'Suite : ' || concat_ws(' le ', new.prochaine_action, to_char(new.date_prochaine_action, 'DD/MM/YYYY')) end);
  insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu, cree_le)
  values (new.apprenant_id, new.organisme_id, coalesce(new.auteur_id, auth.uid()), 'appel', v_texte, new.date_appel);
  return null;
end;
$$;

create trigger appels_commentaire
  after insert on public.appels
  for each row execute function prive.commenter_appel();

-- Note interne écrite ou modifiée
create or replace function prive.commenter_note_interne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appel record;
begin
  if tg_op = 'UPDATE' and new.contenu is not distinct from old.contenu then
    return null;
  end if;
  select ap.apprenant_id, ap.organisme_id, ap.date_appel, ap.auteur_id into v_appel
  from public.appels ap where ap.id = new.appel_id;
  insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu, cree_le)
  values (v_appel.apprenant_id, v_appel.organisme_id, coalesce(auth.uid(), v_appel.auteur_id), 'note_interne',
          case when tg_op = 'UPDATE' then 'Note interne modifiée (appel du ' || to_char(v_appel.date_appel at time zone 'Europe/Paris', 'DD/MM/YYYY') || ')' || E'\n' else '' end || new.contenu,
          case when tg_op = 'INSERT' then v_appel.date_appel + interval '1 second' else now() end);
  return null;
end;
$$;

create trigger notes_internes_commentaire
  after insert or update of contenu on public.notes_internes
  for each row execute function prive.commenter_note_interne();

-- Coaching : chaque champ rempli ou modifié
create or replace function prive.commenter_coaching()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lignes text;
begin
  v_lignes := prive.champs_modifies(
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    -- Création de la fiche : « pas de stage » est la valeur par défaut, rien à signaler.
    case when tg_op = 'INSERT' and new.stage_statut = 'non_concerne' then to_jsonb(new) - 'stage_statut' else to_jsonb(new) end,
    jsonb_build_object(
      'stage_statut', 'Stage',
      'stage_structure', 'Structure de stage',
      'stage_debut', 'Début du stage',
      'stage_fin', 'Fin du stage',
      'projet_metier', 'Métier visé',
      'projet_situation', 'Situation',
      'projet_note', 'Motivation',
      'orga_heures_semaine', 'Heures de formation par semaine',
      'orga_creneaux', 'Créneaux',
      'orga_objectif', 'Objectif du mois',
      'orga_date_fin_visee', 'Fin de parcours visée'));
  if v_lignes is not null then
    insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu)
    values (new.apprenant_id, new.organisme_id, auth.uid(), 'coaching', 'Coaching mis à jour' || E'\n' || v_lignes);
  end if;
  return null;
end;
$$;

create trigger coaching_commentaire
  after insert or update on public.coaching
  for each row execute function prive.commenter_coaching();

-- Examen (partie « Examen » du coaching, rangée sur la fiche apprenant)
create or replace function prive.commenter_examen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lignes text;
begin
  v_lignes := prive.champs_modifies(
    jsonb_build_object('date_examen', old.date_examen, 'presence_examen', old.presence_examen, 'resultat_examen', old.resultat_examen),
    jsonb_build_object('date_examen', new.date_examen, 'presence_examen', new.presence_examen, 'resultat_examen', new.resultat_examen),
    jsonb_build_object('date_examen', 'Date d''examen', 'presence_examen', 'Présence à l''examen', 'resultat_examen', 'Résultat de l''examen'));
  -- Pas de commentaire pour un import en masse fait par une autre voie que la fiche :
  -- seulement quand une personne connectée modifie.
  if v_lignes is not null and auth.uid() is not null then
    insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu)
    values (new.id, new.organisme_id, auth.uid(), 'coaching', 'Examen mis à jour' || E'\n' || v_lignes);
  end if;
  return null;
end;
$$;

create trigger apprenants_commentaire_examen
  after update of date_examen, presence_examen, resultat_examen on public.apprenants
  for each row execute function prive.commenter_examen();

-- -----------------------------------------------------------------------------
-- Droits et cloisonnement
-- -----------------------------------------------------------------------------

revoke all on public.commentaires from anon;
grant select, insert, delete on public.commentaires to authenticated;
alter table public.commentaires enable row level security;

create policy commentaires_admin on public.commentaires
  for all to authenticated
  using (prive.est_admin())
  with check (prive.est_admin());

create policy commentaires_appelante_lecture on public.commentaires
  for select to authenticated
  using (prive.apprenant_confie(apprenant_id));

create policy commentaires_appelante_ecriture on public.commentaires
  for insert to authenticated
  with check (prive.apprenant_confie(apprenant_id) and source = 'manuel');

-- -----------------------------------------------------------------------------
-- Reprise de l'existant : appels et notes internes déjà saisis
-- -----------------------------------------------------------------------------

insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu, cree_le)
select ap.apprenant_id, ap.organisme_id, ap.auteur_id, 'appel',
  concat_ws(E'\n',
    prive.libelle(ap.canal::text) || ' · ' || prive.libelle(ap.resultat::text),
    nullif(ap.note_client, ''),
    case when ap.prochaine_action is not null or ap.date_prochaine_action is not null
      then 'Suite : ' || concat_ws(' le ', ap.prochaine_action, to_char(ap.date_prochaine_action, 'DD/MM/YYYY')) end),
  ap.date_appel
from public.appels ap;

insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu, cree_le)
select ap.apprenant_id, ap.organisme_id, ap.auteur_id, 'note_interne', n.contenu, ap.date_appel + interval '1 second'
from public.notes_internes n
join public.appels ap on ap.id = n.appel_id;
