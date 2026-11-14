// Espace Abdel : service minimal pour rendre l'appli installable sur le téléphone.
// Réseau d'abord ; rien n'est gardé en copie (données clients toujours à jour).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
