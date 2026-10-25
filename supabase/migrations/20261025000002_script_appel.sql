-- =============================================================================
-- Script d'appel guidé (#/script)
-- =============================================================================
-- L'appelante déroule le script de suivi en cliquant des réponses (QCM) et en
-- complétant des champs libres. À la fin, elle choisit :
--   - « Générer le commentaire » : un texte rédigé à partir des réponses ;
--   - « Garder les réponses seulement » : la liste brute des réponses.
-- Dans les deux cas l'appel est enregistré comme d'habitude (historique,
-- compteur remis à zéro, suite prévue) et les réponses sont conservées ici
-- pour mesurer si le script fonctionne mieux que la saisie classique.
--
-- Données internes : jamais visibles par un client (même règle que les notes
-- internes), car les réponses peuvent contenir des éléments personnels.
-- =============================================================================

create table if not exists public.appels_script (
  appel_id        uuid primary key references public.appels (id) on delete cascade,
  apprenant_id    uuid not null references public.apprenants (id) on delete cascade,
  mode            text not null check (mode in ('commentaire', 'reponses')),
  reponses        jsonb not null default '{}'::jsonb,
  duree_secondes  integer check (duree_secondes is null or duree_secondes between 0 and 14400),
  cree_le         timestamptz not null default now()
);

comment on table public.appels_script is
  'Réponses du script d''appel guidé. Équipe Fil Rouge uniquement : jamais visible par un client.';

create index if not exists appels_script_apprenant_idx on public.appels_script (apprenant_id, cree_le desc);
create index if not exists appels_script_cree_idx on public.appels_script (cree_le desc);

alter table public.appels_script enable row level security;

drop policy if exists appels_script_admin on public.appels_script;
create policy appels_script_admin on public.appels_script
  for all to authenticated using (prive.est_admin()) with check (prive.est_admin());

drop policy if exists appels_script_appelante_lecture on public.appels_script;
create policy appels_script_appelante_lecture on public.appels_script
  for select to authenticated using (prive.appel_de_l_appelante(appel_id));

revoke all on public.appels_script from anon;
grant select on public.appels_script to authenticated;

create trigger journal_appels_script after insert or update or delete on public.appels_script
  for each row execute function prive.journaliser();

-- Enregistre l'appel (via enregistrer_appel, qui vérifie les droits) puis ses réponses.
create or replace function public.enregistrer_appel_script(
  p_apprenant             uuid,
  p_statuts               text[],
  p_commentaire           text,
  p_mode                  text,
  p_reponses              jsonb,
  p_prochaine_action      text default null,
  p_date_prochaine_action date default null,
  p_duree_secondes        integer default null,
  p_publier               boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_mode not in ('commentaire', 'reponses') then
    raise exception 'Mode inconnu.' using errcode = 'P0001';
  end if;
  if p_reponses is null or jsonb_typeof(p_reponses) <> 'object' or pg_column_size(p_reponses) > 20000 then
    raise exception 'Réponses du script invalides.' using errcode = 'P0001';
  end if;

  -- Droits, statuts, compteur, publication : tout passe par la fonction existante.
  v_id := public.enregistrer_appel(
    p_apprenant, p_statuts, p_commentaire, p_prochaine_action, p_date_prochaine_action,
    'telephone'::public.canal_appel, now(), p_publier);

  insert into public.appels_script (appel_id, apprenant_id, mode, reponses, duree_secondes)
  values (v_id, p_apprenant, p_mode, p_reponses,
          case when p_duree_secondes between 0 and 14400 then p_duree_secondes end);

  return v_id;
end;
$$;

revoke all on function public.enregistrer_appel_script(uuid, text[], text, text, jsonb, text, date, integer, boolean) from public, anon;
grant execute on function public.enregistrer_appel_script(uuid, text[], text, text, jsonb, text, date, integer, boolean) to authenticated;
