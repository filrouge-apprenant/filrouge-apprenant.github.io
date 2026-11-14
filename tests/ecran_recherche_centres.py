"""
Test d'écran « Trouver des centres » (14 novembre 2026), avec une FAUSSE base en
mémoire (tests/faux-supabase.js) et une fausse réponse du registre public.
Usage : python tests/ecran_recherche_centres.py [dossier des captures]
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()

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
            await page.goto("http://127.0.0.1:8766/index.html#/recherche-centres")
            await page.wait_for_selector("text=Trouver des centres à démarcher", timeout=8000)
            await page.click("form button[type=submit]")
            await page.wait_for_selector("text=2 centres trouvés")
            texte = await page.inner_text("#contenu") if await page.query_selector("#contenu") else await page.inner_text("body")
            ok("Hors champ (YouSchool)" in texte, "concurrent YouSchool écarté")
            ok("Opposition au démarchage" in texte, "opposition signalée")
            titres = await page.eval_on_selector_all(".liste .ligne-titre", "e => e.map(x => x.textContent)")
            ok(titres[0].startswith("ACADEMIE"), "le mieux noté en premier")
            ok(await page.locator("text=+ Ajouter à mes prospects").count() == 1, "un seul bouton d'ajout (pas pour le concurrent)")
            await page.screenshot(path=os.path.join(SORTIE, "recherche-centres.png"), full_page=True)
            await page.click("text=+ Ajouter à mes prospects")
            await page.wait_for_selector("text=✓ Ajouté : ouvrir la fiche")
            crees = await page.evaluate("window.__crees")
            ok(crees[0]["p_nom"] == "ACADEMIE DISTANCE PRO" and "Claire Dupont" in crees[0]["p_notes"], "fiche créée avec les infos du registre")
            ok(not erreurs, f"aucune erreur JS {erreurs}")
            await nav.close()
    finally:
        serveur.kill()

asyncio.run(main())
