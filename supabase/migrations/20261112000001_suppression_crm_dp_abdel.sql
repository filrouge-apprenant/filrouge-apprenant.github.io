-- Suppression complète du CRM DP Abdel (demande d'Émilie, 12/11/2026).
-- Retire les tables, fonctions et accès créés par 20261111000001_crm_dp_abdel.sql.
drop table if exists public.abdel_prospects cascade;
drop table if exists public.abdel_appels_offres cascade;
drop table if exists public.abdel_parametres cascade;
drop function if exists public.abdel_suis_membre() cascade;
drop function if exists prive.abdel_horodatage() cascade;
drop function if exists prive.abdel_autorise() cascade;
drop table if exists prive.abdel_membres cascade;
