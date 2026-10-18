-- =============================================================================
-- Questionnaire de satisfaction apprenant (appliquée le 18/10/2026)
-- Un lien personnel (jeton) par apprenant, une seule réponse par lien.
-- La page publique app/questionnaire.html ne peut appeler que
-- questionnaire_infos() et questionnaire_repondre().
-- =============================================================================
create table public.satisfaction (
  id uuid primary key default gen_random_uuid(),
  jeton uuid not null unique default gen_random_uuid(),
  apprenant_id uuid not null references public.apprenants(id) on delete cascade,
  organisme_id uuid not null references public.organismes(id),
  envoye_le timestamptz not null default now(),
  repondu_le timestamptz,
  note_globale smallint check (note_globale between 1 and 5),
  note_ecoute smallint check (note_ecoute between 1 and 5),
  note_clarte smallint check (note_clarte between 1 and 5),
  note_utilite smallint check (note_utilite between 1 and 5),
  frequence text check (frequence in ('pas_assez','juste','trop')),
  recommandation smallint check (recommandation between 0 and 10),
  point_fort text check (char_length(point_fort) <= 1000),
  amelioration text check (char_length(amelioration) <= 1000),
  anonyme boolean not null default false,
  cree_le timestamptz not null default now()
);
comment on table public.satisfaction is 'Questionnaires de satisfaction apprenants. Lecture client uniquement via satisfaction_resultats() (respect de l''anonymat).';
create index satisfaction_organisme_idx on public.satisfaction(organisme_id);
create index satisfaction_apprenant_idx on public.satisfaction(apprenant_id);

alter table public.satisfaction enable row level security;
create policy satisfaction_admin on public.satisfaction for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());

-- L'organisme est toujours celui de l'apprenant
create or replace function prive.satisfaction_fixe_organisme() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select a.organisme_id into new.organisme_id from public.apprenants a where a.id = new.apprenant_id;
  return new;
end $$;
create trigger satisfaction_fixe_organisme before insert or update of apprenant_id on public.satisfaction
  for each row execute function prive.satisfaction_fixe_organisme();

-- Page publique : infos d'accueil à partir du jeton
create or replace function public.questionnaire_infos(p_jeton uuid)
returns table(prenom text, organisme text, deja_repondu boolean)
language sql stable security definer set search_path = '' as $$
  select a.prenom, o.nom, s.repondu_le is not null
  from public.satisfaction s
  join public.apprenants a on a.id = s.apprenant_id
  join public.organismes o on o.id = s.organisme_id
  where s.jeton = p_jeton;
$$;

-- Page publique : enregistrement de la réponse (une seule fois par jeton)
create or replace function public.questionnaire_repondre(
  p_jeton uuid, p_note_globale int, p_note_ecoute int, p_note_clarte int, p_note_utilite int,
  p_frequence text, p_recommandation int, p_point_fort text, p_amelioration text, p_anonyme boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_note_globale is null then raise exception 'La note globale est obligatoire'; end if;
  update public.satisfaction set
    repondu_le = now(),
    note_globale = p_note_globale, note_ecoute = p_note_ecoute, note_clarte = p_note_clarte,
    note_utilite = p_note_utilite, frequence = nullif(p_frequence,''), recommandation = p_recommandation,
    point_fort = nullif(trim(p_point_fort),''), amelioration = nullif(trim(p_amelioration),''),
    anonyme = coalesce(p_anonyme,false)
  where jeton = p_jeton and repondu_le is null;
  if not found then raise exception 'Lien invalide ou questionnaire déjà rempli'; end if;
  return true;
end $$;

-- Admin : crée un lien pour chaque apprenant ayant un email et sans questionnaire en attente
create or replace function public.creer_invitations_satisfaction(p_organisme uuid default null)
returns table(organisme text, prenom text, nom text, email text, lien text)
language plpgsql security definer set search_path = '' as $$
begin
  if not prive.est_admin() then raise exception 'Réservé à l''administratrice'; end if;
  insert into public.satisfaction(apprenant_id, organisme_id)
  select a.id, a.organisme_id from public.apprenants a
  where a.email is not null and trim(a.email) <> ''
    and (p_organisme is null or a.organisme_id = p_organisme)
    and not exists (select 1 from public.satisfaction s where s.apprenant_id = a.id and s.repondu_le is null);
  return query
  select o.nom, a.prenom, a.nom, a.email,
         'https://filrouge-apprenant.github.io/questionnaire.html?j=' || s.jeton::text
  from public.satisfaction s
  join public.apprenants a on a.id = s.apprenant_id
  join public.organismes o on o.id = s.organisme_id
  where s.repondu_le is null and (p_organisme is null or s.organisme_id = p_organisme)
  order by o.nom, a.nom;
end $$;

-- Client (et admin) : résultats de son organisme, nom masqué si l'apprenant a choisi l'anonymat
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
  where s.repondu_le is not null
    and (prive.est_admin() or s.organisme_id = prive.organisme_actuel())
  order by s.repondu_le desc;
$$;

revoke all on function public.questionnaire_infos(uuid) from public;
revoke all on function public.questionnaire_repondre(uuid,int,int,int,int,text,int,text,text,boolean) from public;
revoke all on function public.creer_invitations_satisfaction(uuid) from public, anon;
revoke all on function public.satisfaction_resultats() from public, anon;
grant execute on function public.questionnaire_infos(uuid) to anon, authenticated;
grant execute on function public.questionnaire_repondre(uuid,int,int,int,int,text,int,text,text,boolean) to anon, authenticated;
grant execute on function public.creer_invitations_satisfaction(uuid) to authenticated;
grant execute on function public.satisfaction_resultats() to authenticated;
