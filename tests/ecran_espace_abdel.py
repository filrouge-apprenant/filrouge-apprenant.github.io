"""
Test d'écran de l'Espace Abdel (aperçu d'Émilie), avec une FAUSSE base (aucune vraie donnée).
Vérifie : un prospect venu du simulateur (pas encore de rendez-vous) n'apparaît PAS ;
un contrat signé affiche son tarif horaire et sa durée (d'après le devis accepté).
Usage : python tests/ecran_espace_abdel.py [dossier des captures]
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
FAUX = FAUX.replace('nom === "abdel_suis_membre" ? true', 'nom === "abdel_mon_role" ? "membre" : nom === "abdel_suis_membre" ? true')

DONNEES = """
() => {
  window.__db.abdel_prospects = [
    { id: 'p_site', data: { name: 'Demande Simulateur Fictive', city: 'Pessac', net: true, status: 'besoin', reached: ['identifie','besoin'], source: 'Simulateur du site', history: [] } },
    { id: 'p_gagne', data: { name: 'Entrepôt Signé Fictif', city: 'Mérignac', secu: true, status: 'gagne', reached: ['identifie','rdv','devis','gagne'], hoursSecu: 364, wonAt: '2026-11-10T10:00:00Z', contractStart: '2026-12-01', history: [] } } ];
  window.__db.abdel_devis = [ { id: 'dev_1', prospect_id: 'p_gagne', data: { prospectId: 'p_gagne', numero: 'D-2026-001', statut: 'accepte', transmisAbdel: '2026-11-09', dureeMois: 12, debut: '2026-12-01', remisePct: 0, tvaPct: 20,
      lignes: [{ libelle: 'Gardiennage de nuit', heures: 364, taux: 27 }], date: '2026-11-09' } } ];
  window.__db.abdel_parametres = [{ id: 'main', data: { rateSecu: 27, commHour: 1 } }];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
"""

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8771", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 400, "height": 860}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
            await page.goto("http://127.0.0.1:8771/espace-abdel/index.html#/")
            await page.wait_for_timeout(1000)
            await page.evaluate(DONNEES)
            await page.goto("http://127.0.0.1:8771/espace-abdel/index.html#/clients")
            await page.reload()
            await page.wait_for_timeout(1500)
            await page.click("text=Tous")
            await page.wait_for_timeout(400)
            t = await page.inner_text("body")
            ok("Entrepôt Signé Fictif" in t, "le client signé est visible")
            ok("Demande Simulateur Fictive" not in t, "la demande du simulateur (sans rendez-vous) n'est pas visible")
            await page.goto("http://127.0.0.1:8771/espace-abdel/index.html#/gains")
            await page.wait_for_timeout(800)
            t = (await page.inner_text("body")).replace(" ", " ").replace(" ", " ")
            ok("27,00 € HT / h" in t, "contrat : tarif horaire affiché")
            ok("12 mois" in t and "30/11/2027" in t, "contrat : durée et date de fin affichées")
            await page.screenshot(path=os.path.join(SORTIE, "espace-abdel-contrats.png"), full_page=True)
            await nav.close()
        ok(not erreurs, "aucune erreur JavaScript" + (": " + "; ".join(erreurs) if erreurs else ""))
    finally:
        serveur.terminate()

asyncio.run(main())
