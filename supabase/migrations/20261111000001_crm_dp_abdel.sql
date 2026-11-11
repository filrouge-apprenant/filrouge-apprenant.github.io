-- CRM de prospection DP Abdel (11/11/2026) : appliqué sur le projet Supabase.
-- Tables séparées de Fil Rouge, réservées aux comptes de prive.abdel_membres,
-- avec double authentification (aal2). Voir app/dp-abdel/.

create table if not exists prive.abdel_membres (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ajoute_le timestamptz not null default now()
);
revoke all on prive.abdel_membres from anon, authenticated;

create or replace function prive.abdel_autorise()
returns boolean language sql stable security definer set search_path to ''
as $$
  select coalesce(
    exists (select 1 from prive.abdel_membres m where m.user_id = auth.uid())
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2',
    false)
$$;
revoke all on function prive.abdel_autorise() from public, anon;
grant execute on function prive.abdel_autorise() to authenticated;

create or replace function public.abdel_suis_membre()
returns boolean language sql stable security definer set search_path to ''
as $$ select exists (select 1 from prive.abdel_membres m where m.user_id = auth.uid()) $$;
revoke all on function public.abdel_suis_membre() from public, anon;
grant execute on function public.abdel_suis_membre() to authenticated;

create or replace function prive.abdel_horodatage()
returns trigger language plpgsql set search_path to ''
as $$ begin new.modifie_le := now(); return new; end $$;

create table if not exists public.abdel_prospects (
  id text primary key check (length(id) between 4 and 64),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 250000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create table if not exists public.abdel_appels_offres (
  id text primary key check (length(id) between 4 and 64),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 100000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create table if not exists public.abdel_parametres (
  id text primary key check (id = 'main'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  modifie_le timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['abdel_prospects','abdel_appels_offres','abdel_parametres'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists abdel_acces on public.%I', t);
    execute format('create policy abdel_acces on public.%I for all to authenticated using (prive.abdel_autorise()) with check (prive.abdel_autorise())', t);
    execute format('drop trigger if exists abdel_horodatage on public.%I', t);
    execute format('create trigger abdel_horodatage before update on public.%I for each row execute function prive.abdel_horodatage()', t);
  end loop;
end $$;

insert into prive.abdel_membres (user_id)
select id from auth.users where email = 'emilie.rachas@gmail.com'
on conflict do nothing;
