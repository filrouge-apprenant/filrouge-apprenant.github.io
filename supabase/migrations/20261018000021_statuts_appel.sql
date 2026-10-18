-- =============================================================================
-- Statut de l'appel : plusieurs statuts possibles pour un même contact
-- =============================================================================
-- Ex. : « Répondeur » + « Email envoyé », ou « Joint·e » + « Suivi 15 jours ».
-- La colonne « resultat » (un seul résultat) est gardée : elle sert aux
-- compteurs (contacts aboutis = joint) et aux relances. Elle est déduite des
-- statuts quand ils sont donnés.
-- =============================================================================

alter table public.appels
  add column statuts text[] not null default '{}'
    check (statuts <@ array['joint', 'repondeur', 'messagerie_impossible', 'faux_numero', 'injoignable',
                            'rendez_vous', 'a_relancer', 'suivi_15', 'suivi_30',
                            'email_envoye', 'sms_envoye', 'refuse_suivi']::text[]);

comment on column public.appels.statuts is
  'Statuts de l''appel (plusieurs possibles). Le résultat principal en est déduit.';

-- Libellés lisibles des nouveaux statuts
create or replace function prive.libelle(p_valeur text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_valeur
    when 'joint' then 'Joint·e'
    when 'messagerie' then 'Message laissé'
    when 'injoignable' then 'Injoignable'
    when 'refuse_suivi' then 'Refuse le suivi'
    when 'repondeur' then 'Répondeur'
    when 'messagerie_impossible' then 'Message vocal impossible'
    when 'faux_numero' then 'Faux numéro'
    when 'rendez_vous' then 'Rendez-vous'
    when 'a_relancer' then 'À relancer'
    when 'suivi_15' then 'Suivi 15 jours'
    when 'suivi_30' then 'Suivi 30 jours'
    when 'email_envoye' then 'Email envoyé'
    when 'sms_envoye' then 'SMS envoyé'
    when 'telephone' then 'Appel'
    when 'sms' then 'SMS'
    when 'email' then 'Email'
    when 'whatsapp' then 'WhatsApp'
    when 'visio' then 'Visio'
    when 'non_concerne' then 'Pas de stage dans ce parcours'
    when 'a_chercher' then 'Stage à trouver'
    when 'structure_trouvee' then 'Structure trouvée'
    when 'convention_envoyee' then 'Convention envoyée, en attente de signature'
    when 'convention_signee' then 'Convention signée'
    when 'en_cours' then 'En stage'
    when 'termine' then 'Stage terminé'
    when 'reconversion' then 'En reconversion'
    when 'en_emploi' then 'En emploi'
    when 'en_recherche' then 'En recherche d''emploi'
    when 'creation_activite' then 'Création d''activité'
    when 'autre' then 'Autre situation'
    when 'present' then 'Présent·e'
    when 'absent' then 'Absent·e'
    when 'reussi' then 'Réussi'
    when 'echoue' then 'Échoué'
    else p_valeur
  end;
$$;

-- Résultat principal déduit des statuts
create or replace function prive.resultat_depuis_statuts(p_statuts text[])
returns public.resultat_appel
language sql
immutable
set search_path = ''
as $$
  select case
    when 'joint' = any(p_statuts) then 'joint'::public.resultat_appel
    when 'refuse_suivi' = any(p_statuts) then 'refuse_suivi'::public.resultat_appel
    when 'repondeur' = any(p_statuts) or 'email_envoye' = any(p_statuts) or 'sms_envoye' = any(p_statuts) then 'messagerie'::public.resultat_appel
    else 'injoignable'::public.resultat_appel
  end;
$$;

-- noter_appel_statuts : comme noter_appel (qui reste en place), avec les statuts.

create or replace function public.noter_appel_statuts(
  p_apprenant             uuid,
  p_canal                 public.canal_appel default 'telephone',
  p_date_appel            timestamptz default now(),
  p_note_client           text default null,
  p_note_interne          text default null,
  p_prochaine_action      text default null,
  p_date_prochaine_action date default null,
  p_statuts               text[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_statuts text[] := coalesce(p_statuts, '{}');
  v_resultat public.resultat_appel;
begin
  if not (prive.est_admin() or prive.apprenant_confie(p_apprenant)) then
    raise exception 'Vous ne pouvez pas noter d''appel pour cet apprenant.' using errcode = '42501';
  end if;
  if p_date_appel > now() + interval '10 minutes' then
    raise exception 'La date de l''appel ne peut pas être dans le futur.' using errcode = 'P0001';
  end if;

  v_resultat := case when cardinality(v_statuts) > 0 then prive.resultat_depuis_statuts(v_statuts) else null end;
  if v_resultat is null then
    raise exception 'Choisissez au moins un statut.' using errcode = 'P0001';
  end if;

  insert into public.appels
    (apprenant_id, organisme_id, auteur_id, date_appel, canal, resultat, statuts, note_client, prochaine_action, date_prochaine_action)
  values
    (p_apprenant, '00000000-0000-0000-0000-000000000000', auth.uid(), p_date_appel, p_canal, v_resultat, v_statuts,
     nullif(trim(p_note_client), ''), nullif(trim(p_prochaine_action), ''), p_date_prochaine_action)
  returning id into v_id;

  if nullif(trim(p_note_interne), '') is not null then
    insert into public.notes_internes (appel_id, contenu) values (v_id, trim(p_note_interne));
  end if;

  return v_id;
end;
$$;

revoke all on function public.noter_appel_statuts(uuid, public.canal_appel, timestamptz, text, text, text, date, text[]) from public, anon;
grant execute on function public.noter_appel_statuts(uuid, public.canal_appel, timestamptz, text, text, text, date, text[]) to authenticated;

-- Commentaire automatique : les statuts plutôt que le seul résultat.
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
    prive.libelle(new.canal::text) || ' · ' ||
      case when cardinality(new.statuts) > 0
        then (select string_agg(prive.libelle(x), ' · ') from unnest(new.statuts) as x)
        else prive.libelle(new.resultat::text) end,
    nullif(new.note_client, ''),
    case when new.prochaine_action is not null or new.date_prochaine_action is not null
      then 'Suite : ' || concat_ws(' le ', new.prochaine_action, to_char(new.date_prochaine_action, 'DD/MM/YYYY')) end);
  insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu, cree_le)
  values (new.apprenant_id, new.organisme_id, coalesce(new.auteur_id, auth.uid()), 'appel', v_texte, new.date_appel);
  return null;
end;
$$;
