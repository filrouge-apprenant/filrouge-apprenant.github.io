-- =============================================================================
-- Offre d'essai : « 30 jours sur vos apprenants à risque » (16 novembre 2026)
-- =============================================================================
-- Remplace l'essai gratuit de 15 jours (un seul appel par apprenant : aucun
-- résultat visible en 15 jours). Nouvelle offre :
--   - 20 apprenants à risque au plus (pas connectés depuis 2 à 4 semaines) ;
--   - 2 appels chacun (au début et vers le 15e jour) + relances par email ;
--   - un groupe comparable que l'on n'appelle pas (groupe témoin) ;
--   - bilan chiffré au 30e jour : reprises, progression, comparées au témoin ;
--   - objectif de reprise fixé avec le centre au démarrage, selon sa
--     plateforme. Atteint : le suivi continue au tarif normal pendant 3 mois.
--     Non atteint : rien à payer.
-- Ce fichier ne supprime rien : il réécrit le texte de l'essai, la fonction
-- publique de demande et les modèles d'emails qui parlaient des 15 jours.
-- =============================================================================

create or replace function prive.texte_essai_30_jours()
returns text language sql immutable set search_path = '' as $f$
  select 'Jusqu''à 20 de vos apprenants à risque (pas connectés depuis 2 à 4 semaines), appelés deux fois chacun pendant 30 jours : point sur la progression, objectifs, relance, aide pour l''inscription à l''examen, et un email de relance après chaque appel manqué. Un groupe comparable n''est pas appelé, pour mesurer l''effet réel. Au 30e jour, un bilan chiffré de 30 minutes : combien ont repris leur formation et progressé, comparé aux apprenants non appelés. L''objectif de reprise est fixé ensemble au démarrage, selon votre plateforme : s''il est atteint, le suivi continue au tarif normal pendant 3 mois ; sinon, vous ne devez rien.'::text
$f$;
revoke all on function prive.texte_essai_30_jours() from public, anon;
grant execute on function prive.texte_essai_30_jours() to authenticated;

comment on column public.propositions.duree_jours is 'Durée en jours (essai : 30). Vide = durée en mois.';
comment on column public.propositions.type_offre is 'standard = offre au tarif à l''appel ; essai = essai de 30 jours sur les apprenants à risque (une fois par organisme).';

-- Essais déjà créés mais pas encore acceptés : passent à la nouvelle formule.
update public.propositions
   set titre = 'Essai de 30 jours sur vos apprenants à risque',
       description = prive.texte_essai_30_jours(),
       duree_jours = 30, appels_par_mois = 2
 where type_offre = 'essai' and accepte_le is null;

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
       v_nb, 1, 30, 2, 0, 0, 'unique');
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

-- -----------------------------------------------------------------------------
-- Modèles d'emails aux organismes (prospection)
-- -----------------------------------------------------------------------------
update public.modeles_email set texte = replace(texte,
  'je peux vous montrer comment un appel de suivi par mois et par apprenant réduit ce chiffre, avec 15 jours d''essai gratuit pour le vérifier sur vos propres apprenants.',
  'je peux le vérifier sur vos propres apprenants : un essai de 30 jours sur 20 apprenants à risque, comparés à des apprenants que je n''appelle pas.')
 where texte like '%15 jours d''essai gratuit pour le vérifier%';

update public.modeles_email set texte = replace(texte,
  'on peut le vérifier sur vos vrais apprenants avec 15 jours d''essai gratuit, sans engagement.',
  'on peut le vérifier sur vos vrais apprenants : 30 jours d''essai sur 20 apprenants à risque, avec un bilan chiffré à la fin.')
 where texte like '%avec 15 jours d''essai gratuit, sans engagement.%';

update public.modeles_email set texte = replace(texte,
  'je vous propose 15 jours d''essai gratuit sur 20 de vos apprenants, puis un bilan chiffré. Vous décidez ensuite, sans engagement.',
  'je vous propose un essai de 30 jours sur 20 de vos apprenants à risque : deux appels chacun, puis un bilan chiffré comparé à des apprenants que je n''appelle pas.')
 where texte like '%15 jours d''essai gratuit sur 20 de vos apprenants%';

update public.modeles_email set texte = replace(texte,
  'je peux démarrer les 15 jours d''essai gratuit dès la semaine prochaine.',
  'je peux démarrer l''essai de 30 jours sur vos apprenants à risque dès la semaine prochaine.')
 where texte like '%démarrer les 15 jours d''essai gratuit%';

update public.modeles_email set texte = replace(texte,
  'Vous pouvez tester gratuitement pendant 15 jours sur 20 apprenants, sans engagement.',
  'Vous pouvez commencer par un essai de 30 jours sur 20 apprenants à risque, avec un bilan chiffré à la fin.')
 where texte like '%tester gratuitement pendant 15 jours sur 20 apprenants%';

update public.modeles_email set texte = replace(texte,
  'l''essai gratuit de 15 jours reste disponible',
  'l''essai de 30 jours sur vos apprenants à risque reste disponible')
 where texte like '%l''essai gratuit de 15 jours reste disponible%';

update public.modeles_email set texte = replace(replace(texte,
  '- 15 jours d''essai gratuit sur 20 apprenants, puis un bilan chiffré ;',
  '- un essai de 30 jours sur 20 apprenants à risque (deux appels chacun), puis un bilan chiffré comparé à des apprenants non appelés ; si l''objectif de reprise fixé ensemble est atteint, le suivi continue au tarif normal pendant 3 mois, sinon vous ne devez rien ;'),
  'Pour démarrer l''essai, il me faut seulement la liste des 20 apprenants (nom, téléphone, email, formation, date d''entrée).',
  'Pour démarrer l''essai, il me faut la liste de vos apprenants qui ne se sont pas connectés depuis 2 à 4 semaines (nom, téléphone, email, formation, date d''entrée) : on choisit ensemble les 20 que j''appelle et ceux qui servent de comparaison.')
 where texte like '%15 jours d''essai gratuit sur 20 apprenants, puis un bilan chiffré ;%';

update public.modeles_email set categorie = 'Prospection — essai 30 jours' where categorie = 'Prospection — essai gratuit';

update public.modeles_email set
  titre = 'Proposer l''essai de 30 jours',
  objet = '30 jours pour mesurer l''effet sur vos apprenants à risque',
  texte = $t$Bonjour {contact},

Plutôt qu'un long discours, je vous propose de mesurer le résultat sur vos propres apprenants.

Pendant 30 jours, j'appelle 20 apprenants de {organisme} qui ne se sont pas connectés depuis 2 à 4 semaines, deux fois chacun, avec une relance par email après chaque appel manqué. Un groupe comparable n'est pas appelé.

Au 30e jour, un bilan chiffré : combien ont repris leur formation et progressé, comparé aux apprenants non appelés. Nous fixons ensemble un objectif de reprise au départ : s'il est atteint, le suivi continue au tarif normal pendant 3 mois ; sinon, vous ne devez rien.

On en parle 10 minutes cette semaine ?

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$
 where categorie = 'Prospection — essai 30 jours' and titre = 'Proposer les 15 jours gratuits';

update public.modeles_email set
  objet = 'Démarrage de votre essai de 30 jours',
  texte = $t$Bonjour {contact},

Merci pour votre confiance ! Pour démarrer l'essai de 30 jours, j'ai besoin de :

- la liste de vos apprenants qui ne se sont pas connectés depuis 2 à 4 semaines (nom, prénom, téléphone, email, formation, date d'entrée, date d'examen si elle est connue) : nous choisirons ensemble les 20 que j'appelle et ceux qui servent de comparaison ;
- un accès en lecture à votre plateforme de formation, pour voir leurs connexions et leur progression ;
- le nom de la personne à prévenir si un apprenant est en difficulté.

Lors de notre point de démarrage, nous fixerons l'objectif de reprise, adapté à votre plateforme. Vous recevrez aussi vos accès à votre espace Fil Rouge pour suivre les comptes rendus en direct.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$
 where categorie = 'Prospection — essai 30 jours' and titre = 'Démarrage de l''essai (ce qu''il me faut)';

update public.modeles_email set
  objet = 'Bilan de vos 30 jours d''essai',
  texte = $t$Bonjour {contact},

Les 30 jours d'essai pour {organisme} sont terminés. Vous trouverez le bilan dans votre espace Fil Rouge : combien d'apprenants appelés ont repris leur formation et progressé, comparé à ceux que je n'ai pas appelés, les freins repérés et les apprenants à surveiller.

Comme convenu au démarrage, si l'objectif de reprise est atteint, le suivi continue au tarif normal pendant 3 mois. Je vous propose d'en parler 10 minutes {date_rdv} pour regarder les chiffres ensemble.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$
 where categorie = 'Prospection — essai 30 jours' and titre = 'Fin de l''essai : bilan et suite';

-- -----------------------------------------------------------------------------
-- Entraînement aux appels de vente : objectifs et personnages
-- -----------------------------------------------------------------------------
update public.entrainement_scenarios
   set objectif_appel = replace(objectif_appel, 'l''essai gratuit de 15 jours', 'l''essai de 30 jours sur ses apprenants à risque')
 where objectif_appel like '%l''essai gratuit de 15 jours%';
update public.entrainement_personas
   set personnage = replace(personnage, 'l''essai gratuit', 'l''essai de 30 jours sur tes apprenants à risque')
 where personnage like '%l''essai gratuit%';
