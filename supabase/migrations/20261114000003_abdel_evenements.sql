-- CRM Abdel : calendrier des événements (14/11/2026).
-- Événements de Bordeaux Métropole qui peuvent avoir besoin de sécurité ou de nettoyage,
-- filtrés selon la taille de l'équipe d'Abdel (6 agents). Mêmes règles d'accès que les autres tables abdel_*.
-- Incluse automatiquement dans la sauvegarde hebdomadaire (toutes les tables public.abdel_*).

create table if not exists public.abdel_evenements (
  id text primary key check (length(id) between 4 and 64),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 100000),
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.abdel_evenements enable row level security;
revoke all on public.abdel_evenements from anon;
grant select, insert, update, delete on public.abdel_evenements to authenticated;
drop policy if exists abdel_acces on public.abdel_evenements;
create policy abdel_acces on public.abdel_evenements for all to authenticated using (prive.abdel_autorise()) with check (prive.abdel_autorise());
drop trigger if exists abdel_horodatage on public.abdel_evenements;
create trigger abdel_horodatage before update on public.abdel_evenements for each row execute function prive.abdel_horodatage();
