-- Espace Abdel : visibilité MANUELLE, fiche par fiche (14/11/2026, demande d'Émilie).
-- Une fiche n'est visible par Abdel que si Émilie a activé l'interrupteur « Visible par Abdel »
-- (data.partageAbdel = date d'activation). Plus de partage automatique au rendez-vous.
-- Un devis transmis n'est visible que si la fiche de son client l'est aussi.
create or replace function prive.abdel_partage(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(d ->> 'partageAbdel', '') <> ''
$$;

drop policy if exists abdel_gerant_devis_lecture on public.abdel_devis;
create policy abdel_gerant_devis_lecture on public.abdel_devis for select to authenticated
  using (prive.abdel_gerant()
    and (coalesce(data ->> 'transmisAbdel', '') <> '' or data ->> 'auteur' = 'abdel')
    and exists (select 1 from public.abdel_prospects p where p.id = prospect_id and prive.abdel_partage(p.data)));
