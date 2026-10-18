-- =============================================================================
-- Satisfaction : envoi déclenché par l'administratrice, réponses privées
-- jusqu'à ce qu'elle les débloque pour le client (appliquée le 18/10/2026).
-- =============================================================================
alter table public.satisfaction alter column envoye_le drop not null;
alter table public.satisfaction alter column envoye_le drop default;
alter table public.satisfaction alter column organisme_id drop not null;
alter table public.satisfaction add column lu_le timestamptz;
alter table public.satisfaction add column partage_client boolean not null default false;
alter table public.satisfaction add column partage_le timestamptz;
comment on column public.satisfaction.partage_client is 'Réponse débloquée par l''administratrice : visible par le client et incluse dans le récap. Faux par défaut.';

-- Ancienne création en masse : plus utilisée (l'envoi se fait élève par élève)
revoke execute on function public.creer_invitations_satisfaction(uuid) from authenticated;

create or replace function prive.satisfaction_fixe_organisme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select a.organisme_id into new.organisme_id from public.apprenants a where a.id = new.apprenant_id;
  if new.organisme_id is null then raise exception 'Apprenant introuvable'; end if;
  return new;
end $$;

-- Admin : lien personnel de l'apprenant (réutilise le lien en attente, sinon en crée un)
create or replace function public.preparer_questionnaire(p_apprenant uuid)
returns table(id uuid, lien text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_jeton uuid;
begin
  if not prive.est_admin() then raise exception 'Réservé à l''administratrice'; end if;
  select s.id, s.jeton into v_id, v_jeton from public.satisfaction s
    where s.apprenant_id = p_apprenant and s.repondu_le is null order by s.cree_le desc limit 1;
  if v_id is null then
    insert into public.satisfaction(apprenant_id) values (p_apprenant) returning satisfaction.id, satisfaction.jeton into v_id, v_jeton;
  end if;
  return query select v_id, 'https://filrouge-apprenant.github.io/questionnaire.html?j=' || v_jeton::text;
end $$;
revoke all on function public.preparer_questionnaire(uuid) from public, anon;
grant execute on function public.preparer_questionnaire(uuid) to authenticated;

-- Client : uniquement les réponses débloquées de son organisme
create or replace function public.satisfaction_resultats()
returns table(repondu_le timestamptz, apprenant text, note_globale smallint, note_ecoute smallint,
  note_clarte smallint, note_utilite smallint, frequence text, recommandation smallint,
  point_fort text, amelioration text)
language sql stable security definer set search_path = '' as $$
  select s.repondu_le,
         case when s.anonyme then 'Anonyme' else concat_ws(' ', a.prenom, a.nom) end,
         s.note_globale, s.note_ecoute, s.note_clarte, s.note_utilite, s.frequence,
         s.recommandation, s.point_fort, s.amelioration
  from public.satisfaction s join public.apprenants a on a.id = s.apprenant_id
  where s.repondu_le is not null and s.partage_client
    and s.organisme_id = prive.organisme_actuel()
  order by s.repondu_le desc;
$$;
