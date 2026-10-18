-- =============================================================================
-- Notes internes écrites directement (onglet « Notes internes » de la fiche)
-- =============================================================================
-- Une note interne peut maintenant s'écrire sans appel : elle est rangée dans
-- le fil de commentaires (source « note_interne ») et apparaît aussitôt dans
-- le bandeau de droite. Toujours réservé à l'équipe Fil Rouge.
--
-- Écriture directe (pas depuis un automatisme) : la base impose l'auteur réel
-- et l'heure réelle, quelle que soit la source.
-- =============================================================================

create or replace function prive.commentaire_preparer()
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
    -- pg_trigger_depth() = 1 : écrit directement par une personne connectée
    -- (et non par l'automatisme d'un appel, d'une note d'appel ou du coaching).
    if pg_trigger_depth() = 1 and auth.uid() is not null then
      new.auteur_id := auth.uid();
      new.cree_le := now();
    end if;
    if new.auteur_nom is null and new.auteur_id is not null then
      select coalesce(nullif(trim(p.nom_affiche), ''), p.email) into new.auteur_nom from public.profils p where p.id = new.auteur_id;
    end if;
  end if;
  new.contenu := trim(new.contenu);
  return new;
end;
$$;

drop policy if exists commentaires_appelante_ecriture on public.commentaires;
create policy commentaires_appelante_ecriture on public.commentaires
  for insert to authenticated
  with check (prive.apprenant_confie(apprenant_id) and source in ('manuel', 'note_interne'));
