#!/usr/bin/env python3
"""Génère le site public d'Abdel (app/abdel/) : accueil, simulateurs, pages locales, mentions, sitemap.

Usage : python3 outils/generer_site_abdel.py
Les pages sont statiques (bon référencement) ; les infos légales (sociétés, SIREN, n° CNAPS)
sont lues en direct depuis les Paramètres du CRM par app/abdel/site.js.
Tant que le n° d'autorisation CNAPS n'est pas renseigné, aucun contenu « sécurité » n'est affiché.
"""
from pathlib import Path
import html

RACINE = Path(__file__).resolve().parent.parent / "app" / "abdel"
URL = "https://filrouge-apprenant.github.io/abdel/"
FONCTION = "https://cafcevtehuywovvsllvp.supabase.co"

COMMUNES = ["Ambarès-et-Lagrave", "Ambès", "Artigues-près-Bordeaux", "Bassens", "Bègles", "Blanquefort", "Bordeaux", "Bouliac", "Bruges",
            "Carbon-Blanc", "Cenon", "Eysines", "Floirac", "Gradignan", "Le Bouscat", "Le Haillan", "Le Taillan-Médoc", "Lormont",
            "Martignas-sur-Jalle", "Mérignac", "Parempuyre", "Pessac", "Saint-Aubin-de-Médoc", "Saint-Louis-de-Montferrand",
            "Saint-Médard-en-Jalles", "Saint-Vincent-de-Paul", "Talence", "Villenave-d'Ornon"]

# Pages locales : une par grande commune, avec un texte propre à chacune (pas de copier-coller).
LOCALES = {
    "bordeaux": ("Bordeaux", "Bureaux, agences, cabinets et commerces de Bordeaux : du quartier d'affaires de Bordeaux Lac aux bureaux d'Euratlantique autour de la gare Saint-Jean, en passant par les Chartrons et les Bassins à flot. Interventions tôt le matin ou après la fermeture, pour que vos équipes et vos clients trouvent des locaux propres sans croiser l'équipe de nettoyage."),
    "merignac": ("Mérignac", "Mérignac concentre des bureaux, des sièges régionaux et des commerces, autour de l'aéroport et de la zone commerciale de Mérignac Soleil. Nous entretenons bureaux, open spaces, salles de réunion, espaces d'accueil et sanitaires, avec un planning adapté à vos horaires."),
    "pessac": ("Pessac", "À Pessac, de la zone d'activités de Bersol au centre-ville, nous intervenons dans les bureaux, cabinets, locaux techniques et commerces. Même équipe à chaque passage, pour que vos locaux soient entretenus par des personnes qui les connaissent."),
    "begles": ("Bègles", "Ateliers, bureaux et commerces de Bègles, entre les bords de Garonne et la rocade : entretien régulier des zones de vie, des bureaux et des sanitaires, nettoyage des vitres et remise en état après travaux sur demande."),
    "lormont": ("Lormont", "Sur la rive droite, à Lormont comme à Cenon et Floirac, nous assurons l'entretien de bureaux, de commerces et de parties communes d'immeubles, à la fréquence qui vous convient : d'une fois par semaine à tous les jours ouvrés."),
    "blanquefort": ("Blanquefort", "Entreprises industrielles, ateliers et bureaux de Blanquefort et de ses zones d'activités : entretien des bureaux, vestiaires, réfectoires et sanitaires, en dehors des heures de production si besoin."),
    "bassens": ("Bassens", "Autour du port de Bassens et des sites industriels et logistiques de la presqu'île, nous entretenons bureaux d'exploitation, vestiaires, réfectoires et locaux sociaux, avec des horaires calés sur vos équipes."),
    "saint-medard-en-jalles": ("Saint-Médard-en-Jalles", "Saint-Médard-en-Jalles accueille de nombreuses entreprises de la filière aéronautique et spatiale et leurs sous-traitants. Nous entretenons les bureaux, salles de réunion, espaces de pause et sanitaires, avec un interlocuteur unique qui suit la qualité."),
}

E = html.escape
TRAIT = ('<svg viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true"><path d="M3 10.5 C 30 5.5, 70 4.2, 110 6.2 C 140 7.6, 170 6.4, 197 3.8" '
         'fill="none" stroke="#e39b2d" stroke-width="3.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>')


def tete(titre, description, chemin, rel, noindex=False):
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="only light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src {FONCTION}; base-uri 'self'; form-action 'none'">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  {'<meta name="robots" content="noindex">' if noindex else ''}
  <title>{E(titre)}</title>
  <meta name="description" content="{E(description)}">
  <link rel="canonical" href="{URL}{chemin}">
  <meta property="og:title" content="{E(titre)}">
  <meta property="og:description" content="{E(description)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="fr_FR">
  <link rel="icon" href="{rel}../dp-abdel/icone.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,400&display=swap">
  <link rel="stylesheet" href="{rel}site.css?v=__VERSION__">
</head>"""


def entete(rel, actif):
    lien = lambda href, nom, cle: f'<a href="{rel}{href}"{" aria-current=\"page\"" if actif == cle else ""}>{nom}</a>'
    return f"""<header class="entete"><div class="contenant">
  <a class="marque" href="{rel}"><b>Abdel</b><span>sécurité · nettoyage</span>{TRAIT}</a>
  <nav class="nav" aria-label="Navigation">{lien('nettoyage/', 'Nettoyage', 'net')}<span data-si-secu hidden><template>{lien('securite/', 'Sécurité', 'secu')}</template></span><a href="#" data-tel hidden>☎ Appeler</a></nav>
</div></header>"""


def pied(rel):
    return f"""<footer class="pied"><div class="contenant">
  <p>Entreprises de Bordeaux Métropole · Réponse sous 24 h ouvrées</p>
  <div id="pied-legal"></div>
</div></footer>
<script src="{rel}calcul.js?v=__VERSION__"></script>
<script src="{rel}site.js?v=__VERSION__"></script>
</body>
</html>
"""


def options_communes(sel=""):
    return "".join(f'<option{" selected" if c == sel else ""}>{E(c)}</option>' for c in COMMUNES) + '<option>Autre commune</option>'


def formulaire(act, commune=""):
    couleur = "" if act == "secu" else " menthe"
    quoi = "votre comparatif chiffré" if act == "secu" else "votre devis précis"
    return f"""<form class="demande carte{' encre' if act == 'secu' else ' menthe'}" data-act="{act}" novalidate>
  <h2>Recevez {quoi}</h2>
  <p class="aide">Gratuit et sans engagement. Nous vous rappelons sous 24 h ouvrées ; une visite des lieux est offerte.</p>
  <div class="deux">
    <div><label for="f-ent-{act}">Entreprise *</label><input id="f-ent-{act}" name="entreprise" type="text" required maxlength="120" autocomplete="organization"></div>
    <div><label for="f-com-{act}">Commune du site</label><select id="f-com-{act}" name="commune">{options_communes(commune)}</select></div>
    <div><label for="f-nom-{act}">Votre nom *</label><input id="f-nom-{act}" name="nom" type="text" required maxlength="80" autocomplete="name"></div>
    <div><label for="f-fct-{act}">Fonction</label><input id="f-fct-{act}" name="fonction" type="text" maxlength="80" autocomplete="organization-title" placeholder="Ex. responsable des services généraux"></div>
    <div><label for="f-tel-{act}">Téléphone</label><input id="f-tel-{act}" name="telephone" type="tel" maxlength="25" autocomplete="tel"></div>
    <div><label for="f-mel-{act}">E-mail professionnel</label><input id="f-mel-{act}" name="email" type="email" maxlength="120" autocomplete="email"></div>
  </div>
  <label for="f-msg-{act}">Précisions (facultatif)</label>
  <textarea id="f-msg-{act}" name="message" rows="3" maxlength="1200" placeholder="{'Type de site, horaires, date de démarrage souhaitée…' if act == 'secu' else 'Horaires souhaités, accès, date de démarrage…'}"></textarea>
  <div class="piege" aria-hidden="true"><label for="f-web-{act}">Ne pas remplir</label><input id="f-web-{act}" name="site_web" type="text" tabindex="-1" autocomplete="off"></div>
  <label class="case"><input type="checkbox" name="consentement" value="1" required> <span>J'accepte d'être recontacté au sujet de ma demande. Mes informations ne servent qu'à cela (<a href="{'../' if not commune else '../../'}mentions-legales/">en savoir plus</a>).</span></label>
  <button class="bouton{couleur} large" type="submit">Envoyer ma demande</button>
  <p class="aide">* obligatoire · un téléphone ou un e-mail suffit.</p>
</form>
<div id="message-demande" class="message" hidden role="status"></div>"""


def sim_net():
    loc = [("bureaux", "Bureaux"), ("commerce", "Commerce"), ("sante", "Cabinet médical"), ("atelier", "Entrepôt, atelier"), ("communes", "Parties communes"), ("erp", "Salle, ERP")]
    return f"""<form id="sim-net" class="carte menthe menthe-zone">
  <h2>Estimez votre budget</h2>
  <label>Type de locaux</label>
  <div class="choix">{''.join(f'<label><input type="radio" name="locaux" value="{v}"{" checked" if v == "bureaux" else ""}> {l}</label>' for v, l in loc)}</div>
  <label for="s-surf">Surface à entretenir (m²)</label>
  <input id="s-surf" name="surface" type="number" inputmode="numeric" min="10" max="50000" step="10" value="300">
  <label>Passages par semaine</label>
  <div class="choix">{''.join(f'<label><input type="radio" name="passages" value="{n}"{" checked" if n == 5 else ""}> {n}</label>' for n in range(1, 7))}</div>
  <label>Produits et consommables</label>
  <div class="choix"><label><input type="radio" name="produits" value="client" checked> Fournis par nous</label><label><input type="radio" name="produits" value="abdel"> Fournis par Abdel</label></div>
  <label>Horaires</label>
  <div class="choix"><label><input type="radio" name="horaires" value="journee" checked> Journée, tôt le matin ou fin de journée</label><label><input type="radio" name="horaires" value="nuit"> Nuit (21 h – 6 h)</label></div>
  <label class="case" style="margin-top:1rem"><input type="checkbox" name="approfondi"> <span>Entretien approfondi (locaux très fréquentés, exigences d'hygiène)</span></label>
</form>"""


def sim_secu():
    return """<form id="sim-secu" class="carte encre">
  <h2>Votre besoin de surveillance</h2>
  <label>Agents présents en même temps</label>
  <div class="choix">""" + ''.join(f'<label><input type="radio" name="agents" value="{n}"{" checked" if n == 1 else ""}> {n}</label>' for n in range(1, 5)) + """</div>
  <label>Plage horaire</label>
  <div class="choix"><label><input type="radio" name="plage" value="nuit" checked> Nuit (19 h – 7 h)</label><label><input type="radio" name="plage" value="jour"> Jour (7 h – 19 h)</label><label><input type="radio" name="plage" value="h24"> 24 h / 24</label><label><input type="radio" name="plage" value="soiree"> Fermeture (18 h – 23 h)</label></div>
  <label>Jours par semaine</label>
  <div class="choix">""" + ''.join(f'<label><input type="radio" name="jours" value="{n}"{" checked" if n == 7 else ""}> {n}</label>' for n in range(1, 8)) + """</div>
  <label class="case" style="margin-top:1rem"><input type="checkbox" name="dimanche"> <span>Le dimanche est inclus (automatique à 7 jours sur 7)</span></label>
</form>"""


def page_net(chemin, rel, commune_slug=None):
    if commune_slug:
        nom, texte = LOCALES[commune_slug]
        titre = f"Nettoyage de bureaux et locaux professionnels à {nom} · estimation en ligne"
        desc = f"Entreprise de nettoyage à {nom} (Bordeaux Métropole) : bureaux, commerces, ateliers. Estimez votre budget en 1 minute, devis et visite gratuits."
        h1 = f"Nettoyage de locaux professionnels à {nom}"
        intro = texte
        page, data_commune = "locale-net", nom
    else:
        titre = "Nettoyage de bureaux et locaux professionnels · Bordeaux Métropole · estimation en ligne"
        desc = "Estimez en 1 minute le budget d'entretien de vos bureaux, commerces ou ateliers à Bordeaux et dans la métropole. Devis et visite gratuits."
        h1 = "Combien coûte l'entretien de vos locaux ?"
        intro = "Bureaux, commerces, cabinets, ateliers, parties communes : indiquez votre surface et votre fréquence, l'estimation s'affiche aussitôt. Nous intervenons dans les 28 communes de Bordeaux Métropole."
        page, data_commune = "nettoyage", ""
    autres = "".join(f'<li><a href="{rel}nettoyage/{s}/">Nettoyage à {E(n)}</a></li>' for s, (n, _) in LOCALES.items() if s != commune_slug)
    return f"""{tete(titre, desc, chemin, rel)}
<body data-page="{page}" data-racine="{rel}"{f' data-commune="{E(data_commune)}"' if data_commune else ''}>
{entete(rel, 'net')}
<main>
<section class="heros"><div class="contenant">
  <p class="surtitre menthe">Nettoyage professionnel{f' · {E(data_commune)}' if data_commune else ' · Bordeaux Métropole'}</p>
  <h1>{E(h1)}</h1>
  <p class="chapo">{E(intro)}</p>
  <ul class="points"><li>Tarif horaire clair, sans frais cachés</li><li>Même équipe à chaque passage</li><li>Remplacements assurés</li><li>Visite et devis gratuits</li></ul>
</div></section>
<div class="contenant">
  <div class="grille">
    <div>{sim_net()}</div>
    <div class="carte safran" id="res-net" aria-live="polite"></div>
  </div>
  {formulaire('net', data_commune)}
  <h2>Comment ça se passe</h2>
  <ol class="etapes"><li>Vous faites votre estimation et laissez vos coordonnées.</li><li>Nous vous rappelons sous 24 h ouvrées pour préciser le besoin.</li><li>Visite gratuite des locaux et devis écrit.</li><li>Démarrage à la date qui vous convient, avec un point qualité après le premier mois.</li></ol>
  <h2>Questions fréquentes</h2>
  <details><summary>L'estimation est-elle un devis ?</summary><p>Non : c'est un ordre de grandeur calculé sur des ratios moyens (surface nettoyée par heure selon le type de locaux). Le devis définitif est établi après la visite gratuite.</p></details>
  <details><summary>Qui fournit les produits et le matériel ?</summary><p>Vous choisissez : soit vous les fournissez, soit Abdel s'en charge (le tarif horaire est alors un peu plus élevé). Le simulateur affiche les deux cas.</p></details>
  <details><summary>Intervenez-vous tôt le matin ou le soir ?</summary><p>Oui. Nous adaptons les horaires à votre activité pour ne pas gêner vos équipes ni vos clients.</p></details>
  <details><summary>Quelles communes couvrez-vous ?</summary><p>Les 28 communes de Bordeaux Métropole :</p><ul class="communes">{''.join(f'<li>{E(c)}</li>' for c in COMMUNES)}</ul></details>
  <h2>Ailleurs dans la métropole</h2>
  <ul class="communes">{autres}{'<li><a href="' + rel + 'nettoyage/">Toute la métropole</a></li>' if commune_slug else ''}</ul>
</div>
</main>
{pied(rel)}"""


def page_secu(rel):
    titre = "Sécurité privée et gardiennage · Bordeaux Métropole · recruter ou externaliser ?"
    desc = "Agent de sécurité en interne ou prestataire ? Comparez le coût complet en 1 minute : salaires, majorations de nuit, remplacements. Bordeaux Métropole."
    return f"""{tete(titre, desc, 'securite/', rel)}
<body data-page="securite" data-racine="{rel}">
{entete(rel, 'secu')}
<main>
<div data-sinon-secu hidden><section class="heros"><div class="contenant">
  <p class="surtitre">Sécurité privée</p><h1>Service en cours d'ouverture</h1>
  <p class="chapo">Notre offre de sécurité privée sera bientôt disponible en ligne. En attendant, découvrez notre <a href="{rel}nettoyage/">offre de nettoyage professionnel</a>.</p>
</div></section></div>
<div data-si-secu hidden><template>
<section class="heros"><div class="contenant">
  <p class="surtitre">Sécurité privée · Bordeaux Métropole</p>
  <h1>Recruter un agent de sécurité ou externaliser ?</h1>
  <p class="chapo">Gardiennage de nuit, surveillance d'entrepôt, de chantier ou de parking, rondes : comparez en une minute le coût complet d'un recrutement en interne et d'une prestation.</p>
  <ul class="points"><li>Agents titulaires de la carte professionnelle CNAPS</li><li>Remplacements assurés</li><li>Renfort ponctuel ou contrat à l'année</li><li>Réponse sous 24 h ouvrées</li></ul>
</div></section>
<div class="contenant">
  <div class="grille">
    <div>{sim_secu()}</div>
    <div class="carte safran" id="res-secu" aria-live="polite"></div>
  </div>
  {formulaire('secu')}
  <h2>Questions fréquentes</h2>
  <details><summary>Pourquoi faut-il plusieurs agents pour un seul poste ?</summary><p>Un temps plein travaille environ 1 600 heures par an, congés et jours fériés déduits. Une surveillance de nuit toute l'année représente plus de 4 300 heures : il faut donc près de trois personnes, plus les remplacements.</p></details>
  <details><summary>Un service de sécurité interne a-t-il des obligations ?</summary><p>Oui : les agents chargés de la surveillance doivent eux aussi détenir une carte professionnelle délivrée par le CNAPS, et l'entreprise doit organiser formations, recyclages et plannings.</p></details>
  <details><summary>Le calcul est-il fiable ?</summary><p>Il repose sur les minima de la convention collective de la prévention-sécurité 2026 et des hypothèses prudentes (détaillées sous le résultat). Le coût réel d'un salarié est souvent plus élevé (ancienneté, heures de jours fériés, turnover).</p></details>
</div>
</template></div>
</main>
{pied(rel)}"""


def page_accueil(rel):
    titre = "Abdel · Nettoyage et sécurité pour les entreprises de Bordeaux Métropole"
    desc = "Nettoyage de locaux professionnels et sécurité privée pour les entreprises de Bordeaux Métropole. Estimez votre budget en ligne, réponse sous 24 h."
    return f"""{tete(titre, desc, '', rel)}
<body data-page="accueil" data-racine="{rel}">
{entete(rel, '')}
<main>
<section class="heros"><div class="contenant">
  <p class="surtitre">Entreprises de Bordeaux Métropole</p>
  <h1>Des locaux propres et des sites surveillés, sans recruter.</h1>
  <p class="chapo">Estimez votre budget en une minute, comparez avec un recrutement en interne, et recevez une proposition sous 24 h ouvrées.</p>
</div></section>
<div class="contenant">
  <div class="cartes-services">
    <div class="carte menthe"><p class="surtitre menthe">Nettoyage professionnel</p><h2>Bureaux, commerces, ateliers</h2><p>Entretien régulier, de 1 à 6 passages par semaine. Tarif horaire clair, produits fournis ou non.</p><a class="bouton menthe" href="{rel}nettoyage/">Estimer mon budget</a></div>
    <div data-si-secu hidden><template><div class="carte encre"><p class="surtitre">Sécurité privée</p><h2>Gardiennage, surveillance, rondes</h2><p>Recruter ou externaliser ? Comparez le coût complet d'un agent en interne et d'une prestation.</p><a class="bouton" href="{rel}securite/">Faire la comparaison</a></div></template></div>
  </div>
  <h2>Nos communes</h2>
  <ul class="communes">{''.join(f'<li>{E(c)}</li>' for c in COMMUNES)}</ul>
</div>
</main>
{pied(rel)}"""


def page_mentions(rel):
    return f"""{tete('Mentions légales et données personnelles · Abdel', 'Mentions légales du site et traitement des données personnelles.', 'mentions-legales/', rel, noindex=True)}
<body data-page="mentions" data-racine="{rel}">
{entete(rel, '')}
<main><div class="contenant" style="max-width:46rem;padding-top:1.5rem">
  <h1>Mentions légales</h1>
  <h2>Éditeur</h2>
  <p><b data-champ="societe-net">Abdel</b> — SIREN : <span data-champ="siren-net"></span><br>Adresse : <span data-champ="adresse"></span><br>Responsable de la publication : <span data-champ="responsable"></span>
  <span data-si-champ="email" hidden><br>E-mail : <span data-champ="email"></span></span><span data-si-champ="telephone" hidden><br>Téléphone : <span data-champ="telephone"></span></span></p>
  <p data-si-champ="societe-secu" hidden>Activité de sécurité privée : <b data-champ="societe-secu"></b>, autorisation d'exercice CNAPS n° <span data-champ="cnaps"></span>. « L'autorisation d'exercice délivrée par le CNAPS ne confère aucune prérogative de puissance publique à l'entreprise ou aux personnes qui en bénéficient. » (article L612-14 du Code de la sécurité intérieure)</p>
  <h2>Hébergement</h2>
  <p>Pages : GitHub Pages, GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.<br>Demandes envoyées par le formulaire : Supabase, base de données hébergée dans l'Union européenne (région de Paris).</p>
  <h2>Données personnelles</h2>
  <p><b>Ce que nous recueillons :</b> les informations que vous saisissez dans le formulaire (entreprise, nom, fonction, téléphone, e-mail, commune, message) et le résultat de votre estimation.</p>
  <p><b>Pourquoi :</b> uniquement pour vous recontacter au sujet de votre demande et vous faire une proposition commerciale (base légale : votre demande et votre accord).</p>
  <p><b>Qui les voit :</b> la société concernée par votre demande (nettoyage ou sécurité) et la personne qui gère ses demandes commerciales. Elles ne sont ni vendues ni cédées.</p>
  <p><b>Combien de temps :</b> 3 ans après notre dernier échange, puis elles sont supprimées.</p>
  <p><b>Vos droits :</b> accès, rectification, effacement, opposition. Il suffit de le demander <span data-si-champ="email" hidden>à <span data-champ="email"></span></span> en répondant à l'un de nos messages ou par téléphone. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
  <p><b>Cookies :</b> ce site ne dépose aucun cookie et n'utilise aucun outil de mesure d'audience.</p>
</div></main>
{pied(rel)}"""


def page_reponse(rel):
    return f"""{tete('Votre réponse · Abdel', 'Réponse à notre message.', 'reponse/', rel, noindex=True)}
<body data-page="reponse" data-racine="{rel}">
{entete(rel, '')}
<main><div class="contenant" style="max-width:34rem;padding-top:2rem">
  <div id="rep-rappel" class="carte encre" hidden>
    <p class="surtitre">Rappel</p><h1>Vous souhaitez être rappelé ?</h1>
    <p class="aide">Indiquez si vous le voulez un numéro et un moment pratique. Nous vous appelons sous 24 h ouvrées.</p>
    <form id="f-rappel" novalidate>
      <label for="r-tel">Téléphone (facultatif)</label><input id="r-tel" name="telephone" type="tel" maxlength="25" autocomplete="tel">
      <label for="r-creneau">Le meilleur moment</label>
      <select id="r-creneau" name="creneau"><option>Peu importe</option><option>Le matin</option><option>Le midi</option><option>L'après-midi</option><option>En fin de journée</option></select>
      <button class="bouton large" type="submit">Oui, rappelez-moi</button>
    </form>
  </div>
  <div id="rep-stop" class="carte" hidden>
    <p class="surtitre">Désinscription</p><h1>Ne plus recevoir de message ?</h1>
    <p class="aide">Vous ne serez plus contacté au sujet de nos services.</p>
    <button id="b-stop" class="bouton secondaire large" type="button">Confirmer</button>
  </div>
  <div id="message-demande" class="message" hidden role="status"></div>
</div></main>
{pied(rel)}"""


def ecrire(rel_chemin, contenu):
    f = RACINE / rel_chemin
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(contenu, encoding="utf-8")


def main():
    ecrire("index.html", page_accueil("./"))
    ecrire("nettoyage/index.html", page_net("nettoyage/", "../"))
    ecrire("securite/index.html", page_secu("../"))
    ecrire("mentions-legales/index.html", page_mentions("../"))
    ecrire("reponse/index.html", page_reponse("../"))
    for slug in LOCALES:
        ecrire(f"nettoyage/{slug}/index.html", page_net(f"nettoyage/{slug}/", "../../", slug))
    urls = ["", "nettoyage/", "securite/"] + [f"nettoyage/{s}/" for s in LOCALES]
    ecrire("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "".join(f"  <url><loc>{URL}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    print(f"{4 + len(LOCALES)} pages générées dans {RACINE}")


if __name__ == "__main__":
    main()
