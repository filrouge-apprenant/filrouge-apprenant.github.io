-- =============================================================================
-- Prélèvement SEPA automatique au réel des appels (Stripe)
-- =============================================================================
--   1. Le centre accepte sa proposition en ligne, puis signe une seule fois le
--      mandat de prélèvement SEPA sur la page sécurisée de Stripe (IBAN).
--      → table « mandats_sepa » (une ligne par organisme).
--   2. Chaque mois, l'échéance (appels du mois × tarif) est calculée comme
--      avant. L'administratrice vérifie et clique « Prélever » : la fonction
--      serveur « prelevement » demande à Stripe de prélever ce montant.
--      → colonnes « prelevement_* » sur les échéances.
--   3. Acceptation d'une offre payante = contrat créé automatiquement
--      (date de début, prix de l'appel accepté, email de facturation).
--
-- Les identifiants Stripe ne sont écrits que par la fonction serveur (clé de
-- service) : l'écran ne peut pas les modifier. Administratrice uniquement.
-- Cette mise à jour n'ajoute que des éléments : rien n'est retiré de la base.
-- =============================================================================

create table public.mandats_sepa (
  organisme_id         uuid primary key references public.organismes (id) on delete cascade,
  statut               text not null default 'en_attente' check (statut in ('en_attente', 'actif', 'revoque')),
  stripe_client_id     text,
  stripe_session_id    text,
  stripe_moyen_id      text,
  stripe_mandat_id     text,
  iban_fin             text check (char_length(iban_fin) <= 4),
  banque               text check (char_length(banque) <= 100),
  titulaire            text check (char_length(titulaire) <= 200),
  signe_le             timestamptz,
  cree_le              timestamptz not null default now(),
  modifie_le           timestamptz not null default now()
);

comment on table public.mandats_sepa is 'Mandat de prélèvement SEPA de chaque centre (Stripe). Écrit par la fonction serveur, lu par l''administratrice.';

create trigger mandats_sepa_modifie_le before update on public.mandats_sepa
  for each row execute function prive.maj_modifie_le();
create trigger journal_mandats_sepa after insert or update or delete on public.mandats_sepa
  for each row execute function prive.journaliser();

alter table public.mandats_sepa enable row level security;
revoke all on public.mandats_sepa from anon;
grant select on public.mandats_sepa to authenticated;
create policy mandats_sepa_admin_lecture on public.mandats_sepa for select to authenticated
  using (prive.est_admin());

-- Suivi du prélèvement de chaque échéance
alter table public.echeances
  add column prelevement_statut   text check (prelevement_statut in ('en_cours', 'reussi', 'echoue')),
  add column prelevement_id       text,
  add column prelevement_demande_le timestamptz,
  add column prelevement_erreur   text check (char_length(prelevement_erreur) <= 500);

comment on column public.echeances.prelevement_statut is 'Prélèvement SEPA : en_cours (3 à 5 jours ouvrés), reussi, echoue. Vide = pas encore demandé.';

-- Seule la fonction serveur (clé de service) écrit le suivi du prélèvement.
create or replace function prive.proteger_prelevement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.prelevement_statut := null; new.prelevement_id := null;
      new.prelevement_demande_le := null; new.prelevement_erreur := null;
    else
      new.prelevement_statut := old.prelevement_statut; new.prelevement_id := old.prelevement_id;
      new.prelevement_demande_le := old.prelevement_demande_le; new.prelevement_erreur := old.prelevement_erreur;
    end if;
  end if;
  return new;
end;
$$;

create trigger echeances_proteger_prelevement before insert or update on public.echeances
  for each row execute function prive.proteger_prelevement();

-- Une échéance dont le prélèvement est en cours ou réussi n'est plus recalculée :
-- son montant reste celui qui a été prélevé (sans bloquer le calcul des autres).
create or replace function prive.bloquer_recalcul_preleve()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.prelevement_statut in ('en_cours', 'reussi') then
    new.montant := old.montant;
    new.nb_appels := old.nb_appels;
    new.nb_apprenants := old.nb_apprenants;
    new.tarif_unitaire := old.tarif_unitaire;
  end if;
  return new;
end;
$$;

create trigger echeances_bloquer_recalcul before update on public.echeances
  for each row execute function prive.bloquer_recalcul_preleve();

-- -----------------------------------------------------------------------------
-- Acceptation d'une offre payante : le contrat est créé automatiquement
-- (même fonction qu'avant, avec le contrat en plus).
-- -----------------------------------------------------------------------------
create or replace function public.accepter_proposition(
  p_jeton    uuid,
  p_nom      text,
  p_fonction text,
  p_email    text
)
returns table (
  proposition_id uuid, organisme_id uuid, organisme text, titre text, type_offre text,
  montant_total numeric, paiement text, duree_mois integer, lien_paiement text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.propositions;
  v_nom text := trim(coalesce(p_nom, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(v_nom) not between 2 and 120 then
    raise exception 'Indiquez votre nom.' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 200 then
    raise exception 'Adresse email invalide.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_fonction, '')) > 120 then
    raise exception 'Fonction trop longue.' using errcode = 'P0001';
  end if;

  select * into p from public.propositions where jeton = p_jeton for update;
  if p.id is null or p.statut not in ('brouillon', 'envoyee') or p.accepte_le is not null then
    raise exception 'Cette proposition ne peut plus être acceptée en ligne. Contactez-moi directement.' using errcode = 'P0001';
  end if;

  update public.propositions
     set statut = 'envoyee', accepte_le = now(), accepte_nom = v_nom,
         accepte_fonction = nullif(trim(p_fonction), ''), accepte_email = v_email
   where id = p.id;

  update public.organismes_suivi_commercial s
     set etape = case when p.type_offre = 'essai' then
                   case when s.etape = 'client' then s.etape else 'test_gratuit'::public.etape_commerciale end
                 else 'client'::public.etape_commerciale end,
         prochaine_relance = prive.aujourdhui()
   where s.organisme_id = p.organisme_id;

  -- Offre payante : contrat au prix de l'appel accepté, prélèvement mensuel.
  if p.type_offre = 'standard' then
    insert into public.contrats (organisme_id, date_debut, mode_paiement, tarif_fixe, email_facturation, notes)
    values (p.organisme_id, prive.aujourdhui(), 'prelevement',
            case when p.prix_appel > 0 then p.prix_appel end, v_email,
            'Créé à l''acceptation en ligne de la proposition « ' || p.titre || ' » le ' || to_char(prive.aujourdhui(), 'DD/MM/YYYY') || '.')
    on conflict on constraint contrats_pkey do nothing;
  end if;

  insert into public.echanges_commerciaux (organisme_id, date_echange, canal, resume)
  values (p.organisme_id, prive.aujourdhui(), 'autre',
          left(case when p.type_offre = 'essai' then 'Essai gratuit accepté en ligne' else 'Proposition acceptée en ligne' end
               || ' par ' || v_nom || coalesce(' (' || nullif(trim(p_fonction), '') || ')', '') || ', ' || v_email
               || ' : ' || p.titre || case when p.montant_total > 0 then ', ' || to_char(p.montant_total, 'FM999G999D00') || ' € HT' else '' end || '.', 4000));

  return query
    select p.id, p.organisme_id, o.nom, p.titre, p.type_offre, p.montant_total, p.paiement, p.duree_mois,
           case when p.stripe_lien_montant = p.montant_total and p.stripe_lien_paiement = p.paiement then p.stripe_lien_url end
    from public.organismes o where o.id = p.organisme_id;
end;
$$;

revoke all on function public.accepter_proposition(uuid, text, text, text) from public;
grant execute on function public.accepter_proposition(uuid, text, text, text) to anon, authenticated;
