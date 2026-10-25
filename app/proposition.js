// =============================================================================
// Page « Votre proposition » : affiche l'offre personnelle d'un client à partir
// de son lien secret (?p=jeton), lui permet de l'accepter en ligne, puis de
// régler par le lien de paiement Stripe (offre payante).
// Lecture : fonction publique proposition_client().
// Acceptation : fonction serveur « tunnel-vente » (prévient Émilie par email),
// ou directement la base si la fonction serveur ne répond pas.
// =============================================================================

(function () {
  "use strict";

  const config = window.FIL_ROUGE_CONFIG || {};
  const BOITE = config.emailFilRouge || "contact.filrouge.apprenant@gmail.com";
  const $ = (id) => document.getElementById(id);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const STRIPE = /^https:\/\/(buy|checkout)\.stripe\.com\//;
  const euros = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  const pluriel = (n, un, plusieurs) => `${String(n).replace(".", ",")} ${Number(n) > 1 ? plusieurs : un}`;
  const dateFr = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  const jeton = new URLSearchParams(window.location.search).get("p") || "";

  function erreur() {
    $("pr-chargement").hidden = true;
    $("pr-erreur").hidden = false;
  }

  function montrerPaiement(lien) {
    if (lien && STRIPE.test(lien)) {
      $("pr-payer").href = lien;
      $("pr-payer").rel = "noopener";
      $("pr-payer").hidden = false;
      $("pr-securite").hidden = false;
    }
  }

  function confirmer(p, lien, nom, date) {
    $("pr-accord-bloc").hidden = true;
    const essai = p.type_offre === "essai";
    $("pr-confirmation-texte").textContent = essai
      ? `${nom ? `Accepté par ${nom}` : "Accepté"}${date ? ` le ${dateFr(date)}` : ""}. Je vous appelle sous 48 h pour récupérer la liste de vos apprenants et démarrer votre essai gratuit.`
      : `${nom ? `Accepté par ${nom}` : "Accepté"}${date ? ` le ${dateFr(date)}` : ""}. ${lien ? "Vous pouvez régler en ligne dès maintenant :" : "Je vous recontacte sous 48 h pour démarrer."}`;
    $("pr-confirmation").hidden = false;
    if (!essai && p.paiement === "mensuel") {
      $("pr-confirmation-texte").textContent = `${nom ? `Accepté par ${nom}` : "Accepté"}${date ? ` le ${dateFr(date)}` : ""}. Dernière étape : mettre en place le prélèvement automatique, ci-dessous.`;
      brancherMandat();
    } else if (!essai) montrerPaiement(lien);
  }

  // --- Mandat de prélèvement SEPA (fonction serveur « prelevement ») ---
  async function appelPrelevement(corps) {
    const r = await fetch(`${config.supabaseUrl}/functions/v1/prelevement`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
      body: JSON.stringify({ jeton, ...corps }),
    });
    let c = null;
    try { c = await r.json(); } catch (e) { /* vide */ }
    if (!r.ok) throw new Error((c && c.erreur) || `Le prélèvement n'a pas pu être mis en place. Réessayez, ou écrivez à ${BOITE}.`);
    return c || {};
  }
  function mandatEnPlace(ibanFin) {
    $("pr-mandat-bloc").hidden = true;
    $("pr-confirmation-texte").textContent = "Votre accord est enregistré et le prélèvement automatique est en place.";
    $("pr-mandat-ok-texte").textContent = `Les prélèvements se feront sur le compte se terminant par ${ibanFin || "…"}. Chaque mois, vous recevez d'abord la facture par email, avec le détail des appels passés.`;
    $("pr-mandat-ok").hidden = false;
  }
  let mandatBranche = false;
  async function brancherMandat() {
    if (mandatBranche) return;
    mandatBranche = true;
    const dire = (t) => { $("pr-mandat-message").textContent = t; $("pr-mandat-message").hidden = !t; };
    const bouton = $("pr-mandat-bouton");
    const retourStripe = new URLSearchParams(window.location.search).get("mandat") || "";
    try {
      const etat = /^cs_(test|live)_/.test(retourStripe)
        ? await appelPrelevement({ action: "confirmer", session_id: retourStripe })
        : await appelPrelevement({ action: "etat" });
      if (retourStripe) history.replaceState(null, "", `${window.location.pathname}?p=${jeton}`);
      if (etat.mandat === "actif") return mandatEnPlace(etat.iban_fin);
      if (retourStripe) dire("La validation du mandat n'est pas encore confirmée par la banque. Réessayez dans un instant, ou cliquez à nouveau sur le bouton.");
    } catch (e) {
      dire(e.message);
    }
    $("pr-mandat-bloc").hidden = false;
    bouton.addEventListener("click", async () => {
      bouton.disabled = true;
      bouton.textContent = "Ouverture de la page sécurisée…";
      dire("");
      try {
        const r = await appelPrelevement({ action: "mandat" });
        if (r.mandat === "actif") return mandatEnPlace(r.iban_fin);
        if (r.url && /^https:\/\/checkout\.stripe\.com\//.test(r.url)) { window.location.href = r.url; return; }
        throw new Error("La page de prélèvement n'a pas pu s'ouvrir.");
      } catch (e) {
        dire(e.message);
        bouton.disabled = false;
        bouton.textContent = "Mettre en place le prélèvement";
      }
    });
  }

  async function charger() {
    if (!UUID.test(jeton) || !config.supabaseUrl) return erreur();

    let p;
    try {
      const r = await fetch(`${config.supabaseUrl}/rest/v1/rpc/proposition_client`, {
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

    const essai = p.type_offre === "essai";
    $("pr-organisme").textContent = p.organisme;
    $("pr-titre").textContent = p.titre;
    document.title = `${p.titre} — Fil Rouge Apprenants`;
    if (p.message_client) { $("pr-mot").textContent = p.message_client; $("pr-mot").hidden = false; }

    if (essai) {
      $("pr-montant").textContent = "Gratuit";
      $("pr-ht").hidden = true;
      $("pr-detail").textContent = [
        `jusqu'à ${pluriel(p.nb_apprenants, "apprenant", "apprenants")}`,
        pluriel(p.duree_jours || 15, "jour", "jours"),
        "1 appel chacun",
      ].join(" · ");
      $("pr-mensuel").textContent = "Sans engagement, sans carte bancaire";
      $("pr-mensuel").hidden = false;
      $("pr-accord-titre").textContent = "Lancer mon essai gratuit";
      $("pr-accord-texte").textContent = "Je demande l'essai gratuit de 15 jours pour mon organisme. Je décide librement de continuer ou non à la fin de l'essai.";
      $("pr-accepter").textContent = "Je lance mon essai gratuit";
    } else {
      $("pr-montant").textContent = euros(p.montant_total);
      $("pr-detail").textContent = [
        pluriel(p.nb_apprenants, "apprenant", "apprenants"),
        pluriel(p.duree_mois, "mois", "mois"),
        `${pluriel(p.appels_par_mois, "appel", "appels")} par mois et par apprenant`,
      ].join(" · ");
      if (p.paiement === "mensuel") {
        $("pr-ht").textContent = "HT (estimation)";
        $("pr-mensuel").textContent = `À ${euros(p.prix_appel)} HT l'appel : vous ne payez que les appels réellement passés, par prélèvement mensuel.`;
        $("pr-mensuel").hidden = false;
      }
    }

    if (p.description) {
      $("pr-description").textContent = p.description;
      $("pr-inclus-bloc").hidden = false;
    }

    if (p.statut === "payee") {
      $("pr-payee").hidden = false;
    } else if (p.accepte_le) {
      confirmer(p, p.lien_paiement, p.accepte_nom, p.accepte_le);
    } else {
      // Pré-remplissage avec le contact connu (modifiable).
      const f = $("pr-accord");
      if (p.contact_nom) f.elements.nom.value = p.contact_nom;
      if (p.contact_fonction) f.elements.fonction.value = p.contact_fonction;
      if (p.contact_email) f.elements.email.value = p.contact_email;
      $("pr-accord-bloc").hidden = false;
      brancherAccord(p);
    }

    $("pr-chargement").hidden = true;
    $("pr-contenu").hidden = false;
  }

  function brancherAccord(p) {
    const f = $("pr-accord");
    const bouton = $("pr-accepter");
    const texteBouton = bouton.textContent;
    const dire = (t) => { $("pr-accord-message").textContent = t; $("pr-accord-message").hidden = !t; };

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nom = f.elements.nom.value.trim();
      const fonction = f.elements.fonction.value.trim();
      const email = f.elements.email.value.trim();
      if (nom.length < 2) return dire("Indiquez votre nom.");
      if (!EMAIL.test(email)) return dire("Vérifiez votre adresse email.");
      if (!f.elements.accord.checked) return dire("Cochez la case pour confirmer votre accord.");
      dire("");
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";

      let resultat = null;
      try {
        const r = await fetch(`${config.supabaseUrl}/functions/v1/tunnel-vente`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
          body: JSON.stringify({ action: "accepter", jeton, nom, fonction, email, accord: true }),
        });
        let corps = null;
        try { corps = await r.json(); } catch (x) { /* vide */ }
        if (r.ok && corps && corps.ok) resultat = { ok: true, lien: corps.lien_paiement };
        else if (r.status === 400 && corps && corps.erreur) resultat = { ok: false, erreur: corps.erreur };
      } catch (x) { /* fonction serveur injoignable : voir plus bas */ }

      if (!resultat) {
        try {
          const r = await fetch(`${config.supabaseUrl}/rest/v1/rpc/accepter_proposition`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
            body: JSON.stringify({ p_jeton: jeton, p_nom: nom, p_fonction: fonction, p_email: email }),
          });
          const corps = await r.json().catch(() => null);
          if (r.ok) resultat = { ok: true, lien: Array.isArray(corps) && corps[0] ? corps[0].lien_paiement : null };
          else resultat = { ok: false, erreur: corps && corps.code === "P0001" && corps.message ? corps.message : `L'acceptation n'a pas pu être enregistrée. Réessayez, ou écrivez à ${BOITE}.` };
        } catch (x) {
          resultat = { ok: false, erreur: `L'acceptation n'a pas pu être enregistrée. Vérifiez votre connexion, ou écrivez à ${BOITE}.` };
        }
      }

      if (!resultat.ok) {
        dire(resultat.erreur);
        bouton.disabled = false;
        bouton.textContent = texteBouton;
        return;
      }
      confirmer(p, resultat.lien, nom, new Date().toISOString());
      $("pr-confirmation").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  charger();
})();
