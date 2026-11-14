"""
Test d'écran du CRM Abdel : onglet « Simulateur » d'une fiche (fausse base, aucun vrai envoi).
Vérifie : texte prêt avec le lien vers la page locale et l'entreprise pré-remplie ; envoi demandé
à la fonction « abdel-envoi » ; envoi noté dans l'historique ; sécurité fermée sans n° CNAPS.
Usage : python tests/ecran_abdel_simulateur_envoi.py [dossier des captures]
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
FAUX = FAUX.replace('if (nom !== "envoyer-email") return Promise.resolve({ data: null, error: null });',
  'if (nom === "abdel-envoi") { window.__envoisSimu = (window.__envoisSimu || []).concat([body]); return Promise.resolve({ data: { ok: true }, error: null }); }\n            if (nom !== "envoyer-email") return Promise.resolve({ data: null, error: null });')
DONNEES = """
() => {
  window.__db.abdel_prospects = [{ id: 'p1', data: { name: 'Cabinet Fictif', city: 'Mérignac', net: true, status: 'contact', email: '', contacts: { site: 'Julie Exemple — Gérante' }, history: [] } }];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
"""

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8774", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 400, "height": 860}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await page.goto("http://127.0.0.1:8774/dp-abdel/index.html#/")
            await page.wait_for_timeout(1000)
            await page.evaluate(DONNEES)
            await page.goto("http://127.0.0.1:8774/dp-abdel/index.html#/prospect/p1/simulateur")
            await page.reload()
            await page.wait_for_selector("#simu-texte", timeout=8000)
            texte = await page.input_value("#simu-texte")
            ok("[[SIMULATEUR]]" in texte, "le message contient le repère du bouton (pas d'adresse de site)")
            lien = await page.get_attribute("a:has-text('Voir la page nettoyage')", "href")
            ok("abdel/nettoyage/merignac/?entreprise=Cabinet+Fictif" in lien, "lien vers la page Mérignac avec l'entreprise pré-remplie")
            ok(texte.startswith("Bonjour Julie Exemple,"), "message personnalisé avec le nom du contact")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-onglet-simulateur.png"), full_page=True)
            await page.click("[data-action=simu-envoyer]")
            await page.wait_for_timeout(300)
            ok(await page.evaluate("() => !(window.__envoisSimu || []).length"), "sans e-mail : rien n'est envoyé")
            await page.fill("#simu-email", "julie@cabinet-fictif.fr")
            await page.click("[data-action=simu-envoyer]")
            await page.click(".dialogue button:has-text('Envoyer')")
            await page.wait_for_timeout(900)
            envois = await page.evaluate("() => window.__envoisSimu || []")
            ok(len(envois) == 1 and envois[0]["prospect_id"] == "p1" and envois[0]["activite"] == "net", "envoi demandé à la fonction serveur")
            fiche = await page.evaluate("() => window.__db.abdel_prospects.filter(r => r.id === 'p1').pop().data")
            ok(fiche["email"] == "julie@cabinet-fictif.fr", "l'adresse est enregistrée sur la fiche")
            ok(any("Simulateur envoyé par e-mail" in (h.get("text") or "") for h in fiche["history"]), "l'envoi est noté dans l'historique")
            # Fiche sécurité : simulateur sécurité par défaut, ouverture en saisissant le n° CNAPS
            await page.evaluate("""() => { window.__db.abdel_prospects.push({ id: 'p2', data: { name: 'Entrepôt Fictif', city: 'Bruges', secu: true, status: 'identifie', email: 'site@entrepot-fictif.fr', history: [] } }); sessionStorage.setItem('db', JSON.stringify(window.__db)); }""")
            await page.goto("http://127.0.0.1:8774/dp-abdel/index.html#/prospect/p2/simulateur")
            await page.reload()
            await page.wait_for_selector("#simu-texte", timeout=8000)
            ok("simulateur sécurité" in (await page.inner_text("#f-simu")).lower(), "fiche sécurité : simulateur sécurité sélectionné")
            ok(await page.locator("[data-action=simu-envoyer]").is_disabled(), "envoi bloqué tant que le n° CNAPS manque")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-onglet-simulateur-secu.png"), full_page=True)
            await page.fill("#simu-societe", "Abdel Sécurité Fictive")
            await page.fill("#simu-cnaps", "AUT-033-0000-00-00-00000000000")
            await page.click("[data-action=simu-ouvrir-secu]")
            await page.wait_for_timeout(800)
            ok(not await page.locator("[data-action=simu-envoyer]").is_disabled(), "après saisie : envoi sécurité possible")
            await page.click("[data-action=simu-envoyer]")
            await page.click(".dialogue button:has-text('Envoyer')")
            await page.wait_for_timeout(900)
            envois = await page.evaluate("() => window.__envoisSimu || []")
            ok(envois[-1]["activite"] == "secu" and "abdel/securite/" in envois[-1]["lien"], "envoi du simulateur sécurité")
            await nav.close()
        ok(not erreurs, "aucune erreur JavaScript" + (": " + "; ".join(erreurs) if erreurs else ""))
    finally:
        serveur.terminate()

asyncio.run(main())
