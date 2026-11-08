-- Qualification BANT des prospects (Budget, Autorité, Besoin, Timing) :
-- "oui", "non" ou vide (pas encore vérifié), avec la date de mise à jour.
alter table public.organismes_suivi_commercial
  add column if not exists bant_budget   text check (bant_budget   in ('oui','non')),
  add column if not exists bant_autorite text check (bant_autorite in ('oui','non')),
  add column if not exists bant_besoin   text check (bant_besoin   in ('oui','non')),
  add column if not exists bant_timing   text check (bant_timing   in ('oui','non')),
  add column if not exists bant_maj      date;
comment on column public.organismes_suivi_commercial.bant_besoin is 'Qualification BANT : oui / non / null = pas encore vérifié.';
