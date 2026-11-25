"""Test d'écran (25/11/2026) : Machine de prospection › Envoi groupé, avec une fausse base.
Vérifie : centres éligibles / écartés, personnalisation par centre, un envoi Brevo par centre."""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright
APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
def ok(c, t):
    print(("OK   " if c else "ÉCHEC ") + t)
    if not c: raise SystemExit(1)
DONNEES = """() => {
  const o = (id, nom) => ({ id, nom });
  window.__db.organismes = [o('a0000000-0000-4000-8000-000000000001','Alpha Formation'), o('a0000000-0000-4000-8000-000000000002','Beta Campus'),
    o('a0000000-0000-4000-8000-000000000003','Gamma Client'), o('a0000000-0000-4000-8000-000000000004','Delta Sans Email')];
  window.__db.organismes_suivi_commercial = [
    { organisme_id:'a0000000-0000-4000-8000-000000000001', etape:'prospect', contact_nom:'Claire Martin', contact_email:'claire@alpha.fr', score_criteres:{distance:'oui'} },
    { organisme_id:'a0000000-0000-4000-8000-000000000002', etape:'contacte', contact_nom:'', contact_email:'contact@beta.fr', score_criteres:{} },
    { organisme_id:'a0000000-0000-4000-8000-000000000003', etape:'client', contact_nom:'X', contact_email:'x@gamma.fr', score_criteres:{} },
    { organisme_id:'a0000000-0000-4000-8000-000000000004', etape:'prospect', contact_nom:'Y', contact_email:'', score_criteres:{} }];
  for (const org of window.__db.organismes) org.organismes_suivi_commercial = window.__db.organismes_suivi_commercial.filter((x) => x.organisme_id === org.id);
  window.__db.emails_organismes = [];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}"""
async def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8774", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1); err = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=["--no-sandbox"]); pg = await b.new_page(viewport={"width": 1280, "height": 900})
            pg.on("pageerror", lambda e: err.append(str(e)))
            pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
            await pg.route("**/supabase.js", lambda r: r.fulfill(body=FAUX, content_type="application/javascript"))
            await pg.goto("http://127.0.0.1:8774/index.html#/"); await pg.wait_for_timeout(1200)
            await pg.evaluate(DONNEES)
            await pg.goto("http://127.0.0.1:8774/index.html#/acquisition/groupe"); await pg.reload()
            await pg.wait_for_selector(".grp-ligne", timeout=8000)
            ok(await pg.locator(".grp-ligne").count() == 2, "2 centres éligibles (client et centre sans email écartés)")
            ecart = await pg.inner_text("main")
            ok("Gamma Client : déjà client" in ecart or "Centres écartés (2)" in ecart, "centres écartés listés")
            await pg.wait_for_timeout(500)
            await pg.click("text=Cocher les 15 mieux notés")
            ap = await pg.inner_text(".grp-apercu")
            ok("Claire Martin" in ap and "simulateur.html?o=Alpha" in ap and "vierge=1" in ap, "aperçu personnalisé (contact, lien au nom du centre)")
            await pg.click("#grp-envoyer")
            await pg.wait_for_selector("text=2 emails envoyés sur 2", timeout=10000)
            envois = await pg.evaluate("window.__envoisOrg")
            ok(len(envois) == 2 and {e["destinataire"] for e in envois} == {"claire@alpha.fr", "contact@beta.fr"}, "un envoi Brevo par centre")
            beta = [e for e in envois if e["destinataire"] == "contact@beta.fr"][0]
            ok("Beta Campus" in beta["texte"] and "Bonjour," in beta["texte"] and "{" not in beta["texte"] + beta["objet"], "texte rempli pour chaque centre, sans variable restante")
            await pg.screenshot(path="/tmp/envoi-groupe.png", full_page=True)
            ok(not err, "aucune erreur JavaScript " + "; ".join(err))
            await b.close()
    finally: srv.terminate()
asyncio.run(main())
