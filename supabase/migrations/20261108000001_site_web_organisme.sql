-- Site internet de l'organisme : lien cliquable sur la fiche et dans la liste
-- Prospection (CRM, administratrice seulement, comme le reste du suivi commercial).
alter table public.organismes_suivi_commercial
  add column if not exists site_web text
  check (site_web is null or site_web ~* '^https?://[^\s<>"]+$');
comment on column public.organismes_suivi_commercial.site_web is
  'Site internet de l''organisme (lien cliquable sur la fiche et la liste Prospection).';
