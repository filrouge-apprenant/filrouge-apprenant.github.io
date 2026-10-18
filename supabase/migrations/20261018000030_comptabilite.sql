-- =============================================================================
-- Fil Rouge Apprenants — Comptabilité des clients
-- =============================================================================
--   contrats            un contrat par organisme : dates, paiement, PDF signé
--   echeances           une échéance par mois facturé :
--                       appels du mois × tarif (20 € / 15 € / 12 € selon le
--                       nombre d'apprenants, ou tarif fixé au contrat)
--   relances_paiement   relances FAITES PAR L'ADMINISTRATRICE (email, appel…)
--   vue_echeances       statut calculé : payée, à payer, en retard, annulée,
--                       et « relance_due » : l'alerte de relance à faire
--
-- Calcul : public.calculer_echeance(organisme, mois) — appelé chaque 1er du
-- mois pour le mois écoulé (voir le fichier « planification »), ou à la main.
-- Relances : AUCUN envoi automatique. La base signale la relance à faire
-- (rappel à J+3, relance à J+15, mise en demeure à J+30, une marche à la fois,
-- 7 jours au moins entre deux) ; l'administratrice relance elle-même puis
-- note sa relance, ce qui fait avancer l'alerte.
--
-- Tout est réservé à l'administratrice (double authentification).
-- =============================================================================

create type public.mode_paiement as enum ('prelevement', 'virement');
create type public.base_facturation as enum ('appels_aboutis', 'tous_les_appels');

-- -----------------------------------------------------------------------------
-- Contrats
-- -----------------------------------------------------------------------------

create table public.contrats (
  organisme_id          uuid primary key references public.organismes (id) on delete cascade,
  date_debut            date not null,
  date_fin              date,
  mode_paiement         public.mode_paiement not null default 'prelevement',
  base_facturation      public.base_facturation not null default 'appels_aboutis',
  tarif_fixe            numeric(8,2) check (tarif_fixe is null or tarif_fixe > 0),
  delai_paiement_jours  smallint not null default 30 check (delai_paiement_jours between 0 and 60),
  email_facturation     text check (email_facturation is null or email_facturation ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  alertes_relance       boolean not null default true,
  reference_mandat      text check (char_length(reference_mandat) <= 100),
  fichier_chemin        text,
  fichier_nom           text,
  notes                 text check (char_length(notes) <= 2000),
  cree_le               timestamptz not null default now(),
  modifie_le            timestamptz not null default now(),
  check (date_fin is null or date_fin >= date_debut)
);

comment on table public.contrats is 'Contrat de chaque client. Administratrice uniquement.';
comment on column public.contrats.tarif_fixe is 'Prix d''un appel fixé au contrat. Vide = grille : 20 € sous 20 apprenants, 15 € jusqu''à 150, 12 € au-delà.';
comment on column public.contrats.base_facturation is 'Ce qui est facturé : appels aboutis (joint·e) ou tous les appels passés.';

create trigger contrats_modifie_le before update on public.contrats
  for each row execute function prive.maj_modifie_le();
create trigger journal_contrats after insert or update or delete on public.contrats
  for each row execute function prive.journaliser();

-- -----------------------------------------------------------------------------
-- Échéances (une par mois facturé)
-- -----------------------------------------------------------------------------

create table public.echeances (
  id                    uuid primary key default gen_random_uuid(),
  organisme_id          uuid not null references public.organismes (id) on delete cascade,
  mois                  date not null check (extract(day from mois) = 1),
  reference             text not null unique,
  nb_appels             integer not null default 0 check (nb_appels >= 0),
  nb_apprenants         integer not null default 0 check (nb_apprenants >= 0),
  tarif_unitaire        numeric(8,2) not null check (tarif_unitaire >= 0),
  montant               numeric(10,2) not null check (montant >= 0),
  date_emission         date not null,
  date_echeance         date not null,
  payee_le              date,
  annulee               boolean not null default false,
  alertes_suspendues    boolean not null default false,
  note                  text check (char_length(note) <= 1000),
  cree_le               timestamptz not null default now(),
  modifie_le            timestamptz not null default now(),
  unique (organisme_id, mois),
  check (date_echeance >= date_emission)
);

comment on table public.echeances is 'Une échéance par mois facturé : appels du mois × tarif. Administratrice uniquement.';

create trigger echeances_modifie_le before update on public.echeances
  for each row execute function prive.maj_modifie_le();
create trigger journal_echeances after insert or update or delete on public.echeances
  for each row execute function prive.journaliser();

-- -----------------------------------------------------------------------------
-- Relances envoyées
-- -----------------------------------------------------------------------------

create type public.canal_relance as enum ('email', 'telephone', 'courrier', 'autre');

create table public.relances_paiement (
  id             uuid primary key default gen_random_uuid(),
  echeance_id    uuid not null references public.echeances (id) on delete cascade,
  organisme_id   uuid not null references public.organismes (id) on delete cascade,
  niveau         smallint not null check (niveau between 1 and 3),
  canal          public.canal_relance not null default 'email',
  faite_le       timestamptz not null default now(),
  auteur_id      uuid default auth.uid() references public.profils (id) on delete set null,
  note           text check (char_length(note) <= 1000)
);

comment on table public.relances_paiement is 'Relances d''impayés faites par l''administratrice (1 = rappel, 2 = relance, 3 = mise en demeure). Aucun envoi automatique.';

-- L'organisme et l'auteur sont posés par la base, jamais par l'écran.
create or replace function prive.relance_preparer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.organisme_id into new.organisme_id from public.echeances e where e.id = new.echeance_id;
  new.auteur_id := auth.uid();
  return new;
end;
$$;

create trigger relances_paiement_preparer before insert on public.relances_paiement
  for each row execute function prive.relance_preparer();
create trigger journal_relances_paiement after insert or update or delete on public.relances_paiement
  for each row execute function prive.journaliser();

alter table public.contrats enable row level security;
alter table public.echeances enable row level security;
alter table public.relances_paiement enable row level security;

create policy contrats_admin on public.contrats for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());
create policy echeances_admin on public.echeances for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());
create policy relances_paiement_admin on public.relances_paiement for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());

-- -----------------------------------------------------------------------------
-- Statut calculé
-- -----------------------------------------------------------------------------

-- relance_due : niveau de la relance à faire (1, 2 ou 3), ou vide.
--   1 = rappel dès J+3, 2 = relance dès J+15, 3 = mise en demeure dès J+30 ;
--   une marche à la fois, au moins 7 jours après la relance précédente ;
--   rien si l'échéance est payée, annulée, en pause, ou si le contrat coupe les alertes.
create view public.vue_echeances with (security_invoker = true) as
select b.*,
  case
    when b.statut = 'en_retard' and not b.alertes_suspendues and b.alertes_contrat
     and coalesce(b.derniere_relance, 0) < 3
     and b.jours_retard >= (array[3, 15, 30])[coalesce(b.derniere_relance, 0) + 1]
     and (b.derniere_relance_le is null or b.derniere_relance_le <= now() - interval '7 days')
    then coalesce(b.derniere_relance, 0) + 1
  end as relance_due
from (
  select e.*,
    o.nom as organisme_nom,
    case
      when e.annulee then 'annulee'
      when e.payee_le is not null then 'payee'
      when e.date_echeance < prive.aujourdhui() then 'en_retard'
      else 'a_payer'
    end as statut,
    case when e.payee_le is null and not e.annulee and e.date_echeance < prive.aujourdhui()
         then prive.aujourdhui() - e.date_echeance else 0 end as jours_retard,
    (select max(r.niveau) from public.relances_paiement r where r.echeance_id = e.id) as derniere_relance,
    (select max(r.faite_le) from public.relances_paiement r where r.echeance_id = e.id) as derniere_relance_le,
    coalesce(c.alertes_relance, true) as alertes_contrat,
    c.email_facturation,
    s.contact_email,
    s.contact_telephone,
    s.contact_nom
  from public.echeances e
  join public.organismes o on o.id = e.organisme_id
  left join public.contrats c on c.organisme_id = e.organisme_id
  left join public.organismes_suivi_commercial s on s.organisme_id = e.organisme_id
) b;

-- -----------------------------------------------------------------------------
-- Calcul d'une échéance
-- -----------------------------------------------------------------------------

-- Mois en français : « octobre 2026 ».
create or replace function prive.mois_fr(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])[extract(month from p_date)::int]
         || ' ' || extract(year from p_date)::int
$$;

-- Grille : 20 € sous 20 apprenants, 15 € jusqu'à 150, 12 € au-delà.
create or replace function prive.tarif_grille(p_nb_apprenants integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_nb_apprenants < 20 then 20.00
              when p_nb_apprenants <= 150 then 15.00
              else 12.00 end::numeric
$$;

-- Compte les appels et apprenants du mois et enregistre l'échéance.
-- Une échéance déjà payée n'est jamais recalculée.
create or replace function prive.calculer_echeance(p_organisme uuid, p_mois date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contrats;
  v_mois date := date_trunc('month', p_mois)::date;
  v_fin date := (date_trunc('month', p_mois) + interval '1 month')::date;
  v_appels integer;
  v_apprenants integer;
  v_tarif numeric;
  v_emission date;
  v_id uuid;
begin
  select * into c from public.contrats where organisme_id = p_organisme;
  if not found then
    raise exception 'Aucun contrat pour cet organisme : renseignez-le d''abord.' using errcode = 'P0001';
  end if;
  if v_fin <= c.date_debut or (c.date_fin is not null and v_mois > c.date_fin) then
    raise exception 'Ce mois est en dehors des dates du contrat.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.echeances where organisme_id = p_organisme and mois = v_mois and payee_le is not null) then
    raise exception 'Cette échéance est déjà payée : elle n''est plus recalculée.' using errcode = 'P0001';
  end if;

  select count(*) into v_appels
  from public.appels a
  where a.organisme_id = p_organisme
    and (a.date_appel at time zone 'Europe/Paris')::date >= v_mois
    and (a.date_appel at time zone 'Europe/Paris')::date < v_fin
    and a.canal in ('telephone', 'visio')
    and (c.base_facturation = 'tous_les_appels' or a.resultat = 'joint');

  -- Apprenants suivis ce mois-là : en formation, ou contactés dans le mois.
  select count(*) into v_apprenants
  from public.apprenants ap
  where ap.organisme_id = p_organisme
    and (ap.statut = 'actif' or exists (
      select 1 from public.appels a where a.apprenant_id = ap.id
        and (a.date_appel at time zone 'Europe/Paris')::date >= v_mois
        and (a.date_appel at time zone 'Europe/Paris')::date < v_fin));

  v_tarif := coalesce(c.tarif_fixe, prive.tarif_grille(v_apprenants));
  v_emission := greatest(v_fin, prive.aujourdhui());

  insert into public.echeances (organisme_id, mois, reference, nb_appels, nb_apprenants, tarif_unitaire, montant, date_emission, date_echeance)
  values (p_organisme, v_mois,
          'FRA-' || to_char(v_mois, 'YYYYMM') || '-' || upper(substr(replace(p_organisme::text, '-', ''), 1, 6)),
          v_appels, v_apprenants, v_tarif, round(v_appels * v_tarif, 2),
          v_emission, v_emission + c.delai_paiement_jours)
  on conflict (organisme_id, mois) do update set
    nb_appels = excluded.nb_appels,
    nb_apprenants = excluded.nb_apprenants,
    tarif_unitaire = excluded.tarif_unitaire,
    montant = excluded.montant
  returning id into v_id;
  return v_id;
end;
$$;

-- Version appelable depuis la plateforme : administratrice seulement.
create or replace function public.calculer_echeance(p_organisme uuid, p_mois date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not prive.est_admin() then
    raise exception 'Réservé à l''administratrice.' using errcode = '42501';
  end if;
  return prive.calculer_echeance(p_organisme, p_mois);
end;
$$;

-- Chaque 1er du mois : le mois écoulé, pour tous les contrats en cours.
create or replace function prive.generer_echeances_mois_ecoule()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mois date := (date_trunc('month', prive.aujourdhui()) - interval '1 month')::date;
  c record;
  n integer := 0;
begin
  for c in
    select organisme_id from public.contrats
    where date_debut < (v_mois + interval '1 month')::date
      and (date_fin is null or date_fin >= v_mois)
  loop
    if not exists (select 1 from public.echeances where organisme_id = c.organisme_id and mois = v_mois and payee_le is not null) then
      perform prive.calculer_echeance(c.organisme_id, v_mois);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Texte des relances : prêt à envoyer par l'administratrice (email) ou à
-- suivre au téléphone. Rien n'est envoyé par la base.
-- -----------------------------------------------------------------------------

create or replace function prive.texte_relance(p_niveau integer, e public.vue_echeances, c public.contrats)
returns table (objet text, texte text)
language sql
stable
set search_path = ''
as $$
  select
    case p_niveau
      when 1 then 'Rappel : échéance ' || e.reference || ' — Fil Rouge Apprenants'
      when 2 then 'Relance : échéance ' || e.reference || ' impayée — Fil Rouge Apprenants'
      else 'Mise en demeure de payer — échéance ' || e.reference
    end,
    'Bonjour,' || E'\n\n' ||
    case p_niveau
      when 1 then
        'Sauf erreur de ma part, l''échéance ' || e.reference || ' de ' || replace(to_char(e.montant, 'FM999990.00'), '.', ',') || ' €'
        || ' (suivi de vos apprenants, ' || prive.mois_fr(e.mois) || ', ' || e.nb_appels || ' appels)'
        || ' arrivée à terme le ' || to_char(e.date_echeance, 'DD/MM/YYYY') || ' n''est pas encore réglée.'
        || case when c.mode_paiement = 'prelevement' then ' Le prélèvement n''a pas pu aboutir.' else '' end
        || E'\n\n' || 'Il s''agit sans doute d''un simple oubli : pourriez-vous procéder au règlement dans les prochains jours ? Si c''est déjà fait, merci de ne pas tenir compte de ce message.'
      when 2 then
        'Malgré mon précédent rappel, l''échéance ' || e.reference || ' de ' || replace(to_char(e.montant, 'FM999990.00'), '.', ',') || ' €,'
        || ' échue depuis le ' || to_char(e.date_echeance, 'DD/MM/YYYY') || ' (' || e.jours_retard || ' jours de retard), reste impayée.'
        || E'\n\n' || 'Je vous remercie de procéder au règlement sous 8 jours. Conformément à l''article L441-10 du Code de commerce, tout retard de paiement entraîne des pénalités de retard et une indemnité forfaitaire de 40 € pour frais de recouvrement.'
        || E'\n\n' || 'En cas de difficulté, n''hésitez pas à me contacter pour convenir d''une solution.'
      else
        'Par la présente, je vous mets en demeure de régler sous 8 jours l''échéance ' || e.reference
        || ' d''un montant de ' || replace(to_char(e.montant, 'FM999990.00'), '.', ',') || ' €, échue depuis le ' || to_char(e.date_echeance, 'DD/MM/YYYY')
        || ' (' || e.jours_retard || ' jours de retard), malgré mes relances précédentes.'
        || E'\n\n' || 'À défaut de règlement dans ce délai, je me verrai contrainte d''engager une procédure de recouvrement et de suspendre le suivi de vos apprenants. Les pénalités de retard et l''indemnité forfaitaire de 40 € pour frais de recouvrement (article L441-10 du Code de commerce) sont dues.'
    end
    || E'\n\n' || 'Cordialement,' || E'\n' || 'Émilie Rachas' || E'\n' || 'Fil Rouge Apprenants' || E'\n' || 'contact.filrouge.apprenant@gmail.com'
$$;

-- Texte de la relance à faire (pour l'email prérempli et le script d'appel).
create or replace function public.apercu_relance(p_echeance uuid, p_niveau integer)
returns table (objet text, texte text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.vue_echeances;
  c public.contrats;
begin
  if not prive.est_admin() then
    raise exception 'Réservé à l''administratrice.' using errcode = '42501';
  end if;
  select * into e from public.vue_echeances where id = p_echeance;
  select * into c from public.contrats where organisme_id = e.organisme_id;
  return query select * from prive.texte_relance(greatest(1, least(3, p_niveau)), e, c);
end;
$$;

revoke all on function prive.calculer_echeance(uuid, date) from public, anon, authenticated;
revoke all on function prive.generer_echeances_mois_ecoule() from public, anon, authenticated;
revoke all on function public.calculer_echeance(uuid, date) from public, anon;
grant execute on function public.calculer_echeance(uuid, date) to authenticated;
revoke all on function public.apercu_relance(uuid, integer) from public, anon;
grant execute on function public.apercu_relance(uuid, integer) to authenticated;
