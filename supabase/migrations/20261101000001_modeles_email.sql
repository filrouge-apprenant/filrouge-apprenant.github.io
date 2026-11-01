-- =============================================================================
-- Bibliothèque de modèles d'emails (1er novembre 2026)
-- =============================================================================
-- Deux menus déroulants dans la plateforme : la catégorie (ex. « Rendez-vous »),
-- puis le modèle (ex. « Absent au rendez-vous »). Émilie modifie, ajoute ou
-- désactive les modèles depuis la page « Modèles d'emails ».
--
-- Relances automatiques : un modèle peut porter un numéro de tentative (1 à 8).
-- Quand un appel du mois n'aboutit pas (répondeur, pas de réponse…), la
-- plateforme propose ou envoie le modèle qui porte le numéro de cette tentative.
--
-- Variables remplacées à l'envoi : {prenom} {moi} {organisme} {formation}
-- {avancement} {date_examen} {date_rdv} {signature}
--
-- Droits : l'administratrice fait tout ; une appelante active lit les modèles
-- actifs (pour écrire à ses apprenants) ; un client ne voit rien.
-- Ajout pur : aucune table existante n'est modifiée.
-- =============================================================================

create table public.modeles_email (
  id          uuid primary key default gen_random_uuid(),
  categorie   text not null check (length(trim(categorie)) between 1 and 80),
  titre       text not null check (length(trim(titre)) between 1 and 120),
  objet       text not null check (length(trim(objet)) between 1 and 200),
  texte       text not null check (length(trim(texte)) between 1 and 5000),
  ordre       integer not null default 0,
  tentative   smallint check (tentative between 1 and 8),
  actif       boolean not null default true,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now()
);

comment on table public.modeles_email is
  'Modèles d''emails aux apprenants, rangés par catégorie, modifiables par l''administratrice.';
comment on column public.modeles_email.tentative is
  'Numéro de tentative de relance (1 à 8) auquel ce modèle répond automatiquement.';

-- Un seul modèle actif par numéro de tentative.
create unique index modeles_email_tentative_unique
  on public.modeles_email (tentative) where actif and tentative is not null;

create trigger modeles_email_modifie_le
  before update on public.modeles_email
  for each row execute function prive.maj_modifie_le();

alter table public.modeles_email enable row level security;
revoke all on public.modeles_email from anon;
grant select, insert, update, delete on public.modeles_email to authenticated;

create policy modeles_email_admin on public.modeles_email for all to authenticated
  using (prive.est_admin()) with check (prive.est_admin());
create policy modeles_email_appelante_lecture on public.modeles_email for select to authenticated
  using (prive.est_appelante() and actif);

-- -----------------------------------------------------------------------------
-- Les modèles de départ (modifiables ensuite dans la plateforme)
-- -----------------------------------------------------------------------------
insert into public.modeles_email (categorie, ordre, tentative, titre, objet, texte) values

-- Relance après un appel sans réponse : 8 tentatives, ton qui monte doucement
('Relance après un appel manqué', 1, 1, 'Tentative 1 — J''ai essayé de vous joindre', 'J''ai essayé de vous joindre',
$t$Bonjour {prenom},

Je viens d'essayer de vous appeler pour faire le point sur {formation}.

Rappelez-moi quand vous pouvez, ou répondez simplement à cet email en m'indiquant le meilleur moment pour vous joindre.

{signature}$t$),

('Relance après un appel manqué', 2, 2, 'Tentative 2 — Quel créneau vous arrange ?', 'Quel moment vous arrange ?',
$t$Bonjour {prenom},

Je n'ai pas réussi à vous joindre ces derniers jours. Je sais que les journées sont chargées : dites-moi simplement quel moment vous convient le mieux (matin, midi, soir, samedi), et je m'adapte.

Il suffit de répondre à cet email avec votre créneau.

{signature}$t$),

('Relance après un appel manqué', 3, 3, 'Tentative 3 — Où en êtes-vous ?', 'Où en êtes-vous de votre formation ?',
$t$Bonjour {prenom},

Je continue d'essayer de vous joindre pour faire le point. Où en êtes-vous ? {avancement}

Même si vous avez pris un peu de retard, ce n'est pas grave : c'est justement pour ça que je suis là, pour vous aider à reprendre le rythme.

{signature}$t$),

('Relance après un appel manqué', 4, 4, 'Tentative 4 — Un petit mot suffit', 'Un petit mot suffit',
$t$Bonjour {prenom},

Pas besoin d'un long appel : un simple mot en réponse à cet email me suffit pour savoir comment vous allez et où vous en êtes.

Par exemple : « Tout va bien », « J'ai du retard » ou « J'ai besoin d'aide ». Je m'occupe du reste.

{signature}$t$),

('Relance après un appel manqué', 5, 5, 'Tentative 5 — Votre prochaine étape', 'Votre prochaine étape',
$t$Bonjour {prenom},

Je vous écris pour ne pas que vous passiez à côté de la prochaine étape de {formation}. Un point de 10 minutes ensemble permet souvent de débloquer la suite : organisation, modules à finir, inscription à l'examen.

Répondez-moi avec un créneau, je vous appelle à l'heure qui vous convient.

{signature}$t$),

('Relance après un appel manqué', 6, 6, 'Tentative 6 — Tout va bien ?', 'Tout va bien ?',
$t$Bonjour {prenom},

Je n'ai pas de nouvelles depuis un moment et je voulais simplement m'assurer que tout va bien de votre côté.

Si c'est une période compliquée, on peut en parler sans jugement et trouver ensemble un rythme qui vous convient. Vous pouvez aussi juste me répondre par écrit.

{signature}$t$),

('Relance après un appel manqué', 7, 7, 'Tentative 7 — Votre organisme et moi', 'Nous tenons à votre réussite',
$t$Bonjour {prenom},

{organisme} et moi tenons à ce que vous alliez au bout de votre formation. Malgré plusieurs appels, je n'ai pas réussi à vous joindre ce mois-ci.

Un simple message de votre part me permettra de savoir comment vous aider. Je reste disponible.

{signature}$t$),

('Relance après un appel manqué', 8, 8, 'Tentative 8 — Dernier message du mois', 'Je reviens vers vous le mois prochain',
$t$Bonjour {prenom},

Je n'ai pas réussi à vous joindre ce mois-ci, malgré plusieurs tentatives. Je reviendrai vers vous le mois prochain.

D'ici là, ma porte reste ouverte : répondez à cet email à tout moment, je vous rappelle dans la foulée.

{signature}$t$),

-- Rendez-vous
('Rendez-vous', 10, null, 'Confirmation du prochain rendez-vous', 'Notre prochain rendez-vous',
$t$Bonjour {prenom},

Comme convenu, je vous appellerai {date_rdv} pour notre prochain point sur {formation}.

Si ce moment ne vous convient plus, répondez simplement à cet email et nous en fixerons un autre.

{signature}$t$),

('Rendez-vous', 11, null, 'Rappel : rendez-vous demain', 'Notre rendez-vous de demain',
$t$Bonjour {prenom},

Petit rappel : je vous appelle demain, {date_rdv}, pour faire le point sur votre formation.

À demain !

{signature}$t$),

('Rendez-vous', 12, null, 'Absent au rendez-vous', 'Je n''ai pas pu vous joindre au rendez-vous',
$t$Bonjour {prenom},

Je vous ai appelé comme prévu pour notre rendez-vous, mais je n'ai pas réussi à vous joindre.

Ce n'est pas grave : dites-moi simplement quel nouveau moment vous convient, et je vous rappelle.

{signature}$t$),

('Rendez-vous', 13, null, 'Rendez-vous à reprogrammer', 'Reprogrammons notre rendez-vous',
$t$Bonjour {prenom},

Je dois décaler notre rendez-vous. Je vous propose {date_rdv}.

Si ce moment ne vous convient pas, répondez-moi avec un autre créneau, je m'adapte.

{signature}$t$),

-- Progression
('Progression', 20, null, 'Point du mois', 'Point mensuel sur votre formation',
$t$Bonjour {prenom},

C'est le moment de notre point mensuel sur {formation}. {avancement}

Dites-moi quand vous êtes disponible pour un appel d'une dizaine de minutes.

{signature}$t$),

('Progression', 21, null, 'Objectif du mois', 'Votre objectif du mois',
$t$Bonjour {prenom},

Merci pour notre échange. Comme convenu, voici votre objectif d'ici notre prochain point :


Je vous appellerai pour voir où vous en êtes. Vous allez y arriver !

{signature}$t$),

('Progression', 22, null, 'Retard sur le rythme', 'Reprenons le rythme ensemble',
$t$Bonjour {prenom},

J'ai remarqué que vous avez pris un peu de retard sur le rythme prévu. {avancement}

C'est très courant, et ça se rattrape. On fait un point ensemble pour organiser les prochaines semaines ?

{signature}$t$),

('Progression', 23, null, 'Plus que quelques modules', 'Vous y êtes presque',
$t$Bonjour {prenom},

{avancement}Il ne vous reste plus que quelques modules pour terminer votre parcours.

On organise ensemble la dernière ligne droite ?

{signature}$t$),

('Progression', 24, null, 'Félicitations : formation terminée', 'Bravo, vous avez terminé votre parcours !',
$t$Bonjour {prenom},

Félicitations : vous avez terminé votre parcours de formation ! C'est une belle étape, et vous pouvez en être fier·e.

Je reste à vos côtés pour la suite, notamment pour préparer votre examen.

{signature}$t$),

-- Examen
('Examen', 30, null, 'Inscription à l''examen', 'Votre inscription à l''examen',
$t$Bonjour {prenom},

Une étape importante arrive : l'inscription à votre examen. Je peux vous montrer comment faire, étape par étape.

Quand êtes-vous disponible pour qu'on le fasse ensemble ?

{signature}$t$),

('Examen', 31, null, 'Examen dans un mois', 'Votre examen dans un mois',
$t$Bonjour {prenom},

Votre examen a lieu {date_examen}, dans un mois environ. C'est le bon moment pour faire le point sur vos révisions et votre organisation.

Dites-moi quand je peux vous appeler.

{signature}$t$),

('Examen', 32, null, 'Examen dans 7 jours', 'Votre examen approche',
$t$Bonjour {prenom},

Votre examen a lieu {date_examen}, dans une semaine. Avez-vous bien reçu votre convocation ?

Je reste disponible si vous avez la moindre question.

{signature}$t$),

('Examen', 33, null, 'Examen demain', 'C''est demain !',
$t$Bonjour {prenom},

C'est demain ! Votre examen a lieu {date_examen}. Pensez à votre convocation et à votre pièce d'identité.

Je vous souhaite bonne chance, vous êtes prêt·e !

{signature}$t$),

('Examen', 34, null, 'Après l''examen', 'Comment s''est passé votre examen ?',
$t$Bonjour {prenom},

Comment s'est passé votre examen ? J'espère que tout s'est bien déroulé.

Tenez-moi au courant du résultat dès que vous l'avez !

{signature}$t$),

-- Démarches
('Démarches', 40, null, 'Convention de stage', 'Votre convention de stage',
$t$Bonjour {prenom},

Où en êtes-vous de votre recherche de stage ? Pour la convention, je peux vous aider à remplir les documents.

Dites-moi quand on peut en parler.

{signature}$t$),

('Démarches', 41, null, 'Document manquant', 'Un document à nous transmettre',
$t$Bonjour {prenom},

Il manque encore un document à votre dossier :


Pouvez-vous le transmettre dès que possible ? Si vous avez un souci pour l'obtenir, dites-le-moi, on trouvera une solution.

{signature}$t$),

-- Soutien
('Soutien', 50, null, 'Moral en baisse', 'Je pense à vous',
$t$Bonjour {prenom},

Je pense à vous. Si c'est compliqué en ce moment, on peut en parler, sans jugement : on trouvera ensemble un rythme qui vous convient.

{signature}$t$),

('Soutien', 51, null, 'Reprise après une pause', 'Ravie de vous retrouver',
$t$Bonjour {prenom},

Je suis contente que vous repreniez votre formation après cette pause. Le plus dur, c'est de redémarrer : vous l'avez fait !

On fixe un petit objectif pour les deux prochaines semaines ?

{signature}$t$);
