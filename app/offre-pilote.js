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
