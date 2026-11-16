# CRM Abdel

Outil de prospection B2B (sécurité privée en priorité, nettoyage) d'Émilie pour Abdel, zone Bordeaux Métropole.

- Adresse : https://filrouge-apprenant.github.io/dp-abdel/
- Connexion : même compte que Fil Rouge (code par email + double authentification).
- Données : projet Supabase de Fil Rouge, tables séparées `abdel_prospects`, `abdel_appels_offres`, `abdel_parametres`,
  lisibles uniquement par les comptes de `prive.abdel_membres` en double authentification (migration `supabase/migrations/20261111000001_crm_dp_abdel.sql`).
- Recherche d'entreprises (API Recherche d'entreprises de l'État) et veille BOAMP : fonction serveur `supabase/functions/abdel-recherche`.
- Fichiers : `core.js` (score, calculs, statistiques — sans interface), `data.js` (sites, cibles, communes, scripts), `app.js` (écrans), `styles.css`.
- Aucune compilation : publié tel quel avec le reste du dossier `app`.
- Site public d'acquisition (14/11/2026) : `app/abdel/` (accueil, simulateur nettoyage, simulateur sécurité verrouillé tant que le n° CNAPS n'est pas dans Paramètres, 8 pages locales, mentions légales). Pages générées par `outils/generer_site_abdel.py` ; calculs dans `app/abdel/calcul.js`. Les demandes passent par la fonction publique `supabase/functions/abdel-estimation` (crée la fiche « Simulateur du site » + e-mail à Émilie via Brevo).
- Événements : table `abdel_evenements` (migration 20261114000002), écran « Événements » filtré selon la taille de l'équipe (Paramètres › agents disponibles, 6 par défaut), alimenté par l'agent Leads.
- Tests d'écran : `tests/ecran_abdel_site.py`, `tests/ecran_abdel_evenements.py`.
- Entraînement aux appels (16/11/2026) : `entrainement.js` (#/entrainement), prospects fictifs joués par l'IA (tables `entrainement_*`, domaine `abdel`, migration 20261116000005), fonction serveur `simulation-appel`, voix `../voix.js`. Test : `tests/ecran_abdel_entrainement.py`.
