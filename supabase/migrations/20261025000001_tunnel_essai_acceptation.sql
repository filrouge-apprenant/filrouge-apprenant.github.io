-- =============================================================================
-- Tunnel de vente : essai gratuit 15 jours, tarif dégressif, acceptation en ligne
-- =============================================================================
--   1. Une proposition est soit un « essai » (gratuit, 15 jours, une fois par
--      organisme), soit une offre « standard » (au tarif à l'appel).
--   2. Tarif dégressif : 20 € l'appel sous 20 apprenants, 15 € de 20 à 150,
--      12 € au-delà (prive.prix_appel_degressif). Appliqué aux demandes reçues.
--   3. demander_essai_ou_devis() : comme demander_devis() (gardée telle quelle),
--      avec le type de demande (essai ou devis).
--   4. accepter_proposition() : le client accepte en ligne depuis sa page
--      personnelle (accepte_le rempli) ; la fiche passe en « Test gratuit »
--      (essai) ou « Client ». proposition_client() remplace la lecture publique.
-- Cette mise à jour n'ajoute que des éléments : rien n'est retiré de la base.
-- =============================================================================

alter table public.propositions
  add column type_offre       text not null default 'standard' check (type_offre in ('standard', 'essai')),
  add column duree_jours      integer check (duree_jours is null or duree_jours between 1 and 90),
  add column accepte_le       timestamptz,
  add column accepte_nom      text check (char_length(accepte_nom) <= 120),
  add column accepte_fonction text check (char_length(accepte_fonction) <= 120),
  add column accepte_email    text check (char_length(accepte_email) <= 200);

comment on column public.propositions.type_offre is 'standard = offre au tarif à l''appel ; essai = essai gratuit (une fois par organisme).';
comment on column public.propositions.duree_jours is 'Durée en jours (essai gratuit : 15). Vide = durée en mois.';

-- Un seul essai gratuit par organisme.
create unique index propositions_un_essai_par_organisme on public.propositions (organisme_id) where type_offre = 'essai';

-- -----------------------------------------------------------------------------
-- Tarif dégressif à l'appel
-- -----------------------------------------------------------------------------
create or replace function prive.prix_appel_degressif(p_nb integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_nb, 0) < 20 then 20::numeric
              when p_nb <= 150 then 15::numeric
              else 12::numeric end
$$;

-- -----------------------------------------------------------------------------
-- Demande depuis le site public : essai gratuit ou devis
-- -----------------------------------------------------------------------------
create or replace function public.demander_essai_ou_devis(
  p_organisme        text,
  p_contact_nom      text,
  p_contact_fonction text,
  p_email            text,
  p_telephone        text,
  p_nb_apprenants    integer,
  p_formations       text,
  p_message          text,
  p_piege            text default null,
  p_type             text default 'devis'
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
  v_type text := case when p_type = 'essai' then 'essai' else 'devis' end;
  v_nb integer;
  v_prix numeric;
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

  if v_type = 'essai' and v_org is not null
     and exists (select 1 from public.propositions where organisme_id = v_org and type_offre = 'essai') then
    raise exception 'Votre organisme a déjà bénéficié de l''essai gratuit. Demandez plutôt un devis : je vous réponds sous 48 h.' using errcode = 'P0001';
  end if;

  if v_org is null then
    insert into public.organismes (nom) values (v_nom) returning id into v_org;
    insert into public.organismes_suivi_commercial
      (organisme_id, etape, contact_nom, contact_fonction, contact_email, contact_telephone, prochaine_relance, notes)
    values
      (v_org, 'prospect', trim(p_contact_nom), nullif(trim(p_contact_fonction), ''), v_email,
       nullif(trim(p_telephone), ''), prive.aujourdhui(),
       case when v_type = 'essai' then 'Demande d''essai gratuit reçue depuis le site.' else 'Demande de devis reçue depuis le site.' end);
  else
    update public.organismes_suivi_commercial
       set prochaine_relance = prive.aujourdhui(),
           contact_telephone = coalesce(contact_telephone, nullif(trim(p_telephone), ''))
     where organisme_id = v_org;
  end if;

  if v_type = 'essai' then
    v_nb := least(coalesce(p_nb_apprenants, 20), 20);
    insert into public.propositions
      (organisme_id, statut, type_offre, demande_le, demande_nb_apprenants, demande_formations, demande_message,
       titre, description, nb_apprenants, duree_mois, duree_jours, appels_par_mois, prix_appel, montant_total, paiement)
    values
      (v_org, 'demande', 'essai', now(), p_nb_apprenants, nullif(trim(p_formations), ''), nullif(trim(p_message), ''),
       'Essai gratuit de 15 jours',
       'Jusqu''à 20 apprenants appelés une fois chacun pendant 15 jours : point sur la progression, objectifs, relance, aide pour l''inscription à l''examen. Votre espace en ligne avec le compte rendu de chaque appel, puis un bilan chiffré de 30 minutes. Sans engagement : vous décidez ensuite librement de continuer.',
       v_nb, 1, 15, 1, 0, 0, 'unique');
  else
    v_nb := coalesce(p_nb_apprenants, 20);
    v_prix := prive.prix_appel_degressif(v_nb);
    insert into public.propositions
      (organisme_id, statut, type_offre, demande_le, demande_nb_apprenants, demande_formations, demande_message,
       titre, nb_apprenants, duree_mois, appels_par_mois, prix_appel, montant_total, paiement)
    values
      (v_org, 'demande', 'standard', now(), p_nb_apprenants, nullif(trim(p_formations), ''), nullif(trim(p_message), ''),
       'Suivi téléphonique de vos apprenants', v_nb, 6, 1, v_prix, v_nb * 6 * v_prix, 'mensuel');
  end if;

  v_resume := case when v_type = 'essai' then 'Demande d''essai gratuit reçue depuis le site' else 'Demande de devis reçue depuis le site' end
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

revoke all on function public.demander_essai_ou_devis(text, text, text, text, text, integer, text, text, text, text) from public;
grant execute on function public.demander_essai_ou_devis(text, text, text, text, text, integer, text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Page publique d'une proposition (lien personnel par jeton)
-- -----------------------------------------------------------------------------
create or replace function public.proposition_client(p_jeton uuid)
returns table (
  organisme text, titre text, description text, nb_apprenants integer, duree_mois integer,
  appels_par_mois numeric, prix_appel numeric, montant_total numeric, paiement text,
  message_client text, lien_paiement text, statut text,
  type_offre text, duree_jours integer, accepte_le timestamptz, accepte_nom text,
  contact_nom text, contact_fonction text, contact_email text
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
         p.statut, p.type_offre, p.duree_jours, p.accepte_le, p.accepte_nom,
         s.contact_nom, s.contact_fonction, s.contact_email
  from public.propositions p
  join public.organismes o on o.id = p.organisme_id
  left join public.organismes_suivi_commercial s on s.organisme_id = p.organisme_id
  where p.jeton = p_jeton and p.statut in ('brouillon', 'envoyee', 'payee')
$$;

revoke all on function public.proposition_client(uuid) from public;
grant execute on function public.proposition_client(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Acceptation en ligne par le client
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
