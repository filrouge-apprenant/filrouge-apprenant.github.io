// =============================================================================
// Fil Rouge Apprenants — page publique preferences-email.html (19/11/2026)
// Le centre accepte ou refuse le suivi d'ouverture de nos emails.
// Les deux boutons ont le même poids (refuser aussi simple qu'accepter).
// Tout l'affichage passe par textContent.
// =============================================================================
(function () {
  "use strict";
  const config = window.FIL_ROUGE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const jeton = new URLSearchParams(window.location.search).get("t") || "";
  const BOITE = "contact.filrouge.apprenant@gmail.com";

  async function appeler(corps) {
    const r = await fetch(`${config.supabaseUrl}/functions/v1/preferences-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
      body: JSON.stringify({ jeton, ...corps }),
    });
    let d = null;
    try { d = await r.json(); } catch (e) { /* vide */ }
    if (!r.ok) throw new Error((d && d.erreur) || "Service indisponible.");
    return d;
  }

  function afficherEtat(choix) {
    $("pref-etat").textContent = choix === true
      ? "Votre choix actuel : vous acceptez le suivi de l'ouverture de nos emails."
      : choix === false
        ? "Votre choix actuel : vous refusez le suivi de l'ouverture de nos emails."
        : "Vous n'avez pas encore fait de choix : rien n'est suivi.";
  }

  async function choisir(choix) {
    $("pref-message").textContent = "Enregistrement…";
    try {
      const d = await appeler({ action: "choisir", choix });
      afficherEtat(d.choix);
      $("pref-message").textContent = "Merci, votre choix est enregistré.";
    } catch (e) {
      $("pref-message").textContent = `${e.message} Vous pouvez aussi écrire à ${BOITE}.`;
    }
  }

  $("pref-oui").addEventListener("click", () => choisir(true));
  $("pref-non").addEventListener("click", () => choisir(false));

  (async () => {
    if (!/^[0-9a-f-]{36}$/i.test(jeton)) {
      $("pref-pour").textContent = `Ce lien est incomplet. Utilisez le lien en bas de notre email, ou écrivez à ${BOITE}.`;
      return;
    }
    try {
      const d = await appeler({ action: "lire" });
      $("pref-pour").textContent = d.organisme ? `Pour ${d.organisme}.` : "Votre choix pour nos emails.";
      afficherEtat(d.choix);
      $("pref-boutons").hidden = false;
    } catch (e) {
      $("pref-pour").textContent = `${e.message} Écrivez-nous à ${BOITE}.`;
    }
  })();
})();
