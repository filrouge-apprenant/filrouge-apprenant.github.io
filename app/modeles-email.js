// =============================================================================
// Fil Rouge Apprenants — Modèles d'emails (#/modeles-email)
// =============================================================================
// Bibliothèque d'emails tout prêts, rangés par catégorie (table modeles_email).
//   - Deux menus déroulants : 1) la catégorie, 2) le modèle.
//   - Page « Modèles d'emails » (administratrice) : modifier, ajouter,
//     désactiver un modèle, créer une catégorie, aperçu sur un élève fictif.
//   - Relances automatiques : un modèle peut porter un numéro de tentative
//     (1 à 8). Après un appel sans réponse, la plateforme envoie celui qui
//     correspond à la tentative du mois (voir app.js, formulaire d'appel).
//   - Envoi par la fonction serveur « envoyer-email » (Brevo, gratuit). Sans
//     clé Brevo, l'email s'ouvre tout prêt dans Gmail : un clic pour l'envoyer.
// Sécurité : tout le texte passe par h() (textContent), jamais innerHTML.
// =============================================================================

(function () {
  "use strict";

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CLE_AUTO = "filrouge-relance-auto";

  // Élève fictif pour l'aperçu de la page d'édition.
  const EXEMPLE = { prenom: "Julie", organisme: "Académie Horizon", formation: "CAP Pâtissier", avancement_pct: 42, date_examen: "2027-06-12", date_rdv: "mardi 18 novembre à 18 h" };

  window.FilRougeModelesEmail = function (outils) {
    const { sb, h, afficher, message, texteErreur, champTexte, champChoix, signaler, occupe, pastille } = outils;
    const C = window.FilRougeContact;
    let cache = null;
    let etatBrevo = null;

    // -------------------------------------------------------------------------
    // Données
    // -------------------------------------------------------------------------
    async function charger(forcer) {
      if (cache && !forcer) return cache;
      const { data, error } = await sb.from("modeles_email")
        .select("id, categorie, titre, objet, texte, ordre, tentative, actif")
        .order("ordre").order("titre");
      if (error) throw error;
      cache = data || [];
      return cache;
    }
    const actifs = (liste) => liste.filter((m) => m.actif);
    const categories = (liste) => [...new Set(liste.map((m) => m.categorie))];

    async function brevoActif() {
      if (etatBrevo !== null) return etatBrevo;
      try {
        const { data } = await sb.functions.invoke("envoyer-email", { body: { action: "etat" } });
        etatBrevo = !!(data && data.brevo);
      } catch { etatBrevo = false; }
      return etatBrevo;
    }

    // Envoi par la fonction serveur. Renvoie { ok } ou { ok:false, raison, erreur }.
    async function envoyerParServeur(apprenantId, objet, texte) {
      const { data, error } = await sb.functions.invoke("envoyer-email", { body: { action: "envoyer", apprenant_id: apprenantId, objet, texte } });
      if (error) {
        let erreur = "L'envoi a échoué.";
        try { erreur = (await error.context.json()).erreur || erreur; } catch { /* réponse illisible */ }
        return { ok: false, raison: "erreur", erreur };
      }
      return data || { ok: false, raison: "erreur" };
    }

    const relanceAutoActive = () => { try { return localStorage.getItem(CLE_AUTO) !== "non"; } catch { return true; } };
    const choisirRelanceAuto = (oui) => { try { localStorage.setItem(CLE_AUTO, oui ? "oui" : "non"); } catch { /* navigateur sans stockage */ } };

    // Modèle de relance pour la tentative n (1 à 8). S'il n'existe pas, le plus proche en dessous.
    function modeleDeTentative(liste, n) {
      const relances = actifs(liste).filter((m) => m.tentative).sort((a, b) => a.tentative - b.tentative);
      return relances.filter((m) => m.tentative <= n).pop() || null;
    }

    // -------------------------------------------------------------------------
    // Les deux menus déroulants : catégorie, puis modèle.
    // options.initial : id du modèle sélectionné au départ ; options.libre : ajoute « — Message libre — »
    // -------------------------------------------------------------------------
    function menus(liste, prefixe, onChoix, options = {}) {
      const dispo = options.tous ? liste : actifs(liste);
      const cats = categories(dispo);
      const initial = dispo.find((m) => m.id === options.initial) || null;
      const choixCat = { ...(options.libre ? { "": "— Message libre —" } : {}), ...Object.fromEntries(cats.map((c) => [c, c])) };
      const cat = champChoix(`${prefixe}-categorie`, "Catégorie", choixCat, initial ? initial.categorie : (options.libre ? "" : cats[0]));
      const mod = champChoix(`${prefixe}-modele`, "Email", {}, "");

      function remplirModeles(garder) {
        const items = dispo.filter((m) => m.categorie === cat.champ.value);
        mod.champ.replaceChildren(...items.map((m) => h("option", { value: m.id }, (m.actif ? "" : "(désactivé) ") + m.titre)));
        mod.champ.disabled = !items.length;
        if (garder && items.some((m) => m.id === garder)) mod.champ.value = garder;
      }
      const modeleChoisi = () => dispo.find((m) => m.id === mod.champ.value) || null;

      remplirModeles(initial && initial.id);
      cat.champ.addEventListener("change", () => { remplirModeles(); onChoix(modeleChoisi()); });
      mod.champ.addEventListener("change", () => onChoix(modeleChoisi()));
      return {
        bloc: h("div", { class: "deux-colonnes" }, cat.bloc, mod.bloc),
        modeleChoisi,
        choisir(id) {
          const m = dispo.find((x) => x.id === id);
          if (!m) return;
          cat.champ.value = m.categorie;
          remplirModeles(id);
        },
      };
    }

    // -------------------------------------------------------------------------
    // Page « Modèles d'emails » (administratrice)
    // -------------------------------------------------------------------------
    async function route(morceaux) {
      afficher(h("p", { class: "chargement" }, "Chargement des modèles…"));
      let liste;
      try { liste = await charger(true); } catch (e) { return afficher(message("erreur", texteErreur(e))); }
      const idDemande = (morceaux || []).find((m) => UUID.test(m)) || null;
      dessiner(liste, idDemande);
    }

    function dessiner(liste, idInitial) {
      const zone = h("div");
      const etatEnvoi = h("p", { class: "aide" }, "Vérification de l'envoi automatique…");
      brevoActif().then((oui) => {
        etatEnvoi.replaceChildren(
          oui ? pastille("vert", "Envoi automatique actif") : pastille("orange", "Envoi automatique à activer"),
          " ",
          oui
            ? "Les emails partent directement de la plateforme, par Brevo."
            : "Pour l'instant, chaque email s'ouvre tout prêt dans Gmail : il reste à cliquer « Envoyer ». Pour l'envoi automatique, il manque la clé Brevo dans Supabase.");
      });

      let courant = null;
      const champCategorie = champTexte("me-categorie", "Catégorie", "", { aide: "Choisissez-en une existante ou tapez un nouveau nom pour créer une catégorie." });
      champCategorie.champ.setAttribute("list", "me-categories");
      const listeCategories = h("datalist", { id: "me-categories" }, categories(liste).map((c) => h("option", { value: c })));
      const champTitre = champTexte("me-titre", "Nom du modèle (dans le menu)", "");
      const champObjet = champTexte("me-objet", "Objet de l'email", "");
      const champTexteMail = champTexte("me-texte", "Message", "", { multiligne: true });
      champTexteMail.champ.rows = 12;
      const choixTentatives = { "": "Non (envoi à la main seulement)", ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), `Oui, à la tentative n° ${n}`])) };
      const champTentative = champChoix("me-tentative", "Relance automatique après un appel sans réponse", choixTentatives, "");
      const champActif = h("input", { type: "checkbox", id: "me-actif" });
      const blocActif = h("label", { for: "me-actif", class: "case" }, champActif, " Modèle actif (visible dans les menus)");

      const apercuObjet = h("p", {}, "");
      const apercuTexte = h("p", { class: "texte-libre" }, "");
      const apercuManque = h("p", { class: "aide" }, "");
      function majApercu() {
        const r = C.remplirModeleEmail({ objet: champObjet.champ.value, texte: champTexteMail.champ.value }, { ...EXEMPLE, moi: "Émilie" });
        apercuObjet.replaceChildren(h("strong", {}, "Objet : "), r.objet);
        apercuTexte.textContent = r.texte;
        const inconnues = C.variablesRestantes(r.objet + r.texte).filter((v) => !C.VARIABLES_EMAIL.some(([cle]) => cle === v));
        apercuManque.textContent = inconnues.length
          ? `Variable inconnue : {${inconnues.join("}, {")}}. Vérifiez l'orthographe (liste ci-dessous).`
          : "Aperçu avec un élève fictif (Julie, CAP Pâtissier, 42 %).";
      }
      for (const c of [champObjet.champ, champTexteMail.champ]) c.addEventListener("input", majApercu);

      function charger1(m) {
        courant = m;
        champCategorie.champ.value = m ? m.categorie : "";
        champTitre.champ.value = m ? m.titre : "";
        champObjet.champ.value = m ? m.objet : "";
        champTexteMail.champ.value = m ? m.texte : "Bonjour {prenom},\n\n\n\n{signature}";
        champTentative.champ.value = m && m.tentative ? String(m.tentative) : "";
        champActif.checked = m ? m.actif : true;
        titreFormulaire.textContent = m ? "Modifier le modèle" : "Nouveau modèle";
        supprimer.hidden = !m;
        signaler(zone);
        majApercu();
      }

      const selection = menus(liste, "me-choix", (m) => charger1(m), { tous: true, initial: idInitial });
      const titreFormulaire = h("h2", {}, "Modifier le modèle");
      const nouveau = h("button", { type: "button", class: "bouton bouton-secondaire" }, "+ Nouveau modèle");
      const enregistrer = h("button", { type: "submit", class: "bouton" }, "Enregistrer");
      const supprimer = h("button", { type: "button", class: "bouton-lien bouton-lien-danger" }, "Supprimer ce modèle");
      nouveau.addEventListener("click", () => { charger1(null); champCategorie.champ.focus(); });

      // Insérer une variable à l'endroit du curseur.
      const boutonsVariables = C.VARIABLES_EMAIL.map(([cle, aide]) => {
        const b = h("button", { type: "button", class: "puce", title: aide }, `{${cle}}`);
        b.addEventListener("click", () => {
          const t = champTexteMail.champ;
          const debut = t.selectionStart ?? t.value.length, fin = t.selectionEnd ?? t.value.length;
          t.value = t.value.slice(0, debut) + `{${cle}}` + t.value.slice(fin);
          t.focus();
          t.selectionStart = t.selectionEnd = debut + cle.length + 2;
          majApercu();
        });
        return b;
      });

      const formulaire = h("form", { class: "formulaire", novalidate: true },
        titreFormulaire,
        champCategorie.bloc, champTitre.bloc, listeCategories,
        champObjet.bloc, champTexteMail.bloc,
        h("div", { class: "raccourcis" }, h("span", { class: "aide" }, "Insérer :"), boutonsVariables),
        h("details", { class: "depliant" }, h("summary", {}, "Que veut dire chaque variable ?"),
          h("ul", {}, C.VARIABLES_EMAIL.map(([cle, aide]) => h("li", {}, h("strong", {}, `{${cle}}`), ` : ${aide}`)))),
        champTentative.bloc, blocActif, zone,
        h("div", { class: "actions-ligne" }, enregistrer, nouveau),
        supprimer);

      formulaire.addEventListener("submit", async (e) => {
        e.preventDefault();
        const valeurs = {
          categorie: champCategorie.champ.value.trim(),
          titre: champTitre.champ.value.trim(),
          objet: champObjet.champ.value.trim(),
          texte: champTexteMail.champ.value.trim(),
          tentative: champTentative.champ.value ? Number(champTentative.champ.value) : null,
          actif: champActif.checked,
        };
        if (!valeurs.categorie || !valeurs.titre || !valeurs.objet || !valeurs.texte) return signaler(zone, "erreur", "Remplissez la catégorie, le nom, l'objet et le message.");
        const inconnues = C.variablesRestantes(valeurs.objet + valeurs.texte).filter((v) => !C.VARIABLES_EMAIL.some(([cle]) => cle === v));
        if (inconnues.length) return signaler(zone, "erreur", `Variable inconnue : {${inconnues.join("}, {")}}.`);
        // Une seule relance active par numéro : l'ancienne est libérée.
        const doublon = valeurs.tentative && valeurs.actif ? liste.find((m) => m.actif && m.tentative === valeurs.tentative && (!courant || m.id !== courant.id)) : null;
        occupe(enregistrer, true, "Enregistrement…");
        if (doublon) {
          const { error } = await sb.from("modeles_email").update({ tentative: null }).eq("id", doublon.id);
          if (error) { occupe(enregistrer, false); return signaler(zone, "erreur", texteErreur(error)); }
        }
        const requete = courant
          ? sb.from("modeles_email").update(valeurs).eq("id", courant.id).select("id").single()
          : sb.from("modeles_email").insert({ ...valeurs, ordre: 100 + liste.length }).select("id").single();
        const { data, error } = await requete;
        occupe(enregistrer, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        const nouvelleListe = await charger(true);
        dessiner(nouvelleListe, data.id);
        const note = doublon ? ` « ${doublon.titre} » n'est plus la relance n° ${valeurs.tentative}.` : "";
        window.scrollTo(0, 0);
        document.querySelector("#me-message")?.replaceChildren(message("info", `Modèle enregistré.${note}`));
      });

      let confirmation = false;
      supprimer.addEventListener("click", async () => {
        if (!courant) return;
        if (!confirmation) { confirmation = true; supprimer.textContent = "Confirmer la suppression définitive"; return; }
        occupe(supprimer, true, "Suppression…");
        const { error } = await sb.from("modeles_email").delete().eq("id", courant.id);
        occupe(supprimer, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        dessiner(await charger(true), null);
      });

      afficher(
        h("div", { class: "entete-page" }, h("h1", {}, "Modèles d'emails"),
          h("p", { class: "aide" }, "Choisissez une catégorie puis un email pour le modifier. Les variables entre accolades se remplacent toutes seules à l'envoi (prénom, organisme…).")),
        h("div", { id: "me-message" }),
        h("section", { class: "carte carte-large pile pile-serree" }, etatEnvoi, selection.bloc),
        h("div", { class: "deux-colonnes deux-colonnes-larges" },
          h("section", { class: "carte carte-large" }, formulaire),
          h("section", { class: "carte carte-large pile pile-serree" }, h("h2", {}, "Aperçu"), apercuObjet, apercuTexte, apercuManque)));
      charger1(selection.modeleChoisi());
    }

    return { charger, menus, route, brevoActif, envoyerParServeur, modeleDeTentative, relanceAutoActive, choisirRelanceAuto };
  };
})();
