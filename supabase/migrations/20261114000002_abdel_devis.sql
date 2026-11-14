-- Devis du CRM Abdel (étape 1 : onglet Devis dans la fiche). Appliquée le 14/11/2026.
create table if not exists public.abdel_devis (
  id text primary key,
  prospect_id text not null,
  data jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
create index if not exists abdel_devis_prospect on public.abdel_devis (prospect_id);
alter table public.abdel_devis enable row level security;
drop policy if exists abdel_acces on public.abdel_devis;
create policy abdel_acces on public.abdel_devis for all to authenticated
  using (prive.abdel_autorise()) with check (prive.abdel_autorise());
revoke all on public.abdel_devis from anon;
grant select, insert, update, delete on public.abdel_devis to authenticated;
create or replace function prive.abdel_devis_modifie() returns trigger language plpgsql set search_path = '' as $$
begin new.modifie_le := now(); return new; end $$;
drop trigger if exists abdel_devis_modifie on public.abdel_devis;
create trigger abdel_devis_modifie before update on public.abdel_devis for each row execute function prive.abdel_devis_modifie();
