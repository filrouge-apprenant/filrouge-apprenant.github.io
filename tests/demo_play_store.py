"""
Test du compte de démonstration (vérification Google Play) sur le site en ligne,
et captures d'écran téléphone pour la fiche Play Store.

Lancé par le workflow GitHub « Test compte démo ». Le mot de passe arrive par
la variable d'environnement MDP_DEMO, jamais écrit dans le dépôt.

Vérifie :
  1. la connexion par mot de passe du compte démo ;
  2. qu'il arrive sur l'espace client de l'organisme fictif ;
  3. qu'il ne voit aucun nom d'organisme réel ni de rubrique d'administration.

Usage : python tests/demo_play_store.py <dossier de sortie>
"""

import asyncio
import os
import sys

from playwright.async_api import async_playwright

SITE = "https://filrouge-apprenant.github.io/"
EMAIL = "contact.filrouge.apprenant+demo@gmail.com"

# Ne doivent JAMAIS apparaître pour le compte démo.
INTERDITS = [
    "Comptabilité", "Impayés", "Prospects", "Demandes de devis", "Accès clients",
    "EFC Formation", "Icademie", "Walter Learning", "EDAA", "ENACO", "Skill and You",
    "Koreva", "L'École Française", "Institut Boréal",
]


async def main(sortie):
    mdp = os.environ["MDP_DEMO"]
    erreurs = []
    async with async_playwright() as p:
        navigateur = await p.chromium.launch()
        # 360 × 640 à l'échelle 3 = captures 1080 × 1920 (format accepté par le Play Store).
        contexte = await navigateur.new_context(
            viewport={"width": 360, "height": 640}, device_scale_factor=3,
            locale="fr-FR", timezone_id="Europe/Paris",
        )
        page = await contexte.new_page()
        page.on("console", lambda m: print("console", m.type, m.text[:200]) if m.type == "error" else None)

        await page.goto(SITE + "?v=test", wait_until="networkidle")
        await page.screenshot(path=f"{sortie}/1-connexion.png")

        await page.click("text=Compte de démonstration")
        await page.fill("#champ-email-demo", EMAIL)
        await page.fill("#champ-mdp-demo", mdp)
        await page.click("button:has-text('Me connecter')")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(4000)

        texte = await page.inner_text("body")
        print("== Écran après connexion ==")
        print(texte[:1500])

        if "Adresse ou mot de passe incorrect" in texte:
            erreurs.append("connexion refusée")
        if "Académie Horizon" not in texte:
            erreurs.append("l'organisme fictif n'apparaît pas")
        for mot in INTERDITS:
            if mot in texte:
                erreurs.append(f"élément interdit visible : {mot}")

        await page.screenshot(path=f"{sortie}/2-espace-client.png")

        # Une fiche apprenant (premier nom cliquable de la liste).
        lien = page.locator("main a[href*='apprenant'], main button.lien-apprenant, main .nom-apprenant").first
        if await lien.count():
            await lien.click()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2500)
            await page.screenshot(path=f"{sortie}/3-fiche-apprenant.png")
            fiche = await page.inner_text("body")
            for mot in ["Note interne", "note interne"]:
                if mot in fiche:
                    erreurs.append("note interne visible sur la fiche")
        else:
            print("(aucun lien de fiche trouvé : capture 3 non prise)")

        await page.screenshot(path=f"{sortie}/4-page-complete.png", full_page=True)
        await navigateur.close()

    if erreurs:
        print("== ÉCHEC ==")
        for e in erreurs:
            print(" -", e)
        sys.exit(1)
    print("== RÉUSSI : connexion démo OK, uniquement l'organisme fictif, aucune rubrique d'administration ==")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
