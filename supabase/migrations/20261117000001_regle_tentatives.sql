-- Règle de facturation des apprenants injoignables (décidée le 17 novembre 2026)
--  - jusqu'à 10 tentatives d'appel par mois et par apprenant ;
--  - la facture du mois est due dès 5 tentatives réparties sur au moins
--    3 jours différents, le matin (avant 12 h) et en fin de journée (après 17 h) ;
--  - 2 emails de relance automatiques seulement : au 1er appel manqué du mois
--    et à la 5e tentative.
-- Rien n'est supprimé : les 6 autres emails de relance restent disponibles
-- pour un envoi à la main (ils ne partent plus tout seuls).

alter table public.modeles_email drop constraint if exists modeles_email_tentative_check;
alter table public.modeles_email add constraint modeles_email_tentative_check
  check (tentative >= 1 and tentative <= 10);

-- Les emails 2, 3, 4, 6, 7 et 8 ne partent plus automatiquement.
update public.modeles_email
   set tentative = null,
       titre = regexp_replace(titre, '^Tentative [0-9]+ — ', 'À la main — ')
 where tentative in (2, 3, 4, 6, 7, 8);

-- Email automatique n° 1 : 1er appel manqué du mois.
update public.modeles_email
   set titre = 'Automatique — 1er appel manqué du mois'
 where tentative = 1;

-- Email automatique n° 2 : 5e tentative (celle qui déclenche la facture du mois).
update public.modeles_email
   set titre = 'Automatique — 5e tentative du mois',
       objet = 'J''essaie de vous joindre depuis plusieurs jours',
       texte = E'Bonjour {prenom},\n\nJ''ai essayé de vous appeler plusieurs fois ces derniers jours, à différents moments, pour faire le point sur {formation}, sans réussir à vous joindre.\n\nPas besoin d''un long appel : répondez simplement à cet email avec un mot (« tout va bien », « j''ai du retard », « j''ai besoin d''aide ») ou avec le moment qui vous arrange, et je vous rappelle à cette heure-là.\n\n{organisme} et moi tenons à ce que vous alliez au bout de votre formation.\n\n{signature}'
 where tentative = 5;
