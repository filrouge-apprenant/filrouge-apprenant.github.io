-- Espace Abdel (étape 2) : rôle « gérant » limité aux clients transmis.
-- Abdel n'est PAS membre du CRM (prive.abdel_membres) : il ne voit que ce qui suit.
-- Appliquée le 14/11/2026 au soir, à la demande d'Émilie (« je veux qu'il ait accès à tous les rendez-vous et contrats »).
create table if not exists prive.abdel_gerants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ajoute_le timestamptz not null default now()
);
alter table prive.abdel_gerants enable row level security;

create or replace function prive.abdel_gerant() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    exists (select 1 from prive.abdel_gerants g where g.user_id = auth.uid())
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2',
    false)
$$;

-- Une fiche est partagée avec Abdel dès « Rendez-vous programmé » (ou au-delà),
-- ou quand Émilie l'a transmise à la main (data.partageAbdel).
create or replace function prive.abdel_partage(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(d ->> 'status', '') in ('rdv', 'propo', 'devis', 'nego', 'gagne')
      or coalesce(d -> 'reached', '[]'::jsonb) ? 'rdv'
      or coalesce(d ->> 'partageAbdel', '') <> ''
$$;

drop policy if exists abdel_gerant_lecture on public.abdel_prospects;
create policy abdel_gerant_lecture on public.abdel_prospects for select to authenticated
  using (prive.abdel_gerant() and prive.abdel_partage(data));

-- Devis : Abdel voit ceux qu'Émilie a transmis et ceux qu'il a créés lui-même.
drop policy if exists abdel_gerant_devis_lecture on public.abdel_devis;
create policy abdel_gerant_devis_lecture on public.abdel_devis for select to authenticated
  using (prive.abdel_gerant() and (coalesce(data ->> 'transmisAbdel', '') <> '' or data ->> 'auteur' = 'abdel'));
drop policy if exists abdel_gerant_devis_ecriture on public.abdel_devis;
create policy abdel_gerant_devis_ecriture on public.abdel_devis for insert to authenticated
  with check (prive.abdel_gerant() and data ->> 'auteur' = 'abdel'
    and exists (select 1 from public.abdel_prospects p where p.id = prospect_id and prive.abdel_partage(p.data)));
drop policy if exists abdel_gerant_devis_maj on public.abdel_devis;
create policy abdel_gerant_devis_maj on public.abdel_devis for update to authenticated
  using (prive.abdel_gerant() and (coalesce(data ->> 'transmisAbdel', '') <> '' or data ->> 'auteur' = 'abdel'))
  with check (prive.abdel_gerant() and (coalesce(data ->> 'transmisAbdel', '') <> '' or data ->> 'auteur' = 'abdel'));
drop policy if exists abdel_gerant_devis_suppr on public.abdel_devis;
create policy abdel_gerant_devis_suppr on public.abdel_devis for delete to authenticated
  using (prive.abdel_gerant() and data ->> 'auteur' = 'abdel');

-- Qui suis-je ? 'membre' (Émilie, tout le CRM), 'gerant' (Abdel), ou null.
create or replace function public.abdel_mon_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when prive.abdel_autorise() then 'membre' when prive.abdel_gerant() then 'gerant' else null end
$$;
revoke all on function public.abdel_mon_role() from public, anon;
grant execute on function public.abdel_mon_role() to authenticated;

-- Paramètres utiles à l'espace (tarifs, sociétés, rémunération), sans le reste.
create or replace function public.abdel_espace_parametres() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when prive.abdel_autorise() or prive.abdel_gerant() then (
    select jsonb_build_object(
      'rateSecu', data -> 'rateSecu', 'rateNetClient', data -> 'rateNetClient', 'rateNetProduits', data -> 'rateNetProduits',
      'nightCostPct', data -> 'nightCostPct', 'sundayCostPct', data -> 'sundayCostPct',
      'companySecu', data -> 'companySecu', 'companyNet', data -> 'companyNet', 'cnaps', data -> 'cnaps',
      'secuSiret', data -> 'secuSiret', 'secuTva', data -> 'secuTva', 'secuAdresse', data -> 'secuAdresse',
      'netSiret', data -> 'netSiret', 'netTva', data -> 'netTva', 'netAdresse', data -> 'netAdresse',
      'devisConditions', data -> 'devisConditions', 'userName', data -> 'userName', 'userPhone', data -> 'userPhone',
      'commHour', data -> 'commHour', 'commMonths', data -> 'commMonths', 'commRdv', data -> 'commRdv')
    from public.abdel_parametres where id = 'main') end
$$;
revoke all on function public.abdel_espace_parametres() from public, anon;
grant execute on function public.abdel_espace_parametres() to authenticated;

-- Abdel ajoute une note datée à la fiche d'un client partagé (il ne modifie rien d'autre).
create or replace function public.abdel_espace_note(p_id text, p_texte text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_texte text := left(btrim(coalesce(p_texte, '')), 2000);
begin
  if not (prive.abdel_gerant() or prive.abdel_autorise()) then raise exception 'Accès refusé'; end if;
  if v_texte = '' then raise exception 'Note vide'; end if;
  update public.abdel_prospects
     set data = jsonb_set(data, '{history}', coalesce(data -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'type', 'note', 'ts', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'text', v_texte, 'auteur', 'abdel'))),
         modifie_le = now()
   where id = p_id and prive.abdel_partage(data);
  if not found then raise exception 'Fiche introuvable ou non partagée'; end if;
end $$;
revoke all on function public.abdel_espace_note(text, text) from public, anon;
grant execute on function public.abdel_espace_note(text, text) to authenticated;
