-- =============================================================================
-- Emails aux organismes envoyés par Brevo, avec accusé de réception (19/11/2026)
-- -----------------------------------------------------------------------------
-- 1) Chaque email envoyé à un centre depuis la plateforme est enregistré, avec
--    son statut lu chez Brevo : envoyé, reçu (délivré), ouvert, rejeté, spam.
-- 2) Ouvertures : recommandation CNIL du 12 mars 2026 (délibération 2026-042)
--    sur les pixels de suivi, B2B compris : l'ouverture d'un email de
--    prospection n'est suivie individuellement qu'avec le consentement du
--    destinataire. Le consentement est recueilli sur une page publique
--    (preferences-email.html) reliée à un jeton propre à chaque centre ;
--    l'absence de réponse vaut refus ; le retrait est possible à tout moment.
--    La preuve (date, choix, source) est gardée.
--    L'accusé de réception (délivré / rejeté) n'utilise aucun pixel.
-- Lecture et écriture : administratrice seulement (prive.est_admin()).
-- =============================================================================

alter table public.organismes_suivi_commercial
  add column if not exists suivi_ouverture boolean,               -- null = pas de réponse (= refus)
  add column if not exists suivi_ouverture_le timestamptz,
  add column if not exists suivi_ouverture_source text,
  add column if not exists jeton_preferences uuid not null default gen_random_uuid();

create unique index if not exists organismes_suivi_jeton_pref on public.organismes_suivi_commercial (jeton_preferences);

create table if not exists public.emails_organismes (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid not null references public.organismes(id) on delete cascade,
  destinataire text not null check (char_length(destinataire) <= 254),
  objet text not null check (char_length(objet) <= 200),
  modele text check (char_length(modele) <= 150),
  brevo_message_id text,
  suivi_ouverture boolean not null default false,              -- consentement au moment de l'envoi
  statut text not null default 'envoye' check (statut in ('envoye', 'delivre', 'ouvert', 'rejete', 'spam', 'erreur')),
  envoye_le timestamptz not null default now(),
  delivre_le timestamptz,
  ouvert_le timestamptz,                                        -- seulement si suivi_ouverture
  ouvertures integer not null default 0,
  detail text check (char_length(detail) <= 300),
  verifie_le timestamptz,
  auteur_id uuid references auth.users(id) on delete set null
);
create index if not exists emails_organismes_org on public.emails_organismes (organisme_id, envoye_le desc);

alter table public.emails_organismes enable row level security;
drop policy if exists emails_organismes_admin on public.emails_organismes;
create policy emails_organismes_admin on public.emails_organismes
  for all using (prive.est_admin()) with check (prive.est_admin());
revoke all on public.emails_organismes from anon;
