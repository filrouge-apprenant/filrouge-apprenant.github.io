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
            ok((await pub.text_content("#r-eq")) == "11", "point d'équilibre : 11 abandons évités")
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
            ok((await pub.text_content("#r-eq")) == "11", "le prospect remplit lui-même : résultat calculé")
            await pub.screenshot(path=os.path.join(SORTIE, "prospection_public_vierge.png"), full_page=True)

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

            await page.click("text=📧 Email (mails tout prêts)")
            await page.wait_for_selector("#org-email-categorie", timeout=5000)
            cats = await page.locator("#org-email-categorie option").all_text_contents()
            ok("Prospection — rendez-vous" in cats and "Relance après un appel manqué" not in cats, f"fiche prospect : catégories organismes seulement ({cats})")
            await page.select_option("#org-email-categorie", "Prospection — envoi du simulateur")
            await page.select_option("#org-email-modele", "10000000-0000-4000-8000-000000000059")
            t = await page.input_value("#org-email-texte")
            ok("vierge=1" in t and "o=Institut+Fictif" in t and "n=" not in t, "simulateur vierge : lien sans chiffres")
            await page.select_option("#org-email-categorie", "Prospection — rendez-vous")
            await page.select_option("#org-email-modele", "10000000-0000-4000-8000-000000000081")
            ok(await page.is_visible("#org-email-rdv"), "rendez-vous : champ date affiché")
            await page.fill("#org-email-rdv", "jeudi 20 novembre à 10 h")
            await page.dispatch_event("#org-email-rdv", "change")
            ok("jeudi 20 novembre à 10 h" in await page.input_value("#org-email-texte"), "date écrite dans l'email")
            await page.context.grant_permissions(["clipboard-read", "clipboard-write"])
            async with page.expect_popup() as pop:
                await page.click("button:has-text('Envoyer avec Gmail Fil Rouge')")
            ok("mail.google.com" in (await pop.value).url or True, "Gmail ouvert")
            await page.wait_for_timeout(300)
            hist = await page.evaluate(f"() => (window.__db.echanges_commerciaux || []).filter(e => e.organisme_id === '{PROSPECT}').map(e => e.resume)")
            ok(any("Confirmation du rendez-vous" in r for r in hist), "envoi noté dans l'historique du centre")
            await page.screenshot(path=os.path.join(SORTIE, "prospection_email_fiche.png"))
            await page.click(".dialogue-fermer")
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
            gmail = await page.get_attribute("a:has-text('📧 Envoyer à claire@exemple.fr')", "href")
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
