// =============================================================================
// Page « Votre proposition » : affiche l'offre personnelle d'un client à partir
// de son lien secret (?p=jeton) et son bouton de paiement Stripe.
// Lecture seule, via la fonction publique proposition_publique().
// =============================================================================

(function () {
  "use strict";

  const config = window.FIL_ROUGE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const euros = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  const pluriel = (n, un, plusieurs) => `${String(n).replace(".", ",")} ${Number(n) > 1 ? plusieurs : un}`;

  function erreur() {
    $("pr-chargement").hidden = true;
    $("pr-erreur").hidden = false;
  }

  async function charger() {
    const jeton = new URLSearchParams(window.location.search).get("p") || "";
    if (!UUID.test(jeton) || !config.supabaseUrl) return erreur();

    let p;
    try {
      const r = await fetch(`${config.supabaseUrl}/rest/v1/rpc/proposition_publique`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
        body: JSON.stringify({ p_jeton: jeton }),
      });
      if (!r.ok) return erreur();
      const lignes = await r.json();
      p = Array.isArray(lignes) ? lignes[0] : null;
    } catch (e) {
      return erreur();
    }
    if (!p) return erreur();

    $("pr-organisme").textContent = p.organisme;
    $("pr-titre").textContent = p.titre;
    document.title = `${p.titre} — Fil Rouge Apprenants`;
    if (p.message_client) { $("pr-mot").textContent = p.message_client; $("pr-mot").hidden = false; }

    $("pr-montant").textContent = euros(p.montant_total);
    $("pr-detail").textContent = [
      pluriel(p.nb_apprenants, "apprenant", "apprenants"),
      pluriel(p.duree_mois, "mois", "mois"),
      `${pluriel(p.appels_par_mois, "appel", "appels")} par mois et par apprenant`,
    ].join(" · ");
    if (p.paiement === "mensuel") {
      $("pr-mensuel").textContent = `soit ${euros(Number(p.montant_total) / p.duree_mois)} par mois pendant ${pluriel(p.duree_mois, "mois", "mois")}`;
      $("pr-mensuel").hidden = false;
    }

    if (p.statut === "payee") {
      $("pr-payee").hidden = false;
    } else if (p.lien_paiement && /^https:\/\/(buy|checkout)\.stripe\.com\//.test(p.lien_paiement)) {
      $("pr-payer").href = p.lien_paiement;
      $("pr-payer").rel = "noopener";
      $("pr-payer").hidden = false;
      $("pr-securite").hidden = false;
    } else {
      $("pr-sans-lien").hidden = false;
    }

    if (p.description) {
      $("pr-description").textContent = p.description;
      $("pr-inclus-bloc").hidden = false;
    }

    $("pr-chargement").hidden = true;
    $("pr-contenu").hidden = false;
  }

  charger();
})();
