-- =============================================================================
-- Modèles d'emails pour les organismes prospectés (16 novembre 2026)
-- =============================================================================
-- Nouvelle colonne « destinataire » : 'apprenant' (par défaut, tous les modèles
-- existants) ou 'organisme' (prospection). Les menus des fiches élèves ne
-- montrent que les modèles « apprenant » ; ceux « organisme » apparaissent dans
-- l'envoi du simulateur (Machine de prospection). Une appelante ne lit jamais
-- les modèles de prospection.
-- Nouvelles variables : {contact} (nom du contact du centre) et
-- {lien_simulateur} (lien du simulateur pré-rempli pour ce centre).
-- =============================================================================

alter table public.modeles_email
  add column if not exists destinataire text not null default 'apprenant'
    check (destinataire in ('apprenant', 'organisme'));
comment on column public.modeles_email.destinataire is
  'À qui s''adresse le modèle : apprenant (fiches élèves, relances) ou organisme (prospection).';

drop policy if exists modeles_email_appelante_lecture on public.modeles_email;
create policy modeles_email_appelante_lecture on public.modeles_email for select to authenticated
  using (prive.est_appelante() and actif and destinataire = 'apprenant');

insert into public.modeles_email (categorie, ordre, destinataire, titre, objet, texte) values
('Prospection — envoi du simulateur', 60, 'organisme', 'Envoi du simulateur (premier contact)', 'Ce que vous coûtent les abandons — {organisme}',
$t$Bonjour {contact},

Je m'appelle Émilie Rachas, je dirige Fil Rouge Apprenants : j'appelle les apprenants des organismes de formation à distance chaque mois pour éviter qu'ils décrochent, avec un compte rendu de chaque appel utilisable pour Qualiopi.

Plutôt qu'une plaquette, je vous ai préparé un calcul d'une minute pour {organisme} : vous mettez vos propres chiffres (apprenants, prix, abandons) et vous voyez ce que les abandons vous coûtent chaque année, et à partir de combien d'abandons évités un suivi téléphonique est remboursé.

{lien_simulateur}

Vos chiffres restent dans votre navigateur, rien n'est enregistré.

Si le résultat vous parle, on peut le vérifier sur vos vrais apprenants avec 15 jours d'essai gratuit, sans engagement.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com

Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « STOP ».$t$),

('Prospection — envoi du simulateur', 61, 'organisme', 'Envoi du simulateur (après un appel)', 'Le calcul promis — {organisme}',
$t$Bonjour {contact},

Merci pour notre échange. Comme promis, voici le calcul d'une minute préparé pour {organisme} : vous mettez vos propres chiffres et vous voyez ce que les abandons vous coûtent, et à partir de combien d'abandons évités le suivi est remboursé.

{lien_simulateur}

Vos chiffres restent dans votre navigateur, rien n'est enregistré.

Si le résultat vous parle, je vous propose 15 jours d'essai gratuit sur 20 de vos apprenants, puis un bilan chiffré. Vous décidez ensuite, sans engagement.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — envoi du simulateur', 62, 'organisme', 'Relance du simulateur (3 jours après)', 'Avez-vous pu faire le calcul ?',
$t$Bonjour {contact},

Je reviens vers vous au sujet du calcul que je vous ai envoyé pour {organisme}. Avez-vous eu une minute pour y mettre vos chiffres ?

{lien_simulateur}

Si le résultat ne vous parle pas, dites-le-moi simplement : je ne vous relancerai pas. S'il vous parle, je peux démarrer les 15 jours d'essai gratuit dès la semaine prochaine.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$);
