-- =============================================================================
-- Appels : publication dans le fil de commentaires seulement sur demande
-- =============================================================================
-- Avant : chaque appel (et sa note) s'ajoutait tout seul au fil de commentaires.
-- Maintenant : rien n'est publié automatiquement. Le bouton « Enregistrer » de
-- l'onglet Statut publie un seul commentaire (statuts + commentaire + suite) ;
-- « Historique seulement » range l'appel sans rien publier.
-- =============================================================================

-- Plus de commentaire automatique à la création d'un appel.
create or replace function prive.commenter_appel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return null;
end;
$$;

-- La note d'un appel ne se publie pas toute seule non plus pendant un enregistrement guidé.
create or replace function prive.commenter_note_interne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appel record;
begin
  if coalesce(current_setting('filrouge.silence', true), '') = 'oui' then
    return null;
  end if;
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

-- Enregistrer un appel depuis l'onglet Statut.
create or replace function public.enregistrer_appel(
  p_apprenant             uuid,
  p_statuts               text[],
  p_commentaire           text default null,
  p_prochaine_action      text default null,
  p_date_prochaine_action date default null,
  p_canal                 public.canal_appel default 'telephone',
  p_date_appel            timestamptz default now(),
  p_publier               boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_statuts text[] := coalesce(p_statuts, '{}');
  v_texte text;
begin
  if not (prive.est_admin() or prive.apprenant_confie(p_apprenant)) then
    raise exception 'Vous ne pouvez pas noter d''appel pour cet apprenant.' using errcode = '42501';
  end if;
  if cardinality(v_statuts) = 0 then
    raise exception 'Choisissez au moins un statut.' using errcode = 'P0001';
  end if;
  if p_date_appel > now() + interval '10 minutes' then
    raise exception 'La date de l''appel ne peut pas être dans le futur.' using errcode = 'P0001';
  end if;

  perform set_config('filrouge.silence', 'oui', true);

  insert into public.appels
    (apprenant_id, organisme_id, auteur_id, date_appel, canal, resultat, statuts, prochaine_action, date_prochaine_action)
  select p_apprenant, a.organisme_id, auth.uid(), p_date_appel, p_canal, prive.resultat_depuis_statuts(v_statuts), v_statuts,
         nullif(trim(p_prochaine_action), ''), p_date_prochaine_action
  from public.apprenants a where a.id = p_apprenant
  returning id into v_id;

  -- Le commentaire de l'appel reste interne (jamais visible par l'organisme).
  if nullif(trim(p_commentaire), '') is not null then
    insert into public.notes_internes (appel_id, contenu) values (v_id, trim(p_commentaire));
  end if;

  perform set_config('filrouge.silence', '', true);

  if p_publier then
    v_texte := concat_ws(E'\n',
      prive.libelle(p_canal::text) || ' · ' || (select string_agg(prive.libelle(x), ' · ') from unnest(v_statuts) as x),
      nullif(trim(p_commentaire), ''),
      case when nullif(trim(p_prochaine_action), '') is not null or p_date_prochaine_action is not null
        then 'Suite : ' || concat_ws(' le ', nullif(trim(p_prochaine_action), ''), to_char(p_date_prochaine_action, 'DD/MM/YYYY')) end);
    insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu, cree_le)
    select p_apprenant, a.organisme_id, auth.uid(), 'appel', v_texte, p_date_appel
    from public.apprenants a where a.id = p_apprenant;
  end if;

  return v_id;
end;
$$;

revoke all on function public.enregistrer_appel(uuid, text[], text, text, date, public.canal_appel, timestamptz, boolean) from public, anon;
grant execute on function public.enregistrer_appel(uuid, text[], text, text, date, public.canal_appel, timestamptz, boolean) to authenticated;
