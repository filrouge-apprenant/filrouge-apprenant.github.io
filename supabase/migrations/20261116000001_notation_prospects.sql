-- Notation des prospects sur 100 (Machine de prospection, #/acquisition/priorites).
-- score_criteres : { "distance": "oui"|"probable"|"non", ..., "exclu": { "youschool": true, ... } }
-- Le score est recalculé à l'affichage (prospection.js) : seule la saisie est stockée.
alter table public.organismes_suivi_commercial
  add column if not exists score_criteres jsonb not null default '{}'::jsonb,
  add column if not exists score_maj      date;
comment on column public.organismes_suivi_commercial.score_criteres is
  'Notation /100 : état de chaque critère (oui = vérifié, probable = hypothèse, non) et exclusions.';
