-- =============================================================================
-- Accès clients : les comptes rendus publiés pour l'organisme (table
-- comptes_rendus) suivent aussi la case « Comptes rendus d'appel ».
-- =============================================================================

drop policy if exists comptes_rendus_client_lecture on public.comptes_rendus;
create policy comptes_rendus_client_lecture on public.comptes_rendus
  for select to authenticated
  using (organisme_id = prive.organisme_actuel() and (select prive.client_peut('comptes_rendus')));
