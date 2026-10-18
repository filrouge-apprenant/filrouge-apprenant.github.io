-- =============================================================================
-- Fil Rouge Apprenants — Demandes de devis et propositions commerciales
-- =============================================================================
--   propositions           une offre par organisme (pilote, sur mesure…) :
--                          contenu, tarif, total, paiement unique ou mensuel,
--                          lien de paiement Stripe, page publique par jeton.
--   demander_devis()       appelée par la page publique offre-pilote.html :
--                          crée (ou retrouve) la fiche de l'organisme, note la
--                          demande dans l'historique et ouvre une proposition
--                          « demande » à traiter.
--   proposition_publique() lecture d'une proposition (brouillon, envoyée, payée) par son jeton secret,
--                          pour la page proposition.html (sans connexion).
--
-- Tout le reste est réservé à l'administratrice (double authentification).
-- =============================================================================

create table public.propositions (
  id                    uuid primary key default gen_random_uuid(),
  organisme_id          uuid not null references public.organismes (id) on delete cascade,
  jeton                 uuid not null unique default gen_random_uuid(),
  statut                text not null default 'brouillon'
                        check (statut in ('demande', 'brouillon', 'envoyee', 'payee', 'refusee')),

  -- Demande reçue depuis le site (vide si la proposition a été créée à la main)
  demande_le            timestamptz,
  demande_nb_apprenants integer check (demande_nb_apprenants is null or demande_nb_apprenants between 1 and 100000),
  demande_formations    text check (char_length(demande_formations) <= 500),
  demande_message       text check (char_length(demande_message) <= 3000),
  vue_le                timestamptz,

  -- L'offre
  titre                 text not null default 'Suivi téléphonique de vos apprenants' check (char_length(titre) between 1 and 150),
  description           text check (char_length(description) <= 3000),
  nb_apprenants         integer not null default 20 check (nb_apprenants between 1 and 100000),
  duree_mois            integer not null default 2 check (duree_mois between 1 and 36),
  appels_par_mois       numeric(4,1) not null default 1 check (appels_par_mois > 0 and appels_par_mois <= 20),
  prix_appel            numeric(8,2) not null default 20 check (prix_appel >= 0),
  montant_total         numeric(10,2) not null default 0 check (montant_total >= 0),
  paiement              text not null default 'unique' check (paiement in ('unique', 'mensuel')),
  message_client        text check (char_length(message_client) <= 2000),

  -- Paiement en ligne (rempli par la fonction serveur « stripe-proposition »)
  stripe_lien_id        text,
  stripe_lien_url       text check (stripe_lien_url is null or stripe_lien_url ~ '^https://(buy|checkout)\.stripe\.com/'),
  stripe_lien_montant   numeric(10,2),
  stripe_lien_paiement  text,

  envoyee_le            timestamptz,
  payee_le              timestamptz,
  cree_le               timestamptz not null default now(),
  modifie_le            timestamptz not null default now()
);

create index propositions_organisme_idx on public.propositions (organisme_id, cree_le desc);
create index propositions_a_traiter_idx on public.propositions (statut) where statut = 'demande';

comment on table public.propositions is 'Propositions commerciales (devis, offre pilote, sur mesure). Administratrice uniquement ; lecture publique d''une proposition envoyée par son jeton.';
comment on column public.propositions.montant_total is 'Total HT de l''offre. En paiement mensuel : montant_total / duree_mois chaque mois.';

create trigger propositions_modifie_le before update on public.propositions
  for each row execute function prive.maj_modifie_le();
create trigger journal_propositions after insert or update or delete on public.propositions
  for each row execute function prive.journaliser();

alter table public.propositions enable row level security;
revoke all on public.propositions from anon;
grant select, insert, update, delete on public.propositions to authenticated;

create policy propositions_admin on public.propositions for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());

-- Le lien Stripe n'est posé que par la fonction serveur (clé de service) :
-- l'écran ne peut pas y écrire une adresse de son choix.
create or replace function prive.proteger_lien_stripe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.stripe_lien_id := null; new.stripe_lien_url := null;
      new.stripe_lien_montant := null; new.stripe_lien_paiement := null;
    else
      new.stripe_lien_id := old.stripe_lien_id; new.stripe_lien_url := old.stripe_lien_url;
      new.stripe_lien_montant := old.stripe_lien_montant; new.stripe_lien_paiement := old.stripe_lien_paiement;
    end if;
  end if;
  return new;
end;
$$;

create trigger propositions_proteger_lien before insert or update on public.propositions
  for each row execute function prive.proteger_lien_stripe();

-- -----------------------------------------------------------------------------
-- Demande de devis depuis le site public (sans connexion)
-- -----------------------------------------------------------------------------

create or replace function public.demander_devis(
  p_organisme      text,
  p_contact_nom    text,
  p_contact_fonction text,
  p_email          text,
  p_telephone      text,
  p_nb_apprenants  integer,
  p_formations     text,
  p_message        text,
  p_piege          text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nom text := trim(coalesce(p_organisme, ''));
  v_resume text;
begin
  -- Champ invisible rempli = robot : on fait comme si tout allait bien.
  if coalesce(p_piege, '') <> '' then
    return true;
  end if;

  if char_length(v_nom) not between 2 and 150 then
    raise exception 'Indiquez le nom de votre organisme.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_contact_nom, ''))) not between 2 and 120 then
    raise exception 'Indiquez votre nom.' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 200 then
    raise exception 'Adresse email invalide.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_telephone, '')) > 30 or char_length(coalesce(p_contact_fonction, '')) > 120
     or char_length(coalesce(p_formations, '')) > 500 or char_length(coalesce(p_message, '')) > 3000 then
    raise exception 'Un des champs est trop long.' using errcode = 'P0001';
  end if;
  if p_nb_apprenants is not null and p_nb_apprenants not between 1 and 100000 then
    raise exception 'Nombre d''apprenants invalide.' using errcode = 'P0001';
  end if;

  -- Garde-fous contre l'envoi en masse : 3 demandes par email et par jour,
  -- 30 demandes par heure au total.
  if (select count(*) from public.propositions p
        join public.organismes_suivi_commercial s on s.organisme_id = p.organisme_id
       where lower(s.contact_email) = v_email and p.demande_le > now() - interval '1 day') >= 3
     or (select count(*) from public.propositions where demande_le > now() - interval '1 hour') >= 30 then
    raise exception 'Votre demande a déjà été reçue. Nous revenons vers vous rapidement.' using errcode = 'P0001';
  end if;

  -- Organisme déjà connu (même email de contact) : on y rattache la demande.
  select s.organisme_id into v_org
  from public.organismes_suivi_commercial s
  where lower(s.contact_email) = v_email
  order by s.modifie_le desc
  limit 1;

  if v_org is null then
    insert into public.organismes (nom) values (v_nom) returning id into v_org;
    insert into public.organismes_suivi_commercial
      (organisme_id, etape, contact_nom, contact_fonction, contact_email, contact_telephone, prochaine_relance, notes)
    values
      (v_org, 'prospect', trim(p_contact_nom), nullif(trim(p_contact_fonction), ''), v_email,
       nullif(trim(p_telephone), ''), prive.aujourdhui(), 'Demande de devis reçue depuis le site.');
  else
    update public.organismes_suivi_commercial
       set prochaine_relance = prive.aujourdhui(),
           contact_telephone = coalesce(contact_telephone, nullif(trim(p_telephone), ''))
     where organisme_id = v_org;
  end if;

  insert into public.propositions
    (organisme_id, statut, demande_le, demande_nb_apprenants, demande_formations, demande_message,
     nb_apprenants, titre)
  values
    (v_org, 'demande', now(), p_nb_apprenants, nullif(trim(p_formations), ''), nullif(trim(p_message), ''),
     coalesce(p_nb_apprenants, 20), 'Suivi téléphonique de vos apprenants');

  v_resume := 'Demande de devis reçue depuis le site'
    || ' — ' || trim(p_contact_nom) || coalesce(' (' || nullif(trim(p_contact_fonction), '') || ')', '')
    || ', ' || v_email || coalesce(', ' || nullif(trim(p_telephone), ''), '')
    || coalesce('. Apprenants : ' || p_nb_apprenants, '')
    || coalesce('. Formations : ' || nullif(trim(p_formations), ''), '')
    || coalesce('. Message : ' || nullif(trim(p_message), ''), '');

  insert into public.echanges_commerciaux (organisme_id, date_echange, canal, resume)
  values (v_org, prive.aujourdhui(), 'email', left(v_resume, 4000));

  return true;
end;
$$;

revoke all on function public.demander_devis(text, text, text, text, text, integer, text, text, text) from public;
grant execute on function public.demander_devis(text, text, text, text, text, integer, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Page publique d'une proposition envoyée (lien personnel par jeton)
-- -----------------------------------------------------------------------------

create or replace function public.proposition_publique(p_jeton uuid)
returns table (
  organisme text, titre text, description text, nb_apprenants integer, duree_mois integer,
  appels_par_mois numeric, prix_appel numeric, montant_total numeric, paiement text,
  message_client text, lien_paiement text, statut text
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.nom, p.titre, p.description, p.nb_apprenants, p.duree_mois, p.appels_par_mois, p.prix_appel,
         p.montant_total, p.paiement, p.message_client,
         case when p.statut in ('brouillon', 'envoyee') and p.stripe_lien_montant = p.montant_total
                   and p.stripe_lien_paiement = p.paiement then p.stripe_lien_url end,
         p.statut
  from public.propositions p
  join public.organismes o on o.id = p.organisme_id
  where p.jeton = p_jeton and p.statut in ('brouillon', 'envoyee', 'payee')
$$;

revoke all on function public.proposition_publique(uuid) from public;
grant execute on function public.proposition_publique(uuid) to anon, authenticated;
