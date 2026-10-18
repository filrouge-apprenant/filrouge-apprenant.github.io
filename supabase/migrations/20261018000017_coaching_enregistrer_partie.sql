-- =============================================================================
-- Coaching : enregistrer une partie avec le commentaire complet OU seulement
-- le commentaire de cette partie
-- =============================================================================
-- public.enregistrer_coaching(apprenant, partie, mode, valeurs)
--   partie : 'stage' | 'examen' | 'projet' | 'organisation'
--   mode   : 'tout'   -> commentaire de synthèse (Stage + Examen + Projet + Organisation)
--            'partie' -> un commentaire avec seulement cette partie
--   valeurs: les champs de la partie (jsonb)
--
-- Droits vérifiés ici : administratrice, ou appelante pour ses apprenants
-- confiés. Les infos d'examen (date, présence, résultat) restent réservées à
-- l'administratrice, comme sur le reste de la plateforme.
-- Pendant ces écritures, les commentaires automatiques sont mis en pause
-- (réglage « filrouge.silence ») : un seul commentaire est écrit, celui choisi.
-- =============================================================================

-- Texte d'une partie (ou de toutes si p_partie est vide).
create or replace function prive.synthese_coaching(p_apprenant uuid, p_partie text)
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

  if p_partie is null or p_partie = 'stage' then
    v_lignes := concat_ws(E'\n',
      case when c.stage_statut is not null and c.stage_statut <> 'non_concerne' then '• ' || prive.libelle(c.stage_statut::text) end,
      case when c.stage_debut is not null or c.stage_fin is not null then
        '• ' || concat_ws(' ', 'Du ' || to_char(c.stage_debut, 'DD/MM/YYYY'), 'au ' || to_char(c.stage_fin, 'DD/MM/YYYY')) end,
      case when nullif(c.stage_note, '') is not null then '• ' || c.stage_note end);
    if nullif(v_lignes, '') is not null then v_parties := v_parties || ('STAGE' || E'\n' || v_lignes); end if;
  end if;

  if p_partie is null or p_partie = 'examen' then
    v_lignes := concat_ws(E'\n',
      case when a.date_examen is not null then '• Le ' || to_char(a.date_examen, 'DD/MM/YYYY')
        || coalesce(' · ' || prive.libelle(a.presence_examen::text), '')
        || coalesce(' · ' || prive.libelle(a.resultat_examen::text), '') end,
      case when nullif(c.examen_note, '') is not null then '• ' || c.examen_note end);
    if nullif(v_lignes, '') is not null then v_parties := v_parties || ('EXAMEN' || E'\n' || v_lignes); end if;
  end if;

  if p_partie is null or p_partie = 'projet' then
    v_lignes := concat_ws(E'\n',
      case when nullif(c.projet_metier, '') is not null then '• Métier visé : ' || c.projet_metier end,
      case when c.projet_situation is not null then '• ' || prive.libelle(c.projet_situation::text) end,
      case when nullif(c.projet_note, '') is not null then '• ' || c.projet_note end);
    if nullif(v_lignes, '') is not null then v_parties := v_parties || ('PROJET' || E'\n' || v_lignes); end if;
  end if;

  if p_partie is null or p_partie = 'organisation' then
    v_lignes := concat_ws(E'\n',
      case when c.orga_heures_semaine is not null then '• ' || c.orga_heures_semaine || ' h par semaine' end,
      case when nullif(c.orga_creneaux, '') is not null then '• Créneaux : ' || c.orga_creneaux end,
      case when nullif(c.orga_objectif, '') is not null then '• Objectif du mois : ' || c.orga_objectif end,
      case when c.orga_date_fin_visee is not null then '• Fin de parcours visée : ' || to_char(c.orga_date_fin_visee, 'DD/MM/YYYY') end,
      case when nullif(c.orga_note, '') is not null then '• ' || c.orga_note end);
    if nullif(v_lignes, '') is not null then v_parties := v_parties || ('ORGANISATION' || E'\n' || v_lignes); end if;
  end if;

  return nullif(array_to_string(v_parties, E'\n\n'), '');
end;
$$;

-- L'ancienne version (sans partie) appelle la nouvelle.
create or replace function prive.synthese_coaching(p_apprenant uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select prive.synthese_coaching(p_apprenant, null) $$;

revoke all on function prive.synthese_coaching(uuid, text) from public, anon, authenticated;

-- Le commentaire complet du jour se met à jour, sans jamais écraser un
-- commentaire d'une seule partie (« Coaching · Stage », etc.).
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
  v_texte := prive.synthese_coaching(p_apprenant, null);
  if v_texte is null then
    return;
  end if;
  v_texte := 'Coaching' || E'\n\n' || v_texte;

  select cm.id into v_id
  from public.commentaires cm
  where cm.apprenant_id = p_apprenant
    and cm.source = 'coaching'
    and cm.contenu not like 'Coaching · %'
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

revoke all on function prive.ecrire_synthese_coaching(uuid) from public, anon, authenticated;

-- Les commentaires automatiques se taisent pendant un enregistrement guidé.
create or replace function prive.commenter_coaching()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('filrouge.silence', true), '') = 'oui' then
    return null;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'modifie_le' - 'organisme_id') = (to_jsonb(new) - 'modifie_le' - 'organisme_id') then
    return null;
  end if;
  perform prive.ecrire_synthese_coaching(new.apprenant_id);
  return null;
end;
$$;

create or replace function prive.commenter_examen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('filrouge.silence', true), '') = 'oui' then
    return null;
  end if;
  if auth.uid() is not null
     and (old.date_examen, old.presence_examen, old.resultat_examen)
         is distinct from (new.date_examen, new.presence_examen, new.resultat_examen) then
    perform prive.ecrire_synthese_coaching(new.id);
  end if;
  return null;
end;
$$;

create or replace function public.enregistrer_coaching(
  p_apprenant uuid,
  p_partie    text,
  p_mode      text,
  p_valeurs   jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := coalesce(p_valeurs, '{}'::jsonb);
  v_texte text;
begin
  if not (prive.est_admin() or prive.apprenant_confie(p_apprenant)) then
    raise exception 'Vous ne pouvez pas modifier le coaching de cet apprenant.' using errcode = '42501';
  end if;
  if p_partie not in ('stage', 'examen', 'projet', 'organisation') or p_mode not in ('tout', 'partie') then
    raise exception 'Partie ou mode inconnu.' using errcode = '22023';
  end if;

  perform set_config('filrouge.silence', 'oui', true);

  -- La fiche de coaching existe toujours (l'organisme est posé par la base).
  insert into public.coaching (apprenant_id, organisme_id)
  select p_apprenant, a.organisme_id from public.apprenants a where a.id = p_apprenant
  on conflict (apprenant_id) do nothing;

  if p_partie = 'stage' then
    update public.coaching set
      stage_statut = coalesce(nullif(v ->> 'stage_statut', '')::public.statut_stage, 'non_concerne'),
      stage_debut  = nullif(v ->> 'stage_debut', '')::date,
      stage_fin    = nullif(v ->> 'stage_fin', '')::date,
      stage_note   = nullif(trim(v ->> 'stage_note'), '')
    where apprenant_id = p_apprenant;
  elsif p_partie = 'projet' then
    update public.coaching set
      projet_metier    = nullif(trim(v ->> 'projet_metier'), ''),
      projet_situation = nullif(v ->> 'projet_situation', '')::public.situation_projet,
      projet_note      = nullif(trim(v ->> 'projet_note'), '')
    where apprenant_id = p_apprenant;
  elsif p_partie = 'organisation' then
    update public.coaching set
      orga_heures_semaine = nullif(v ->> 'orga_heures_semaine', '')::smallint,
      orga_creneaux       = nullif(trim(v ->> 'orga_creneaux'), ''),
      orga_objectif       = nullif(trim(v ->> 'orga_objectif'), ''),
      orga_date_fin_visee = nullif(v ->> 'orga_date_fin_visee', '')::date,
      orga_note           = nullif(trim(v ->> 'orga_note'), '')
    where apprenant_id = p_apprenant;
  else -- examen
    update public.coaching set examen_note = nullif(trim(v ->> 'examen_note'), '')
    where apprenant_id = p_apprenant;
    -- Date, présence et résultat : administratrice seulement.
    if prive.est_admin() and v ? 'date_examen' then
      update public.apprenants set
        date_examen     = nullif(v ->> 'date_examen', '')::date,
        presence_examen = case when nullif(v ->> 'date_examen', '') is null then null
                               else nullif(v ->> 'presence_examen', '')::public.presence_examen end,
        resultat_examen = case when nullif(v ->> 'date_examen', '') is null or v ->> 'presence_examen' is distinct from 'present' then null
                               else nullif(v ->> 'resultat_examen', '')::public.resultat_examen end
      where id = p_apprenant;
    end if;
  end if;

  perform set_config('filrouge.silence', '', true);

  if p_mode = 'tout' then
    perform prive.ecrire_synthese_coaching(p_apprenant);
  else
    v_texte := prive.synthese_coaching(p_apprenant, p_partie);
    insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu)
    select p_apprenant, a.organisme_id, auth.uid(), 'coaching',
           'Coaching · ' || initcap(p_partie) || E'\n\n' || coalesce(v_texte, upper(p_partie) || E'\n• (rien de renseigné)')
    from public.apprenants a where a.id = p_apprenant;
  end if;
end;
$$;

revoke all on function public.enregistrer_coaching(uuid, text, text, jsonb) from public, anon;
grant execute on function public.enregistrer_coaching(uuid, text, text, jsonb) to authenticated;
