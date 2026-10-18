-- =============================================================================
-- Comptabilité : tâches programmées et rangement des contrats PDF
-- =============================================================================
-- (Fichier séparé : il utilise des services propres à Supabase — tâches
-- programmées, appels web, stockage de fichiers — absents de la base de test.)
--
--   Le 1er de chaque mois à 7 h (Paris) : échéances du mois écoulé.
--   Aucune relance automatique : la plateforme alerte, l'administratrice relance.
--   Dossier « contrats » : PDF signés, lisibles par l'administratrice seule.
-- =============================================================================

create extension if not exists pg_cron;

-- Heure de cron en UTC : 5 h UTC = 7 h à Paris l'été, 6 h l'hiver.
select cron.schedule('fil-rouge-echeances-mensuelles', '0 5 1 * *', $$select prive.generer_echeances_mois_ecoule()$$);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contrats', 'contrats', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy contrats_pdf_admin_lecture on storage.objects for select to authenticated
  using (bucket_id = 'contrats' and prive.est_admin());
create policy contrats_pdf_admin_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'contrats' and prive.est_admin());
create policy contrats_pdf_admin_modification on storage.objects for update to authenticated
  using (bucket_id = 'contrats' and prive.est_admin());
create policy contrats_pdf_admin_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'contrats' and prive.est_admin());
