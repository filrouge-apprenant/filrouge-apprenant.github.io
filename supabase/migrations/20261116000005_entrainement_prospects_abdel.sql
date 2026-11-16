-- =============================================================================
-- Entraînement à la prospection B2B pour la plateforme d'Abdel
-- (sécurité privée et nettoyage professionnel, Bordeaux Métropole).
-- =============================================================================
--   - « domaine » sur les scénarios : 'filrouge' (vendre Fil Rouge aux centres
--     de formation) ou 'abdel' (vendre la sécurité / le nettoyage d'Abdel).
--   - 6 prospects fictifs pour Abdel (3 sécurité, 3 nettoyage).
-- Cette mise à jour n'ajoute que des éléments : rien n'est retiré de la base.
-- =============================================================================

alter table public.entrainement_scenarios
  add column domaine text not null default 'filrouge' check (domaine in ('filrouge', 'abdel'));

comment on column public.entrainement_scenarios.domaine is
  'filrouge : prospection des centres de formation pour Fil Rouge. abdel : prospection des entreprises pour la sécurité privée ou le nettoyage d''Abdel.';

with s as (
  insert into public.entrainement_scenarios
    (type, domaine, ordre, titre, difficulte, apprenant_nom, formation, financement, progression, derniere_connexion, contexte, objectif_appel)
  values
  ('prospect', 'abdel', 310, 'Sécurité · Il recrute un agent de sécurité', 'facile', 'Marc Durand, directeur de site',
   'Logistique Garonne — entrepôt de 8 000 m² à Bassens', 'PME, 45 salariés', null,
   'Offre d''emploi « agent de sécurité de nuit » publiée il y a 5 jours',
   'L''entrepôt recrute un agent de sécurité de nuit en CDI. Signal chaud : il n''a pas encore embauché.',
   'Montrer le coût complet d''un salarié (charges, nuits, congés, remplacements) face à une prestation, et obtenir une visite du site de 30 minutes avec deux créneaux proposés.'),
  ('prospect', 'abdel', 320, 'Sécurité · Chantier, vols de câbles', 'moyen', 'Nicolas Faure, conducteur de travaux',
   'Bâti Sud Construction — chantier de 40 logements à Lormont', 'PME, 80 salariés', null,
   'Permis de construire et panneau de chantier repérés',
   'Gros chantier en cours. Les chantiers de la métropole subissent beaucoup de vols de matériel et de câbles la nuit.',
   'Faire parler des incidents et de l''organisation actuelle, puis obtenir un rendez-vous sur le chantier.'),
  ('prospect', 'abdel', 330, 'Sécurité · Déjà un prestataire', 'difficile', 'Hélène Roussel, responsable des services généraux',
   'Clinique des Coteaux — établissement de santé à Cenon', 'ETI, 300 salariés', null,
   'Appel à froid (registre des entreprises)',
   'Établissement déjà gardienné par une grande société de sécurité nationale. Contrat qui se renouvelle dans l''année.',
   'Ne pas critiquer le prestataire, trouver ce qui pourrait être mieux, obtenir la date de fin de contrat et se positionner en renfort ou pour la prochaine consultation.'),
  ('prospect', 'abdel', 340, 'Nettoyage · Cabinet qui recrute un agent d''entretien', 'facile', 'Sophie Lambert, office manager',
   'Cabinet d''expertise comptable Lambert & Associés — Mérignac', 'TPE, 12 salariés, 250 m²', null,
   'Offre d''emploi « agent d''entretien 10 h par semaine »',
   'Le cabinet cherche quelqu''un pour le ménage du soir. L''ancienne salariée est partie.',
   'Comparer avec le recrutement (absences, remplacement, gestion), découvrir la surface et la fréquence, et obtenir une visite de 15 minutes.'),
  ('prospect', 'abdel', 350, 'Nettoyage · « Envoyez-moi un devis par mail »', 'moyen', 'Julien Morel, gérant',
   'Agence immobilière Morel — Bordeaux Chartrons', 'TPE, 6 salariés, vitrine et bureaux', null,
   'Appel à froid (commerce de quartier)',
   'Petite agence avec vitrine. Il a déjà une prestataire de ménage, pas très régulière.',
   'Passer l''objection « envoyez-moi un devis », poser les questions du devis (surface, fréquence, produits) et obtenir une visite avec deux créneaux.'),
  ('prospect', 'abdel', 360, 'Nettoyage · Syndic « trop cher »', 'difficile', 'Patricia Garcia, gestionnaire de copropriétés',
   'Cabinet Garcia Immobilier — syndic, 35 copropriétés sur la métropole', 'PME, 20 salariés', null,
   'Rencontrée à un salon de l''immobilier',
   'Gère les parties communes de nombreuses résidences. Les copropriétaires se plaignent de la propreté, mais elle négocie tout au prix le plus bas.',
   'Défendre le prix (24 € HT/h produits fournis par le client, 27 € HT/h produits fournis) sans brader, et obtenir un essai sur une résidence.')
  returning id, ordre
)
insert into public.entrainement_personas (scenario_id, personnage)
select s.id, p.personnage
from s
join (values
  (310, 'Tu es Marc Durand, 50 ans, directeur de site d''un entrepôt logistique. Tu as publié une offre pour un agent de sécurité de nuit parce que tu as eu deux intrusions cet hiver. Tu es pragmatique et pressé. Au début : « on va recruter en interne, c''est moins cher ». Tu n''as jamais calculé le coût complet (majorations de nuit et dimanche, congés, arrêts maladie, remplacements). Si l''appelante te fait réfléchir à ça avec des questions simples, tu deviens intéressé. Tu demandes si la société a bien l''autorisation CNAPS et une assurance. Tu acceptes une visite si on te propose deux créneaux précis. Tu te braques si on te donne un prix au téléphone sans avoir vu le site.'),
  (320, 'Tu es Nicolas Faure, 42 ans, conducteur de travaux, toujours sur le terrain, il y a du bruit autour de toi. Réponses courtes. Tu as eu deux vols de câbles et de matériel sur ce chantier, mais tu ne le dis que si on te demande comment ça se passe la nuit. Ton objection : « on a déjà une alarme et des caméras ». En vérité, l''alarme sonne et personne n''intervient avant le matin. Tu es sensible à la rapidité d''intervention et aux rondes. Tu acceptes que quelqu''un passe sur le chantier si l''appelante est concrète et ne te fait pas perdre de temps.'),
  (330, 'Tu es Hélène Roussel, 48 ans, responsable des services généraux d''une clinique. Polie, prudente, très procédurière. Ton objection : « nous avons déjà un prestataire national, nous sommes satisfaits ». En réalité, tu as des soucis de remplacement d''agents absents et d''agents qui changent tout le temps. Tu ne l''avoues que si l''appelante ne critique pas ton prestataire et te demande ce qui pourrait être encore mieux. Le contrat se renouvelle en juin, avec une consultation : tu donnes cette info seulement si on te la demande poliment. Tu peux accepter de recevoir le dossier (Kbis, CNAPS, assurances) et d''inscrire la société à la prochaine consultation ou pour du renfort ponctuel.'),
  (340, 'Tu es Sophie Lambert, 35 ans, office manager d''un cabinet comptable. Sympathique et organisée. Tu cherches quelqu''un pour le ménage du soir, 10 heures par semaine, parce que la salariée est partie. Tu ne savais pas qu''on pouvait passer par une entreprise. Tu poses des questions : qui vient, est-ce toujours la même personne, que se passe-t-il en cas d''absence, combien ça coûte. Les bureaux font 250 m², avec 2 sanitaires et une cuisine. Tu acceptes une visite si l''appelante te rassure sur la régularité et la confiance (clés, confidentialité des dossiers).'),
  (350, 'Tu es Julien Morel, 40 ans, gérant d''une agence immobilière. Décontracté mais pressé, tu dis tout de suite « envoyez-moi un devis par mail ». Tu as une prestataire qui vient deux fois par semaine, mais elle oublie souvent la vitrine et elle annule sans prévenir. Tu ne le dis que si l''appelante te demande quelle note tu mettrais à ton ménage actuel. Tu acceptes une visite de 15 minutes si l''appelante t''explique qu''un devis sans visite risque d''être faux et te propose deux créneaux précis.'),
  (360, 'Tu es Patricia Garcia, 55 ans, gestionnaire de copropriétés. Expérimentée, négociatrice dure. Ta première réaction au prix : « c''est beaucoup trop cher, mon prestataire actuel est à 19 euros de l''heure ». En réalité, les copropriétaires se plaignent tous les mois de la propreté des halls et des poubelles, et ça te fait perdre du temps en réclamations. Si l''appelante défend son prix avec la qualité, la régularité, un interlocuteur unique et moins de réclamations, sans baisser le tarif, tu deviens plus ouverte. Tu respectes quelqu''un qui ne brade pas. Tu peux accepter un essai sur une seule résidence à problème.')
) as p(ordre, personnage) on p.ordre = s.ordre;
