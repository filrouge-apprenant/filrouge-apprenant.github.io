"""
Test d'écran de la Machine de prospection et du simulateur public (16 novembre 2026),
avec une FAUSSE base en mémoire (tests/faux-supabase.js) : aucune vraie donnée.
Vérifie : page publique pré-remplie et calcul, accueil (top 10), simulateur de la
plateforme ouvert depuis la fiche (lien généré), notation /100 (vérifié / probable,
exclusion, enregistrement), plan sur 30 jours, 25 méthodes, approches, coûts,
menu, affichage téléphone.
Usage : python tests/ecran_prospection.py [dossier des captures]
"""
import asyncio, os, sys, subprocess, time
from urllib.parse import quote
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
PROSPECT = "a0000000-0000-4000-8000-000000000002"

AJOUT = """
() => {
  window.__db.organismes_suivi_commercial = window.__db.organismes_suivi_commercial || [];
  const s = { organisme_id: '%s', etape: 'prospect', contact_nom: 'Claire Exemple', contact_fonction: 'Directrice',
    contact_email: 'claire@exemple.fr', contact_telephone: '0600000000', score_criteres: {} };
  window.__db.organismes.push({ id: '%s', nom: 'Institut Fictif', organismes_suivi_commercial: s });
  window.__db.organismes_suivi_commercial.push(s);
  window.__db.echanges_commerciaux = window.__db.echanges_commerciaux || [];
  window.__db.modeles_email.push({ id: '10000000-0000-4000-8000-000000000060', categorie: 'Prospection — envoi du simulateur', ordre: 60, tentative: null, actif: true,
    destinataire: 'organisme', titre: 'Envoi du simulateur (premier contact)', objet: 'Ce que vous coûtent les abandons — {organisme}',
    texte: 'Bonjour {contact},\\n\\nVoici le calcul pour {organisme} :\\n\\n{lien_simulateur}\\n\\nÉmilie Rachas' });
  window.__db.modeles_email.push({ id: '10000000-0000-4000-8000-000000000081', categorie: 'Prospection — rendez-vous', ordre: 81, tentative: null, actif: true,
    destinataire: 'organisme', titre: 'Confirmation du rendez-vous', objet: 'Confirmation — {date_rdv}',
    texte: 'Bonjour {contact},\\n\\nRendez-vous {date_rdv}.' });
  window.__db.modeles_email.push({ id: '10000000-0000-4000-8000-000000000059', categorie: 'Prospection — envoi du simulateur', ordre: 59, tentative: null, actif: true,
    destinataire: 'organisme', titre: 'Simulateur vierge', objet: 'Le calcul en 1 minute',
    texte: 'Bonjour {contact},\\n\\n{lien_simulateur_vierge}' });
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
""" % (PROSPECT, PROSPECT)

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])

            # --- Page publique ---
            pub = await nav.new_page(viewport={"width": 420, "height": 900})
            pub.on("pageerror", lambda e: erreurs.append("public: " + str(e)))
            await pub.goto("http://127.0.0.1:8767/simulateur.html?o=" + quote("Institut <b>Fictif</b>") + "&n=150&p=2500&d=6&t=20")
            await pub.wait_for_timeout(500)
            pour = await pub.text_content("#sim-pour")
            ok("Institut bFictif/b" in pour and "<" not in pour, "page publique : nom du centre affiché, balises neutralisées")
            ok((await pub.text_content("#r-cout")).replace(" ", " ").replace("\xa0", " ") == "37 500 €", "coût des abandons : 30 × 1 250 € = 37 500 €")
            ok((await pub.text_content("#r-eq")) == "2", "point d'équilibre : 2 abandons évités (suivi des seuls apprenants à risque)")
            await pub.fill("#sim-t", "40")
            await pub.wait_for_timeout(200)
            ok((await pub.text_content("#r-cout")).replace(" ", " ").replace("\xa0", " ") == "75 000 €", "le résultat se met à jour quand on change le taux")
            await pub.screenshot(path=os.path.join(SORTIE, "prospection_public_telephone.png"), full_page=True)
            await pub.goto("http://127.0.0.1:8767/simulateur.html?o=Institut+Fictif&vierge=1")
            await pub.wait_for_timeout(400)
            ok(await pub.input_value("#sim-n") == "" and (await pub.text_content("#r-cout")) == "—", "lien vierge : champs vides, pas de résultat")
            for sel, v in [("#sim-n", "150"), ("#sim-p", "2500"), ("#sim-d", "6"), ("#sim-t", "20")]:
                await pub.fill(sel, v)
            await pub.wait_for_timeout(200)
            ok((await pub.text_content("#r-eq")) == "2", "le prospect remplit lui-même : résultat calculé")
            await pub.screenshot(path=os.path.join(SORTIE, "prospection_public_vierge.png"), full_page=True)
            await pub.goto("http://127.0.0.1:8767/simulateur.html?o=Institut+Fictif&n=150&p=2500&d=6&t=20&f=cpf&a=20")
            await pub.wait_for_timeout(400)
            ok(await pub.input_value("#sim-f") == "cpf" and await pub.is_visible("#sim-a") and not await pub.is_visible("#sim-bloc-perte summary"), "lien CPF : mode CPF affiché")
            ok((await pub.text_content("#r-cout")).replace("\u202f", " ").replace("\xa0", " ") == "56 250 €", "CPF, abandon à 20 % : 30 × 1 875 € = 56 250 €")
            ok("60 000" in (await pub.text_content("#r-plancher")).replace("\u202f", " ").replace("\xa0", " "), "CPF : coût sans le forfait de 25 % affiché")
            await pub.fill("#sim-a", "40")
            await pub.wait_for_timeout(200)
            ok((await pub.text_content("#r-cout")).replace("\u202f", " ").replace("\xa0", " ") == "45 000 €" and not await pub.is_visible("#r-plancher"), "CPF, abandon à 40 % : prorata, 45 000 €")
            await pub.screenshot(path=os.path.join(SORTIE, "prospection_public_cpf.png"), full_page=True)
            # Gros centre (cas réel du 17/11/2026) : on ne suit que les apprenants à risque.
            await pub.goto("http://127.0.0.1:8767/simulateur.html?n=4800&p=1200&d=8&t=12&f=cpf&a=50")
            await pub.wait_for_timeout(400)
            esp = lambda t: t.replace("\u202f", " ").replace("\xa0", " ")
            ok(esp(await pub.text_content("#r-cout")) == "345 600 €" and esp(await pub.text_content("#r-fr")) == "43 200 €" and await pub.text_content("#r-eq") == "72",
               "à risque : 1 200 apprenants × 3 mois = 43 200 €, remboursé dès 72 abandons évités sur 576")
            await pub.select_option("#sim-s", "tous")
            await pub.wait_for_timeout(200)
            ok(esp(await pub.text_content("#r-fr")) == "460 800 €", "formule « tous les apprenants » : 460 800 €")
            ok(await pub.locator("label:has-text('Part de vos apprenants')").count() == 0 and await pub.locator("label:has-text('Durée du suivi')").count() == 0, "simulateur simplifié : plus de champs part à risque et durée du suivi")

            # --- Plateforme ---
            page = await nav.new_page(viewport={"width": 1280, "height": 900}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await page.goto("http://127.0.0.1:8767/index.html#/prospection")
            await page.wait_for_timeout(1200)
            await page.evaluate(AJOUT)
            await page.goto(f"http://127.0.0.1:8767/index.html#/organisme/{PROSPECT}")
            await page.reload()
            await page.wait_for_selector("h1:has-text('Institut Fictif')", timeout=8000)

            # (Le bouton « Email » de la fiche a été déplacé dans Échanges › Email le 16/11 : testé ailleurs.)
            # Échanges › Email : envoi avec accusé de réception (Brevo) et liste des emails envoyés
            await page.click("[role=tab]:has-text('Échanges')")
            await page.wait_for_selector("text=📬 Emails envoyés et accusés de réception", timeout=5000)
            ok("Pas encore d'accord du centre" in await page.inner_text(".emails-envoyes"), "fiche : suivi d'ouverture désactivé sans accord du centre (CNIL)")
            await page.fill("#canal-email-dest", "claire@exemple.fr")
            await page.fill("#canal-email-objet", "Test accusé")
            await page.click("button:has-text('📨 Envoyer avec accusé de réception')")
            await page.wait_for_selector(".email-suivi:has-text('Test accusé')", timeout=5000)
            ok("✅ Reçu" in await page.inner_text(".emails-envoyes"), "fiche : email envoyé par Brevo, accusé de réception affiché")
            await page.screenshot(path=os.path.join(SORTIE, "fiche_email_accuse.png"), full_page=True)
            await page.evaluate("window.__envoisOrg = []")
            await page.goto(f"http://127.0.0.1:8767/index.html#/organisme/{PROSPECT}")
            await page.reload()
            await page.wait_for_selector("h1:has-text('Institut Fictif')", timeout=8000)
            await page.click("text=🧮 Envoyer le simulateur")
            await page.wait_for_selector("#acq-org", timeout=5000)
            ok(await page.input_value("#acq-org") == PROSPECT, "simulateur ouvert depuis la fiche : centre présélectionné")
            lien = await page.text_content(".pr-lien")
            ok("simulateur.html?o=Institut+Fictif" in lien and "n=150" in lien, "lien prospect généré avec le nom et les chiffres")
            await page.wait_for_selector("#acq-email-modele", timeout=5000)
            cats2 = await page.locator("#acq-email-categorie option").all_text_contents()
            ok(cats2 and all(c.startswith("Prospection") for c in cats2), f"seuls les e-mails de prospection sont proposés ({cats2})")
            texte = await page.input_value("#acq-texte")
            ok(texte.startswith("Bonjour Claire Exemple,") and "pour Institut Fictif" in texte and "simulateur.html?o=Institut+Fictif" in texte, "modèle rempli : contact, centre et lien")
            ok("Fictif" in await page.input_value("#acq-objet"), "objet rempli avec le nom du centre")
            await page.fill("#acq-n", "300")
            await page.wait_for_timeout(200)
            ok("n=300" in await page.input_value("#acq-texte"), "le lien de l'e-mail suit les chiffres")
            await page.select_option("#acq-f", "cpf")
            await page.wait_for_timeout(200)
            ok("f=cpf" in await page.input_value("#acq-texte") and "a=20" in await page.input_value("#acq-texte"), "plateforme : le mode CPF passe dans le lien")
            await page.select_option("#acq-f", "autre")
            await page.click("button:has-text('📨 Envoyer à claire@exemple.fr (accusé de réception)')")
            await page.wait_for_timeout(300)
            envois = await page.evaluate("window.__envoisOrg || []")
            ok(len(envois) == 1 and envois[0]["destinataire"] == "claire@exemple.fr" and "n=300" in envois[0]["texte"], "envoi par Brevo avec accusé de réception (simulateur)")
            gmail = await page.get_attribute("a:has-text('Gmail (sans accusé)')", "href")
            ok(gmail and "mail.google.com" in gmail and "n%3D300" in gmail, "bouton Gmail avec l'e-mail à jour")
            await page.screenshot(path=os.path.join(SORTIE, "prospection_simulateur.png"), full_page=True)

            # Les fiches élèves ne proposent pas les e-mails de prospection
            await page.goto("http://127.0.0.1:8767/index.html#/modeles-email")
            await page.wait_for_selector("#me-pour", timeout=5000)
            ok(True, "page Modèles d'emails : champ « Pour qui ? »")
            await page.goto("http://127.0.0.1:8767/index.html#/acquisition")
            await page.wait_for_selector("text=Les 10 méthodes les plus prometteuses", timeout=5000)
            ok(await page.locator(".sv-partie").count() == 10, "accueil : top 10 des méthodes")
            await page.wait_for_selector("a.menu-lien[data-chemin='acquisition']", state="attached", timeout=5000)
            ok(True, "entrée « Machine de prospection » dans le menu")
            await page.screenshot(path=os.path.join(SORTIE, "prospection_accueil.png"), full_page=True)

            await page.goto("http://127.0.0.1:8767/index.html#/acquisition/priorites")
            await page.wait_for_selector("text=Institut Fictif", timeout=5000)
            await page.click("summary:has-text('Institut Fictif')")
            await page.wait_for_selector(".pr-critere")
            criteres = page.locator(".pr-critere")
            ok(await criteres.count() == 10, "10 critères de notation")
            for i in range(5):
                await criteres.nth(i).locator("text=✓ Vérifié").click()
            await criteres.nth(5).locator("text=≈ Probable").click()
            await page.wait_for_timeout(300)
            resume = await page.text_content("details[open] > .pile-serree > p")
            ok("65/100" in resume and "Priorité B" in resume, f"notation : 15+15+10+10+10 + 5 (probable) = 65 → B ({resume[:60]}…)")
            ok("1 hypothèse" in resume and "4 critère(s) pas encore vérifié(s)" in resume, "faits et hypothèses séparés")
            enreg = await page.evaluate(f"() => window.__db.organismes_suivi_commercial.find(s => s.organisme_id === '{PROSPECT}').score_criteres")
            ok(enreg.get("distance") == "oui" and enreg.get("recrute") == "probable", "notation enregistrée dans la base")
            await page.click("text=Gros groupe avec sa propre équipe de suivi")
            await page.wait_for_timeout(300)
            ok("Exclu" in await page.text_content("details[open] > .pile-serree > p") and "Exclu" in await page.text_content("main details.sv-partie[open] summary") and "null" not in await page.text_content("details[open]"), "exclusion appliquée, en-tête à jour, aucun « null »")
            await page.screenshot(path=os.path.join(SORTIE, "prospection_priorites.png"), full_page=True)

            await page.goto("http://127.0.0.1:8767/index.html#/acquisition/plan")
            await page.wait_for_selector("text=Démarrer aujourd'hui")
            await page.click("button:has-text('Démarrer aujourd')")
            await page.wait_for_selector(".pr-taches input")
            await page.locator(".pr-taches input").first.check()
            ok("1 tâche(s) sur 20" in await page.text_content(".chapo"), "plan 30 jours : démarrage et case cochée")

            await page.goto("http://127.0.0.1:8767/index.html#/acquisition/methodes")
            await page.wait_for_selector("text=Les 15 autres")
            ok(await page.locator(".sv-partie").count() == 25, "25 méthodes")
            await page.goto("http://127.0.0.1:8767/index.html#/acquisition/scripts")
            await page.wait_for_selector("text=Accroche Qualiopi")
            ok(await page.locator(".sv-partie").count() == 8, "8 approches selon la situation")
            await page.goto("http://127.0.0.1:8767/index.html#/acquisition/avance")
            await page.wait_for_selector("text=Les 3 stratégies")
            ok("13 500" in (await page.text_content("main")).replace(" ", " ").replace("\xa0", " "), "potentiel : client type à 13 500 € par an")

            await page.set_viewport_size({"width": 390, "height": 844})
            await page.goto("http://127.0.0.1:8767/index.html#/acquisition/priorites")
            await page.wait_for_selector("text=Institut Fictif")
            larg = await page.evaluate("() => document.documentElement.scrollWidth")
            ok(larg <= 392, f"téléphone : pas de défilement horizontal ({larg}px)")
            await page.screenshot(path=os.path.join(SORTIE, "prospection_telephone.png"), full_page=True)

            await nav.close()
        ok(not erreurs, "aucune erreur JavaScript" + (f" : {erreurs}" if erreurs else ""))
    finally:
        serveur.terminate()

asyncio.run(main())
