// =============================================================================
// Service worker de l'appli Fil Rouge Apprenants.
// =============================================================================
// Rôle : rendre le site installable (téléphone, Play Store) et afficher une
// page claire quand il n'y a pas de réseau.
//
// Règle de sécurité : AUCUNE donnée d'apprenant ou de client n'est gardée sur
// le téléphone. Seuls les fichiers du site (pages, styles, logo) passent par ici ;
// les échanges avec Supabase ne sont jamais interceptés ni mis en cache.
//
// Stratégie « réseau d'abord » : on charge toujours la dernière version en ligne ;
// la copie locale ne sert que si le réseau est coupé.
// =============================================================================

const VERSION = "__VERSION__";
const CACHE = "fil-rouge-" + VERSION;
const HORS_LIGNE = "hors-ligne.html";

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([HORS_LIGNE, "logo/icone-192.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evenement) => {
  // Efface les copies des versions précédentes.
  evenement.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  const url = new URL(requete.url);

  // Uniquement les lectures de fichiers de ce site. Tout le reste (Supabase,
  // Stripe, polices Google…) passe directement, sans copie.
  if (requete.method !== "GET" || url.origin !== self.location.origin) return;

  evenement.respondWith(
    fetch(requete)
      .then((reponse) => {
        if (reponse.ok && reponse.type === "basic") {
          const copie = reponse.clone();
          caches.open(CACHE).then((cache) => cache.put(requete, copie));
        }
        return reponse;
      })
      .catch(async () => {
        const enCache = await caches.match(requete);
        if (enCache) return enCache;
        if (requete.mode === "navigate") return caches.match(HORS_LIGNE);
        return Response.error();
      })
  );
});
