-- Sauvegarde automatique hebdomadaire (Fil Rouge et Abdel), gardée dans un schéma privé (appliquée le 14/11/2026).
-- Protège contre une suppression ou une erreur dans les applis ; ne remplace pas l'export téléchargé.
create extension if not exists pg_cron;

create table if not exists prive.sauvegardes (
  id bigserial primary key,
  faite_le timestamptz not null default now(),
  perimetre text not null check (perimetre in ('abdel', 'filrouge')),
  donnees jsonb not null,
  lignes integer not null default 0
);
revoke all on prive.sauvegardes from anon, authenticated;

create or replace function prive.sauvegarde_hebdo()
returns void language plpgsql security definer set search_path to ''
as $$
declare
  t text; contenu jsonb; lignes_t integer;
  d_abdel jsonb := '{}'; n_abdel integer := 0;
  d_fr jsonb := '{}'; n_fr integer := 0;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*) from public.%I x', t) into contenu, lignes_t;
    if t like 'abdel\_%' then d_abdel := d_abdel || jsonb_build_object(t, contenu); n_abdel := n_abdel + lignes_t;
    else d_fr := d_fr || jsonb_build_object(t, contenu); n_fr := n_fr + lignes_t; end if;
  end loop;
  insert into prive.sauvegardes (perimetre, donnees, lignes) values ('abdel', d_abdel, n_abdel), ('filrouge', d_fr, n_fr);
  delete from prive.sauvegardes s where s.id in (
    select id from (select id, row_number() over (partition by perimetre order by faite_le desc) rang from prive.sauvegardes) r where r.rang > 8);
end $$;
revoke all on function prive.sauvegarde_hebdo() from public, anon, authenticated;

create or replace function public.abdel_liste_sauvegardes()
returns table (id bigint, faite_le timestamptz, lignes integer)
language sql stable security definer set search_path to ''
as $$ select s.id, s.faite_le, s.lignes from prive.sauvegardes s
      where s.perimetre = 'abdel' and prive.abdel_autorise() order by s.faite_le desc $$;
create or replace function public.abdel_sauvegarde(p_id bigint)
returns jsonb language sql stable security definer set search_path to ''
as $$ select s.donnees from prive.sauvegardes s where s.id = p_id and s.perimetre = 'abdel' and prive.abdel_autorise() $$;
revoke all on function public.abdel_liste_sauvegardes() from public, anon;
revoke all on function public.abdel_sauvegarde(bigint) from public, anon;
grant execute on function public.abdel_liste_sauvegardes() to authenticated;
grant execute on function public.abdel_sauvegarde(bigint) to authenticated;

-- Chaque dimanche à 3 h 17 (heure de Paris en hiver ; 4 h 17 en été).
select cron.unschedule(jobid) from cron.job where jobname = 'sauvegarde-hebdo';
select cron.schedule('sauvegarde-hebdo', '17 2 * * 0', 'select prive.sauvegarde_hebdo()');
select prive.sauvegarde_hebdo();
