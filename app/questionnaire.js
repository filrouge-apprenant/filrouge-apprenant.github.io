// =============================================================================
// Questionnaire de satisfaction apprenant (page publique, sans connexion).
// L'apprenant arrive avec un lien personnel : questionnaire.html?j=<jeton>.
// Le jeton est vérifié par la base (fonctions questionnaire_infos et
// questionnaire_repondre) : une seule réponse par lien, aucune autre donnée
// accessible depuis cette page.
// =============================================================================
(function () {
  "use strict";

  var config = window.FIL_ROUGE_CONFIG;
  var jeton = new URLSearchParams(window.location.search).get("j") || "";
  var formatJeton = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function el(id) { return document.getElementById(id); }

  function afficher(id) {
    ["q-chargement", "q-erreur", "q-deja", "q-merci", "q-formulaire"].forEach(function (x) {
      el(x).hidden = x !== id;
    });
    window.scrollTo(0, 0);
  }

  function appelRpc(fonction, corps) {
    return fetch(config.supabaseUrl + "/rest/v1/rpc/" + fonction, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseCle,
        Authorization: "Bearer " + config.supabaseCle,
      },
      body: JSON.stringify(corps),
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (donnees) {
        if (!r.ok) { throw new Error((donnees && donnees.message) || "Erreur " + r.status); }
        return donnees;
      });
    });
  }

  // Construit les échelles de notes (boutons 1 à 5, ou 0 à 10).
  function construireEchelles() {
    document.querySelectorAll(".q-echelle").forEach(function (bloc) {
      var nom = bloc.dataset.nom;
      var rangee = document.createElement("div");
      rangee.className = "q-notes";
      for (var n = Number(bloc.dataset.min); n <= Number(bloc.dataset.max); n++) {
        var label = document.createElement("label");
        var input = document.createElement("input");
        input.type = "radio";
        input.name = nom;
        input.value = String(n);
        var span = document.createElement("span");
        span.textContent = String(n);
        label.appendChild(input);
        label.appendChild(span);
        rangee.appendChild(label);
      }
      var reperes = document.createElement("div");
      reperes.className = "q-reperes";
      var bas = document.createElement("span");
      bas.textContent = bloc.dataset.bas;
      var haut = document.createElement("span");
      haut.textContent = bloc.dataset.haut;
      reperes.appendChild(bas);
      reperes.appendChild(haut);
      bloc.appendChild(rangee);
      bloc.appendChild(reperes);
    });
  }

  function valeurNote(form, nom) {
    var choisi = form.querySelector('input[name="' + nom + '"]:checked');
    return choisi ? Number(choisi.value) : null;
  }

  function remplirTexte(selecteur, texte) {
    document.querySelectorAll(selecteur).forEach(function (n) { n.textContent = texte; });
  }

  function demarrer() {
    if (!formatJeton.test(jeton)) { afficher("q-erreur"); return; }

    appelRpc("questionnaire_infos", { p_jeton: jeton })
      .then(function (lignes) {
        var infos = lignes && lignes[0];
        if (!infos) { afficher("q-erreur"); return; }
        if (infos.deja_repondu) { afficher("q-deja"); return; }
        remplirTexte(".q-prenom", infos.prenom || "");
        remplirTexte(".q-organisme", infos.organisme || "votre organisme");
        construireEchelles();
        afficher("q-formulaire");
      })
      .catch(function () { afficher("q-erreur"); });

    var form = el("q-formulaire");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var alerte = el("q-alerte");
      var noteGlobale = valeurNote(form, "note_globale");
      if (noteGlobale === null) {
        alerte.textContent = "Merci de donner au moins une note à la question 1.";
        alerte.hidden = false;
        form.querySelector('[data-nom="note_globale"]').scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      alerte.hidden = true;
      var bouton = form.querySelector("button[type=submit]");
      bouton.disabled = true;
      bouton.textContent = "Envoi…";

      var frequence = form.querySelector('input[name="frequence"]:checked');
      appelRpc("questionnaire_repondre", {
        p_jeton: jeton,
        p_note_globale: noteGlobale,
        p_note_ecoute: valeurNote(form, "note_ecoute"),
        p_note_clarte: valeurNote(form, "note_clarte"),
        p_note_utilite: valeurNote(form, "note_utilite"),
        p_frequence: frequence ? frequence.value : null,
        p_recommandation: valeurNote(form, "recommandation"),
        p_point_fort: form.point_fort.value,
        p_amelioration: form.amelioration.value,
        p_anonyme: form.anonyme.checked,
      })
        .then(function () { afficher("q-merci"); })
        .catch(function (err) {
          if (/déjà rempli/.test(err.message)) { afficher("q-deja"); return; }
          alerte.textContent = "L'envoi n'a pas fonctionné. Vérifiez votre connexion et réessayez.";
          alerte.hidden = false;
          bouton.disabled = false;
          bouton.textContent = "Envoyer mon avis";
        });
    });
  }

  demarrer();
})();
