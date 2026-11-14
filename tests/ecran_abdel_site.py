"""
Test d'écran du site public d'Abdel (app/abdel/), avec une FAUSSE fonction serveur (aucune vraie donnée).
Vérifie : estimation nettoyage (400 m², 5 passages, produits du client → 1 040 € HT / mois) ;
envoi du formulaire (données transmises, message de remerciement) ; verrou CNAPS
(page sécurité fermée sans n° CNAPS, ouverte avec, et mention L612-14 en pied de page) ;
comparatif sécurité (1 agent de nuit 7j/7 → 2,9 temps pleins).
Usage : python tests/ecran_abdel_site.py [dossier des captures]
"""
import asyncio, json, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
INFOS = {"securite": {"actif": False, "societe": "", "cnaps": "", "siren": "", "tarif": None},
         "nettoyage": {"actif": True, "societe": "Abdel Propreté (fictif)", "siren": "", "tarifClient": 24, "tarifProduits": 27},
         "contact": {"ville": "Bordeaux Métropole", "email": "", "telephone": ""}, "responsable": "", "adresse": ""}


async def texte(page, sel):
    return (await page.inner_text(sel)).replace("\u202f", " ").replace("\u00a0", " ")


def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)


async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8768", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs, envois = [], []
    infos = json.loads(json.dumps(INFOS))

    async def fonction(route):
        corps = json.loads(route.request.post_data or "{}")
        if corps.get("action") == "infos":
            return await route.fulfill(status=200, content_type="application/json", body=json.dumps(infos))
        envois.append(corps)
        await route.fulfill(status=200, content_type="application/json", body='{"ok":true}')

    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 400, "height": 860}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/functions/v1/abdel-estimation", fonction)
            await page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))

            # Nettoyage
            await page.goto("http://127.0.0.1:8768/abdel/nettoyage/")
            await page.fill("#s-surf", "400")
            await page.wait_for_timeout(300)
            txt = await texte(page, "#res-net")
            ok("1 040" in txt, "estimation nettoyage : 1 040 € HT / mois pour 400 m² de bureaux, 5 passages")
            await page.check("input[name=produits][value=abdel]")
            ok("1 170" in await texte(page, "#res-net"), "produits fournis par Abdel : 27 €/h → 1 170 €")
            ok("Abdel Propreté (fictif)" in await texte(page, "#pied-legal"), "pied de page : société de nettoyage")
            ok(await page.locator("nav a[href*='securite']").count() == 0, "pas de lien Sécurité sans n° CNAPS")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-site-nettoyage.png"), full_page=True)

            f = "form.demande"
            await page.fill(f + " [name=entreprise]", "Cabinet Fictif")
            await page.fill(f + " [name=nom]", "Jeanne Test")
            await page.fill(f + " [name=telephone]", "05 00 00 00 00")
            await page.check(f + " [name=consentement]")
            await page.click(f + " button[type=submit]")
            await page.wait_for_timeout(500)
            ok(len(envois) == 1 and envois[0]["activite"] == "net" and envois[0]["consentement"] is True and envois[0]["estimation"]["surface"] == 400, "demande envoyée avec l'estimation")
            ok(await page.is_visible("text=votre demande est bien reçue"), "message de remerciement")

            # Page locale : commune présélectionnée
            await page.goto("http://127.0.0.1:8768/abdel/nettoyage/merignac/")
            await page.wait_for_timeout(400)
            ok(await page.input_value("form.demande [name=commune]") == "Mérignac", "page Mérignac : commune présélectionnée")

            # Sécurité fermée
            await page.goto("http://127.0.0.1:8768/abdel/securite/")
            await page.wait_for_timeout(400)
            ok(await page.is_visible("text=Service en cours d'ouverture") and await page.locator("#sim-secu").count() == 0, "sécurité fermée sans n° CNAPS")

            # Sécurité ouverte
            infos["securite"].update({"actif": True, "societe": "Abdel Sécurité (fictif)", "cnaps": "AUT-033-0000-00-00-00000000000"})
            await page.goto("http://127.0.0.1:8768/abdel/securite/")
            await page.wait_for_timeout(500)
            txt = await texte(page, "#res-secu")
            ok("2,9" in txt and "35 %" in txt, "1 agent de nuit 7j/7 : 2,9 temps pleins, un seul agent couvre 35 %")
            pied = await texte(page, "#pied-legal")
            ok("AUT-033" in pied and "prérogative de puissance publique" in pied, "mention CNAPS (art. L612-14) en pied de page")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-site-securite.png"), full_page=True)
            await page.set_viewport_size({"width": 1280, "height": 900})
            await page.screenshot(path=os.path.join(SORTIE, "abdel-site-securite-ordi.png"), full_page=False)
            # Page « réponse » (bouton « Je préfère être rappelé » de l'e-mail)
            await page.goto("http://127.0.0.1:8768/abdel/reponse/?t=" + "a" * 32 + "&r=rappel")
            await page.wait_for_timeout(400)
            ok(len(envois) == 1, "ouvrir le lien ne déclenche rien sans confirmation")
            await page.fill("#r-tel", "05 00 00 00 00")
            await page.click("#f-rappel button[type=submit]")
            await page.wait_for_timeout(400)
            ok(envois[-1].get("action") == "reponse" and envois[-1].get("choix") == "rappel" and envois[-1].get("telephone") == "05 00 00 00 00", "demande de rappel envoyée")
            ok("Nous vous appelons sous 24 h ouvrées" in await page.inner_text("#message-demande"), "message de confirmation")
            await page.goto("http://127.0.0.1:8768/abdel/reponse/?t=" + "b" * 32 + "&r=stop")
            await page.wait_for_timeout(400)
            await page.click("#b-stop")
            await page.wait_for_timeout(400)
            ok(envois[-1].get("choix") == "stop", "désinscription confirmée")
            await nav.close()
        ok(not erreurs, "aucune erreur JavaScript" + (": " + "; ".join(erreurs) if erreurs else ""))
    finally:
        serveur.terminate()


asyncio.run(main())
