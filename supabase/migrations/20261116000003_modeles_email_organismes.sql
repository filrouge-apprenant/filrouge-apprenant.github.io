-- =============================================================================
-- Emails tout prêts pour les fiches organismes (16 novembre 2026)
-- Relances, rendez-vous, simulateur vierge, essai gratuit, clients.
-- Variables : {contact} {organisme} {date_rdv} {lien_simulateur_vierge}
-- Signature écrite en toutes lettres (la variable {signature} est celle des élèves).
-- =============================================================================
insert into public.modeles_email (categorie, ordre, destinataire, titre, objet, texte) values

('Prospection — envoi du simulateur', 59, 'organisme', 'Simulateur vierge, à remplir par le centre', 'Combien vous coûtent les abandons ? Le calcul en 1 minute',
$t$Bonjour {contact},

Je vous propose un petit calcul pour {organisme}, à faire vous-même en une minute : vous entrez votre nombre d'apprenants, le prix moyen de vos formations, leur durée et votre taux d'abandon, et vous voyez ce que les abandons vous coûtent chaque année.

{lien_simulateur_vierge}

Vos chiffres restent dans votre navigateur : je ne les vois pas et rien n'est enregistré.

Si le résultat vous interpelle, je peux vous montrer comment un appel de suivi par mois et par apprenant réduit ce chiffre, avec 15 jours d'essai gratuit pour le vérifier sur vos propres apprenants.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com

Si vous ne souhaitez plus recevoir de message de ma part, répondez simplement « STOP ».$t$),

('Prospection — relances', 70, 'organisme', 'Après un appel sans réponse', 'J''ai essayé de vous joindre — {organisme}',
$t$Bonjour {contact},

J'ai essayé de vous joindre aujourd'hui au sujet du suivi des apprenants à distance de {organisme}.

En deux mots : j'appelle chaque mois les apprenants des organismes de formation pour éviter qu'ils décrochent, et chaque appel donne un compte rendu utilisable pour Qualiopi.

Quel moment vous arrangerait pour un échange de 10 minutes ? Il suffit de répondre à cet email avec un créneau.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — relances', 71, 'organisme', 'Après un message vocal', 'Suite à mon message vocal',
$t$Bonjour {contact},

Je viens de vous laisser un message vocal. Pour aller plus vite, voici l'essentiel par écrit.

Fil Rouge Apprenants appelle les apprenants à distance de {organisme} une fois par mois : point sur la progression, objectifs, relance avant l'examen, et un compte rendu de chaque appel (utile pour vos indicateurs Qualiopi 12 et 19).

Vous pouvez tester gratuitement pendant 15 jours sur 20 apprenants, sans engagement. Est-ce que ça vaut un échange de 10 minutes ?

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — relances', 72, 'organisme', 'Sans réponse à mon email', 'Je me permets de revenir vers vous',
$t$Bonjour {contact},

Je me permets de revenir vers vous au sujet de mon précédent message sur le suivi des apprenants de {organisme}.

Une seule question : aujourd'hui, qui appelle vos apprenants quand ils ne se connectent plus ?

Si ce n'est pas un sujet pour vous en ce moment, dites-le-moi simplement et je ne vous relancerai pas.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — relances', 73, 'organisme', 'Dernière relance', 'Je clos mon dossier ?',
$t$Bonjour {contact},

Je n'ai pas eu de retour de votre part et je ne veux pas encombrer votre boîte mail. Sauf message de votre part, je ne vous relancerai plus.

Si le suivi des apprenants à distance redevient un sujet pour {organisme}, l'essai gratuit de 15 jours reste disponible : il suffit de répondre à cet email.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — rendez-vous', 80, 'organisme', 'Proposer un rendez-vous', 'Un échange de 15 minutes ?',
$t$Bonjour {contact},

Je vous propose un échange de 15 minutes, par téléphone ou en visio, pour voir si un suivi téléphonique mensuel de vos apprenants aurait du sens pour {organisme}.

Seriez-vous disponible {date_rdv} ? Sinon, indiquez-moi le créneau qui vous arrange.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — rendez-vous', 81, 'organisme', 'Confirmation du rendez-vous', 'Confirmation de notre rendez-vous — {date_rdv}',
$t$Bonjour {contact},

Je vous confirme notre rendez-vous {date_rdv}.

Pour que l'échange vous soit utile, gardez en tête si possible trois chiffres : votre nombre d'apprenants à distance par an, la durée moyenne des parcours et votre taux d'abandon (même approximatif).

À très vite,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — rendez-vous', 82, 'organisme', 'Rappel la veille', 'Notre rendez-vous de demain',
$t$Bonjour {contact},

Petit rappel : nous avons rendez-vous {date_rdv}. Si le créneau ne vous convient plus, répondez simplement à cet email et on le décale.

À demain,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — rendez-vous', 83, 'organisme', 'Absent au rendez-vous', 'On décale notre rendez-vous ?',
$t$Bonjour {contact},

Je n'ai pas réussi à vous joindre pour notre rendez-vous. Pas de souci, les journées sont chargées.

Quel nouveau créneau vous arrangerait ? Il suffit de répondre à cet email.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — rendez-vous', 84, 'organisme', 'Après le rendez-vous (récapitulatif)', 'Suite à notre échange — {organisme}',
$t$Bonjour {contact},

Merci pour notre échange. Comme convenu, voici le récapitulatif :

- un appel de suivi par apprenant et par mois (progression, objectifs, relance avant l'examen) ;
- un compte rendu de chaque appel, consultable en ligne et utilisable pour Qualiopi ;
- 15 jours d'essai gratuit sur 20 apprenants, puis un bilan chiffré ;
- ensuite, un tarif à l'appel : 20 € HT sous 20 apprenants suivis, 15 € de 20 à 150, 12 € au-delà, sans engagement de durée (préavis de 30 jours).

Pour démarrer l'essai, il me faut seulement la liste des 20 apprenants (nom, téléphone, email, formation, date d'entrée).

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — essai gratuit', 90, 'organisme', 'Proposer les 15 jours gratuits', '15 jours pour juger sur pièce',
$t$Bonjour {contact},

Plutôt qu'un long discours, je vous propose de juger sur pièce : pendant 15 jours, j'appelle gratuitement 20 apprenants de {organisme}, et vous recevez le compte rendu de chaque appel.

À la fin, un bilan chiffré : apprenants joints, freins repérés, objectifs fixés. Vous décidez ensuite, sans engagement.

On démarre la semaine prochaine ?

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — essai gratuit', 91, 'organisme', 'Démarrage de l''essai (ce qu''il me faut)', 'Démarrage de votre essai gratuit',
$t$Bonjour {contact},

Merci pour votre confiance ! Pour démarrer l'essai de 15 jours, j'ai besoin de :

- la liste des 20 apprenants (nom, prénom, téléphone, email, formation, date d'entrée et date d'examen si elle est connue) ;
- le nom de la personne à prévenir si un apprenant est en difficulté ;
- si possible, un accès en lecture à votre plateforme de formation pour voir leur progression.

Vous recevrez vos accès à votre espace Fil Rouge pour suivre les comptes rendus en direct.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Prospection — essai gratuit', 92, 'organisme', 'Fin de l''essai : bilan et suite', 'Bilan de vos 15 jours d''essai',
$t$Bonjour {contact},

Les 15 jours d'essai pour {organisme} sont terminés. Vous trouverez le bilan dans votre espace Fil Rouge : apprenants joints, freins repérés, objectifs fixés et apprenants à surveiller.

Si vous souhaitez continuer, je vous envoie la proposition pour l'ensemble de vos apprenants. Sinon, dites-le-moi simplement, sans aucun engagement.

Seriez-vous disponible pour en parler 10 minutes {date_rdv} ?

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Clients', 100, 'organisme', 'Demande de recommandation', 'Une petite question',
$t$Bonjour {contact},

Merci encore pour votre confiance. Une petite question : connaissez-vous un autre organisme de formation qui aurait le même besoin de suivi pour ses apprenants ?

Si vous me mettez en relation, je vous offre un mois de suivi dès que ce centre devient client.

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$),

('Clients', 101, 'organisme', 'Point mensuel avec le client', 'Le point du mois — {organisme}',
$t$Bonjour {contact},

Le compte rendu du mois est disponible dans votre espace Fil Rouge : apprenants joints, apprenants à risque et examens à venir.

Avez-vous 10 minutes {date_rdv} pour faire le point ensemble et ajuster le suivi si besoin ?

Belle journée,
Émilie Rachas
Fil Rouge Apprenants
contact.filrouge.apprenant@gmail.com$t$);
