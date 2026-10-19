// =============================================================================
// Appli installable : enregistre le service worker (sw.js).
// =============================================================================
// Sans effet sur le fonctionnement du site : si le navigateur ne connaît pas
// les service workers, rien ne change.
// =============================================================================

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {
      // Pas grave : le site marche normalement, il n'est juste pas installable.
    });
  });
}
