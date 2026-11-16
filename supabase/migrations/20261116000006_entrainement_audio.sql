-- =============================================================================
-- Enregistrements des appels d'entraînement (réécoute)
-- =============================================================================
-- Stockage privé « entrainement-audio » : un dossier par personne
-- (<identifiant>/<appel>/<réplique>.webm). Chacun ne lit, n'ajoute et ne
-- supprime que ses propres enregistrements. 5 Mo maximum par fichier.
-- Cette mise à jour n'ajoute que des éléments : rien n'est retiré de la base.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entrainement-audio', 'entrainement-audio', false, 5242880,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])
on conflict (id) do nothing;

create policy entrainement_audio_lecture on storage.objects for select to authenticated
  using (bucket_id = 'entrainement-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy entrainement_audio_ajout on storage.objects for insert to authenticated
  with check (bucket_id = 'entrainement-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy entrainement_audio_maj on storage.objects for update to authenticated
  using (bucket_id = 'entrainement-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy entrainement_audio_suppression on storage.objects for delete to authenticated
  using (bucket_id = 'entrainement-audio' and (storage.foldername(name))[1] = auth.uid()::text);
