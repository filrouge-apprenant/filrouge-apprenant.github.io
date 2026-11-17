"""
Test d'écran (17 novembre 2026) : appel d'entraînement à la prospection Fil Rouge,
avec une FAUSSE base (tests/faux-supabase.js) et une fausse IA.
Vérifie : les réponses du prospect s'insèrent dans le script, sous la phrase
dite (texte du script inchangé), une phrase improvisée est affichée avec la réponse,
et le panneau Objections contient le thème « Passer l'accueil ».
Usage : python tests/ecran_entrainement_script.py [dossier des captures]
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
SC = "c0000000-0000-4000-8000-000000000101"

IA = """
const __inv = window.supabase.createClient;
window.supabase.createClient = function () {
  const c = __inv.apply(this, arguments); const avant = c.functions.invoke;
  let n = 0;
  c.functions.invoke = function (nom, o) {
    if (nom !== 'simulation-appel') return avant.call(this, nom, o);
    const b = o.body;
    if (b.action === 'demarrer') return Promise.resolve({ data: { session_id: 'd0000000-0000-4000-8000-000000000101', reponse: 'Institut Fictif, bonjour.' }, error: null });
    if (b.action === 'repondre') { n += 1; return Promise.resolve({ data: { reponse: n === 1 ? 'Oui, deux minutes, allez-y.' : 'Ah, ça dépend des formateurs.', raccroche: false }, error: null }); }
  };
  return c;
};
"""

DONNEES = """
() => {
  window.__db.entrainement_scenarios = [
    { id: '%s', type: 'prospect', domaine: 'filrouge', actif: true, ordre: 410, titre: 'Test · Directrice pressée', difficulte: 'facile',
      apprenant_nom: 'Claire Exemple, directrice', formation: 'Institut Fictif', financement: 'CPF', derniere_connexion: 'Fichier', contexte: 'Centre à distance.', objectif_appel: 'Obtenir un rendez-vous.' } ];
  window.__db.entrainement_sessions = [];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
""" % SC

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8772", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 1280, "height": 900}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX + IA, content_type="application/javascript"))
            await page.goto("http://127.0.0.1:8772/index.html#/")
            await page.wait_for_timeout(1200)
            await page.evaluate(DONNEES)
            await page.goto(f"http://127.0.0.1:8772/index.html#/entrainement/appel/{SC}")
            await page.reload()
            await page.wait_for_selector("text=📞 Lancer l'appel", timeout=8000)
            if await page.locator("#entr-mode").count():
                await page.select_option("#entr-mode", "ecrit")
            await page.click("text=📞 Lancer l'appel")
            await page.wait_for_selector(".entr-deroule .entr-repli", timeout=6000)
            ok("Institut Fictif, bonjour." in await page.inner_text(".entr-deroule .entr-repli"), "le décroché s'affiche dans le script")
            avant = await page.locator(".entr-deroule > p").all_text_contents()
            phrase = "Bonjour Claire, Émilie Rachas, de Fil Rouge Apprenants. J'aide les centres de formation à distance à garder leurs apprenants jusqu'à l'examen. Vous avez deux minutes, là, maintenant ?"
            await page.fill("#entr-saisie", phrase)
            await page.press("#entr-saisie", "Enter")
            await page.wait_for_selector("text=deux minutes, allez-y", timeout=5000)
            place = await page.evaluate("""() => { const b = [...document.querySelectorAll('.entr-repli')].find(x => x.textContent.includes('allez-y'));
              return b.previousElementSibling.textContent; }""")
            ok("Vous avez deux minutes" in place, "la réponse est placée juste sous la phrase dite")
            ok(await page.locator(".entr-deroule > p").all_text_contents() == avant, "le texte du script est inchangé")
            await page.fill("#entr-saisie", "Et vos formateurs, ils relancent ?")
            await page.press("#entr-saisie", "Enter")
            await page.wait_for_selector("text=ça dépend des formateurs", timeout=5000)
            t = await page.evaluate("""() => { const b = [...document.querySelectorAll('.entr-repli')].find(x => x.textContent.includes('formateurs'));
              return [b.textContent, b.previousElementSibling.textContent]; }""")
            ok("Toi : « Et vos formateurs" in t[0] and "allez-y" in t[1], "phrase improvisée : affichée avec la réponse, après l'échange précédent")
            obj = await page.inner_text(".entr-aide")
            ok("Passer l'accueil" in obj and "Il est en réunion" in obj and "Écrivez à contact@" in obj, "objections : thème « Passer l'accueil » présent")
            # Fenêtre d'objection flottante : la page reste utilisable, on la déplace.
            await page.click(".entr-aide .obj-bouton[data-objection='acc_reunion']")
            await page.wait_for_selector(".obj-dialogue[open]")
            ok(await page.evaluate("!document.querySelector('.obj-dialogue').matches(':modal')"), "objection ouverte sans griser la page (non modale)")
            await page.fill("#entr-saisie", "Je tape pendant que l'objection est ouverte")
            ok(await page.input_value("#entr-saisie") == "Je tape pendant que l'objection est ouverte", "on peut continuer à taper pendant l'appel")
            avant = await page.evaluate("(() => { const r = document.querySelector('.obj-dialogue').getBoundingClientRect(); return [r.left, r.top]; })()")
            poi = await page.locator(".obj-poignee").bounding_box()
            await page.mouse.move(poi["x"] + 60, poi["y"] + 15)
            await page.mouse.down()
            await page.mouse.move(poi["x"] - 400, poi["y"] + 215, steps=8)
            await page.mouse.up()
            apres = await page.evaluate("(() => { const r = document.querySelector('.obj-dialogue').getBoundingClientRect(); return [r.left, r.top]; })()")
            ok(abs((avant[0] - apres[0]) - 460) < 3 and abs((apres[1] - avant[1]) - 200) < 3, f"fenêtre déplacée à la souris ({avant} → {apres})")
            await page.screenshot(path=os.path.join(SORTIE, "entrainement-objection-flottante.png"))
            await page.click(".obj-fermer")
            ok(not await page.is_visible(".obj-dialogue[open]"), "la croix ferme la fenêtre")
            await page.fill("#entr-saisie", "")
            await page.screenshot(path=os.path.join(SORTIE, "entrainement-script-transcription.png"), full_page=True)

            # --- Réécoute avec curseur (comme une vidéo)
            await page.evaluate("""() => { window.__db.entrainement_sessions = [{ id: 'd0000000-0000-4000-8000-000000000102', scenario_id: '%s', scenario_titre: 'Test · Directrice pressée',
              appelante_id: '11111111-1111-4111-8111-111111111111', statut: 'terminee', debut: new Date().toISOString(), duree_secondes: 120, mode: 'ecrit', note_sur_20: 12,
              transcription: [{ qui: 'apprenant', texte: 'Institut Fictif, bonjour.' }, { qui: 'appelante', texte: 'Bonjour Claire.' }, { qui: 'apprenant', texte: 'Oui ?' },
                { qui: 'appelante', texte: 'Vous avez deux minutes ?' }, { qui: 'apprenant', texte: 'Allez-y.' }],
              evaluation: { criteres: [], points_forts: [], a_ameliorer: [] } }]; sessionStorage.setItem('db', JSON.stringify(window.__db)); }""" % SC)
            await page.goto("http://127.0.0.1:8772/index.html#/entrainement/resultat/d0000000-0000-4000-8000-000000000102")
            await page.wait_for_selector("#entr-curseur", timeout=6000)
            ok(await page.get_attribute("#entr-curseur", "max") == "4" and "Réplique 1 / 5" in await page.inner_text(".entr-lecteur"), "lecteur : curseur sur les 5 répliques")
            await page.eval_on_selector("#entr-curseur", "e => { e.value = '3'; e.dispatchEvent(new Event('input', { bubbles: true })); }")
            await page.wait_for_timeout(200)
            ok("Réplique 4 / 5" in await page.inner_text(".entr-lecteur") and "deux minutes" in await page.text_content(".entr-en-lecture"), "curseur déplacé : on avance dans l'appel")
            await page.click("button[aria-label='Réplique précédente']")
            ok("Réplique 3 / 5" in await page.inner_text(".entr-lecteur"), "bouton réplique précédente")
            await page.click("#entr-lire")
            await page.wait_for_timeout(300)
            ok("Pause" in await page.inner_text("#entr-lire"), "lecture lancée depuis la position choisie")
            await page.click("#entr-lire")
            ok("Reprendre" in await page.inner_text("#entr-lire"), "pause")
            await page.screenshot(path=os.path.join(SORTIE, "entrainement-reecoute-curseur.png"), full_page=True)
            ok(not erreurs, "aucune erreur JavaScript " + "; ".join(erreurs))
            await nav.close()
    finally:
        serveur.terminate()

asyncio.run(main())
