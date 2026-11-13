-- CRM DP Abdel (13/11/2026) : corbeille de l'agent Tri.
-- L'agent Tri y déplace les fiches prospects et les appels d'offres périmés
-- (copie complète + raison) avant de les retirer du CRM. Purge après 30 jours.
-- Même règle d'accès que les autres tables abdel_* (membres + double authentification).

create table if not exists public.abdel_corbeille (
  id text primary key default ('cb_' || replace(gen_random_uuid()::text, '-', '')),
  table_origine text not null check (table_origine in ('abdel_prospects', 'abdel_appels_offres')),
  id_origine text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  raison text not null,
  supprime_le timestamptz not null default now(),
  purge_apres timestamptz not null default (now() + interval '30 days')
);
create index if not exists abdel_corbeille_origine on public.abdel_corbeille (table_origine, id_origine);

alter table public.abdel_corbeille enable row level security;
revoke all on public.abdel_corbeille from anon;
grant select, insert, delete on public.abdel_corbeille to authenticated;
drop policy if exists abdel_acces on public.abdel_corbeille;
create policy abdel_acces on public.abdel_corbeille for all to authenticated
  using (prive.abdel_autorise()) with check (prive.abdel_autorise());
