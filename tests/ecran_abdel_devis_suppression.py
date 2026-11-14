"""
Test d'écran du CRM Abdel : bouton « Supprimer » dans la liste des devis (fausse base, aucune vraie donnée).
Vérifie qu'un devis déjà validé (« prêt ») et transmis peut être supprimé directement depuis la liste.
Usage : python tests/ecran_abdel_devis_suppression.py [dossier des captures]
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()

DONNEES = """
() => {
  window.__db.abdel_prospects = [{ id: 'p1', data: { name: 'Client Fictif', city: 'Bègles', net: true, status: 'devis', history: [] } }];
  const d = (id, numero, statut, transmis) => ({ id, prospect_id: 'p1', data: { prospectId: 'p1', numero, statut, transmisAbdel: transmis, societe: 'net', date: '2026-11-14', dureeMois: 12, remisePct: 0, tvaPct: 20,
    client: { nom: 'Client Fictif' }, lignes: [{ libelle: 'Entretien', heures: 40, taux: 24 }], historique: [] } });
  window.__db.abdel_devis = [d('dev_a', 'D-2026-001', 'pret', '2026-11-14T10:00:00Z'), d('dev_b', 'D-2026-002', 'brouillon', '')];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
"""

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8772", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 400, "height": 860}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await page.goto("http://127.0.0.1:8772/dp-abdel/index.html#/")
            await page.wait_for_timeout(1000)
            await page.evaluate(DONNEES)
            await page.goto("http://127.0.0.1:8772/dp-abdel/index.html#/prospect/p1/devis")
            await page.reload()
            await page.wait_for_selector("[data-action=devis-supprimer-liste]", timeout=8000)
            ok(await page.locator("[data-action=devis-supprimer-liste]").count() == 2, "un bouton Supprimer par devis, quelle que soit l'étape")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-devis-liste.png"), full_page=True)
            await page.click("[data-action=devis-supprimer-liste][data-valeur=dev_a]")
            await page.click(".dialogue button:has-text('Supprimer')")
            await page.wait_for_timeout(700)
            reste = await page.evaluate("() => (window.__db.abdel_devis || []).map(r => r.id)")
            ok(reste == ["dev_b"], "le devis validé et transmis est supprimé, le brouillon reste")
            # Interrupteur « Visible par Abdel »
            await page.click("[data-action=partage-abdel]")
            await page.wait_for_timeout(700)
            flag = await page.evaluate("() => window.__db.abdel_prospects.filter(r => r.id === 'p1').pop().data.partageAbdel")
            ok(bool(flag), "l'interrupteur rend la fiche visible par Abdel")
            ok(await page.is_visible("text=Visible par Abdel"), "l'interrupteur affiche « Visible par Abdel »")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-interrupteur.png"))
            await page.click("[data-action=partage-abdel]")
            await page.wait_for_timeout(700)
            flag = await page.evaluate("() => window.__db.abdel_prospects.filter(r => r.id === 'p1').pop().data.partageAbdel")
            ok(not flag, "un second clic masque la fiche")
            await nav.close()
        ok(not erreurs, "aucune erreur JavaScript" + (": " + "; ".join(erreurs) if erreurs else ""))
    finally:
        serveur.terminate()

asyncio.run(main())
