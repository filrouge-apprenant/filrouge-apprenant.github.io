-- SIREN et dirigeants (registre RNE) sur le suivi commercial : le bouton
-- Pappers ouvre directement la bonne fiche quand le SIREN est connu.
alter table public.organismes_suivi_commercial
  add column if not exists siren text check (siren is null or siren ~ '^[0-9]{9}$'),
  add column if not exists dirigeants text;
comment on column public.organismes_suivi_commercial.siren is 'SIREN (registre RNE) : le bouton Pappers ouvre directement la fiche.';
comment on column public.organismes_suivi_commercial.dirigeants is 'Dirigeants inscrits au registre (RNE), avec leur fonction.';
