"""
Test d'écran de l'onglet Compta (17 novembre 2026), avec une FAUSSE base en
mémoire (tests/faux-supabase.js) : aucune vraie donnée.
Usage : python tests/ecran_compta.py [dossier des captures]
Prérequis : playwright et Google Chrome.
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
ORG = "a0000000-0000-4000-8000-000000000001"

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

DONNEES = """
const ORG = '%s';
__db.organismes.push(
  { id: 'b0000000-0000-4000-8000-000000000002', nom: 'Formation Atlas', organismes_suivi_commercial: { etape: 'contacte' } },
  { id: 'b0000000-0000-4000-8000-000000000003', nom: 'Campus Nova', organismes_suivi_commercial: { etape: 'prospect' } });
__db.echanges_commerciaux = [
  { organisme_id: 'b0000000-0000-4000-8000-000000000002', canal: 'telephone' },
  { organisme_id: 'b0000000-0000-4000-8000-000000000002', canal: 'telephone' },
  { organisme_id: ORG, canal: 'telephone' }];
const mois = new Date().toISOString().slice(0, 7);
__db.appels.push({ organisme_id: ORG, apprenant_id: 'x', date_appel: mois + '-02T10:00:00Z', resultat: 'joint' });
__db.vue_echeances = [
  { organisme_id: ORG, mois: mois.slice(0, 4) + '-09-01', montant: 300, statut: 'payee' },
  { organisme_id: ORG, mois: mois.slice(0, 4) + '-10-01', montant: 280, statut: 'en_retard' }];
sessionStorage.setItem('db', JSON.stringify(__db));
""" % ORG

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
            await page.goto("http://127.0.0.1:8766/index.html#/")
            await page.wait_for_selector("text=Tableau de bord", timeout=8000)
            await page.evaluate(DONNEES)
            await page.goto("http://127.0.0.1:8766/index.html#/compta")
            await page.reload()
            await page.wait_for_selector("h1:has-text('Compta')", timeout=8000)
            texte = (await page.text_content("body")).replace("\u202f", " ").replace("\xa0", " ")
            ok("centres appelés (3 appels)" in texte, "centres appelés et appels de prospection")
            ok("client signé" in texte, "client signé compté")
            ok("580" in texte and "300" in texte, "facturé et encaissé de l'année")
            ok(await page.is_visible("a.menu-lien[data-chemin='compta']"), "entrée Compta dans le menu")

            # Simulateur : l'exemple d'Émilie
            await page.fill("#cp-apprenants", "10"); await page.fill("#cp-prix", "2000"); await page.fill("#cp-sauves", "3")
            await page.select_option("#cp-financement", "cpf"); await page.fill("#cp-assiduite", "20")
            await page.fill("#cp-duree", "6"); await page.fill("#cp-appels", "1"); await page.fill("#cp-tarif", "")
            await page.select_option("#cp-taux", "16.2")
            res = (await page.text_content(".compta-cartes")).replace("\u202f", " ").replace("\xa0", " ")
            ok("4 500" in res, "le centre récupère 4 500 € (et non 6 000 €)")
            ok("1 006" in res and "1 200" in res, "je gagne 1 006 € net sur 1 200 € de chiffre d'affaires")
            ok(await page.is_visible("text=Pourquoi"), "explication CPF affichée")
            ok(not await page.is_visible("#cp-perte"), "part perdue masquée en CPF")
            await page.select_option("#cp-financement", "autre")
            ok(await page.is_visible("#cp-perte"), "part perdue visible hors CPF")
            await page.select_option("#cp-financement", "cpf")
            await page.screenshot(path=f"{SORTIE}/compta-ordinateur.png", full_page=True)

            await page.set_viewport_size({"width": 390, "height": 844})
            await page.reload()
            await page.wait_for_selector("h1:has-text('Compta')")
            await page.screenshot(path=f"{SORTIE}/compta-telephone.png", full_page=True)
            ok(not erreurs, f"aucune erreur JavaScript {erreurs}")
            await nav.close()
    finally:
        serveur.terminate()

asyncio.run(main())
