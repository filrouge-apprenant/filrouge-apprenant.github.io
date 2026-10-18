-- =============================================================================
-- Comptes rendus pour l'organisme (onglet « Compte rendu organisme »)
-- =============================================================================
-- Texte libre écrit par l'équipe Fil Rouge pour l'organisme client, à partir
-- d'un appel ou du coaching. Contrairement aux commentaires, il EST visible
-- par le client (son dossier uniquement).
--   - administratrice : tout ;
--   - appelante       : lit et écrit pour ses apprenants confiés ;
--   - client          : lit les comptes rendus de SES apprenants, n'écrit rien.
-- Chaque compte rendu publié s'ajoute aussi au fil de commentaires interne.
-- =============================================================================

alter type public.source_commentaire add value if not exists 'compte_rendu';

create table public.comptes_rendus (
  id            uuid primary key default gen_random_uuid(),
  apprenant_id  uuid not null references public.apprenants (id) on delete cascade,
  organisme_id  uuid not null references public.organismes (id) on delete cascade,
  auteur_id     uuid default auth.uid(),
  auteur_nom    text,
  contenu       text not null check (char_length(trim(contenu)) between 1 and 6000),
  cree_le       timestamptz not null default now()
);

comment on table public.comptes_rendus is
  'Comptes rendus de suivi écrits pour l''organisme client : visibles par ce client.';

create index comptes_rendus_apprenant_idx on public.comptes_rendus (apprenant_id, cree_le desc);
create index comptes_rendus_organisme_idx on public.comptes_rendus (organisme_id);

-- Organisme, auteur réel et heure réelle posés par la base.
create or replace function prive.compte_rendu_preparer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select a.organisme_id into new.organisme_id from public.apprenants a where a.id = new.apprenant_id;
  if new.organisme_id is null then
    raise exception 'Apprenant introuvable : %', new.apprenant_id;
  end if;
  if tg_op = 'INSERT' then
    new.auteur_id := coalesce(auth.uid(), new.auteur_id);
    new.cree_le := now();
    select coalesce(nullif(trim(p.nom_affiche), ''), p.email) into new.auteur_nom from public.profils p where p.id = new.auteur_id;
  end if;
  new.contenu := trim(new.contenu);
  return new;
end;
$$;

create trigger comptes_rendus_preparer
  before insert or update on public.comptes_rendus
  for each row execute function prive.compte_rendu_preparer();

create or replace function prive.apprenant_maj_comptes_rendus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.comptes_rendus set organisme_id = new.organisme_id where apprenant_id = new.id;
  return null;
end;
$$;

create trigger apprenants_maj_comptes_rendus
  after update of organisme_id on public.apprenants
  for each row execute function prive.apprenant_maj_comptes_rendus();

create trigger journal_comptes_rendus after insert or update or delete on public.comptes_rendus
  for each row execute function prive.journaliser();

-- Copie dans le fil de commentaires interne.
create or replace function prive.commenter_compte_rendu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.commentaires (apprenant_id, organisme_id, auteur_id, source, contenu, cree_le)
  values (new.apprenant_id, new.organisme_id, new.auteur_id, 'compte_rendu', new.contenu, new.cree_le);
  return null;
end;
$$;

create trigger comptes_rendus_commentaire
  after insert on public.comptes_rendus
  for each row execute function prive.commenter_compte_rendu();

-- Droits et cloisonnement
revoke all on public.comptes_rendus from anon;
grant select, insert, delete on public.comptes_rendus to authenticated;
alter table public.comptes_rendus enable row level security;

create policy comptes_rendus_admin on public.comptes_rendus
  for all to authenticated
  using (prive.est_admin())
  with check (prive.est_admin());

create policy comptes_rendus_client_lecture on public.comptes_rendus
  for select to authenticated
  using (organisme_id = prive.organisme_actuel());

create policy comptes_rendus_appelante_lecture on public.comptes_rendus
  for select to authenticated
  using (prive.apprenant_confie(apprenant_id));

create policy comptes_rendus_appelante_ecriture on public.comptes_rendus
  for insert to authenticated
  with check (prive.apprenant_confie(apprenant_id));
