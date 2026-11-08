"""
Test d'écran du traitement d'objection (8 novembre 2026), avec une FAUSSE base
en mémoire (tests/faux-supabase.js) : aucune vraie donnée.
Vérifie : onglet « Objections » de la fiche d'un prospect, profil deviné depuis
la fonction du contact, un bouton = une réponse, recherche, fermeture, bouton
« Traitement d'objection » de la fiche, page Scripts de vente, affichage téléphone.
Usage : python tests/ecran_objections.py [dossier des captures]
Prérequis : playwright et Google Chrome.
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
PROSPECT = "a0000000-0000-4000-8000-000000000002"

# Ajoute un prospect fictif à la fausse base.
AJOUT = """
() => {
  window.__db.organismes.push({ id: '%s', nom: 'Institut Fictif', organismes_suivi_commercial: {
    etape: 'prospect', contact_nom: 'Claire Exemple', contact_fonction: 'Responsable qualité',
    contact_telephone: '0600000000', contact_email: 'claire@exemple.fr' } });
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
""" % PROSPECT

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8766", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 1280, "height": 900}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))

            await page.goto("http://127.0.0.1:8766/index.html#/prospection")
            await page.wait_for_timeout(1200)
            await page.evaluate(AJOUT)
            await page.goto(f"http://127.0.0.1:8766/index.html#/organisme/{PROSPECT}")
            await page.reload()
            await page.wait_for_selector("h1:has-text('Institut Fictif')", timeout=8000)

            # 1. Le bouton de la fiche ouvre l'onglet Objections
            await page.click("text=💬 Traitement d'objection")
            await page.wait_for_selector("#panneau-organisme-objections:not([hidden])")
            ok(await page.is_visible(".obj-panneau"), "le bouton de la fiche ouvre l'onglet Objections")
            nb = await page.locator("#panneau-organisme-objections .obj-grille .obj-bouton").count()
            ok(nb >= 57, f"tous les boutons sont là ({nb}, dont les plus fréquentes)")

            # 2. Profil deviné : Responsable qualité
            presse = await page.text_content(".obj-profils [aria-pressed=true]")
            ok(presse == "Responsable Qualiopi", f"profil deviné depuis la fonction : {presse}")
            freq = await page.text_content(".obj-frequentes .obj-groupe-titre")
            ok("Responsable Qualiopi" in freq, "les plus fréquentes suivent le profil")
            await page.screenshot(path=os.path.join(SORTIE, "objections-onglet.png"), full_page=True)

            # 3. Un clic = la réponse
            await page.click(".obj-groupe:not(.obj-frequentes) [data-objection=cher]")
            await page.wait_for_selector(".obj-dialogue[open]")
            texte = await page.text_content(".obj-dialogue")
            ok("Trop cher par rapport à quoi" in texte and "Relancer" in texte, "la réponse s'ouvre en 4 temps")
            await page.screenshot(path=os.path.join(SORTIE, "objections-reponse.png"))
            await page.click(".obj-fermer")
            ok(not await page.is_visible(".obj-dialogue[open]"), "la croix ferme la réponse")

            # 4. Angle selon l'interlocuteur + remplacement du nom
            await page.click(".obj-profils >> text=Direction / fondateur")
            await page.click(".obj-groupe:not(.obj-frequentes) [data-objection=interne]")
            texte = await page.text_content(".obj-dialogue")
            ok("Avec direction / fondateur" in texte, "variante pour la direction affichée")
            await page.keyboard.press("Escape")
            await page.click(".obj-groupe:not(.obj-frequentes) [data-objection=image]")
            ok("Institut Fictif" in await page.text_content(".obj-dialogue"), "{organisme} remplacé par le nom")
            await page.keyboard.press("Escape")

            # 5. Recherche
            await page.fill(".obj-recherche", "rgpd")
            visibles = await page.locator("#panneau-organisme-objections .obj-bouton:visible").count()
            ok(1 <= visibles <= 4, f"la recherche filtre ({visibles} bouton(s) pour « rgpd »)")
            await page.fill(".obj-recherche", "zzzz")
            ok(await page.is_visible("text=Aucune objection trouvée"), "message si rien n'est trouvé")
            await page.fill(".obj-recherche", "")

            # 6. Page Scripts de vente > Objections
            await page.goto(f"http://127.0.0.1:8766/index.html#/scripts-vente/objections/{PROSPECT}")
            await page.wait_for_selector("text=Toutes les objections", timeout=8000)
            ok(await page.locator(".obj-bouton").count() >= 57, "la page Scripts de vente utilise la même bibliothèque")

            # 7. Téléphone
            tel = await nav.new_page(viewport={"width": 390, "height": 844}, bypass_csp=True)
            tel.on("pageerror", lambda e: erreurs.append(str(e)))
            await tel.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await tel.goto(f"http://127.0.0.1:8766/index.html#/organisme/{PROSPECT}/objections")
            await tel.wait_for_timeout(800)
            await tel.evaluate(AJOUT)
            await tel.reload()
            await tel.wait_for_selector(".obj-panneau", timeout=8000)
            if not await tel.is_visible(".obj-panneau"):
                await tel.click("#onglet-organisme-objections")
            larg = await tel.evaluate("document.documentElement.scrollWidth")
            ok(larg <= 392, f"pas de débordement horizontal sur téléphone ({larg}px)")
            await tel.screenshot(path=os.path.join(SORTIE, "objections-telephone.png"), full_page=True)
            await tel.click(".obj-groupe:not(.obj-frequentes) [data-objection=temps]")
            await tel.wait_for_selector(".obj-dialogue[open]")
            await tel.screenshot(path=os.path.join(SORTIE, "objections-telephone-reponse.png"))

            ok(not erreurs, f"aucune erreur JavaScript {erreurs}")
            await nav.close()
    finally:
        serveur.terminate()

asyncio.run(main())
