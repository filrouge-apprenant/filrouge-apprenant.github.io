// =============================================================================
// Génère le projet Android (appli Play Store) à partir du manifeste du site.
// =============================================================================
// L'appli est une « Trusted Web Activity » : elle ouvre le site
// https://filrouge-apprenant.github.io/ en plein écran, sans barre de navigateur.
// Le site reste la seule source : toute mise à jour du site apparaît aussitôt
// dans l'appli, sans republier sur le Play Store.
//
// Lancé par GitHub (workflow « Appli Android »), jamais à la main.
// Usage : node android/generer.js <dossier de sortie> <numéro de version>
// =============================================================================

const fs = require("fs");
const path = require("path");
const { TwaManifest, TwaGenerator, ConsoleLog } = require("@bubblewrap/core");

const SITE = "https://filrouge-apprenant.github.io";
const PAQUET = "fr.filrouge.apprenants"; // Ne JAMAIS changer après la première publication.

async function main() {
  const [sortie, numero] = process.argv.slice(2);
  if (!sortie || !numero) throw new Error("Usage : node generer.js <sortie> <numéro>");

  const manifesteWeb = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "app", "manifest.webmanifest"), "utf8")
  );
  const twa = TwaManifest.fromWebManifestJson(new URL(SITE + "/manifest.webmanifest"), manifesteWeb);

  twa.packageId = PAQUET;
  twa.host = "filrouge-apprenant.github.io";
  twa.name = "Fil Rouge Apprenants";
  twa.launcherName = "Fil Rouge";
  twa.startUrl = "/?source=appli";
  twa.themeColor = "#ffffff";
  twa.navigationColor = "#ffffff";
  twa.backgroundColor = "#ffffff";
  twa.enableNotifications = false;
  twa.fallbackType = "customtabs";
  twa.appVersionCode = Number(numero);
  twa.appVersionName = "1.0." + numero;
  twa.signingKey = { path: "./signature.keystore", alias: "filrouge" };

  const erreur = twa.validate();
  if (erreur) throw new Error("Manifeste invalide : " + erreur);

  fs.mkdirSync(sortie, { recursive: true });
  fs.writeFileSync(path.join(sortie, "twa-manifest.json"), JSON.stringify(twa.toJson(), null, 2));
  await new TwaGenerator().createTwaProject(sortie, twa, new ConsoleLog("generer"));
  console.log("Projet Android généré dans", sortie, "— version", twa.appVersionName);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
