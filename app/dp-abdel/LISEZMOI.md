# CRM Abdel

Outil de prospection B2B (sécurité privée en priorité, nettoyage) d'Émilie pour Abdel, zone Bordeaux Métropole.

- Adresse : https://filrouge-apprenant.github.io/dp-abdel/
- Connexion : même compte que Fil Rouge (code par email + double authentification).
- Données : projet Supabase de Fil Rouge, tables séparées `abdel_prospects`, `abdel_appels_offres`, `abdel_parametres`,
  lisibles uniquement par les comptes de `prive.abdel_membres` en double authentification (migration `supabase/migrations/20261111000001_crm_dp_abdel.sql`).
- Recherche d'entreprises (API Recherche d'entreprises de l'État) et veille BOAMP : fonction serveur `supabase/functions/abdel-recherche`.
- Fichiers : `core.js` (score, calculs, statistiques — sans interface), `data.js` (sites, cibles, communes, scripts), `app.js` (écrans), `styles.css`.
- Aucune compilation : publié tel quel avec le reste du dossier `app`.
