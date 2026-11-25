-- Essai de 30 jours payant (décidé le 25 novembre 2026) : forfait de lancement
-- de 490 € HT au lieu de 600 € (40 appels × 15 €), payé à la commande.
-- Plus d'objectif conditionnel ni d'engagement de 3 mois : après le bilan,
-- le centre décide librement de continuer au tarif normal, sans engagement.
-- Aucune donnée supprimée.

create or replace function prive.texte_essai_30_jours()
returns text language sql immutable set search_path = '' as $$
  select 'Jusqu''à 20 de vos apprenants à risque (pas connectés depuis 2 à 4 semaines), appelés deux fois chacun pendant 30 jours : point sur la progression, objectifs, relance, aide pour l''inscription à l''examen, et un email de relance après chaque appel manqué. 20 apprenants comparables ne sont pas appelés, pour mesurer l''effet réel. Au 30e jour, un bilan chiffré de 30 minutes : combien ont repris leur formation et progressé, comparé aux apprenants non appelés. Forfait de lancement : 490 € HT au lieu de 600 € HT (40 appels × 15 €), payable à la commande. Ensuite, vous décidez librement de continuer ou non, au tarif normal, sans engagement.'::text
$$;

-- Demande d'essai depuis le site : la proposition est créée à 490 € HT
-- (12,25 € par appel, 2 appels par apprenant, au plus 20 apprenants).
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
    raise exception 'Votre organisme a déjà bénéficié de l''essai de 30 jours. Demandez plutôt un devis : je vous réponds sous 48 h.' using errcode = 'P0001';
  end if;

  if v_org is null then
    insert into public.organismes (nom) values (v_nom) returning id into v_org;
    insert into public.organismes_suivi_commercial
      (organisme_id, etape, contact_nom, contact_fonction, contact_email, contact_telephone, prochaine_relance, notes)
    values
      (v_org, 'prospect', trim(p_contact_nom), nullif(trim(p_contact_fonction), ''), v_email,
       nullif(trim(p_telephone), ''), prive.aujourdhui(),
       case when v_type = 'essai' then 'Demande d''essai de 30 jours reçue depuis le site.' else 'Demande de devis reçue depuis le site.' end);
  else
    update public.organismes_suivi_commercial
       set prochaine_relance = prive.aujourdhui(),
           contact_telephone = coalesce(contact_telephone, nullif(trim(p_telephone), ''))
     where organisme_id = v_org;
  end if;

  if v_type = 'essai' then
    -- Essai de 30 jours : 20 apprenants à risque au plus, 2 appels chacun.
    v_nb := least(coalesce(p_nb_apprenants, 20), 20);
    insert into public.propositions
      (organisme_id, statut, type_offre, demande_le, demande_nb_apprenants, demande_formations, demande_message,
       titre, description, nb_apprenants, duree_mois, duree_jours, appels_par_mois, prix_appel, montant_total, paiement)
    values
      (v_org, 'demande', 'essai', now(), p_nb_apprenants, nullif(trim(p_formations), ''), nullif(trim(p_message), ''),
       'Essai de 30 jours sur vos apprenants à risque',
       prive.texte_essai_30_jours(),
       v_nb, 1, 30, 2, 12.25, round(v_nb * 2 * 12.25, 2), 'unique');
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

  v_resume := case when v_type = 'essai' then 'Demande d''essai de 30 jours reçue depuis le site' else 'Demande de devis reçue depuis le site' end
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

-- Essais pas encore acceptés : nouveau texte et nouveau prix.
update public.propositions
   set description = prive.texte_essai_30_jours(),
       prix_appel = 12.25,
       montant_total = round(nb_apprenants * 2 * 12.25, 2),
       paiement = 'unique'
 where type_offre = 'essai' and accepte_le is null and statut in ('demande', 'brouillon', 'envoyee');

-- Emails aux organismes
update public.modeles_email set texte = replace(texte,
  'un essai de 30 jours sur 20 apprenants à risque (deux appels chacun), puis un bilan chiffré comparé à des apprenants non appelés ; si l''objectif de reprise fixé ensemble est atteint, le suivi continue au tarif normal pendant 3 mois, sinon vous ne devez rien ;',
  'un essai de 30 jours sur 20 apprenants à risque (deux appels chacun), puis un bilan chiffré comparé à 20 apprenants non appelés : forfait de lancement de 490 € HT au lieu de 600 €, payable à la commande ;')
 where id = 'a10c0148-8829-4423-924b-c53ee56c785c';

update public.modeles_email set texte = replace(replace(texte,
  'Un groupe comparable n''est pas appelé.',
  '20 apprenants comparables ne sont pas appelés.'),
  'Nous fixons ensemble un objectif de reprise au départ : s''il est atteint, le suivi continue au tarif normal pendant 3 mois ; sinon, vous ne devez rien.',
  'C''est un forfait de lancement de 490 € HT pour les 30 jours, au lieu de 600 € au tarif normal. Ensuite, vous décidez librement de continuer ou non.')
 where id = 'ddc2e1d7-587d-4231-984d-6533b2acbafd';

update public.modeles_email set texte = replace(texte,
  'Lors de notre point de démarrage, nous fixerons l''objectif de reprise, adapté à votre plateforme.',
  'Lors de notre point de démarrage, nous choisirons ce que nous mesurons, selon votre plateforme (connexions, progression ou objectifs tenus). Le forfait de 490 € HT se règle en ligne avec le lien de paiement que je vous ai envoyé.')
 where id = '54b39b76-f515-4540-a5b3-893306577982';

update public.modeles_email set texte = replace(texte,
  'Comme convenu au démarrage, si l''objectif de reprise est atteint, le suivi continue au tarif normal pendant 3 mois. Je vous propose',
  'Si vous souhaitez continuer, le suivi passe au tarif normal, sans engagement, par prélèvement mensuel des seuls appels passés. Je vous propose')
 where id = 'fd70f53c-ac6a-44d2-afad-5f313d70958c';

-- Entraînement aux appels de vente
update public.entrainement_scenarios set objectif_appel = replace(objectif_appel,
  'l''expérience et l''essai sans risque',
  'l''expérience et l''essai de 30 jours à prix de lancement')
 where id = 'aeae493d-11ab-46a6-beb1-683562c2fc81';

update public.entrainement_personas set personnage = replace(personnage,
  'essai de 30 jours sans engagement qui permet de juger sur pièce',
  'essai de 30 jours à 490 € HT, sans engagement ensuite, qui permet de juger sur pièce')
 where personnage like 'Tu es Catherine Lemoine%';

update public.entrainement_personas set personnage = replace(personnage,
  'Tu demandes si l''essai coûte quelque chose.',
  'Tu demandes si l''essai coûte quelque chose. La réponse est 490 € HT pour 30 jours au lieu de 600 € : tu trouves ça un peu cher pour toi, mais tu acceptes si l''appelante te montre calmement qu''un seul abandon évité le rembourse, sans baisser son prix.')
 where personnage like 'Tu es Mehdi Kaci%';
