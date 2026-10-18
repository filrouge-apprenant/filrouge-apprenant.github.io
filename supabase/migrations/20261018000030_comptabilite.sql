-- =============================================================================
-- Fil Rouge Apprenants — Comptabilité des clients
-- =============================================================================
--   contrats            un contrat par organisme : dates, paiement, PDF signé
--   echeances           une échéance par mois facturé :
--                       appels du mois × tarif (20 € / 15 € / 12 € selon le
--                       nombre d'apprenants, ou tarif fixé au contrat)
--   relances_paiement   relances envoyées : J+3, J+15, J+30 (mise en demeure)
--   vue_echeances       statut calculé : payée, à payer, en retard, annulée
--
-- Calcul : public.calculer_echeance(organisme, mois) — appelé chaque 1er du
-- mois pour le mois écoulé (voir le fichier « planification »), ou à la main.
-- Relances : prive.envoyer_relances() — chaque matin, envoie par Brevo la
-- relance due, une seule fois par niveau, copie à la boîte Fil Rouge.
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
  relances_auto         boolean not null default true,
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
  relances_suspendues   boolean not null default false,
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

create table public.relances_paiement (
  id             uuid primary key default gen_random_uuid(),
  echeance_id    uuid not null references public.echeances (id) on delete cascade,
  organisme_id   uuid not null references public.organismes (id) on delete cascade,
  niveau         smallint not null check (niveau between 1 and 3),
  envoyee_le     timestamptz not null default now(),
  destinataire   text not null,
  objet          text not null,
  texte          text not null,
  requete_id     bigint,
  unique (echeance_id, niveau)
);

comment on table public.relances_paiement is 'Relances d''impayés envoyées (1 = rappel J+3, 2 = relance J+15, 3 = mise en demeure J+30).';

alter table public.contrats enable row level security;
alter table public.echeances enable row level security;
alter table public.relances_paiement enable row level security;

create policy contrats_admin on public.contrats for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());
create policy echeances_admin on public.echeances for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());
create policy relances_paiement_admin_lecture on public.relances_paiement for select to authenticated
  using (prive.est_admin());

-- -----------------------------------------------------------------------------
-- Statut calculé
-- -----------------------------------------------------------------------------

create view public.vue_echeances with (security_invoker = true) as
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
  (select max(r.envoyee_le) from public.relances_paiement r where r.echeance_id = e.id) as derniere_relance_le
from public.echeances e
join public.organismes o on o.id = e.organisme_id;

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
-- Relances automatiques (Brevo)
-- -----------------------------------------------------------------------------
-- La clé Brevo est rangée dans le coffre-fort de Supabase (Vault), sous le nom
-- « brevo_cle » ; elle n'apparaît jamais dans le code ni dans la plateforme.

create table prive.reglages_relances (
  id                 boolean primary key default true check (id),
  expediteur_email   text not null default 'contact.filrouge.apprenant@gmail.com',
  expediteur_nom     text not null default 'Émilie Rachas · Fil Rouge Apprenants',
  copie_email        text not null default 'contact.filrouge.apprenant@gmail.com',
  jours_niveau_1     smallint not null default 3,
  jours_niveau_2     smallint not null default 15,
  jours_niveau_3     smallint not null default 30
);
insert into prive.reglages_relances default values;

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

-- Envoi d'un email par l'API Brevo (asynchrone, via pg_net).
create or replace function prive.envoyer_email_brevo(p_destinataire text, p_objet text, p_texte text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  r prive.reglages_relances;
  v_cle text;
begin
  select * into r from prive.reglages_relances;
  select decrypted_secret into v_cle from vault.decrypted_secrets where name = 'brevo_cle' limit 1;
  if v_cle is null then
    raise exception 'Clé Brevo absente du coffre-fort (nom attendu : brevo_cle).' using errcode = 'P0001';
  end if;
  return net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', v_cle, 'Content-Type', 'application/json', 'accept', 'application/json'),
    body := jsonb_build_object(
      'sender', jsonb_build_object('name', r.expediteur_nom, 'email', r.expediteur_email),
      'to', jsonb_build_array(jsonb_build_object('email', p_destinataire)),
      'bcc', jsonb_build_array(jsonb_build_object('email', r.copie_email)),
      'replyTo', jsonb_build_object('email', r.expediteur_email),
      'subject', p_objet,
      'textContent', p_texte)
  );
end;
$$;

-- Chaque matin : pour chaque échéance en retard, envoie la relance suivante
-- si son délai est atteint (J+3, J+15, J+30), une seule fois par niveau.
-- Renvoie le nombre de relances envoyées.
create or replace function prive.envoyer_relances()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r prive.reglages_relances;
  e public.vue_echeances;
  c public.contrats;
  v_niveau integer;
  v_dest text;
  v_objet text;
  v_texte text;
  v_requete bigint;
  v_seuil integer;
  n integer := 0;
begin
  select * into r from prive.reglages_relances;
  for e in select * from public.vue_echeances where statut = 'en_retard' and not relances_suspendues and montant > 0 loop
    select * into c from public.contrats where organisme_id = e.organisme_id;
    if c is null or not c.relances_auto then continue; end if;
    -- Escalade une marche à la fois : jamais de mise en demeure sans relance
    -- préalable, et au moins 7 jours entre deux relances.
    v_niveau := coalesce(e.derniere_relance, 0) + 1;
    if v_niveau > 3 then continue; end if;
    v_seuil := (array[r.jours_niveau_1, r.jours_niveau_2, r.jours_niveau_3])[v_niveau];
    if e.jours_retard < v_seuil then continue; end if;
    if e.derniere_relance_le is not null and e.derniere_relance_le > now() - interval '7 days' then continue; end if;
    v_dest := coalesce(c.email_facturation,
      (select s.contact_email from public.organismes_suivi_commercial s where s.organisme_id = e.organisme_id));
    if v_dest is null then continue; end if;
    select t.objet, t.texte into v_objet, v_texte from prive.texte_relance(v_niveau, e, c) t;
    v_requete := prive.envoyer_email_brevo(v_dest, v_objet, v_texte);
    insert into public.relances_paiement (echeance_id, organisme_id, niveau, destinataire, objet, texte, requete_id)
    values (e.id, e.organisme_id, v_niveau, v_dest, v_objet, v_texte, v_requete);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Aperçu de la prochaine relance d'une échéance (pour l'afficher sur la fiche).
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
revoke all on function prive.envoyer_email_brevo(text, text, text) from public, anon, authenticated;
revoke all on function prive.envoyer_relances() from public, anon, authenticated;
revoke all on function public.calculer_echeance(uuid, date) from public, anon;
grant execute on function public.calculer_echeance(uuid, date) to authenticated;
revoke all on function public.apercu_relance(uuid, integer) from public, anon;
grant execute on function public.apercu_relance(uuid, integer) to authenticated;
revoke all on table prive.reglages_relances from public, anon, authenticated;
