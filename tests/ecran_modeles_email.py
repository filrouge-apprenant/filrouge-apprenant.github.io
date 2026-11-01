"""
Test d'écran des modèles d'emails (1er novembre 2026), avec une FAUSSE base en
mémoire (tests/faux-supabase.js) : aucune vraie donnée, aucun email envoyé.
Usage : python tests/ecran_modeles_email.py [dossier des captures]
Prérequis : playwright et Google Chrome.
"""
import asyncio, os, sys, subprocess, time, json
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
ELEVE = "e0000000-0000-4000-8000-000000000001"

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 1280, "height": 900}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))

            # 1. Page Modèles d'emails
            await page.goto("http://127.0.0.1:8765/index.html#/modeles-email")
            await page.wait_for_selector("text=Modèles d'emails", timeout=8000)
            await page.wait_for_selector("#me-choix-categorie")
            cats = await page.eval_on_selector_all("#me-choix-categorie option", "o => o.map(x => x.textContent)")
            ok(cats == ["Relance après un appel manqué", "Rendez-vous", "Progression"], f"menu 1 : catégories {cats}")
            await page.select_option("#me-choix-categorie", "Rendez-vous")
            mods = await page.eval_on_selector_all("#me-choix-modele option", "o => o.map(x => x.textContent)")
            ok(mods == ["Confirmation du prochain rendez-vous"], "menu 2 : les emails de la catégorie choisie")
            ok(await page.input_value("#me-objet") == "Notre prochain rendez-vous", "le modèle choisi se charge dans le formulaire")
            apercu = await page.text_content(".texte-libre")
            ok("Bonjour Julie," in apercu and "mardi 18 novembre" in apercu, "aperçu avec l'élève fictif")
            await page.fill("#me-objet", "Notre rendez-vous de suivi")
            await page.click("button:has-text('Enregistrer')")
            await page.wait_for_selector("text=Modèle enregistré")
            ok(await page.evaluate("__db.modeles_email.find(m => m.titre.startsWith('Confirmation')).objet") == "Notre rendez-vous de suivi", "modification enregistrée")
            ok(await page.is_visible("text=Envoi automatique actif"), "état de l'envoi automatique affiché")
            await page.screenshot(path=f"{SORTIE}/1-page-modeles.png", full_page=True)

            # Nouveau modèle dans une nouvelle catégorie
            await page.click("text=+ Nouveau modèle")
            await page.fill("#me-categorie", "Administratif")
            await page.fill("#me-titre", "Pièce d'identité")
            await page.fill("#me-objet", "Votre pièce d'identité")
            await page.fill("#me-texte", "Bonjour {prenom},\n\nMerci d'envoyer votre pièce d'identité.\n\n{signature}")
            await page.click("button:has-text('Enregistrer')")
            await page.wait_for_selector("text=Modèle enregistré")
            cats = await page.eval_on_selector_all("#me-choix-categorie option", "o => o.map(x => x.textContent)")
            ok("Administratif" in cats, "nouvelle catégorie créée depuis la page")
            await page.fill("#me-texte", "Bonjour {prenon}")
            await page.click("button:has-text('Enregistrer')")
            ok(await page.is_visible("text=Variable inconnue : {prenon}"), "faute de frappe dans une variable : refusée")

            # 2. Fiche élève : appel sans réponse -> relance automatique n° 1 puis n° 2
            async def appel_repondeur():
                await page.goto(f"http://127.0.0.1:8765/index.html#/apprenant/{ELEVE}/statut")
                await page.wait_for_selector("button:text-is('Statut')", timeout=8000)
                await page.click("button:text-is('Statut')")
                await page.click(".menu-statuts summary")
                await page.check("input[name=statut-appel][value=repondeur]")
                await page.click("form:has(.menu-statuts) button[type=submit]")
            await appel_repondeur()
            await page.wait_for_selector("text=Email de relance n° 1 envoyé automatiquement à Julie")
            envois = await page.evaluate("__envois")
            ok(len(envois) == 1 and envois[0]["objet"] == "J'ai essayé de vous joindre" and envois[0]["apprenant_id"] == ELEVE, "répondeur n° 1 : relance n° 1 envoyée")
            ok("faire le point sur votre formation « CAP Pâtissier »" in envois[0]["texte"] and "{" not in envois[0]["texte"], "variables remplacées dans l'email envoyé")
            ok(await page.evaluate("__db.appels.filter(a => a.canal === 'email').length") == 1, "email ajouté à l'historique")
            await page.screenshot(path=f"{SORTIE}/2-relance-envoyee.png", full_page=True)
            await appel_repondeur()
            await page.wait_for_selector("text=Email de relance n° 2 envoyé")
            ok((await page.evaluate("__envois"))[1]["objet"] == "Quel moment vous arrange ?", "répondeur n° 2 : relance n° 2 (l'email précédent ne compte pas comme tentative)")

            # 3. Sans clé Brevo : la fenêtre s'ouvre, prête, sur la relance n° 3
            await page.evaluate("sessionStorage.setItem('brevo', 'non')")
            await page.reload()
            await page.wait_for_selector("text=Statut de l'appel")
            await page.click(".menu-statuts summary")
            await page.check("input[name=statut-appel][value=injoignable]")
            await page.click("form:has(.menu-statuts) button[type=submit]")
            await page.wait_for_selector("dialog[open] #email-objet", timeout=8000)
            ok(await page.input_value("dialog[open] #email-objet") == "Où en êtes-vous de votre formation ?", "sans Brevo : la relance n° 3 s'ouvre toute prête")
            await page.wait_for_selector("dialog[open] #email-modele")
            ok(await page.eval_on_selector("dialog[open] #email-modele", "s => s.selectedOptions[0].textContent") == "Tentative 3 — Où en êtes-vous ?", "les deux menus pointent sur la bonne relance")
            await page.screenshot(path=f"{SORTIE}/3-fenetre-relance.png")
            await page.click("dialog[open] button:has-text('Annuler')")

            # 4. Email choisi à la main : catégorie Rendez-vous, date à compléter
            await page.evaluate("sessionStorage.setItem('brevo', 'oui')")
            await page.reload()
            await page.wait_for_selector("text=Statut de l'appel")
            await page.goto(f"http://127.0.0.1:8765/index.html#/apprenant/{ELEVE}")
            await page.wait_for_timeout(800)
            await page.click("button:text-is('Fiche')")
            await page.wait_for_selector("button:has-text('📧 Email')", timeout=8000)
            await page.click("button:has-text('📧 Email')")
            await page.wait_for_selector("dialog[open] #email-categorie")
            await page.select_option("dialog[open] #email-categorie", "Rendez-vous")
            ok(await page.is_visible("dialog[open] #email-date-rdv"), "modèle avec date de rendez-vous : le champ date apparaît")
            await page.click("dialog[open] button[type=submit]")
            ok(await page.is_visible("text=Écrivez la date du rendez-vous"), "envoi bloqué tant que la date manque")
            await page.fill("dialog[open] #email-date-rdv", "jeudi 20 novembre à 18 h")
            await page.press("dialog[open] #email-date-rdv", "Tab")
            await page.screenshot(path=f"{SORTIE}/4-fenetre-email.png")
            await page.click("dialog[open] button[type=submit]")
            await page.wait_for_selector("text=Email envoyé et ajouté à l'historique")
            dernier = (await page.evaluate("__envois"))[-1]
            ok("jeudi 20 novembre à 18 h" in dernier["texte"] and dernier["objet"] == "Notre rendez-vous de suivi", "email de rendez-vous envoyé avec la date")

            # 4 bis. Script d'appel guidé : répondeur -> relance automatique aussi
            avant = len(await page.evaluate("__envois"))
            await page.goto(f"http://127.0.0.1:8765/index.html#/script/{ELEVE}")
            await page.wait_for_selector("button:has-text('1. Ouverture')", timeout=8000)
            await page.click("button:has-text('1. Ouverture')")
            await page.click(".scr-option:has-text('Répondeur')")
            await page.click("button:has-text('Garder les réponses seulement')")
            await page.click('button:text-is("Enregistrer l\'appel")')
            await page.wait_for_selector("text=Email de relance n° 4 envoyé automatiquement", timeout=8000)
            envois = await page.evaluate("__envois")
            ok(len(envois) == avant + 1 and envois[-1]["objet"] == "Où en êtes-vous de votre formation ?", "script d'appel : répondeur -> relance envoyée (n° 4, modèle le plus proche faute de n° 4 dans la fausse base)")
            await page.screenshot(path=f"{SORTIE}/6-script-relance.png")

            # 5. Joint·e ce mois-ci : plus de relance
            avant = len(await page.evaluate("__envois"))
            await page.goto(f"http://127.0.0.1:8765/index.html#/apprenant/{ELEVE}/statut")
            await page.wait_for_selector("button:text-is('Statut')")
            await page.click("button:text-is('Statut')")
            await page.click(".menu-statuts summary")
            await page.check("input[name=statut-appel][value=joint]")
            await page.click("form:has(.menu-statuts) button[type=submit]")
            await page.wait_for_selector("text=Appel enregistré")
            await appel_repondeur()
            await page.wait_for_selector("text=Appel enregistré")
            await page.wait_for_timeout(800)
            ok(len(await page.evaluate("__envois")) == avant and not await page.is_visible("dialog[open]"), "élève joint ce mois-ci : aucune relance ensuite")

            # 6. Téléphone
            mobile = await nav.new_page(viewport={"width": 390, "height": 844}, bypass_csp=True)
            await mobile.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await mobile.goto("http://127.0.0.1:8765/index.html#/modeles-email")
            await mobile.wait_for_selector("#me-choix-categorie")
            largeur = await mobile.evaluate("document.documentElement.scrollWidth")
            ok(largeur <= 390, f"téléphone : pas de défilement horizontal ({largeur}px)")
            await mobile.screenshot(path=f"{SORTIE}/5-telephone.png", full_page=True)
            ok(not erreurs, f"aucune erreur JavaScript {erreurs}")
            await nav.close()
    finally:
        serveur.terminate()

asyncio.run(main())
print("TOUS LES TESTS D'ÉCRAN SONT PASSÉS")
