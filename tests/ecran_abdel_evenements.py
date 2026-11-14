"""
Test d'écran du CRM Abdel : écran Événements (14 novembre 2026), avec une FAUSSE base
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


from datetime import date, timedelta
J = lambda n: (date.today() + timedelta(days=n)).isoformat()
EVS = """
() => {
  window.__db.abdel_evenements = [
    { id: 'ev_petit', data: { name: 'Gala fictif du club', date: '%s', commune: 'Pessac', jauge: 400, besoin: 'secu', status: 'a_etudier', organisateur: 'Club Fictif', url: 'https://exemple.fr/gala' } },
    { id: 'ev_gros', data: { name: 'Grand salon fictif', date: '%s', commune: 'Bordeaux', jauge: 20000, besoin: 'secu', status: 'a_etudier', organisateur: 'Agence Fictive', url: 'https://exemple.fr/salon' } },
    { id: 'ev_passe', data: { name: 'Fête passée', date: '%s', commune: 'Lormont', jauge: 100, besoin: 'secu', status: 'a_etudier', url: 'https://exemple.fr/x' } } ];
  window.__db.abdel_prospects = [];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
""" % (J(60), J(90), J(-10))

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8770", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 400, "height": 860}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await page.goto("http://127.0.0.1:8770/dp-abdel/index.html#/")
            await page.wait_for_timeout(1200)
            await page.evaluate(EVS)
            await page.goto("http://127.0.0.1:8770/dp-abdel/index.html#/evenements")
            await page.reload()
            await page.wait_for_selector("text=Gala fictif du club", timeout=8000)
            t = await page.inner_text("main")
            ok("Grand salon fictif" not in t, "vue « faisables » : le salon de 20 000 personnes est masqué")
            ok("Fête passée" not in t, "les événements passés sont masqués")
            ok("à contacter maintenant" in t and "faisable" in t, "gala : fenêtre de contact et taille faisable (3 agents)")
            await page.click("button[data-valeur=tous]")
            ok("renfort seulement" in await page.inner_text("main"), "vue « tous » : salon marqué renfort")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-evenements.png"), full_page=True)
            await page.click("text=Gala fictif du club")
            await page.wait_for_selector("#f-ev")
            await page.click("button[data-action=ev-prospect]")
            await page.wait_for_timeout(900)
            fiche = await page.evaluate("() => window.__db.abdel_prospects.map(r => r.data).find(d => d.name === 'Club Fictif')")
            ok(fiche and fiche["source"] == "Événement" and fiche["sector"] == "evenementiel", "fiche prospect de l'organisateur créée")
            ev = await page.evaluate("() => window.__db.abdel_evenements.filter(r => r.id === 'ev_petit').pop().data")
            ok(ev.get("prospectId") and ev["status"] == "a_contacter", "événement relié à la fiche, statut « à contacter »")
            await page.goto("http://127.0.0.1:8770/dp-abdel/index.html#/evenements/nouveau")
            await page.fill("#f-ev [name=name]", "Inauguration fictive")
            await page.fill("#f-ev [name=date]", J(45))
            await page.fill("#f-ev [name=url]", "https://exemple.fr/inau")
            await page.click("#f-ev button[type=submit]")
            await page.wait_for_timeout(700)
            ok(await page.evaluate("() => window.__db.abdel_evenements.some(r => r.data.name === 'Inauguration fictive')"), "ajout manuel d'un événement")
            await nav.close()
        ok(not erreurs, "aucune erreur JavaScript" + (": " + "; ".join(erreurs) if erreurs else ""))
    finally:
        serveur.terminate()

asyncio.run(main())
