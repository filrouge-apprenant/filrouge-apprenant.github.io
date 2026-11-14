"""
Test d'écran du CRM Abdel : appel en un clic (14 novembre 2026), avec une FAUSSE base
en mémoire (tests/faux-supabase.js) : aucune vraie donnée.
Vérifie : le script reprend l'entreprise et le responsable de la fiche ; le bouton « Appeler » ouvre le clavier du téléphone (lien tel:), au retour sur le CRM
la fiche s'ouvre sur « Suivi et appels » avec la durée remplie, et l'appel enregistré
garde la durée et la case « enregistré ».
Usage : python tests/ecran_abdel_appel.py [dossier des captures]
Prérequis : playwright et Google Chrome.
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
PROSPECT = "b0000000-0000-4000-8000-000000000001"

AJOUT = """
() => {
  window.__db.abdel_prospects = [{ id: '%s', data: { name: 'Entrepôt Fictif', city: 'Mérignac', secu: true, net: false,
    status: 'identifie', phone: '05 00 00 00 00', address: '12 rue du Port', contacts: { securite: 'Karim Exemple — Responsable sécurité (LinkedIn)' }, history: [] } }];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
""" % PROSPECT

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
            page = await nav.new_page(viewport={"width": 400, "height": 860}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await page.goto("http://127.0.0.1:8767/dp-abdel/index.html#/")
            await page.wait_for_timeout(1200)
            await page.evaluate(AJOUT)
            await page.goto(f"http://127.0.0.1:8767/dp-abdel/index.html#/prospect/{PROSPECT}/suivi")
            await page.reload()
            await page.wait_for_selector("#f-appel", timeout=8000)

            lien = page.locator("a[data-appel]").first
            ok(await lien.get_attribute("href") == "tel:0500000000", "le bouton d'appel compose le numéro")

            # Simule : clic sur Appeler (le téléphone prend la main), puis retour sur le CRM.
            await page.evaluate("""() => {
              document.querySelector('a[data-appel]').addEventListener('click', e => e.preventDefault(), { once: true });
            }""")
            await lien.click()
            await page.evaluate("""() => {
              const etat = v => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
              etat('hidden'); document.dispatchEvent(new Event('visibilitychange'));
              etat('visible'); document.dispatchEvent(new Event('visibilitychange'));
            }""")
            await page.wait_for_timeout(600)
            duree = await page.input_value("#f-appel [name=duration]")
            ok(duree == "1", f"au retour, la durée est remplie ({duree} min)")
            ok(await page.is_visible("text=Appel terminé"), "message « Appel terminé : note le résultat »")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-retour-appel.png"), full_page=True)

            await page.check("#f-appel [name=recorded]")
            await page.click("#f-appel button[type=submit]")
            await page.wait_for_timeout(800)
            appel = await page.evaluate("() => (window.__db.abdel_prospects.filter(r => r.id === '%s').pop().data.history || []).find(h => h.type === 'call')" % PROSPECT)
            ok(appel and appel["duration"] == 1 and appel["recorded"] is True, "l'appel garde la durée et « enregistré »")
            # Script adapté à la fiche
            await page.goto(f"http://127.0.0.1:8767/dp-abdel/index.html#/prospect/{PROSPECT}/scripts")
            await page.wait_for_selector(".script-fiche", timeout=8000)
            entete = await page.text_content(".script-fiche")
            ok("Entrepôt Fictif" in entete and "Karim Exemple" in entete, "en-tête : entreprise appelée et personne à demander")
            textes = " ".join(await page.locator(".script").all_text_contents())
            ok("Bonjour Karim Exemple" in textes and "(nom)" not in textes, "le nom du responsable remplace « M. (nom) »")
            ok("parler à Karim Exemple" in textes, "phrase du standard avec le nom")
            ok(await page.locator(".script mark").count() >= 3, "les éléments de la fiche sont surlignés")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-script.png"), full_page=False)

            # Panneau de notes, téléphone : bouton flottant, tiroir, note ajoutée, historique des appels
            ok(await page.is_visible(".bouton-notes-mobile"), "téléphone : bouton « Notes » visible sur l'onglet Scripts")
            await page.click(".bouton-notes-mobile")
            await page.wait_for_timeout(300)
            ok(await page.is_visible("#note-brouillon"), "le tiroir de notes s'ouvre")
            ok("Appel n° 1" in await page.text_content(".notes-historique"), "l'historique des appels est dans le panneau")
            await page.fill("#note-brouillon", "Rappeler après 14 h, parle d'un vol en octobre")
            await page.reload()
            await page.wait_for_selector("#note-brouillon", state="attached")
            ok("vol en octobre" in await page.input_value("#note-brouillon"), "le brouillon survit au rechargement")
            await page.evaluate("document.body.classList.add('notes-ouvertes')")
            await page.click("#f-note button[type=submit]")
            await page.wait_for_timeout(700)
            ok("vol en octobre" in await page.text_content(".notes-historique"), "la note apparaît dans l'historique")
            ok(await page.input_value("#note-brouillon") == "", "la zone est vidée après ajout")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-notes-tel.png"))

            # Ordinateur : panneau à droite, visible sur chaque onglet
            await page.set_viewport_size({"width": 1440, "height": 900})
            for onglet in ["scripts", "infos", "qualification", "suivi"]:
                await page.goto(f"http://127.0.0.1:8767/dp-abdel/index.html#/prospect/{PROSPECT}/{onglet}")
                await page.wait_for_selector("#panneau-notes")
                boite = await page.locator("#panneau-notes").bounding_box()
                ok(boite and boite["x"] > 800 and await page.is_visible("#note-brouillon"), f"ordinateur : panneau à droite sur « {onglet} »")
            await page.goto(f"http://127.0.0.1:8767/dp-abdel/index.html#/prospect/{PROSPECT}/scripts")
            await page.wait_for_selector("#panneau-notes")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-notes-ordi.png"))
            ok(not erreurs, "aucune erreur JavaScript" + (f" : {erreurs}" if erreurs else ""))
            await nav.close()
    finally:
        serveur.terminate()

asyncio.run(main())
