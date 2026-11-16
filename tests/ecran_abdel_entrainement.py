"""
Test d'écran du CRM Abdel : onglet « Entraînement aux appels » (16 novembre 2026),
avec une FAUSSE base en mémoire (tests/faux-supabase.js) et une fausse IA.
Vérifie : le menu, la liste sécurité / nettoyage, la fiche, un appel par écrit
(décroché, réponse, raccrocher) et l'écran de résultat noté sur 20.
Usage : python tests/ecran_abdel_entrainement.py [dossier des captures]
"""
import asyncio, os, sys, subprocess, time
from playwright.async_api import async_playwright

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
SORTIE = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
FAUX = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "faux-supabase.js")).read()
SC = "c0000000-0000-4000-8000-000000000001"
SC2 = "c0000000-0000-4000-8000-000000000002"
SESS = "d0000000-0000-4000-8000-000000000001"

# Fausse IA : on remplace functions.invoke pour « simulation-appel ».
IA = """
const __inv = window.supabase.createClient;
window.supabase.createClient = function () {
  const c = __inv.apply(this, arguments); const avant = c.functions.invoke;
  c.functions.invoke = function (nom, o) {
    if (nom !== 'simulation-appel') return avant.call(this, nom, o);
    const b = o.body; window.__ia = (window.__ia || []).concat([b.action]);
    if (b.action === 'demarrer') return Promise.resolve({ data: { session_id: '%s', reponse: 'Oui, Marc Durand, je vous écoute.' }, error: null });
    if (b.action === 'repondre') return Promise.resolve({ data: { reponse: 'On va recruter en interne, c\\'est moins cher.', raccroche: false }, error: null });
    if (b.action === 'terminer') {
      window.__db.entrainement_sessions = [{ id: '%s', scenario_id: '%s', scenario_titre: 'Sécurité · Il recrute un agent de sécurité', statut: 'terminee', debut: new Date().toISOString(), duree_secondes: 95, mode: 'ecrit',
        transcription: [{ qui: 'apprenant', texte: 'Oui ?' }, { qui: 'appelante', texte: 'Bonjour' }], note_sur_20: 13,
        evaluation: { criteres: [{ cle: 'accroche', nom: 'Accroche et présentation', note: 4, commentaire: 'Claire.' }], points_forts: ['Accroche directe'], a_ameliorer: ['Proposer deux créneaux'], phrase_modele: 'Mardi 17 h ou jeudi 9 h ?', frein_decouvert: false } }];
      return Promise.resolve({ data: { note_sur_20: 13 }, error: null });
    }
  };
  return c;
};
""" % (SESS, SESS, SC)

DONNEES = """
() => {
  window.__db.entrainement_scenarios = [
    { id: '%s', type: 'prospect', domaine: 'abdel', actif: true, ordre: 310, titre: 'Sécurité · Il recrute un agent de sécurité', difficulte: 'facile', apprenant_nom: 'Marc Durand, directeur de site', formation: 'Logistique Garonne', financement: 'PME', derniere_connexion: 'Offre d\\'emploi', contexte: 'Il recrute.', objectif_appel: 'Obtenir une visite.' },
    { id: '%s', type: 'prospect', domaine: 'abdel', actif: true, ordre: 340, titre: 'Nettoyage · Cabinet', difficulte: 'moyen', apprenant_nom: 'Sophie Lambert', formation: 'Cabinet comptable', financement: 'TPE', derniere_connexion: '', contexte: 'Ménage du soir.', objectif_appel: 'Visite de 15 min.' } ];
  window.__db.entrainement_sessions = [];
  sessionStorage.setItem('db', JSON.stringify(window.__db));
}
""" % (SC, SC2)

def ok(cond, texte):
    print(("OK   " if cond else "ÉCHEC ") + texte)
    if not cond: raise SystemExit(1)

async def main():
    serveur = subprocess.Popen([sys.executable, "-m", "http.server", "8771", "--bind", "127.0.0.1"], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    erreurs = []
    try:
        async with async_playwright() as p:
            nav = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--no-sandbox"])
            page = await nav.new_page(viewport={"width": 1200, "height": 900}, bypass_csp=True)
            page.on("pageerror", lambda e: erreurs.append(str(e)))
            await page.route("**/supabase.js", lambda r: r.fulfill(body=FAUX + IA, content_type="application/javascript"))
            await page.goto("http://127.0.0.1:8771/dp-abdel/index.html#/")
            await page.wait_for_timeout(1200)
            await page.evaluate(DONNEES)
            await page.goto("http://127.0.0.1:8771/dp-abdel/index.html#/entrainement")
            await page.reload()
            await page.wait_for_selector("text=Il recrute un agent de sécurité", timeout=8000)
            ok(await page.locator("a.menu-lien[href='#/entrainement']").count() == 1, "menu : « Entraînement aux appels »")
            t = await page.inner_text("main")
            ok("Sécurité privée" in t and "Nettoyage professionnel" in t, "liste rangée par sécurité / nettoyage")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-entrainement-liste.png"), full_page=True)
            await page.click("a[href='#/entrainement/appel/%s']" % SC)
            await page.wait_for_selector("#ent-go")
            ok("Obtenir une visite." in await page.inner_text("main"), "fiche du prospect fictif avec l'objectif")
            if await page.locator("#ent-mode").count():
                await page.select_option("#ent-mode", "ecrit")
            await page.click("#ent-go")
            await page.wait_for_selector("text=Marc Durand, je vous écoute", timeout=5000)
            await page.click("#ent-pause")
            ok(await page.is_disabled("#ent-saisie") and "en pause" in await page.inner_text("#ent-etat"), "pause : saisie bloquée, message de pause")
            await page.click("#ent-pause")
            ok(not await page.is_disabled("#ent-saisie"), "reprise de l'appel")
            await page.fill("#ent-saisie", "Bonjour M. Durand, Émilie, sécurité privée sur Bordeaux Métropole.")
            await page.click("#ent-envoyer")
            await page.wait_for_selector("text=recruter en interne", timeout=5000)
            await page.screenshot(path=os.path.join(SORTIE, "abdel-entrainement-appel.png"), full_page=True)
            await page.click("#ent-raccrocher")
            await page.wait_for_selector("text=Phrase à essayer", timeout=6000)
            t = await page.inner_text("main")
            ok("13" in t and "Mardi 17 h ou jeudi 9 h" in t, "résultat : note sur 20 et phrase modèle")
            ok(await page.evaluate("window.__ia.join(',')") == "demarrer,repondre,terminer", "trois appels à la fonction serveur")
            await page.screenshot(path=os.path.join(SORTIE, "abdel-entrainement-resultat.png"), full_page=True)
            ok(not erreurs, "aucune erreur JavaScript " + "; ".join(erreurs))
            await nav.close()
    finally:
        serveur.terminate()

asyncio.run(main())
