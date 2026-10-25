// =============================================================================
// Page « Essai gratuit / devis » (offre-pilote.html)
// =============================================================================
// Le formulaire envoie la demande à la fonction serveur « tunnel-vente », qui
// crée la fiche de l'organisme, pré-remplit la proposition, prévient Émilie et
// envoie un accusé de réception. Si la fonction serveur ne répond pas, la
// demande est enregistrée directement dans la base (sans les emails) : aucun
// prospect n'est perdu.
// =============================================================================

(function () {
  "use strict";

  const config = window.FIL_ROUGE_CONFIG || {};
  const BOITE = config.emailFilRouge || "contact.filrouge.apprenant@gmail.com";
  const formulaire = document.getElementById("devis-formulaire");
  const retour = document.getElementById("devis-message");
  const merci = document.getElementById("devis-merci");
  const merciTexte = document.getElementById("devis-merci-texte");
  if (!formulaire || !config.supabaseUrl || !config.supabaseCle) return;

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const dire = (texte) => { retour.textContent = texte; retour.hidden = !texte; };
  const boutonEnvoi = formulaire.querySelector("button[type=submit]");
  const TEXTE_BOUTON = boutonEnvoi.textContent;

  // Un lien vers #devis (ancienne page) présélectionne le devis.
  if (/^#devis/.test(window.location.hash)) {
    const devis = formulaire.querySelector('input[name=type][value=devis]');
    if (devis) devis.checked = true;
  }

  async function viaFonctionServeur(donnees) {
    const r = await fetch(`${config.supabaseUrl}/functions/v1/tunnel-vente`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
      body: JSON.stringify({ action: "demande", ...donnees }),
    });
    let corps = null;
    try { corps = await r.json(); } catch (e) { /* réponse vide */ }
    if (r.ok && corps && corps.ok) return { ok: true, emails: corps.emails };
    if (r.status === 400 && corps && corps.erreur) return { ok: false, erreur: corps.erreur };
    return { ok: false, indisponible: true };
  }

  async function directementDansLaBase(d) {
    const r = await fetch(`${config.supabaseUrl}/rest/v1/rpc/demander_essai_ou_devis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseCle },
      body: JSON.stringify({
        p_organisme: d.organisme, p_contact_nom: d.nom, p_contact_fonction: d.fonction, p_email: d.email,
        p_telephone: d.telephone, p_nb_apprenants: d.nb, p_formations: d.formations, p_message: d.message,
        p_piege: d.site, p_type: d.type,
      }),
    });
    if (r.ok) return { ok: true, emails: false };
    let corps = null;
    try { corps = await r.json(); } catch (e) { /* message par défaut */ }
    return { ok: false, erreur: corps && corps.code === "P0001" && corps.message ? corps.message
      : `La demande n'a pas pu être envoyée. Réessayez, ou écrivez à ${BOITE}.` };
  }

  formulaire.addEventListener("submit", async (evenement) => {
    evenement.preventDefault();
    const f = new FormData(formulaire);
    const val = (cle) => String(f.get(cle) || "").trim();

    if (val("organisme").length < 2) return dire("Indiquez le nom de votre organisme.");
    if (val("nom").length < 2) return dire("Indiquez votre nom.");
    if (!EMAIL.test(val("email"))) return dire("Vérifiez votre adresse email.");

    boutonEnvoi.disabled = true;
    boutonEnvoi.textContent = "Envoi…";
    dire("");

    const nb = parseInt(val("nb"), 10);
    const donnees = {
      type: val("type") === "devis" ? "devis" : "essai",
      organisme: val("organisme"), nom: val("nom"), fonction: val("fonction"),
      email: val("email"), telephone: val("telephone"),
      nb: Number.isFinite(nb) && nb > 0 ? nb : null,
      formations: val("formations"), message: val("message"), site: val("site"),
    };

    let resultat;
    try {
      resultat = await viaFonctionServeur(donnees);
    } catch (e) {
      resultat = { ok: false, indisponible: true };
    }
    if (!resultat.ok && resultat.indisponible) {
      try { resultat = await directementDansLaBase(donnees); }
      catch (e) { resultat = { ok: false, erreur: `La demande n'a pas pu être envoyée. Vérifiez votre connexion, ou écrivez à ${BOITE}.` }; }
    }

    if (!resultat.ok) {
      dire(resultat.erreur);
      boutonEnvoi.disabled = false;
      boutonEnvoi.textContent = TEXTE_BOUTON;
      return;
    }
    const delai = donnees.type === "essai" ? "Je vous appelle sous 48 h pour lancer votre essai gratuit." : "Je vous envoie une proposition adaptée sous 48 h.";
    merciTexte.textContent = resultat.emails ? `${delai} Un accusé de réception vient de partir dans votre boîte email.` : delai;
    formulaire.hidden = true;
    merci.hidden = false;
    merci.scrollIntoView({ behavior: "smooth", block: "center" });
  });
})();
