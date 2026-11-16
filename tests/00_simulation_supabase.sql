-- =============================================================================
-- Simulation minimale de Supabase, UNIQUEMENT pour les tests locaux.
-- =============================================================================
-- Sur Supabase, tout ceci existe déjà : ce fichier n'est jamais envoyé en
-- production. Il recrée seulement ce dont nos fichiers ont besoin :
--   - les rôles anon, authenticated, service_role
--   - la table auth.users
--   - la fonction auth.uid() (identifiant de la personne connectée)
-- =============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text,
  last_sign_in_at timestamptz
);

-- Même comportement que Supabase : l'identifiant vient du jeton de connexion.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- Contenu complet du jeton de connexion (dont le niveau aal1 / aal2).
create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant execute on function auth.jwt() to anon, authenticated, service_role;

-- auth.role() : rôle de la session (claim « role » du jeton, comme Supabase).
create function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user::text)
$$;
grant execute on function auth.role() to anon, authenticated, service_role;

-- Supabase donne par défaut des droits à anon et authenticated sur les
-- nouvelles tables : on reproduit ce comportement pour tester qu'on les retire.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;


-- Stockage de fichiers (Supabase Storage), pour les migrations qui créent un
-- espace de fichiers et ses règles d'accès (ex. enregistrements audio).
create schema if not exists storage;
grant usage on schema storage to anon, authenticated;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;
