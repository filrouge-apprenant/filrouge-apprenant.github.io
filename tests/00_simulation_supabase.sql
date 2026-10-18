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

-- Supabase donne par défaut des droits à anon et authenticated sur les
-- nouvelles tables : on reproduit ce comportement pour tester qu'on les retire.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Coffre-fort (Vault) et appels web (pg_net) : de quoi tester les relances.
create schema if not exists vault;
create table vault.secrets_test (name text primary key, decrypted_secret text);
create view vault.decrypted_secrets as select name, decrypted_secret from vault.secrets_test;
create schema if not exists net;
create table net.requetes_test (id bigserial primary key, url text, headers jsonb, body jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$
  insert into net.requetes_test (url, headers, body) values (url, headers, body) returning id
$$;
