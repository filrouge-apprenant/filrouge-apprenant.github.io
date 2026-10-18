-- =============================================================================
-- Coaching : champs libres + un seul commentaire de synthèse
-- =============================================================================
-- 1. Trois champs libres sur la fiche de coaching (visibles par l'organisme,
--    comme le reste du coaching) : stage_note, examen_note, orga_note.
-- 2. Le fil de commentaires ne reçoit plus un commentaire par partie : un seul
--    commentaire « Coaching » reprend Stage, Examen, Projet et Organisation.
--    Le même jour et pour la même personne, il est mis à jour (et remonte en
--    tête du fil) au lieu d'en créer un nouveau.
-- =============================================================================

alter table public.coaching
  add column stage_note  text check (char_length(stage_note)  <= 2000),
  add column examen_note text check (char_length(examen_note) <= 2000),
  add column orga_note   text check (char_length(orga_note)   <= 2000);

comment on column public.coaching.stage_note  is 'Stage : texte libre (visible par l''organisme).';
comment on column public.coaching.examen_note is 'Examen : texte libre (visible par l''organisme).';
comment on column public.coaching.orga_note   is 'Organisation : texte libre (visible par l''organisme).';

-- Texte de synthèse du coaching d'un apprenant (parties vides omises).
create or replace function prive.synthese_coaching(p_apprenant uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.coaching;
  a public.apprenants;
  v_parties text[] := '{}';
  v_lignes text;
begin
  select * into c from public.coaching where apprenant_id = p_apprenant;
  select * into a from public.apprenants where id = p_apprenant;

  -- Stage
  v_lignes := concat_ws(E'\n',
    case when c.stage_statut is not null and c.stage_statut <> 'non_concerne' then '• ' || prive.libelle(c.stage_statut::text) end,
    case when c.stage_debut is not null or c.stage_fin is not null then
      '• ' || concat_ws(' ', 'Du ' || to_char(c.stage_debut, 'DD/MM/YYYY'), 'au ' || to_char(c.stage_fin, 'DD/MM/YYYY')) end,
    case when nullif(c.stage_note, '') is not null then '• ' || c.stage_note end);
  if nullif(v_lignes, '') is not null then v_parties := v_parties || ('STAGE' || E'\n' || v_lignes); end if;

  -- Examen
  v_lignes := concat_ws(E'\n',
    case when a.date_examen is not null then '• Le ' || to_char(a.date_examen, 'DD/MM/YYYY')
      || coalesce(' · ' || prive.libelle(a.presence_examen::text), '')
      || coalesce(' · ' || prive.libelle(a.resultat_examen::text), '') end,
    case when nullif(c.examen_note, '') is not null then '• ' || c.examen_note end);
  if nullif(v_lignes, '') is not null then v_parties := v_parties || ('EXAMEN' || E'\n' || v_lignes); end if;

  -- Projet
  v_lignes := concat_ws(E'\n',
    case when nullif(c.projet_metier, '') is not null then '• Métier visé : ' || c.projet_metier end,
    case when c.projet_situation is not null then '• ' || prive.libelle(c.projet_situation::text) end,
    case when nullif(c.projet_note, '') is not null then '• ' || c.projet_note end);
  if nullif(v_lignes, '') is not null then v_parties := v_parties || ('PROJET' || E'\n' || v_lignes); end if;

  -- Organisation
  v_lignes := concat_ws(E'\n',
    case when c.orga_heures_semaine is not null then '• ' || c.orga_heures_semaine || ' h par semaine' end,
    case when nullif(c.orga_creneaux, '') is not null then '• Créneaux : ' || c.orga_creneaux end,
    case when nullif(c.orga_objectif, '') is not null then '• Objectif du mois : ' || c.orga_objectif end,
    case when c.orga_date_fin_visee is not null then '• Fin de parcours visée : ' || to_char(c.orga_date_fin_visee, 'DD/MM/YYYY') end,
    case when nullif(c.orga_note, '') is not null then '• ' || c.orga_note end);
  if nullif(v_lignes, '') is not null then v_parties := v_parties || ('ORGANISATION' || E'\n' || v_lignes); end if;

  return nullif(array_to_string(v_parties, E'\n\n'), '');
end;
$$;

-- Écrit (ou met à jour) le commentaire de synthèse du jour pour la personne connectée.
create or replace function prive.ecrire_synthese_coaching(p_apprenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texte text;
  v_id uuid;
begin
  v_texte := prive.synthese_coaching(p_apprenant);
  if v_texte is null then
    return;
  end if;
  v_texte := 'Coaching' || E'\n\n' || v_texte;

  select cm.id into v_id
  from public.commentaires cm
  where cm.apprenant_id = p_apprenant
    and cm.source = 'coaching'
    and cm.auteur_id is not distinct from auth.uid()
    and (cm.cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
  order by cm.cree_le desc
  limit 1;

  if v_id is not null then
    update public.commentaires set contenu = v_texte, cree_le = now() where id = v_id;
  else
    insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu)
    select p_apprenant, a.organisme_id, auth.uid(), 'coaching', v_texte
    from public.apprenants a where a.id = p_apprenant;
  end if;
end;
$$;

revoke all on function prive.synthese_coaching(uuid) from public, anon, authenticated;
revoke all on function prive.ecrire_synthese_coaching(uuid) from public, anon, authenticated;

-- Coaching modifié (en ignorant la seule date de modification)
create or replace function prive.commenter_coaching()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'modifie_le' - 'organisme_id') = (to_jsonb(new) - 'modifie_le' - 'organisme_id') then
    return null;
  end if;
  perform prive.ecrire_synthese_coaching(new.apprenant_id);
  return null;
end;
$$;

-- Examen modifié depuis la plateforme
create or replace function prive.commenter_examen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (old.date_examen, old.presence_examen, old.resultat_examen)
         is distinct from (new.date_examen, new.presence_examen, new.resultat_examen) then
    perform prive.ecrire_synthese_coaching(new.id);
  end if;
  return null;
end;
$$;
