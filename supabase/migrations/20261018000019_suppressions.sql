-- =============================================================================
-- Effacer un commentaire, où qu'il soit (administratrice)
-- =============================================================================
-- L'administratrice peut déjà supprimer commentaires, comptes rendus, appels et
-- notes internes (ses droits « tout »). Ici, on garde le fil de commentaires
-- cohérent : quand l'original disparaît, sa copie automatique disparaît aussi.
--   - appel supprimé          -> son commentaire « Appel » et sa note interne copiée ;
--   - note interne supprimée  -> sa copie dans le fil ;
--   - compte rendu supprimé   -> sa copie dans le fil.
-- =============================================================================

create or replace function prive.effacer_copie_appel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.commentaires
  where apprenant_id = old.apprenant_id
    and ((source = 'appel' and cree_le = old.date_appel)
      or (source = 'note_interne' and cree_le = old.date_appel + interval '1 second'));
  return null;
end;
$$;

create trigger appels_effacer_copie
  after delete on public.appels
  for each row execute function prive.effacer_copie_appel();

create or replace function prive.effacer_copie_note_interne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appel record;
begin
  select ap.apprenant_id, ap.date_appel into v_appel from public.appels ap where ap.id = old.appel_id;
  if v_appel.apprenant_id is null then
    return null; -- l'appel entier est supprimé : déjà traité
  end if;
  delete from public.commentaires
  where apprenant_id = v_appel.apprenant_id
    and source = 'note_interne'
    and cree_le = v_appel.date_appel + interval '1 second';
  return null;
end;
$$;

create trigger notes_internes_effacer_copie
  after delete on public.notes_internes
  for each row execute function prive.effacer_copie_note_interne();

create or replace function prive.effacer_copie_compte_rendu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.commentaires
  where apprenant_id = old.apprenant_id
    and source = 'compte_rendu'
    and cree_le = old.cree_le
    and contenu = old.contenu;
  return null;
end;
$$;

create trigger comptes_rendus_effacer_copie
  after delete on public.comptes_rendus
  for each row execute function prive.effacer_copie_compte_rendu();
