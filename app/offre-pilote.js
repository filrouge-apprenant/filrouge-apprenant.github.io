// =============================================================================
// Page « Offre pilote » : branche les boutons sur le lien de paiement Stripe.
// =============================================================================
// Le lien se règle dans config.js (lienPaiementPilote). Tant qu'il est vide
// (compte Stripe pas encore activé), les boutons ouvrent un email de
// réservation déjà rédigé : aucun prospect n'est perdu.
// =============================================================================

(function () {
  "use strict";

  const config = window.FIL_ROUGE_CONFIG || {};
  const email = config.emailFilRouge || "contact.filrouge.apprenant@gmail.com";
  const lienStripe = (config.lienPaiementPilote || "").trim();

  // Seul un lien Stripe en https est accepté (protection contre une erreur de saisie).
  const lienValide = /^https:\/\/(buy|checkout)\.stripe\.com\//.test(lienStripe);

  const objet = "Réservation — Offre pilote Fil Rouge Apprenants";
  const corps = [
    "Bonjour Émilie,",
    "",
    "Je souhaite réserver une place pour l'offre pilote (20 apprenants, 2 mois, 400 € HT).",
    "",
    "Organisme : ",
    "Nom et fonction : ",
    "Téléphone : ",
    "Formations concernées : ",
    "",
    "Bonne journée,",
  ].join("\n");
  const lienEmail = `mailto:${email}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;

  for (const bouton of document.querySelectorAll(".op-lien-paiement")) {
    if (lienValide) {
      bouton.href = lienStripe;
      bouton.rel = "noopener";
    } else {
      bouton.href = lienEmail;
      bouton.textContent = bouton.textContent.replace("et payer en ligne", "ma place par email");
    }
  }

  const indispo = document.querySelector(".op-indispo");
  const securite = document.querySelector(".op-securite");
  if (!lienValide) {
    if (indispo) indispo.hidden = false;
    if (securite) securite.hidden = true;
  }
})();

// =============================================================================
// Formulaire « Demander un devis » : envoie la demande à la base (fonction
// demander_devis), qui crée la fiche de l'organisme dans la plateforme.
// =============================================================================
(function () {
  "use strict";

  const config = window.FIL_ROUGE_CONFIG || {};
  const formulaire = document.getElementById("devis-formulaire");
  const retour = document.getElementById("devis-message");
  const merci = document.getElementById("devis-merci");
  if (!formulaire || !config.supabaseUrl || !config.supabaseCle) return;

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const dire = (texte) => { retour.textContent = texte; retour.hidden = !texte; };

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const f = new FormData(formulaire);
    const val = (cle) => String(f.get(cle) || "").trim();

    if (val("organisme").length < 2) return dire("Indiquez le nom de votre organisme.");
    if (val("nom").length < 2) return dire("Indiquez votre nom.");
    if (!EMAIL.test(val("email"))) return dire("Vérifiez votre adresse email.");

    const bouton = formulaire.querySelector("button[type=submit]");
    bouton.disabled = true;
    bouton.textContent = "Envoi…";
    dire("");

    try {
      const nb = parseInt(val("nb"), 10);
      const r = await fetch(`${config.supabaseUrl}/rest/v1/rpc/demander_devis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
        body: JSON.stringify({
          p_organisme: val("organisme"),
          p_contact_nom: val("nom"),
          p_contact_fonction: val("fonction"),
          p_email: val("email"),
          p_telephone: val("telephone"),
          p_nb_apprenants: Number.isFinite(nb) && nb > 0 ? nb : null,
          p_formations: val("formations"),
          p_message: val("message"),
          p_piege: val("site"),
        }),
      });
      if (!r.ok) {
        let texte = "La demande n'a pas pu être envoyée. Réessayez, ou écrivez à contact.filrouge.apprenant@gmail.com.";
        try { const corps = await r.json(); if (corps && corps.message && corps.code === "P0001") texte = corps.message; } catch (e) { /* message par défaut */ }
        throw new Error(texte);
      }
      formulaire.hidden = true;
      merci.hidden = false;
      merci.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (erreur) {
      dire(erreur.message);
      bouton.disabled = false;
      bouton.textContent = "Demander un devis";
    }
  });
})();
