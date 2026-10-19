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
  // Valeurs par défaut tirées du manifeste du site, puis réglages propres à l'appli.
  const base = TwaManifest.fromWebManifestJson(
    new URL(SITE + "/manifest.webmanifest"),
    manifesteWeb
  ).toJson();

  const twa = new TwaManifest({
    ...base,
    packageId: PAQUET,
    host: "filrouge-apprenant.github.io",
    name: "Fil Rouge Apprenants",
    launcherName: "Fil Rouge",
    startUrl: "/?source=appli",
    themeColor: "#ffffff",
    navigationColor: "#ffffff",
    navigationColorDark: "#ffffff",
    navigationDividerColor: "#ffffff",
    navigationDividerColorDark: "#ffffff",
    backgroundColor: "#ffffff",
    enableNotifications: false,
    fallbackType: "customtabs",
    appVersionCode: Number(numero),
    appVersion: "1.0." + numero,
    minSdkVersion: 24, // Android 7.0 minimum (exigé par la bibliothèque Google)
    signingKey: { path: "./signature.keystore", alias: "filrouge" },
  });

  const erreur = typeof twa.validate === "function" ? twa.validate() : null;
  if (erreur) throw new Error("Manifeste invalide : " + erreur);

  fs.mkdirSync(sortie, { recursive: true });
  fs.writeFileSync(path.join(sortie, "twa-manifest.json"), JSON.stringify(twa.toJson(), null, 2));
  await new TwaGenerator().createTwaProject(sortie, twa, new ConsoleLog("generer"));
  console.log("Projet Android généré dans", sortie, "— version", twa.appVersionName || twa.appVersion);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
