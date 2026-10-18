// =============================================================================
// Fil Rouge Apprenants — application (étapes 2 et 3 : connexion, rôles, CRM)
// =============================================================================
// Parcours :
//   1. Adresse email  -> Supabase envoie un code à 6 chiffres
//   2. Code reçu      -> session ouverte (niveau aal1)
//   3. Profil         -> rôle : administratrice, client ou appelante
//   4. Administratrice uniquement : double authentification
//        - première fois : inscription de l'application d'authentification (QR code)
//        - ensuite : code à 6 chiffres de l'application à chaque connexion
//      La base refuse toute donnée à l'administratrice tant que ce n'est pas fait.
//   5. Accueil selon le rôle
//
// Sécurité : tout le texte venant de la base est inséré avec textContent
// (jamais innerHTML), pour qu'aucune donnée ne puisse injecter du code.
// =============================================================================

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Démarrage du client Supabase
  // ---------------------------------------------------------------------------

  const config = window.FIL_ROUGE_CONFIG;
  const contenu = document.getElementById("contenu");
  const zoneCompte = document.getElementById("zone-compte");
  const compteLibelle = document.getElementById("compte-libelle");
  const boutonDeconnexion = document.getElementById("bouton-deconnexion");

  if (!window.supabase || !config) {
    contenu.replaceChildren(
      h("p", { class: "message message-erreur" },
        "La page n'a pas pu se charger complètement. Vérifiez votre connexion internet, puis rechargez la page.")
    );
    return;
  }

  // Un lien de connexion expiré ou déjà utilisé revient avec une erreur dans l'adresse.
  const erreurLien = /(^|[#&?])error=/.test(window.location.hash + window.location.search)
    ? "Ce lien de connexion a expiré ou a déjà servi. Demandez-en un nouveau ci-dessous."
    : null;
  if (erreurLien) history.replaceState(null, "", window.location.pathname);

  // detectSessionInUrl : ouvre la session quand on arrive par le lien reçu par email.
  const sb = window.supabase.createClient(config.supabaseUrl, config.supabaseCle, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // Adresse où renvoie le lien de l'email : la page elle-même, une fois en ligne.
  function adresseRetour() {
    return /^https?:$/.test(window.location.protocol)
      ? window.location.origin + window.location.pathname
      : undefined;
  }

  function demanderAcces(email) {
    return sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: adresseRetour() },
    });
  }

  const LIBELLES_ROLE = {
    admin: "Administratrice",
    client: "Espace client",
    appelante: "Appelante",
  };

  const LIBELLES_ETAPE = {
    prospect: "Prospects",
    contacte: "Contactés",
    test_gratuit: "Tests gratuits",
    client: "Clients",
    perdu: "Perdus",
  };

  const etat = { email: "" };

  // ---------------------------------------------------------------------------
  // Petits outils d'affichage
  // ---------------------------------------------------------------------------

  // Crée un élément : h("p", { class: "x" }, "texte", autreElement)
  function h(balise, attributs, ...enfants) {
    const el = document.createElement(balise);
    for (const [cle, valeur] of Object.entries(attributs || {})) {
      if (valeur === false || valeur === null || valeur === undefined) continue;
      if (cle.startsWith("on") && typeof valeur === "function") {
        el.addEventListener(cle.slice(2), valeur);
      } else if (valeur === true) {
        el.setAttribute(cle, "");
      } else {
        el.setAttribute(cle, String(valeur));
      }
    }
    for (const enfant of enfants.flat(Infinity)) {
      if (enfant === null || enfant === undefined || enfant === false) continue;
      el.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
    }
    return el;
  }

  function afficher(...elements) {
    // Menu latéral : seulement pour l'administratrice connectée.
    const avecMenu = menuVisible();
    document.body.classList.toggle("avec-menu", avecMenu);
    menu.hidden = !avecMenu;
    boutonMenu.hidden = !avecMenu;
    if (!avecMenu) ouvrirMenu(false);
    contenu.replaceChildren(...elements.filter((e) => e !== null && e !== undefined && e !== false));
    document.body.classList.toggle("page-large", !!contenu.querySelector(".fiche-page"));
    // Onglets trop larges pour un téléphone : on fait défiler jusqu'à l'onglet actif.
    const ongletActif = contenu.querySelector(".onglet[aria-current='page']");
    if (ongletActif && ongletActif.parentElement) {
      ongletActif.parentElement.scrollLeft = Math.max(0, ongletActif.offsetLeft - ongletActif.parentElement.offsetLeft - 16);
    }
    // Focus automatique seulement sur les écrans de connexion (pas sur les
    // fiches : sur téléphone, cela ouvrirait le clavier ou le calendrier).
    const premierChamp = contenu.querySelector(".onglets") ? null : contenu.querySelector("input");
    if (premierChamp) premierChamp.focus();
  }

  function message(type, texte) {
    return h("p", { class: `message message-${type}`, role: type === "erreur" ? "alert" : "status" }, texte);
  }

  // Place un message dans la zone prévue d'un formulaire (ou l'efface).
  function signaler(zone, type, texte) {
    zone.replaceChildren(texte ? message(type, texte) : "");
  }

  function occupe(bouton, enCours, texteEnCours) {
    if (enCours) {
      bouton.dataset.texte = bouton.textContent;
      bouton.textContent = texteEnCours;
      bouton.disabled = true;
    } else {
      bouton.textContent = bouton.dataset.texte || bouton.textContent;
      bouton.disabled = false;
    }
  }

  function codeValide(valeur) {
    return /^\d{6}$/.test(valeur);
  }

  // Ne garde que les chiffres (un code collé avec des espaces reste valable).
  function chiffresSeulement(champ) {
    champ.addEventListener("input", () => {
      champ.value = champ.value.replace(/\D/g, "").slice(0, 6);
    });
  }

  function pluriel(n, singulier, plurielTexte) {
    return `${n} ${n > 1 ? plurielTexte : singulier}`;
  }

  // Traduit les erreurs de Supabase en phrases utiles.
  function texteErreur(erreur) {
    const brut = `${erreur?.code || ""} ${erreur?.message || ""}`.toLowerCase();
    if (brut.includes("email_send_rate") || brut.includes("email rate limit")) {
      return "Trop d'emails de connexion envoyés récemment (2 par heure maximum pendant la construction). Si vous avez reçu un email il y a moins d'une heure, utilisez son lien. Sinon, réessayez dans une heure.";
    }
    if (brut.includes("rate") || erreur?.status === 429) {
      return "Trop de demandes en peu de temps. Patientez quelques minutes, puis réessayez.";
    }
    if (brut.includes("expired") || brut.includes("invalid") || brut.includes("otp")) {
      return "Ce code n'est pas valable ou a expiré. Vérifiez les 6 chiffres, ou demandez un nouveau code.";
    }
    if (brut.includes("fetch") || brut.includes("network")) {
      return "Impossible de joindre le serveur. Vérifiez votre connexion internet.";
    }
    if (erreur?.message && /[àâçéèêëîïôûù]/i.test(erreur.message)) {
      return erreur.message; // message déjà rédigé en français par la base
    }
    return "Une erreur est survenue. Réessayez dans un instant.";
  }

  // ---------------------------------------------------------------------------
  // Aiguillage : quel écran montrer ?
  // ---------------------------------------------------------------------------

  async function aiguiller() {
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      zoneCompte.hidden = true;
      return ecranEmail(erreurLien);
    }

    const { data: profil, error } = await sb
      .from("profils")
      .select("id, email, nom_affiche, role, organisme_id, actif, acces_debut, acces_fin, voir_comptes_rendus, voir_coaching, voir_avis, voir_examens, voir_preuves")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      return afficher(message("erreur", texteErreur(error)));
    }

    if (!profil || !profil.actif) {
      return ecranSansAcces(session.user.email);
    }

    // Période d'accès (clients et appelantes) : la base bloque déjà tout en dehors ;
    // ici on explique pourquoi.
    if (profil.role !== "admin") {
      const auj = aujourdhui();
      if (profil.acces_fin && profil.acces_fin < auj) return ecranAccesTermine(profil, "fin");
      if (profil.acces_debut && profil.acces_debut > auj) return ecranAccesTermine(profil, "debut");
    }

    zoneCompte.hidden = false;
    compteLibelle.textContent = `${profil.nom_affiche || profil.email} · ${LIBELLES_ROLE[profil.role]}`;

    if (profil.role === "admin") {
      const { data: niveau } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (niveau?.currentLevel !== "aal2") {
        const { data: facteurs } = await sb.auth.mfa.listFactors();
        const verifie = (facteurs?.totp || []).find((f) => f.status === "verified");
        return verifie ? ecranCodeApplication(verifie.id) : ecranInscriptionApplication(facteurs);
      }
      etat.profil = profil;
      return routeAdmin();
    }

    if (profil.role === "client") {
      etat.profil = profil;
      return routeClient();
    }
    etat.profil = profil;
    return routeAppelante();
  }

  // ---------------------------------------------------------------------------
  // Écran 1 : adresse email
  // ---------------------------------------------------------------------------

  function ecranEmail(infoPrealable) {
    const zone = h("div");
    const champ = h("input", {
      id: "champ-email", type: "email", name: "email", autocomplete: "email",
      required: true, inputmode: "email", value: etat.email, placeholder: "prenom@organisme.fr",
    });
    const bouton = h("button", { class: "bouton", type: "submit" }, "Recevoir mon lien de connexion");

    const formulaire = h("form", { novalidate: true },
      h("label", { for: "champ-email" }, "Adresse email", champ),
      zone,
      bouton
    );

    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      const email = champ.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return signaler(zone, "erreur", "Saisissez une adresse email complète, par exemple prenom@organisme.fr.");
      }
      signaler(zone);
      occupe(bouton, true, "Envoi en cours…");
      const { error } = await demanderAcces(email);
      occupe(bouton, false);

      // Une adresse sans accès reçoit le même écran qu'une adresse autorisée :
      // on ne révèle pas quelles adresses ont un compte.
      const adresseInconnue = error && /signups not allowed|otp_disabled|user not found/i.test(`${error.code} ${error.message}`);
      if (error && !adresseInconnue) {
        return signaler(zone, "erreur", texteErreur(error));
      }
      etat.email = email;
      ecranCodeEmail();
    });

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Connexion"),
          h("h1", {}, "Vos apprenants jusqu'au bout"),
          h("p", { class: "chapo" }, "Saisissez votre adresse email\u00a0: vous recevrez un email pour vous connecter. Aucun mot de passe à retenir.")
        ),
        infoPrealable ? message("info", infoPrealable) : null,
        h("div", { class: "carte" }, formulaire)
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Écran 2 : code reçu par email
  // ---------------------------------------------------------------------------

  function ecranCodeEmail() {
    const zone = h("div");
    const champ = h("input", {
      id: "champ-code-email", class: "code", type: "text", name: "code",
      autocomplete: "one-time-code", inputmode: "numeric", maxlength: "6", required: true,
    });
    chiffresSeulement(champ);
    const bouton = h("button", { class: "bouton", type: "submit" }, "Me connecter");
    const renvoyer = h("button", { class: "bouton-lien", type: "button" }, "Renvoyer l'email");
    const changer = h("button", { class: "bouton-lien", type: "button", onclick: () => ecranEmail() }, "Changer d'adresse");

    // Délai d'une minute avant de pouvoir redemander un code.
    let restant = 60;
    renvoyer.disabled = true;
    const minuteur = setInterval(() => {
      restant -= 1;
      renvoyer.textContent = restant > 0 ? `Renvoyer l'email (${restant} s)` : "Renvoyer l'email";
      if (restant <= 0) { renvoyer.disabled = false; clearInterval(minuteur); }
    }, 1000);

    renvoyer.addEventListener("click", async () => {
      renvoyer.disabled = true;
      const { error } = await demanderAcces(etat.email);
      if (error && !/signups not allowed|otp_disabled/i.test(`${error.code} ${error.message}`)) {
        renvoyer.disabled = false;
        return signaler(zone, "erreur", texteErreur(error));
      }
      clearInterval(minuteur);
      ecranCodeEmail();
    });

    const formulaire = h("form", { novalidate: true },
      h("label", { for: "champ-code-email" }, "Code reçu par email", h("span", { class: "aide" }, "Les 6 chiffres de l'email. C'est le plus sûr sur téléphone."), champ),
      zone,
      bouton,
      h("div", { class: "actions-secondaires" }, renvoyer, changer)
    );

    // Secours sur téléphone : le lien s'ouvre parfois dans un autre navigateur.
    const zoneLien = h("div");
    const champLien = h("input", { id: "champ-lien-email", type: "text", inputmode: "url", autocomplete: "off", placeholder: "https://…supabase.co/auth/v1/verify…" });
    const formulaireLien = h("form", { novalidate: true },
      h("label", { for: "champ-lien-email" }, "Le lien s'ouvre dans un autre navigateur\u00a0?",
        h("span", { class: "aide" }, "Dans l'email, appui long sur le lien, « Copier l'adresse du lien », puis collez-le ici."),
        champLien),
      zoneLien,
      h("button", { class: "bouton bouton-secondaire", type: "submit" }, "Ouvrir le lien ici")
    );
    formulaireLien.addEventListener("submit", (evenement) => {
      evenement.preventDefault();
      let url;
      try { url = new URL(champLien.value.trim()); } catch { url = null; }
      const attendu = new URL(config.supabaseUrl);
      if (!url || url.origin !== attendu.origin || !url.pathname.startsWith("/auth/v1/verify")) {
        return signaler(zoneLien, "erreur", "Ce n'est pas le lien de connexion de l'email. Copiez le lien du bouton de connexion, en entier.");
      }
      clearInterval(minuteur);
      window.location.href = url.href;
    });

    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      if (!codeValide(champ.value)) {
        return signaler(zone, "erreur", "Le code contient exactement 6 chiffres.");
      }
      signaler(zone);
      occupe(bouton, true, "Vérification…");
      const { error } = await sb.auth.verifyOtp({ email: etat.email, token: champ.value, type: "email" });
      occupe(bouton, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
      clearInterval(minuteur);
      aiguiller();
    });

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Connexion · étape 2 sur 2"),
          h("h1", {}, "Ouvrez votre boîte mail"),
          h("p", { class: "chapo" },
            `Si l'adresse ${etat.email} a un accès, un email de connexion vient de lui être envoyé. Saisissez le code à 6 chiffres qu'il contient, ou cliquez sur son bouton. Valable une heure, pour une seule connexion. Pensez à regarder dans les courriers indésirables.`)
        ),
        h("div", { class: "carte" }, formulaire),
        h("div", { class: "carte" }, formulaireLien)
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Écran 3a : première connexion de l'administratrice — inscrire le téléphone
  // ---------------------------------------------------------------------------

  async function ecranInscriptionApplication(facteurs) {
    afficher(h("p", { class: "chargement" }, "Préparation de la double authentification…"));

    // Supprime une inscription commencée mais jamais terminée.
    for (const f of facteurs?.all || []) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        await sb.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Téléphone",
      issuer: "Fil Rouge Apprenants",
    });
    if (error) return afficher(message("erreur", texteErreur(error)));

    const zone = h("div");
    const champ = h("input", {
      id: "champ-code-mfa-inscription", class: "code", type: "text",
      autocomplete: "one-time-code", inputmode: "numeric", maxlength: "6", required: true,
    });
    chiffresSeulement(champ);
    const bouton = h("button", { class: "bouton", type: "submit" }, "Activer la double authentification");

    const formulaire = h("form", { novalidate: true },
      h("ol", { class: "etapes-mfa" },
        h("li", {}, "Installez sur votre téléphone une application d'authentification : Google Authenticator, Microsoft Authenticator ou une équivalente."),
        h("li", {}, "Dans l'application, ajoutez un compte en scannant ce QR code."),
        h("li", {}, "Saisissez le code à 6 chiffres affiché par l'application.")
      ),
      h("img", { class: "qr", src: data.totp.qr_code, alt: "QR code à scanner avec l'application d'authentification", width: "176", height: "176" }),
      h("p", { class: "aide" }, "Impossible de scanner ? Saisissez cette clé dans l'application :"),
      h("p", { class: "secret" }, data.totp.secret),
      h("label", { for: "champ-code-mfa-inscription" }, "Code affiché par l'application", champ),
      zone,
      bouton
    );

    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      if (!codeValide(champ.value)) return signaler(zone, "erreur", "Le code contient exactement 6 chiffres.");
      signaler(zone);
      occupe(bouton, true, "Vérification…");
      const { error: erreurVerif } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: champ.value });
      occupe(bouton, false);
      if (erreurVerif) return signaler(zone, "erreur", "Ce code ne correspond pas. Attendez que l'application affiche un nouveau code, puis réessayez.");
      aiguiller();
    });

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Sécurité du compte administratrice"),
          h("h1", {}, "Activez la double authentification"),
          h("p", { class: "chapo" }, "Votre compte voit les apprenants de tous vos clients. Un second code, généré par votre téléphone, sera demandé à chaque connexion. Cette étape ne se fait qu'une fois.")
        ),
        h("div", { class: "carte" }, formulaire)
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Écran 3b : connexions suivantes de l'administratrice — code de l'application
  // ---------------------------------------------------------------------------

  function ecranCodeApplication(factorId) {
    const zone = h("div");
    const champ = h("input", {
      id: "champ-code-mfa", class: "code", type: "text",
      autocomplete: "one-time-code", inputmode: "numeric", maxlength: "6", required: true,
    });
    chiffresSeulement(champ);
    const bouton = h("button", { class: "bouton", type: "submit" }, "Valider");

    const formulaire = h("form", { novalidate: true },
      h("label", { for: "champ-code-mfa" }, "Code de l'application d'authentification",
        h("span", { class: "aide" }, "Ouvrez l'application sur votre téléphone, ligne « Fil Rouge Apprenants »."),
        champ),
      zone,
      bouton
    );

    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      if (!codeValide(champ.value)) return signaler(zone, "erreur", "Le code contient exactement 6 chiffres.");
      signaler(zone);
      occupe(bouton, true, "Vérification…");
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: champ.value });
      occupe(bouton, false);
      if (error) return signaler(zone, "erreur", "Ce code ne correspond pas. Attendez le code suivant de l'application, puis réessayez.");
      aiguiller();
    });

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Double authentification"),
          h("h1", {}, "Un dernier code"),
          h("p", { class: "chapo" }, "Pour protéger les données de vos clients, confirmez votre connexion avec votre téléphone.")
        ),
        h("div", { class: "carte" }, formulaire)
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Écran : compte sans accès
  // ---------------------------------------------------------------------------

  function ecranSansAcces(email) {
    zoneCompte.hidden = false;
    compteLibelle.textContent = email || "";
    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Accès"),
          h("h1", {}, "Votre accès n'est pas encore ouvert"),
          h("p", { class: "chapo" }, "Votre compte existe, mais aucun espace ne lui est encore attribué, ou cet accès a été fermé. Contactez Fil Rouge Apprenants pour l'ouvrir.")
        )
      )
    );
  }

  function ecranAccesTermine(profil, cas) {
    zoneCompte.hidden = false;
    compteLibelle.textContent = profil.nom_affiche || profil.email || "";
    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Accès"),
          h("h1", {}, cas === "fin" ? "Votre accès a pris fin" : "Votre accès n'est pas encore ouvert"),
          h("p", { class: "chapo" }, cas === "fin"
            ? `Votre accès à l'espace de suivi était ouvert jusqu'au ${dateLisible(profil.acces_fin)}. Vos données sont conservées : pour le prolonger, contactez Fil Rouge Apprenants.`
            : `Votre accès à l'espace de suivi s'ouvrira le ${dateLisible(profil.acces_debut)}.`),
          cas === "fin"
            ? h("p", {}, h("a", { class: "bouton", href: `mailto:contact.filrouge.apprenant@gmail.com?subject=${encodeURIComponent("Prolonger mon accès Fil Rouge Apprenants")}` }, "Écrire à Fil Rouge Apprenants"))
            : null)));
  }

  // ---------------------------------------------------------------------------
  // Accueils selon le rôle
  // ---------------------------------------------------------------------------

  function compterAlertes(lignes) {
    const total = { vert: 0, orange: 0, rouge: 0 };
    for (const l of lignes) total[l.alerte] = (total[l.alerte] || 0) + 1;
    return total;
  }

  function blocCompteurs(total, suivis) {
    return h("div", { class: "compteurs" },
      h("div", { class: "compteur" },
        h("span", { class: "compteur-valeur" }, suivis),
        h("span", { class: "compteur-libelle" }, "apprenants suivis")),
      h("div", { class: "compteur compteur-vert" },
        h("span", { class: "compteur-valeur" }, total.vert),
        h("span", { class: "compteur-libelle" }, "à jour")),
      h("div", { class: "compteur compteur-orange" },
        h("span", { class: "compteur-valeur" }, total.orange),
        h("span", { class: "compteur-libelle" }, "à surveiller")),
      h("div", { class: "compteur compteur-rouge" },
        h("span", { class: "compteur-valeur" }, total.rouge),
        h("span", { class: "compteur-libelle" }, "en alerte"))
    );
  }

  function pastille(couleur, texte) {
    return h("span", { class: `pastille pastille-${couleur}` }, texte);
  }

  // --- Impayés : montant en retard de paiement, par organisme ---
  // Map organisme_id → total en retard. Vide (sans erreur) si la comptabilité
  // n'est pas encore activée dans la base.
  async function chargerImpayes(organismeId) {
    let requete = sb.from("vue_echeances").select("organisme_id, montant").eq("statut", "en_retard");
    if (organismeId) requete = requete.eq("organisme_id", organismeId);
    const { data, error } = await requete;
    const parOrganisme = new Map();
    if (error || !data) return parOrganisme;
    for (const e of data) parOrganisme.set(e.organisme_id, (parOrganisme.get(e.organisme_id) || 0) + Number(e.montant));
    return parOrganisme;
  }

  // Étiquette rouge « IMPAYÉ » avec la somme en dessous, à côté d'un nom.
  function badgeImpaye(montant, taille) {
    if (!montant) return null;
    return h("span", { class: `badge-impaye${taille === "grand" ? " badge-impaye-grand" : ""}`, title: "Échéance en retard de paiement" },
      h("span", { class: "badge-impaye-mot" }, "Impayé"),
      h("span", { class: "badge-impaye-montant" }, euros(montant)));
  }

  // Un nom suivi de son étiquette d'impayé (s'il y en a un).
  function nomAvecImpaye(nom, montant, taille) {
    return montant ? h("span", { class: "nom-impaye" }, nom, badgeImpaye(montant, taille)) : nom;
  }

  // --- Action de formation (entrée officielle / sortie) ---
  function texteFormation(a) {
    const e = a.date_entree_formation, s = a.date_sortie_formation;
    if (e && s) return `formation du ${dateLisible(e)} au ${dateLisible(s)}`;
    if (e) return `en formation depuis le ${dateLisible(e)}`;
    if (s) return `sortie de formation le ${dateLisible(s)}`;
    return null;
  }
  // Pastille d'alerte : sortie dépassée ou toute proche (apprenant encore « En formation »).
  function pastilleSortie(a) {
    if (!a.date_sortie_formation || (a.statut && a.statut !== "actif")) return null;
    const reste = -joursDepuis(a.date_sortie_formation);
    if (reste < 0) return pastille("rouge", `sortie dépassée de ${-reste} j`);
    if (reste <= 15) return pastille("orange", reste === 0 ? "sort aujourd'hui" : `sort dans ${reste} j`);
    return null;
  }
  // --- Compteurs de contacts ---
  function texteContacts(c) {
    const t = Number(c?.tentatives || 0), ab = Number(c?.aboutis || 0);
    return `${pluriel(t, "tentative", "tentatives")} · ${pluriel(ab, "contact abouti", "contacts aboutis")}`;
  }

  function libelleAlerte(alerte) {
    return { vert: "à jour", orange: "à surveiller", rouge: "en alerte" }[alerte] || alerte;
  }

  function listeApprenants(lignes) {
    if (!lignes.length) {
      return message("info", "Aucun apprenant actif pour le moment.");
    }
    return h("ul", { class: "liste" },
      lignes.map((a) =>
        h("li", { class: "ligne" },
          h("span", { class: "ligne-titre" }, lienApprenant(a)),
          h("span", { class: "pastilles" },
            pastille(a.alerte, `${a.jours_sans_contact} j · ${libelleAlerte(a.alerte)}`), pastilleSortie(a)),
          h("span", { class: "ligne-detail" },
            [a.parcours, texteFormation(a), texteContacts(a)].filter(Boolean).join(" · "), lienTelephone(a.telephone))
        )
      )
    );
  }

  const ordreAlerte = { rouge: 0, orange: 1, vert: 2 };
  function trierParUrgence(lignes) {
    return lignes.slice().sort((a, b) =>
      (ordreAlerte[a.alerte] - ordreAlerte[b.alerte]) || (b.jours_sans_contact - a.jours_sans_contact));
  }

  // ===========================================================================
  // ESPACE ADMINISTRATRICE
  // ===========================================================================
  // Adresses internes (après le #) :
  //   #/                  tableau de bord
  //   #/prospection       CRM : liste des organismes, filtrable par étape
  //   #/prospection/client  (ou toute autre étape) : liste filtrée
  //   #/nouveau           formulaire d'ajout d'un organisme
  //   #/organisme/<id>    fiche d'un organisme : suivi commercial et échanges
  // ===========================================================================

  const ETAPES = ["prospect", "contacte", "test_gratuit", "client", "perdu"];
  const LIBELLE_ETAPE_UNE = {
    prospect: "Prospect", contacte: "Contacté", test_gratuit: "Test gratuit", client: "Client", perdu: "Perdu",
  };
  const COULEUR_ETAPE = {
    prospect: "neutre", contacte: "orange", test_gratuit: "orange", client: "vert", perdu: "neutre",
  };
  const CANAUX = { email: "Email", telephone: "Téléphone", whatsapp: "WhatsApp", sms: "SMS", linkedin: "LinkedIn", visio: "Visio", autre: "Autre" };

  // Enregistre un échange commercial. Si la base ne connaît pas encore le canal
  // (WhatsApp, SMS avant leur ajout), l'échange est rangé dans « Autre » avec
  // le nom du canal en tête : rien n'est perdu.
  async function insererEchange(ligne) {
    const r = await sb.from("echanges_commerciaux").insert(ligne);
    if (r.error && /canal_echange/.test(r.error.message || "") && ligne.canal !== "autre") {
      return sb.from("echanges_commerciaux").insert({ ...ligne, canal: "autre", resume: `${CANAUX[ligne.canal] || ligne.canal} : ${ligne.resume}` });
    }
    return r;
  }
  const FORMULES = { "": "—", "30": "Jusqu'à 30 apprenants (590 €/mois)", "80": "Jusqu'à 80 apprenants (990 €/mois)", "150": "Jusqu'à 150 apprenants (1 490 €/mois)", sur_devis: "Sur devis" };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Date du jour à l'heure de Paris, au format AAAA-MM-JJ.
  function aujourdhui() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  }
  function ajouterJours(dateIso, n) {
    const d = new Date(`${dateIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dateLisible(dateIso) {
    if (!dateIso) return "";
    return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  // « aujourd'hui », « demain », « il y a 3 j », « dans 5 j »
  function ecartJours(dateIso) {
    const n = Math.round((new Date(`${dateIso}T12:00:00Z`) - new Date(`${aujourdhui()}T12:00:00Z`)) / 86400000);
    if (n === 0) return "aujourd'hui";
    if (n === 1) return "demain";
    if (n === -1) return "hier";
    return n < 0 ? `en retard de ${-n} j` : `dans ${n} j`;
  }

  function lireRoute() {
    const brut = window.location.hash.replace(/^#\/?/, "");
    // Les jetons de connexion passent aussi par le # : on les ignore.
    if (/access_token=|error=|type=/.test(brut)) return { nom: "accueil" };
    const morceaux = brut.split("/").filter(Boolean);
    if (morceaux[0] === "prospection") return { nom: "prospection", etape: ETAPES.includes(morceaux[1]) ? morceaux[1] : null };
    if (morceaux[0] === "nouveau") return { nom: "nouveau" };
    if (morceaux[0] === "organisme" && UUID.test(morceaux[1] || "")) return { nom: "organisme", id: morceaux[1], onglet: morceaux[2] || null };
    if (morceaux[0] === "rappels") return { nom: "rappels", id: UUID.test(morceaux[1] || "") ? morceaux[1] : null };
    if (morceaux[0] === "import") return { nom: "import", id: UUID.test(morceaux[1] || "") ? morceaux[1] : null };
    if (morceaux[0] === "examens") return { nom: "examens", id: UUID.test(morceaux[1] || "") ? morceaux[1] : null };
    if (morceaux[0] === "acces") return { nom: "acces", id: UUID.test(morceaux[1] || "") ? morceaux[1] : null };
    if (morceaux[0] === "apprenant" && UUID.test(morceaux[1] || "")) return { nom: "apprenant", id: morceaux[1], onglet: morceaux[2] || null, partie: morceaux[3] || null };
    if (morceaux[0] === "preuves") return { nom: "preuves", id: UUID.test(morceaux[1] || "") ? morceaux[1] : null };
    if (morceaux[0] === "eleves" && UUID.test(morceaux[1] || "")) return { nom: "eleves", id: morceaux[1] };
    if (morceaux[0] === "impayes") return { nom: "impayes" };
    if (morceaux[0] === "satisfaction") return { nom: "satisfaction", id: UUID.test(morceaux[1] || "") ? morceaux[1] : null };
    if (morceaux[0] === "coaching") return { nom: "coaching", type: morceaux[1] || "stage", id: UUID.test(morceaux[2] || "") ? morceaux[2] : null };
    return { nom: "accueil" };
  }

  function aller(chemin) {
    if (window.location.hash === `#/${chemin}`) routeAdmin();
    else window.location.hash = `#/${chemin}`;
  }

  function lienInterne(chemin, ...enfants) {
    return h("a", { href: `#/${chemin}`, class: "lien-interne" }, ...enfants);
  }

  // Les onglets du haut sont remplacés par le menu latéral (étape 9) :
  // cette fonction reste pour les écrans existants et ne dessine plus rien.
  function navigationAdmin() {
    return null;
  }

  function routeAdmin() {
    if (!etat.profil || etat.profil.role !== "admin") return aiguiller();
    const route = lireRoute();
    etat.dossierActif = null;
    chargerMenu();
    if (route.nom === "eleves") return ecranDossierEleves(route.id);
    if (route.nom === "coaching") return ecranCoaching(route.type, route.id);
    if (route.nom === "satisfaction") return ecranSatisfaction(route.id);
    if (route.nom === "impayes") return ecranImpayes();
    if (route.nom === "prospection") return ecranProspection(route.etape);
    if (route.nom === "nouveau") return ecranNouvelOrganisme();
    if (route.nom === "organisme") return ecranOrganisme(route.id);
    if (route.nom === "rappels") return ecranRappels(route.id);
    if (route.nom === "import") return ecranImport(route.id);
    if (route.nom === "examens") return ecranExamens(route.id);
    if (route.nom === "apprenant") return ecranApprenant(route.id);
    if (route.nom === "acces") return ecranAcces(null, route.id);
    if (route.nom === "preuves") return route.id ? ecranPreuves(route.id) : ecranExamens(null);
    return accueilAdmin(etat.profil);
  }

  // Espace client : son accueil, et son dossier de preuves (#/preuves).
  function routeClient() {
    if (!etat.profil || etat.profil.role !== "client") return aiguiller();
    const route = lireRoute();
    if (route.nom === "preuves" && clientPeut("voir_preuves")) return ecranPreuves(etat.profil.organisme_id);
    if (route.nom === "apprenant") return ecranApprenant(route.id);
    return accueilClient(etat.profil);
  }

  // Espace appelante : ses apprenants confiés, et leur fiche.
  function routeAppelante() {
    if (!etat.profil || etat.profil.role !== "appelante") return aiguiller();
    const route = lireRoute();
    if (route.nom === "apprenant") return ecranApprenant(route.id);
    return accueilAppelante(etat.profil);
  }

  window.addEventListener("hashchange", () => {
    if (etat.profil && etat.profil.role === "admin") routeAdmin();
    else if (etat.profil && etat.profil.role === "client") routeClient();
    else if (etat.profil && etat.profil.role === "appelante") routeAppelante();
  });

  // ---------------------------------------------------------------------------
  // Tableau de bord
  // ---------------------------------------------------------------------------

  async function accueilAdmin(profil) {
    afficher(navigationAdmin("accueil"), h("p", { class: "chargement" }, "Chargement du tableau de bord…"));

    const [apprenants, suivi, relancesExamen, impayes] = await Promise.all([
      sb.from("vue_qui_rappeler").select("organisme_id, organisme_nom, alerte"),
      sb.from("organismes_suivi_commercial").select("organisme_id, etape, prochaine_relance"),
      sb.from("vue_relances_examen").select("id").not("etape_relance", "is", null).eq("relance_faite", false),
      chargerImpayes(),
    ]);
    const totalImpayes = [...impayes.values()].reduce((t, m) => t + m, 0);
    if (apprenants.error || suivi.error || relancesExamen.error) {
      return afficher(navigationAdmin("accueil"), message("erreur", texteErreur(apprenants.error || suivi.error || relancesExamen.error)));
    }
    const nbRelancesExamen = relancesExamen.data.length;

    const parOrganisme = new Map();
    for (const l of apprenants.data) {
      if (!parOrganisme.has(l.organisme_id)) parOrganisme.set(l.organisme_id, { id: l.organisme_id, nom: l.organisme_nom, lignes: [] });
      parOrganisme.get(l.organisme_id).lignes.push(l);
    }

    const etapes = {};
    for (const s of suivi.data) etapes[s.etape] = (etapes[s.etape] || 0) + 1;
    const ajd = aujourdhui();
    const aRelancer = suivi.data.filter((s) => s.prochaine_relance && s.prochaine_relance <= ajd && s.etape !== "perdu").length;

    const prenom = (profil.nom_affiche || "").split(" ")[0];

    afficher(
      navigationAdmin("accueil"),
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Tableau de bord"),
          h("h1", {}, prenom ? `Bonjour ${prenom}` : "Bonjour"),
          h("p", { class: "chapo" }, "Vue d'ensemble de vos clients et de votre prospection.")
        ),
        h("p", { class: "bandeau-demo" }, "Construction en cours : les apprenants affichés sont fictifs."),

        totalImpayes
          ? h("p", { class: "message message-impaye" },
              h("strong", {}, `Impayés : ${euros(totalImpayes)}`),
              ` chez ${pluriel(impayes.size, "client", "clients")}. `,
              lienInterne("impayes", "Voir les impayés"))
          : null,

        aRelancer
          ? h("p", { class: "message message-action" },
              h("strong", {}, pluriel(aRelancer, "organisme à relancer", "organismes à relancer")),
              " aujourd'hui ou en retard. ",
              lienInterne("prospection", "Voir la liste"))
          : null,

        nbRelancesExamen
          ? h("p", { class: "message message-action" },
              h("strong", {}, pluriel(nbRelancesExamen, "relance d'examen", "relances d'examen")),
              " à faire (J-30, J-7 ou J-1). ",
              lienInterne("examens", "Voir les examens"))
          : null,

        blocCompteurs(compterAlertes(apprenants.data), apprenants.data.length),
        h("p", { class: "lien-suite" }, lienInterne("rappels", "Voir qui rappeler en premier →")),

        h("section", {},
          h("div", { class: "section-titre" },
            h("h2", {}, "Par client"),
            h("p", {}, pluriel(parOrganisme.size, "organisme", "organismes"))),
          parOrganisme.size
            ? h("ul", { class: "liste" },
                [...parOrganisme.values()].map((o) => {
                  const t = compterAlertes(o.lignes);
                  return h("li", { class: "ligne" },
                    h("span", { class: "ligne-titre" }, nomAvecImpaye(lienInterne(impayes.get(o.id) ? `organisme/${o.id}/compta` : `organisme/${o.id}`, o.nom), impayes.get(o.id))),
                    h("span", { class: "pastilles" },
                      t.rouge ? pastille("rouge", `${t.rouge} en alerte`) : null,
                      t.orange ? pastille("orange", `${t.orange} à surveiller`) : null,
                      pastille("vert", `${t.vert} à jour`)),
                    h("span", { class: "ligne-detail" }, pluriel(o.lignes.length, "apprenant actif", "apprenants actifs"), " · ", lienInterne(`rappels/${o.id}`, "qui rappeler")));
                }))
            : message("info", "Aucun client avec des apprenants pour le moment. Importez un premier fichier depuis la fiche d'un organisme.")
        ),

        h("section", {},
          h("div", { class: "section-titre" },
            h("h2", {}, "Prospection"),
            h("p", {}, lienInterne("prospection", "Ouvrir le CRM"))),
          h("ul", { class: "liste" },
            ETAPES.map((etape) =>
              h("li", { class: "ligne" },
                h("span", { class: "ligne-titre" }, lienInterne(`prospection/${etape}`, LIBELLES_ETAPE[etape])),
                h("span", { class: "pastilles" }, pastille("neutre", String(etapes[etape] || 0))))))
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // CRM : liste des organismes
  // ---------------------------------------------------------------------------

  async function ecranProspection(filtre) {
    afficher(navigationAdmin("prospection"), h("p", { class: "chargement" }, "Chargement de la prospection…"));

    const { data, error } = await sb
      .from("organismes")
      .select("id, nom, organismes_suivi_commercial ( etape, contact_nom, contact_fonction, prochaine_relance )")
      .order("nom");
    const impayes = await chargerImpayes();
    if (error) return afficher(navigationAdmin("prospection"), message("erreur", texteErreur(error)));

    const lignes = data.map((o) => ({ id: o.id, nom: o.nom, ...(o.organismes_suivi_commercial || { etape: "prospect" }) }));
    const ajd = aujourdhui();
    const compte = {};
    for (const l of lignes) compte[l.etape] = (compte[l.etape] || 0) + 1;

    const aRelancer = lignes
      .filter((l) => l.prochaine_relance && l.prochaine_relance <= ajd && l.etape !== "perdu")
      .sort((a, b) => a.prochaine_relance.localeCompare(b.prochaine_relance));

    const visibles = lignes
      .filter((l) => !filtre || l.etape === filtre)
      .sort((a, b) => (a.prochaine_relance || "9999").localeCompare(b.prochaine_relance || "9999") || a.nom.localeCompare(b.nom, "fr"));

    const filtreBouton = (cle, texte, n) =>
      h("a", { href: cle ? `#/prospection/${cle}` : "#/prospection", class: "filtre", "aria-current": (filtre || null) === cle ? "true" : null },
        texte, h("span", { class: "filtre-nombre" }, String(n)));

    const ligneOrganisme = (l) => {
      const enRetard = l.prochaine_relance && l.prochaine_relance <= ajd && l.etape !== "perdu";
      return h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, nomAvecImpaye(lienInterne(`organisme/${l.id}`, l.nom), impayes.get(l.id))),
        h("span", { class: "pastilles" }, pastille(COULEUR_ETAPE[l.etape], LIBELLE_ETAPE_UNE[l.etape])),
        h("span", { class: "ligne-detail" },
          [l.contact_nom, l.contact_fonction].filter(Boolean).join(" · ") || "Contact à identifier",
          l.prochaine_relance
            ? h("span", { class: enRetard ? "relance relance-retard" : "relance" }, ` · Relance ${ecartJours(l.prochaine_relance)}`)
            : null));
    };

    afficher(
      navigationAdmin("prospection"),
      h("div", { class: "pile" },
        h("div", { class: "entete-action" },
          h("div", {},
            h("p", { class: "surtitre" }, "Prospection"),
            h("h1", {}, "Vos organismes")),
          h("a", { href: "#/nouveau", class: "bouton bouton-petit" }, "+ Ajouter")),

        aRelancer.length
          ? h("section", {},
              h("div", { class: "section-titre" },
                h("h2", {}, "À relancer"),
                h("p", {}, "aujourd'hui ou en retard")),
              h("ul", { class: "liste" }, aRelancer.map(ligneOrganisme)))
          : message("info", "Aucune relance prévue aujourd'hui."),

        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Tous les organismes")),
          h("div", { class: "filtres" },
            filtreBouton(null, "Tous", lignes.length),
            ETAPES.map((e) => filtreBouton(e, LIBELLES_ETAPE[e], compte[e] || 0))),
          visibles.length
            ? h("ul", { class: "liste" }, visibles.map(ligneOrganisme))
            : message("info", filtre ? "Aucun organisme à cette étape." : "Aucun organisme pour le moment. Ajoutez votre premier prospect."))
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Champs de formulaire réutilisables
  // ---------------------------------------------------------------------------

  function champTexte(id, libelle, valeur, options = {}) {
    const champ = h(options.multiligne ? "textarea" : "input", {
      id, name: id, type: options.multiligne ? null : (options.type || "text"),
      rows: options.multiligne ? "4" : null,
      required: options.obligatoire || null, autocomplete: options.autocomplete || "off",
      inputmode: options.inputmode || null, placeholder: options.placeholder || null,
    });
    champ.value = valeur || "";
    return {
      champ,
      bloc: h("label", { for: id }, libelle,
        options.aide ? h("span", { class: "aide" }, options.aide) : null, champ),
    };
  }

  function champChoix(id, libelle, choix, valeur) {
    const champ = h("select", { id, name: id },
      Object.entries(choix).map(([cle, texte]) => h("option", { value: cle }, texte)));
    champ.value = valeur ?? Object.keys(choix)[0];
    return { champ, bloc: h("label", { for: id }, libelle, champ) };
  }

  const CHOIX_ETAPES = Object.fromEntries(ETAPES.map((e) => [e, LIBELLE_ETAPE_UNE[e]]));

  // ---------------------------------------------------------------------------
  // CRM : ajouter un organisme
  // ---------------------------------------------------------------------------

  function ecranNouvelOrganisme() {
    const zone = h("div");
    const nom = champTexte("org-nom", "Nom de l'organisme", "", { obligatoire: true, placeholder: "Ex. : EFC Formation" });
    const etape = champChoix("org-etape", "Étape", CHOIX_ETAPES, "prospect");
    const contact = champTexte("org-contact", "Contact", "", { placeholder: "Prénom Nom" });
    const fonction = champTexte("org-fonction", "Fonction", "", { placeholder: "Ex. : Directrice pédagogique" });
    const email = champTexte("org-email", "Email", "", { type: "email", inputmode: "email" });
    const tel = champTexte("org-tel", "Téléphone", "", { type: "tel", inputmode: "tel" });
    const relance = champTexte("org-relance", "Prochaine relance", "", { type: "date" });
    const notes = champTexte("org-notes", "Notes", "", { multiligne: true });
    const bouton = h("button", { class: "bouton", type: "submit" }, "Enregistrer l'organisme");

    const formulaire = h("form", { novalidate: true, class: "formulaire" },
      nom.bloc, etape.bloc,
      h("div", { class: "deux-colonnes" }, contact.bloc, fonction.bloc),
      h("div", { class: "deux-colonnes" }, email.bloc, tel.bloc),
      relance.bloc, notes.bloc, zone, bouton);

    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      if (!nom.champ.value.trim()) return signaler(zone, "erreur", "Indiquez le nom de l'organisme.");
      signaler(zone);
      occupe(bouton, true, "Enregistrement…");
      const { data, error } = await sb.rpc("creer_organisme", {
        p_nom: nom.champ.value,
        p_etape: etape.champ.value,
        p_contact_nom: contact.champ.value,
        p_contact_fonction: fonction.champ.value,
        p_contact_email: email.champ.value,
        p_contact_telephone: tel.champ.value,
        p_prochaine_relance: relance.champ.value || null,
        p_notes: notes.champ.value,
      });
      occupe(bouton, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
      aller(`organisme/${data}`);
    });

    afficher(
      navigationAdmin("prospection"),
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, lienInterne("prospection", "← Prospection")),
          h("h1", {}, "Ajouter un organisme")),
        h("div", { class: "carte carte-large" }, formulaire))
    );
  }

  // ---------------------------------------------------------------------------
  // CRM : fiche d'un organisme
  // ---------------------------------------------------------------------------

  async function ecranOrganisme(id) {
    afficher(navigationAdmin("prospection"), h("p", { class: "chargement" }, "Chargement de la fiche…"));

    const [org, echanges, nbApprenants, apprenantsOrg, acces, impayesOrg] = await Promise.all([
      sb.from("organismes").select("id, nom, organismes_suivi_commercial ( * )").eq("id", id).maybeSingle(),
      sb.from("echanges_commerciaux").select("id, date_echange, canal, resume, cree_le").eq("organisme_id", id)
        .order("date_echange", { ascending: false }).order("cree_le", { ascending: false }),
      sb.from("apprenants").select("id", { count: "exact", head: true }).eq("organisme_id", id),
      sb.from("apprenants").select("statut").eq("organisme_id", id),
      sb.rpc("acces_organisme", { p_organisme: id }),
      chargerImpayes(id),
    ]);
    const montantImpaye = impayesOrg.get(id) || 0;
    const erreur = org.error || echanges.error || nbApprenants.error || apprenantsOrg.error || acces.error;
    if (erreur) return afficher(navigationAdmin("prospection"), message("erreur", texteErreur(erreur)));
    if (!org.data) return afficher(navigationAdmin("prospection"), message("info", "Cet organisme n'existe plus."), lienInterne("prospection", "← Retour à la prospection"));

    const s = org.data.organismes_suivi_commercial || {};
    const apprenantsCount = nbApprenants.count || 0;

    // --- Bloc « Suivi commercial » ---
    const zone = h("div");
    const nom = champTexte("fiche-nom", "Nom de l'organisme", org.data.nom, { obligatoire: true });
    const etape = champChoix("fiche-etape", "Étape", CHOIX_ETAPES, s.etape || "prospect");
    const contact = champTexte("fiche-contact", "Contact", s.contact_nom);
    const fonction = champTexte("fiche-fonction", "Fonction", s.contact_fonction);
    const email = champTexte("fiche-email", "Email", s.contact_email, { type: "email", inputmode: "email" });
    const tel = champTexte("fiche-tel", "Téléphone", s.contact_telephone, { type: "tel", inputmode: "tel" });
    const relance = champTexte("fiche-relance", "Prochaine relance", s.prochaine_relance, { type: "date" });
    const formule = champChoix("fiche-formule", "Formule", FORMULES, s.formule || "");
    const debut = champTexte("fiche-debut", "Début du contrat", s.date_debut_contrat, { type: "date" });
    const notes = champTexte("fiche-notes", "Notes", s.notes, { multiligne: true });
    const bouton = h("button", { class: "bouton", type: "submit" }, "Enregistrer");

    const raccourcis = h("div", { class: "raccourcis" },
      h("span", { class: "aide" }, "Relancer :"),
      [["Demain", 1], ["Dans 7 j", 7], ["Dans 15 j", 15], ["Dans 1 mois", 30]].map(([texte, n]) =>
        h("button", { type: "button", class: "puce", onclick: () => { relance.champ.value = ajouterJours(aujourdhui(), n); } }, texte)),
      h("button", { type: "button", class: "puce", onclick: () => { relance.champ.value = ""; } }, "Aucune"));

    const blocContrat = h("div", { class: "deux-colonnes" }, formule.bloc, debut.bloc);
    const majContrat = () => { blocContrat.hidden = etape.champ.value !== "client"; };
    etape.champ.addEventListener("change", majContrat);
    majContrat();

    const formulaire = h("form", { novalidate: true, class: "formulaire" },
      nom.bloc, etape.bloc, blocContrat,
      h("div", { class: "deux-colonnes" }, contact.bloc, fonction.bloc),
      h("div", { class: "deux-colonnes" }, email.bloc, tel.bloc),
      relance.bloc, raccourcis, notes.bloc, zone, bouton);

    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      if (!nom.champ.value.trim()) return signaler(zone, "erreur", "Indiquez le nom de l'organisme.");
      signaler(zone);
      occupe(bouton, true, "Enregistrement…");
      const vide = (v) => (v && v.trim() ? v.trim() : null);
      const r1 = nom.champ.value.trim() !== org.data.nom
        ? await sb.from("organismes").update({ nom: nom.champ.value.trim() }).eq("id", id)
        : { error: null };
      const r2 = r1.error ? r1 : await sb.from("organismes_suivi_commercial").upsert({
        organisme_id: id,
        etape: etape.champ.value,
        contact_nom: vide(contact.champ.value),
        contact_fonction: vide(fonction.champ.value),
        contact_email: vide(email.champ.value),
        contact_telephone: vide(tel.champ.value),
        prochaine_relance: relance.champ.value || null,
        formule: etape.champ.value === "client" ? (formule.champ.value || null) : (s.formule || null),
        date_debut_contrat: etape.champ.value === "client" ? (debut.champ.value || null) : (s.date_debut_contrat || null),
        notes: vide(notes.champ.value),
      });
      occupe(bouton, false);
      if (r2.error) return signaler(zone, "erreur", texteErreur(r2.error));
      org.data.nom = nom.champ.value.trim();
      titre.textContent = org.data.nom;
      signaler(zone, "info", "Enregistré.");
    });

    // --- Bloc « Échanges » ---
    const zoneEchange = h("div");
    const dateEchange = champTexte("echange-date", "Date", aujourdhui(), { type: "date" });
    const canal = champChoix("echange-canal", "Canal", CANAUX, "email");
    const resume = champTexte("echange-resume", "Ce qui s'est passé", "", { multiligne: true, placeholder: "Ex. : Email n°1 envoyé. / Appel : intéressée, rappeler après les vacances." });
    const boutonEchange = h("button", { class: "bouton bouton-secondaire", type: "submit" }, "Ajouter à l'historique");
    const formulaireEchange = h("form", { novalidate: true, class: "formulaire" },
      h("div", { class: "deux-colonnes" }, dateEchange.bloc, canal.bloc),
      resume.bloc, zoneEchange, boutonEchange);

    formulaireEchange.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      if (!resume.champ.value.trim()) return signaler(zoneEchange, "erreur", "Décrivez l'échange en une phrase.");
      signaler(zoneEchange);
      occupe(boutonEchange, true, "Ajout…");
      const { error } = await insererEchange({
        organisme_id: id,
        date_echange: dateEchange.champ.value || aujourdhui(),
        canal: canal.champ.value,
        resume: resume.champ.value.trim(),
        auteur_id: etat.profil.id,
      });
      occupe(boutonEchange, false);
      if (error) return signaler(zoneEchange, "erreur", texteErreur(error));
      ecranOrganisme(id);
    });

    const historique = echanges.data.length
      ? h("ul", { class: "liste" }, echanges.data.map((e) =>
          h("li", { class: "ligne ligne-echange" },
            h("span", { class: "ligne-titre" }, dateLisible(e.date_echange)),
            h("span", { class: "pastilles" }, pastille("neutre", CANAUX[e.canal] || e.canal)),
            h("span", { class: "ligne-detail texte-libre" }, e.resume))))
      : message("info", "Aucun échange enregistré pour l'instant.");

    // --- Bloc « Supprimer » (prospects sans apprenants uniquement) ---
    let blocSuppression = null;
    if (apprenantsCount === 0) {
      const zoneSuppr = h("div");
      const confirmer = h("button", { type: "button", class: "bouton bouton-danger", hidden: true }, "Oui, supprimer définitivement");
      const annuler = h("button", { type: "button", class: "bouton-lien", hidden: true }, "Annuler");
      const demander = h("button", { type: "button", class: "bouton-lien bouton-lien-danger" }, "Supprimer cet organisme");
      demander.addEventListener("click", () => {
        demander.hidden = true; confirmer.hidden = false; annuler.hidden = false;
        signaler(zoneSuppr, "erreur", `Supprimer « ${org.data.nom} » et tout son historique ? Cette action est définitive.`);
      });
      annuler.addEventListener("click", () => {
        demander.hidden = false; confirmer.hidden = true; annuler.hidden = true; signaler(zoneSuppr);
      });
      confirmer.addEventListener("click", async () => {
        occupe(confirmer, true, "Suppression…");
        const { error } = await sb.rpc("supprimer_prospect", { p_organisme: id });
        occupe(confirmer, false);
        if (error) return signaler(zoneSuppr, "erreur", texteErreur(error));
        aller("prospection");
      });
      blocSuppression = h("section", { class: "zone-suppression" }, zoneSuppr, h("div", { class: "actions-secondaires" }, demander, confirmer, annuler));
    }

    const titre = h("h1", {}, org.data.nom);
    const titreFiche = montantImpaye ? h("div", { class: "nom-impaye" }, titre, badgeImpaye(montantImpaye, "grand")) : titre;
    const etapeCle = s.etape || "prospect";
    const estClient = etapeCle === "client";
    const retour = estClient ? lienInterne(`eleves/${id}`, "← Dossier élèves") : lienInterne("prospection", "← Prospection");
    const nbActifs = (apprenantsOrg.data || []).filter((x) => x.statut === "actif").length;
    const dernierEchange = echanges.data[0];
    const comptes = acces.data || [];
    const derniereConnexion = comptes.map((c) => c.derniere_connexion).filter(Boolean).sort().pop();

    // --- Encadré « Contrat » en face du nom (comme l'action de formation d'un élève) ---
    const encadreContrat = h("section", { class: "formation formation-compacte", "aria-label": estClient ? "Contrat" : "Relance" },
      h("p", { class: "surtitre" }, estClient ? "Contrat" : "Prochaine relance"),
      estClient
        ? h("div", { class: "formation-dates" },
            h("div", { class: "formation-date" }, h("span", { class: "compteur-libelle" }, "Formule"), h("span", { class: "formation-valeur" }, FORMULES[s.formule || ""] && s.formule ? FORMULES[s.formule] : "à renseigner")),
            h("div", { class: "formation-date formation-duree-bloc" }, h("span", { class: "compteur-libelle" }, "Début"), h("span", { class: "formation-valeur" }, s.date_debut_contrat ? dateLisible(s.date_debut_contrat) : "à renseigner")))
        : null,
      h("p", { class: "aide" }, s.prochaine_relance ? `Relance ${ecartJours(s.prochaine_relance)} · ${dateLisible(s.prochaine_relance)}` : "Aucune relance prévue"));

    // --- Contacter l'organisme ---
    const boite = (window.FIL_ROUGE_CONFIG || {}).emailFilRouge || "";
    const lienGmail = s.contact_email ? window.FilRougeContact.lienGmail(s.contact_email, `Fil Rouge Apprenants — ${org.data.nom}`, `Bonjour${s.contact_nom ? " " + s.contact_nom.split(" ")[0] : ""},\n\n\n\nBelle journée,\nÉmilie Rachas\nFil Rouge Apprenants`, boite) : null;
    const blocContacterOrg = h("section", {},
      h("div", { class: "section-titre" }, h("h2", {}, "Contacter")),
      h("div", { class: "carte carte-large pile-serree" },
        h("div", { class: "actions-ligne" },
          s.contact_telephone ? h("a", { class: "bouton", href: `tel:${s.contact_telephone.replace(/[^\d+]/g, "")}` }, `📞 Appeler · ${s.contact_telephone}`) : null,
          lienGmail ? h("a", { class: "bouton bouton-secondaire", href: lienGmail, target: "_blank", rel: "noopener" }, "📧 Email (Gmail Fil Rouge)") : null),
        !s.contact_telephone && !s.contact_email ? h("p", { class: "aide" }, "Pas de téléphone ni d'email : complète le contact dans l'onglet Suivi commercial.") : null,
        h("p", { class: "aide" }, "Après l'échange, note-le dans le bandeau « Échanges » à droite.")));

    // --- Onglet Fiche ---
    const panneauFiche = h("div", { class: "pile" },
      h("div", { class: "fiche-entete" },
        h("div", { class: "fiche-identite" },
          titreFiche,
          h("p", { class: "fiche-ecole" }, s.contact_nom ? [s.contact_nom, s.contact_fonction].filter(Boolean).join(" · ") : "Contact non renseigné"),
          h("p", { class: "chapo" }, pastille(COULEUR_ETAPE[etapeCle], LIBELLE_ETAPE_UNE[etapeCle]))),
        encadreContrat),
      h("div", { class: "compteurs" },
        h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, String(apprenantsCount)), h("span", { class: "compteur-libelle" }, `élèves suivis (${nbActifs} en formation)`)),
        h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, String(echanges.data.length)), h("span", { class: "compteur-libelle" }, "échanges")),
        h("div", { class: "compteur" }, h("span", { class: "compteur-valeur compteur-valeur-date" }, dernierEchange ? dateLisible(dernierEchange.date_echange) : "—"), h("span", { class: "compteur-libelle" }, "dernier échange")),
        h("div", { class: "compteur" }, h("span", { class: "compteur-valeur compteur-valeur-date" }, derniereConnexion ? dateLisible(derniereConnexion.slice(0, 10)) : "—"), h("span", { class: "compteur-libelle" }, "dernière connexion client"))),
      blocContacterOrg);

    // --- Onglet Élèves ---
    const panneauEleves = h("section", { class: "pile-serree" },
      h("div", { class: "section-titre" }, h("h2", {}, "Élèves"), h("p", {}, pluriel(apprenantsCount, "élève", "élèves"))),
      h("div", { class: "actions-ligne" },
        apprenantsCount ? h("a", { href: `#/eleves/${id}`, class: "bouton bouton-petit" }, "Dossier élèves") : null,
        h("a", { href: `#/import/${id}`, class: "bouton bouton-secondaire bouton-petit" }, "Importer un fichier"),
        apprenantsCount ? h("a", { href: `#/rappels/${id}`, class: "bouton bouton-secondaire bouton-petit" }, "Qui rappeler en premier") : null,
        apprenantsCount ? h("a", { href: `#/examens/${id}`, class: "bouton bouton-secondaire bouton-petit" }, "Examens") : null,
        apprenantsCount ? h("a", { href: `#/preuves/${id}`, class: "bouton bouton-secondaire bouton-petit" }, "Dossier de preuves Qualiopi") : null),
      apprenantsCount ? null : message("info", "Aucun élève pour l'instant : importe le fichier envoyé par ce client."));

    // --- Onglet Échanges : contacter par canal (Email, Téléphone, WhatsApp, SMS), puis noter ---
    const panneauEchanges = h("section", { class: "pile" },
      h("div", { class: "section-titre" }, h("h2", {}, "Échanges"), h("p", {}, pluriel(echanges.data.length, "échange", "échanges"))),
      blocCanauxOrganisme(org.data, s, () => ecranOrganisme(id)),
      h("details", { class: "carte carte-large depliant" },
        h("summary", {}, "Noter un autre échange (visio, LinkedIn, rendez-vous…)"),
        formulaireEchange),
      h("div", { class: "section-titre" }, h("h2", {}, "Historique"), h("p", {}, pluriel(echanges.data.length, "échange", "échanges"))),
      historique);

    // --- Onglet Suivi commercial ---
    const panneauSuivi = h("section", { class: "pile-serree" },
      h("div", { class: "section-titre" }, h("h2", {}, "Suivi commercial")),
      h("div", { class: "carte carte-large" }, formulaire),
      blocSuppression);

    // --- Onglet Accès plateforme ---
    const panneauAcces = h("section", { class: "pile-serree" },
      h("div", { class: "section-titre" }, h("h2", {}, "Accès à la plateforme"), h("p", {}, pluriel(comptes.length, "compte", "comptes"))),
      comptes.length
        ? h("ul", { class: "liste" }, comptes.map((c) => h("li", { class: "ligne" },
            h("span", { class: "ligne-titre" }, c.nom_affiche || c.email),
            h("span", { class: "pastilles" }, c.actif ? pastille("vert", "Actif") : pastille("neutre", "Désactivé")),
            h("span", { class: "ligne-detail" }, [c.email,
              `créé le ${dateLisible(c.cree_le.slice(0, 10))}`,
              c.derniere_connexion ? `dernière connexion le ${dateHeureComplete(c.derniere_connexion)}` : "jamais connecté·e"].join(" · ")))))
        : message("info", "Aucun compte pour cet organisme."),
      h("div", { class: "actions-ligne" },
        h("a", { href: `#/acces/${id}`, class: "bouton bouton-petit" }, "Créer un compte pour ce client"),
        h("a", { href: "#/acces", class: "bouton bouton-secondaire bouton-petit" }, "Gérer les accès (durée, droits)")));

    // --- Colonne de gauche : contact ---
    const ligneContact = (libelle, valeur, lien) => h("div", { class: "perso-case" },
      h("span", { class: "compteur-libelle" }, libelle),
      valeur ? (lien ? h("a", { class: "perso-valeur", href: lien }, valeur) : h("span", { class: "perso-valeur" }, valeur)) : h("span", { class: "perso-valeur perso-vide" }, "à renseigner"));
    const blocContact = h("section", { class: "carte carte-large perso", "aria-label": "Contact" },
      h("div", { class: "perso-entete" }, h("p", { class: "surtitre" }, "Contact")),
      h("div", { class: "perso-liste" },
        ligneContact("Nom", s.contact_nom),
        montantImpaye ? h("div", { class: "perso-case" }, badgeImpaye(montantImpaye)) : null,
        ligneContact("Fonction", s.contact_fonction),
        ligneContact("Email", s.contact_email, s.contact_email ? `mailto:${s.contact_email}` : null),
        ligneContact("Téléphone", s.contact_telephone, s.contact_telephone ? `tel:${s.contact_telephone.replace(/[^\d+]/g, "")}` : null)),
      s.notes ? h("p", { class: "perso-contraintes" }, s.notes) : null,
      h("p", { class: "aide" }, "À modifier dans l'onglet Suivi commercial."));

    // --- Colonne de droite : fil des échanges, saisie rapide ---
    const zoneRapide = h("div");
    const canalRapide = h("select", { class: "statut-choix", "aria-label": "Canal" }, Object.entries(CANAUX).map(([v, t]) => h("option", { value: v }, t)));
    const texteRapide = h("textarea", { class: "commentaire-champ", rows: "3", placeholder: "Noter un échange… (Ctrl + Entrée)", "aria-label": "Nouvel échange" });
    const publierRapide = h("button", { type: "submit", class: "bouton bouton-petit" }, "Publier");
    const formRapide = h("form", { class: "commentaire-formulaire", novalidate: true }, texteRapide,
      h("div", { class: "commentaire-actions" }, canalRapide, publierRapide), zoneRapide);
    const envoyerRapide = async () => {
      const t = texteRapide.value.trim();
      if (!t) return;
      occupe(publierRapide, true, "…");
      const { error } = await insererEchange({ organisme_id: id, date_echange: aujourdhui(), canal: canalRapide.value, resume: t, auteur_id: etat.profil.id });
      occupe(publierRapide, false);
      if (error) return signaler(zoneRapide, "erreur", texteErreur(error));
      ecranOrganisme(id);
    };
    formRapide.addEventListener("submit", (e) => { e.preventDefault(); envoyerRapide(); });
    texteRapide.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); envoyerRapide(); } });
    const filEchanges = h("section", { class: "commentaires" },
      h("div", { class: "commentaires-titre" }, h("h2", {}, "Échanges"), h("span", { class: "aide" }, pluriel(echanges.data.length, "échange", "échanges"))),
      formRapide,
      echanges.data.length
        ? h("ol", { class: "commentaires-liste" }, echanges.data.map((e) => h("li", { class: "commentaire commentaire-manuel" },
            h("div", { class: "commentaire-tete" }, h("span", { class: "commentaire-source" }, CANAUX[e.canal] || e.canal), h("span", { class: "commentaire-date" }, dateLisible(e.date_echange))),
            h("p", { class: "commentaire-texte" }, e.resume),
            h("div", { class: "commentaire-pied" }, h("span"), boutonEffacer(async () => {
              const r = await sb.from("echanges_commerciaux").delete().eq("id", e.id);
              if (!r.error) ecranOrganisme(id);
              return r;
            })))))
        : h("p", { class: "aide" }, "Aucun échange pour l'instant."));

    // --- Onglets en haut ---
    const memoOrg = etat.ongletOrganisme && etat.ongletOrganisme.id === id ? etat.ongletOrganisme : { id, onglet: lireRoute().onglet || "fiche" };
    etat.ongletOrganisme = memoOrg;
    const nb = (n) => (n ? ` (${n})` : "");
    const ongletsOrg = barreOnglets("organisme", [
      ["fiche", "Fiche", panneauFiche],
      ["echanges", `Échanges${nb(echanges.data.length)}`, panneauEchanges],
      ["suivi", "Suivi commercial", panneauSuivi],
      ["eleves", `Élèves${nb(apprenantsCount)}`, panneauEleves],
      ["acces", `Accès plateforme${nb(comptes.length)}`, panneauAcces],
      ["compta", montantImpaye ? h("span", { class: "onglet-impaye" }, "Comptabilité", h("span", { class: "onglet-impaye-point", "aria-label": "impayé" })) : "Comptabilité", blocComptabilite(org.data, s)],
    ], memoOrg.onglet, (cle) => {
      memoOrg.onglet = cle;
      const cible = `#/organisme/${id}/${cle}`;
      if (window.location.hash !== cible) history.replaceState(null, "", cible);
      hautOrg.classList.toggle("fiche-haut-onglet", cle !== "fiche");
      window.scrollTo(0, 0);
    }, { separe: true });
    const hautOrg = h("div", { class: `fiche-haut${memoOrg.onglet !== "fiche" ? " fiche-haut-onglet" : ""}` },
      h("p", { class: "surtitre" }, retour),
      h("p", { class: "fiche-rappel" }, nomAvecImpaye(h("strong", {}, org.data.nom), montantImpaye), " · ", LIBELLE_ETAPE_UNE[etapeCle]),
      h("div", { class: "onglets-fiche onglets-haut" }, ongletsOrg.barre));

    afficher(
      h("div", { class: "fiche-page" },
        h("aside", { class: "fiche-gauche", "aria-label": "Contact" }, blocContact),
        h("div", { class: "fiche-centre pile" }, hautOrg, ongletsOrg),
        h("aside", { class: "fiche-droite", "aria-label": "Échanges" }, filEchanges))
    );
    // Pas de focus automatique sur la fiche : la page s'ouvre en haut.
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------------------
  // « Qui rappeler en premier ? » — tous les clients ou un seul
  // ---------------------------------------------------------------------------

  async function ecranRappels(organismeId) {
    afficher(navigationAdmin("rappels"), h("p", { class: "chargement" }, "Chargement des apprenants…"));

    const { data, error } = await sb
      .from("vue_qui_rappeler")
      .select("id, organisme_id, organisme_nom, identifiant_externe, prenom, nom, telephone, parcours, avancement_pct, derniere_connexion, jours_sans_contact, alerte, date_entree_formation, date_sortie_formation, tentatives, aboutis");
    if (error) return afficher(navigationAdmin("rappels"), message("erreur", texteErreur(error)));

    const organismes = new Map();
    for (const l of data) {
      if (!organismes.has(l.organisme_id)) organismes.set(l.organisme_id, { id: l.organisme_id, nom: l.organisme_nom, n: 0 });
      organismes.get(l.organisme_id).n++;
    }
    const visibles = trierParUrgence(data.filter((l) => !organismeId || l.organisme_id === organismeId));
    const total = compterAlertes(visibles);
    memoriserFile(visibles, organismeId ? `rappels/${organismeId}` : "rappels");

    const filtre = (id, texte, n) =>
      h("a", { href: id ? `#/rappels/${id}` : "#/rappels", class: "filtre", "aria-current": (organismeId || null) === id ? "true" : null },
        texte, h("span", { class: "filtre-nombre" }, String(n)));

    const ligne = (a) => {
      const nomComplet = `${a.prenom || ""} ${a.nom || ""}`.trim() || a.identifiant_externe || "Apprenant";
      const details = [
        organismeId ? null : a.organisme_nom,
        a.parcours,
        texteFormation(a),
        a.avancement_pct !== null && a.avancement_pct !== undefined ? `${Math.round(a.avancement_pct)}\u00a0% réalisé` : null,
        a.derniere_connexion ? `connecté·e le ${dateLisible(a.derniere_connexion)}` : null,
        texteContacts(a),
      ].filter(Boolean).join(" · ");
      return h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, lienInterne(`apprenant/${a.id}`, nomComplet)),
        h("span", { class: "pastilles" }, pastille(a.alerte, `${a.jours_sans_contact} j · ${libelleAlerte(a.alerte)}`), pastilleSortie(a)),
        h("span", { class: "ligne-detail" },
          details,
          a.telephone ? h("span", { class: "telephone" }, " · ", h("a", { href: `tel:${a.telephone.replace(/[^\d+]/g, "")}` }, a.telephone)) : null));
    };

    afficher(
      navigationAdmin("rappels"),
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "À rappeler"),
          h("h1", {}, "Qui rappeler en premier ?"),
          h("p", { class: "chapo" }, "Apprenants actifs, classés du plus urgent au moins urgent selon le nombre de jours sans contact.")),
        organismes.size > 1
          ? h("div", { class: "filtres" },
              filtre(null, "Tous les clients", data.length),
              [...organismes.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((o) => filtre(o.id, o.nom, o.n)))
          : null,
        visibles.length ? blocCompteurs(total, visibles.length) : null,
        visibles.length
          ? h("ul", { class: "liste" }, visibles.map(ligne))
          : message("info", "Aucun apprenant actif. Importez le fichier d'un client depuis sa fiche, dans Prospection."))
    );
  }

  // ---------------------------------------------------------------------------
  // Import d'un fichier d'apprenants (CSV)
  // ---------------------------------------------------------------------------

  const CLE_CORRESPONDANCE = "filrouge-correspondance-";

  function lireCorrespondanceMemorisee(organismeId, entetes) {
    try {
      const brut = window.localStorage.getItem(CLE_CORRESPONDANCE + organismeId);
      if (!brut) return null;
      const memo = JSON.parse(brut); // { champ: "En-tête" }
      const resultat = {};
      for (const [champ, entete] of Object.entries(memo)) {
        const i = entetes.indexOf(entete);
        if (i >= 0) resultat[champ] = i;
      }
      return Object.keys(resultat).length ? resultat : null;
    } catch (e) { return null; }
  }

  function memoriserCorrespondance(organismeId, correspondance, entetes) {
    try {
      const memo = {};
      for (const [champ, i] of Object.entries(correspondance)) if (Number.isInteger(i)) memo[champ] = entetes[i];
      window.localStorage.setItem(CLE_CORRESPONDANCE + organismeId, JSON.stringify(memo));
    } catch (e) { /* mémorisation impossible : sans gravité */ }
  }

  async function ecranImport(organismeId) {
    const I = window.FilRougeImport;
    afficher(navigationAdmin("rappels"), h("p", { class: "chargement" }, "Préparation de l'import…"));

    const { data: organismes, error } = await sb.from("organismes").select("id, nom").order("nom");
    if (error) return afficher(navigationAdmin("rappels"), message("erreur", texteErreur(error)));
    if (!organismes.length) return afficher(navigationAdmin("rappels"), message("info", "Ajoutez d'abord un organisme dans Prospection."));

    const etatImport = { organismeId: organismes.some((o) => o.id === organismeId) ? organismeId : "", fichier: null, entetes: [], lignes: [], correspondance: {} };

    const choixOrganisme = champChoix("import-organisme", "Client concerné",
      Object.fromEntries([["", "— Choisir —"], ...organismes.map((o) => [o.id, o.nom])]), etatImport.organismeId);
    const champFichier = h("input", { id: "import-fichier", type: "file", accept: ".csv,text/csv,text/plain" });
    const zoneFichier = h("div");
    const zoneCorrespondance = h("div", { class: "pile" });

    const etape1 = h("div", { class: "carte carte-large" },
      h("div", { class: "formulaire" },
        choixOrganisme.bloc,
        h("label", { for: "import-fichier" }, "Fichier des apprenants (CSV)",
          h("span", { class: "aide" }, "Depuis Excel : Fichier › Enregistrer sous › « CSV (séparateur : point-virgule) ». Le fichier est lu sur cet appareil et n'est pas conservé."),
          champFichier),
        h("p", { class: "aide" }, "Pour essayer : ", h("a", { href: "exemple-apprenants-fictifs.csv", download: "exemple-apprenants-fictifs.csv" }, "télécharger un fichier d'exemple (12 apprenants fictifs)"), "."),
        zoneFichier));

    choixOrganisme.champ.addEventListener("change", () => {
      etatImport.organismeId = choixOrganisme.champ.value;
      if (etatImport.entetes.length) afficherCorrespondance();
    });

    champFichier.addEventListener("change", async () => {
      signaler(zoneFichier);
      zoneCorrespondance.replaceChildren();
      const fichier = champFichier.files && champFichier.files[0];
      if (!fichier) return;
      if (/\.xlsx?$/i.test(fichier.name)) {
        return signaler(zoneFichier, "erreur", "Ce fichier est au format Excel. Ouvrez-le dans Excel et enregistrez-le en « CSV (séparateur : point-virgule) », puis choisissez ce nouveau fichier.");
      }
      if (fichier.size > 5 * 1024 * 1024) return signaler(zoneFichier, "erreur", "Fichier trop lourd (plus de 5 Mo). Gardez seulement les colonnes utiles.");
      const lu = I.lireCsv(I.decoder(new Uint8Array(await fichier.arrayBuffer())));
      if (lu.entetes.length < 2 || !lu.lignes.length) {
        return signaler(zoneFichier, "erreur", "Ce fichier ne contient pas de tableau lisible : il faut une ligne d'en-têtes, puis une ligne par apprenant.");
      }
      etatImport.fichier = fichier.name;
      etatImport.entetes = lu.entetes;
      etatImport.lignes = lu.lignes;
      etatImport.correspondance = (etatImport.organismeId && lireCorrespondanceMemorisee(etatImport.organismeId, lu.entetes)) || I.devinerCorrespondance(lu.entetes);
      signaler(zoneFichier, "info", `${fichier.name} : ${pluriel(lu.lignes.length, "ligne", "lignes")}, ${pluriel(lu.entetes.length, "colonne", "colonnes")}.`);
      afficherCorrespondance();
    });

    function afficherCorrespondance() {
      const choixColonnes = { "": "— Ne pas importer —" };
      etatImport.entetes.forEach((e, i) => { choixColonnes[String(i)] = e; });

      const selecteurs = I.CHAMPS.map((champ) => {
        const actuel = etatImport.correspondance[champ.cle];
        const c = champChoix(`corr-${champ.cle}`, champ.libelle, choixColonnes, Number.isInteger(actuel) ? String(actuel) : "");
        c.champ.addEventListener("change", () => {
          etatImport.correspondance[champ.cle] = c.champ.value === "" ? undefined : Number(c.champ.value);
          majApercu();
        });
        return c.bloc;
      });

      const zoneApercu = h("div", { class: "pile" });
      const zoneResultat = h("div");
      const bouton = h("button", { class: "bouton", type: "button" }, "Importer");

      function majApercu() {
        const r = I.preparer(etatImport.lignes, etatImport.correspondance, etatImport.organismeId || "?");
        const colonnes = I.CHAMPS.filter((c) => Number.isInteger(etatImport.correspondance[c.cle]));
        const tableau = h("div", { class: "tableau-defilant" },
          h("table", { class: "tableau" },
            h("thead", {}, h("tr", {}, colonnes.map((c) => h("th", {}, c.libelle)))),
            h("tbody", {}, r.valides.slice(0, 5).map((v) =>
              h("tr", {}, colonnes.map((c) => h("td", {}, v[c.cle] === null || v[c.cle] === undefined ? "—" : String(v[c.cle]))))))));
        bouton.textContent = r.valides.length ? `Importer ${pluriel(r.valides.length, "apprenant", "apprenants")}` : "Importer";
        bouton.disabled = !r.valides.length || !etatImport.organismeId;
        zoneApercu.replaceChildren(...[
          h("h2", {}, "Aperçu"),
          colonnes.length ? tableau : message("info", "Choisissez au moins une colonne."),
          r.valides.length > 5 ? h("p", { class: "aide" }, `… et ${pluriel(r.valides.length - 5, "autre ligne", "autres lignes")}.`) : null,
          !Number.isInteger(etatImport.correspondance.identifiant_externe)
            ? message("info", "Pas de colonne d'identifiant : l'email (ou à défaut le prénom et le nom) servira à reconnaître chaque apprenant. Gardez la même façon de faire d'un import à l'autre pour éviter les doublons.")
            : null,
          r.doublons ? message("info", `${pluriel(r.doublons, "apprenant apparaît", "apprenants apparaissent")} plusieurs fois dans le fichier : la dernière ligne est retenue.`) : null,
          r.erreurs.length
            ? h("div", { class: "message message-erreur" },
                h("strong", {}, `${pluriel(r.erreurs.length, "ligne ignorée", "lignes ignorées")} :`),
                h("ul", { class: "liste-erreurs" },
                  r.erreurs.slice(0, 10).map((e) => h("li", {}, `ligne ${e.ligne} — ${e.message}`)),
                  r.erreurs.length > 10 ? h("li", {}, `… et ${r.erreurs.length - 10} autres`) : null))
            : null,
          !etatImport.organismeId ? message("erreur", "Choisissez le client concerné, tout en haut.") : null,
        ].filter(Boolean));
      }

      bouton.addEventListener("click", async () => {
        const r = I.preparer(etatImport.lignes, etatImport.correspondance, etatImport.organismeId);
        if (!r.valides.length) return;
        signaler(zoneResultat);
        occupe(bouton, true, "Import en cours…");

        // Combien existent déjà ? (pour annoncer nouveaux / mis à jour)
        const existants = await sb.from("apprenants").select("identifiant_externe").eq("organisme_id", etatImport.organismeId);
        const dejaLa = new Set((existants.data || []).map((e) => e.identifiant_externe));

        // Envoi par groupes de lignes ayant les mêmes colonnes : une ligne dont
        // une cellule d'examen est vide n'envoie pas cette colonne, et ne doit
        // pas effacer ce qui a été saisi dans la plateforme.
        // La date de naissance va dans la situation personnelle (équipe Fil Rouge
        // uniquement), pas dans la fiche apprenant que le client peut lire.
        const naissances = new Map();
        const lignesApprenants = r.valides.map((v) => {
          const { date_naissance, ...reste } = v;
          if (date_naissance) naissances.set(reste.identifiant_externe, date_naissance);
          return reste;
        });
        const groupes = new Map();
        for (const v of lignesApprenants) {
          const signature = Object.keys(v).sort().join(",");
          if (!groupes.has(signature)) groupes.set(signature, []);
          groupes.get(signature).push(v);
        }
        let erreur = null;
        for (const groupe of groupes.values()) {
          for (let i = 0; i < groupe.length && !erreur; i += 500) {
            const lot = groupe.slice(i, i + 500);
            const res = await sb.from("apprenants").upsert(lot, { onConflict: "organisme_id,identifiant_externe", defaultToNull: false });
            erreur = res.error;
          }
        }
        if (!erreur && naissances.size) {
          const ids = await toutLire(() => sb.from("apprenants").select("id, identifiant_externe").eq("organisme_id", etatImport.organismeId).order("id"));
          erreur = ids.error;
          const lignesSituation = (ids.data || [])
            .filter((x) => naissances.has(x.identifiant_externe))
            .map((x) => ({ apprenant_id: x.id, organisme_id: etatImport.organismeId, date_naissance: naissances.get(x.identifiant_externe) }));
          for (let i = 0; i < lignesSituation.length && !erreur; i += 500) {
            const res = await sb.from("situation_personnelle").upsert(lignesSituation.slice(i, i + 500), { onConflict: "apprenant_id", defaultToNull: false });
            erreur = res.error;
          }
        }
        occupe(bouton, false);
        if (erreur) return signaler(zoneResultat, "erreur", `L'import s'est arrêté : ${texteErreur(erreur)}`);

        memoriserCorrespondance(etatImport.organismeId, etatImport.correspondance, etatImport.entetes);
        const nouveaux = r.valides.filter((v) => !dejaLa.has(v.identifiant_externe)).length;
        etatImport.lignes = []; // le contenu du fichier n'est pas gardé en mémoire
        champFichier.value = "";
        zoneCorrespondance.replaceChildren(
          h("div", { class: "message message-action" },
            h("strong", {}, "Import terminé. "),
            `${pluriel(nouveaux, "nouvel apprenant", "nouveaux apprenants")}, ${pluriel(r.valides.length - nouveaux, "mis à jour", "mis à jour")}`,
            r.erreurs.length ? `, ${pluriel(r.erreurs.length, "ligne ignorée", "lignes ignorées")}` : "",
            ". ",
            lienInterne(`rappels/${etatImport.organismeId}`, "Voir qui rappeler en premier →")));
        bouton.disabled = true;
      });

      zoneCorrespondance.replaceChildren(
        h("section", { class: "carte carte-large" },
          h("h2", {}, "Correspondance des colonnes"),
          h("p", { class: "aide" }, "Pour chaque information, choisissez la colonne du fichier qui la contient. Les colonnes devinées sont déjà sélectionnées ; ce choix sera retenu pour les prochains imports de ce client."),
          h("div", { class: "formulaire grille-correspondance" }, selecteurs)),
        zoneApercu,
        zoneResultat,
        bouton);
      majApercu();
    }

    afficher(
      navigationAdmin("rappels"),
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, etatImport.organismeId ? lienInterne(`organisme/${etatImport.organismeId}`, "← Fiche du client") : "Import"),
          h("h1", {}, "Importer des apprenants"),
          h("p", { class: "chapo" }, "Un nouvel import met à jour les apprenants déjà présents (reconnus par leur identifiant) et ajoute les nouveaux. Il ne supprime personne.")),
        etape1,
        zoneCorrespondance)
    );
  }

  // ===========================================================================
  // SUIVI JUSQU'À L'EXAMEN (étape 5)
  // ===========================================================================
  //   #/examens            tous les clients
  //   #/examens/<id>       un client : relances, saisie, taux par cohorte
  //   #/preuves/<id>       dossier de preuves Qualiopi (aussi #/preuves côté client)
  // ===========================================================================

  const LIBELLE_PRESENCE = { present: "Présent·e", absent: "Absent·e" };
  const LIBELLE_RESULTAT = { reussi: "Réussi", echoue: "Échoué" };
  const COULEUR_RELANCE = { "J-1": "rouge", "J-7": "orange", "J-30": "neutre" };
  const LIBELLE_RESULTAT_APPEL = { joint: "Joint·e", messagerie: "Message laissé", injoignable: "Injoignable", refuse_suivi: "Refuse le suivi" };
  const LIBELLE_CANAL_APPEL = { telephone: "Téléphone", whatsapp: "WhatsApp", sms: "SMS", email: "Email", visio: "Visio" };
  const LIBELLE_STATUT = { actif: "En formation", termine: "Terminé", abandon: "Abandon" };

  function nomApprenant(a) {
    return `${a.prenom || ""} ${a.nom || ""}`.trim() || a.identifiant_externe || "Apprenant";
  }

  function lienTelephone(numero) {
    return numero ? h("span", { class: "telephone" }, " · ", h("a", { href: `tel:${numero.replace(/[^\d+]/g, "")}` }, numero)) : null;
  }

  function pourcentage(valeur) {
    return valeur === null || valeur === undefined || Number.isNaN(valeur) ? "—" : `${String(Math.round(valeur * 10) / 10).replace(".", ",")} %`;
  }

  function taux(numerateur, denominateur) {
    return denominateur ? (100 * numerateur) / denominateur : null;
  }

  // Additionne les lignes de vue_taux_examen (une ligne par cohorte).
  function totalTaux(lignes) {
    const t = { effectif: 0, abandons: 0, inscrits_examen: 0, a_venir: 0, a_renseigner: 0, presents: 0, absents: 0, reussis: 0, echoues: 0 };
    for (const l of lignes) for (const cle of Object.keys(t)) t[cle] += Number(l[cle] || 0);
    t.taux_presence = taux(t.presents, t.presents + t.absents);
    t.taux_reussite = taux(t.reussis, t.reussis + t.echoues);
    return t;
  }

  // Lit toutes les lignes d'une requête, par pages de 1 000 (limite de Supabase).
  async function toutLire(fabriquerRequete) {
    const resultat = [];
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await fabriquerRequete().range(debut, debut + 999);
      if (error) return { data: null, error };
      resultat.push(...data);
      if (data.length < 1000) return { data: resultat, error: null };
    }
  }

  function tableauTaux(lignes, tauxDepart) {
    const t = totalTaux(lignes);
    const ligne = (libelle, l, classe) => h("tr", { class: classe || null },
      h("td", {}, libelle),
      h("td", {}, String(l.inscrits_examen)),
      h("td", {}, String(l.presents)),
      h("td", {}, String(l.absents)),
      h("td", {}, pourcentage(l.taux_presence === null || l.taux_presence === undefined ? null : Number(l.taux_presence))),
      h("td", {}, String(l.reussis)),
      h("td", {}, pourcentage(l.taux_reussite === null || l.taux_reussite === undefined ? null : Number(l.taux_reussite))));
    const tries = lignes.slice().sort((a, b) => a.cohorte.localeCompare(b.cohorte));
    return h("div", { class: "pile pile-serree" },
      h("div", { class: "tableau-defilant" },
        h("table", { class: "tableau" },
          h("thead", {}, h("tr", {},
            h("th", {}, "Inscrits en"), h("th", {}, "Examens"), h("th", {}, "Présents"),
            h("th", {}, "Absents"), h("th", {}, "Présence"), h("th", {}, "Réussis"), h("th", {}, "Réussite"))),
          h("tbody", {},
            tries.map((l) => ligne(moisLisible(l.cohorte), l)),
            tries.length > 1 ? ligne("Total", t, "ligne-total") : null))),
      h("p", { class: "aide" },
        "Taux de présence = présents ÷ (présents + absents). Taux de réussite = réussis ÷ résultats connus. ",
        t.a_renseigner ? `${pluriel(t.a_renseigner, "examen passé n'est pas encore renseigné", "examens passés ne sont pas encore renseignés")} : il n'entre pas dans les taux. ` : "",
        tauxDepart !== null && tauxDepart !== undefined ? `Taux de présence avant Fil Rouge : ${pourcentage(Number(tauxDepart))}.` : ""));
  }

  function moisLisible(cohorte) {
    if (!/^\d{4}-\d{2}$/.test(cohorte || "")) return "Sans date d'inscription";
    const texte = new Date(`${cohorte}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  // Formulaire compact : date d'examen, présence, résultat d'un apprenant.
  function editeurExamen(a, apresEnregistrement) {
    const zone = h("div");
    const date = h("input", { type: "date", value: a.date_examen || "", "aria-label": "Date d'examen" });
    const presence = h("select", { "aria-label": "Présence" },
      h("option", { value: "" }, "Présence : à venir / inconnue"),
      h("option", { value: "present" }, "Présent·e"),
      h("option", { value: "absent" }, "Absent·e"));
    presence.value = a.presence_examen || "";
    const resultat = h("select", { "aria-label": "Résultat" },
      h("option", { value: "" }, "Résultat : inconnu"),
      h("option", { value: "reussi" }, "Réussi"),
      h("option", { value: "echoue" }, "Échoué"));
    resultat.value = a.resultat_examen || "";
    const majResultat = () => {
      resultat.disabled = presence.value !== "present";
      if (resultat.disabled) resultat.value = "";
    };
    presence.addEventListener("change", majResultat);
    majResultat();
    const bouton = h("button", { type: "submit", class: "bouton bouton-petit" }, "Enregistrer");
    const formulaire = h("form", { class: "editeur-examen", novalidate: true },
      h("label", {}, "Date d'examen", date),
      h("label", {}, "Présence", presence),
      h("label", {}, "Résultat", resultat),
      bouton, zone);
    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      if (!date.value && presence.value) return signaler(zone, "erreur", "Indiquez d'abord la date de l'examen.");
      signaler(zone);
      occupe(bouton, true, "Enregistrement…");
      const valeurs = {
        date_examen: date.value || null,
        presence_examen: date.value ? (presence.value || null) : null,
        resultat_examen: date.value && presence.value === "present" ? (resultat.value || null) : null,
      };
      const { error } = await sb.from("apprenants").update(valeurs).eq("id", a.id);
      occupe(bouton, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
      Object.assign(a, valeurs);
      apresEnregistrement();
    });
    return formulaire;
  }

  // Une ligne d'apprenant avec son examen, et un bouton « Modifier ».
  function ligneExamen(a, options) {
    const { afficherOrganisme, rafraichir, rapide } = options;
    const li = h("li", { class: "ligne" });
    const dessiner = () => {
      const pastilles = [];
      if (a.date_examen) pastilles.push(pastille("neutre", dateLisible(a.date_examen)));
      if (a.presence_examen) pastilles.push(pastille(a.presence_examen === "present" ? "vert" : "rouge", LIBELLE_PRESENCE[a.presence_examen]));
      if (a.resultat_examen) pastilles.push(pastille(a.resultat_examen === "reussi" ? "vert" : "orange", LIBELLE_RESULTAT[a.resultat_examen]));
      const zoneEdition = h("div", { class: "ligne-edition", hidden: true });
      const boutonModifier = h("button", { type: "button", class: "bouton-lien" }, a.date_examen ? "Modifier" : "Ajouter une date d'examen");
      boutonModifier.addEventListener("click", () => {
        zoneEdition.hidden = !zoneEdition.hidden;
        if (!zoneEdition.hidden && !zoneEdition.firstChild) zoneEdition.append(editeurExamen(a, rafraichir));
      });
      // Saisie en un geste pour un examen passé : présent / absent, puis le résultat.
      const zoneRapide = h("div", { class: "actions-ligne" });
      const enregistrerRapide = async (valeurs, bouton) => {
        occupe(bouton, true, "…");
        const { error } = await sb.from("apprenants").update(valeurs).eq("id", a.id);
        occupe(bouton, false);
        if (error) return zoneRapide.replaceChildren(message("erreur", texteErreur(error)));
        Object.assign(a, valeurs);
        rafraichir();
      };
      if (rapide && a.date_examen && !a.presence_examen) {
        const present = h("button", { type: "button", class: "puce" }, "Présent·e");
        const absent = h("button", { type: "button", class: "puce" }, "Absent·e");
        present.addEventListener("click", () => enregistrerRapide({ presence_examen: "present" }, present));
        absent.addEventListener("click", () => enregistrerRapide({ presence_examen: "absent", resultat_examen: null }, absent));
        zoneRapide.append(present, absent);
      } else if (rapide && a.presence_examen === "present" && !a.resultat_examen) {
        const reussi = h("button", { type: "button", class: "puce" }, "Réussi");
        const echoue = h("button", { type: "button", class: "puce" }, "Échoué");
        reussi.addEventListener("click", () => enregistrerRapide({ resultat_examen: "reussi" }, reussi));
        echoue.addEventListener("click", () => enregistrerRapide({ resultat_examen: "echoue" }, echoue));
        zoneRapide.append(h("span", { class: "aide" }, "Résultat :"), reussi, echoue);
      }
      const details = [afficherOrganisme ? a.organisme_nom : null, a.parcours].filter(Boolean).join(" · ");
      li.replaceChildren(...[
        h("span", { class: "ligne-titre" }, lienApprenant(a)),
        h("span", { class: "pastilles" }, pastilles),
        h("span", { class: "ligne-detail" }, details, lienTelephone(a.telephone)),
        zoneRapide.childNodes.length ? h("div", { class: "ligne-detail" }, zoneRapide) : null,
        etat.profil && etat.profil.role === "admin" ? h("div", { class: "ligne-detail" }, boutonModifier) : null,
        zoneEdition,
      ].filter(Boolean)); // replaceChildren écrirait « null » en toutes lettres
    };
    dessiner();
    return li;
  }

  async function ecranExamens(organismeId) {
    afficher(navigationAdmin("examens"), h("p", { class: "chargement" }, "Chargement des examens…"));

    const [apprenants, relances, tauxCohortes] = await Promise.all([
      toutLire(() => sb.from("apprenants")
        .select("id, organisme_id, identifiant_externe, prenom, nom, telephone, parcours, statut, date_examen, presence_examen, resultat_examen, organismes ( nom, taux_presence_depart )")
        .order("date_examen", { ascending: true, nullsFirst: false }).order("id")),
      sb.from("vue_relances_examen").select("id, etape_relance, relance_faite, jours_avant_examen"),
      sb.from("vue_taux_examen").select("*"),
    ]);
    const erreur = apprenants.error || relances.error || tauxCohortes.error;
    if (erreur) return afficher(navigationAdmin("examens"), message("erreur", texteErreur(erreur)));

    const tous = apprenants.data.map((a) => ({ ...a, organisme_nom: a.organismes?.nom || "", taux_presence_depart: a.organismes?.taux_presence_depart }));
    const organismes = new Map();
    for (const a of tous) {
      if (!organismes.has(a.organisme_id)) organismes.set(a.organisme_id, { id: a.organisme_id, nom: a.organisme_nom, n: 0, tauxDepart: a.taux_presence_depart });
      if (a.date_examen) organismes.get(a.organisme_id).n++;
    }
    const filtrer = (l) => !organismeId || l.organisme_id === organismeId;
    const visibles = tous.filter(filtrer);
    const relanceParId = new Map(relances.data.map((r) => [r.id, r]));
    const ajd = aujourdhui();
    const retourExamens = organismeId ? `examens/${organismeId}` : "examens";

    const rafraichir = () => ecranExamens(organismeId);
    const options = { afficherOrganisme: !organismeId, rafraichir };

    const aRelancer = visibles
      .filter((a) => relanceParId.has(a.id) && relanceParId.get(a.id).etape_relance && !relanceParId.get(a.id).relance_faite)
      .sort((a, b) => a.date_examen.localeCompare(b.date_examen));
    const aRenseigner = visibles
      .filter((a) => a.statut !== "abandon" && a.date_examen && a.date_examen < ajd && (!a.presence_examen || (a.presence_examen === "present" && !a.resultat_examen)))
      .sort((a, b) => a.date_examen.localeCompare(b.date_examen));
    const aVenir = visibles.filter((a) => a.date_examen && a.date_examen >= ajd && !a.presence_examen && a.statut !== "abandon");
    const passes = visibles.filter((a) => a.date_examen && (a.date_examen < ajd || a.presence_examen)).sort((a, b) => b.date_examen.localeCompare(a.date_examen));
    const sansDate = visibles.filter((a) => !a.date_examen && a.statut === "actif");
    memoriserFile([...aRelancer, ...aRenseigner], retourExamens);

    const ligneRelance = (a) => {
      const r = relanceParId.get(a.id);
      return h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, lienApprenant(a)),
        h("span", { class: "pastilles" }, pastille(COULEUR_RELANCE[r.etape_relance], `${r.etape_relance} · ${ecartJours(a.date_examen)}`)),
        h("span", { class: "ligne-detail" },
          [options.afficherOrganisme ? a.organisme_nom : null, a.parcours, `examen le ${dateLisible(a.date_examen)}`].filter(Boolean).join(" · "),
          lienTelephone(a.telephone)));
    };

    const filtre = (id, texte, n) =>
      h("a", { href: id ? `#/examens/${id}` : "#/examens", class: "filtre", "aria-current": (organismeId || null) === id ? "true" : null },
        texte, h("span", { class: "filtre-nombre" }, String(n)));

    // Taux de départ (base de l'option résultat), pour un client sélectionné.
    let blocTauxDepart = null;
    if (organismeId && organismes.has(organismeId)) {
      const zone = h("div");
      const champ = h("input", { type: "text", inputmode: "decimal", id: "taux-depart", value: organismes.get(organismeId).tauxDepart ?? "", placeholder: "ex. : 70" });
      const bouton = h("button", { type: "submit", class: "bouton bouton-secondaire bouton-petit" }, "Enregistrer");
      const formulaire = h("form", { class: "formulaire", novalidate: true },
        h("label", { for: "taux-depart" }, "Taux de présence à l'examen avant Fil Rouge (%)",
          h("span", { class: "aide" }, "Mesuré au diagnostic. Sert de point de départ pour l'option « résultat » du contrat."), champ),
        zone, bouton);
      formulaire.addEventListener("submit", async (evenement) => {
        evenement.preventDefault();
        const brut = champ.value.replace(",", ".").replace("%", "").trim();
        const valeur = brut === "" ? null : Number(brut);
        if (valeur !== null && (!Number.isFinite(valeur) || valeur < 0 || valeur > 100)) return signaler(zone, "erreur", "Indiquez un nombre entre 0 et 100.");
        occupe(bouton, true, "Enregistrement…");
        const { error } = await sb.from("organismes").update({ taux_presence_depart: valeur }).eq("id", organismeId);
        occupe(bouton, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        rafraichir();
      });
      blocTauxDepart = h("div", { class: "carte carte-large" }, formulaire);
    }

    const tauxVisibles = tauxCohortes.data.filter(filtrer);
    const total = totalTaux(tauxVisibles);
    const tauxDepart = organismeId && organismes.has(organismeId) ? organismes.get(organismeId).tauxDepart : null;

    afficher(
      navigationAdmin("examens"),
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, organismeId ? lienInterne(`organisme/${organismeId}`, "← Fiche du client") : "Examens"),
          h("h1", {}, organismeId && organismes.has(organismeId) ? `Examens · ${organismes.get(organismeId).nom}` : "Jusqu'à l'examen"),
          h("p", { class: "chapo" }, "Relances J-30, J-7 et J-1, présence le jour J, résultats et taux par cohorte.")),
        organismes.size > 1
          ? h("div", { class: "filtres" },
              filtre(null, "Tous les clients", [...organismes.values()].reduce((n, o) => n + o.n, 0)),
              [...organismes.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((o) => filtre(o.id, o.nom, o.n)))
          : null,

        h("div", { class: "compteurs" },
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, aVenir.length), h("span", { class: "compteur-libelle" }, "examens à venir")),
          h("div", { class: `compteur ${aRelancer.length ? "compteur-rouge" : ""}` }, h("span", { class: "compteur-valeur" }, aRelancer.length), h("span", { class: "compteur-libelle" }, "relances à faire")),
          h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, pourcentage(total.taux_presence)), h("span", { class: "compteur-libelle" }, "taux de présence")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, pourcentage(total.taux_reussite)), h("span", { class: "compteur-libelle" }, "taux de réussite"))),

        organismeId ? h("div", { class: "actions-ligne" },
          h("a", { href: `#/preuves/${organismeId}`, class: "bouton bouton-petit" }, "Dossier de preuves Qualiopi")) : null,

        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "À relancer avant l'examen"), h("p", {}, "J-30 · J-7 · J-1")),
          aRelancer.length
            ? h("ul", { class: "liste" }, aRelancer.map(ligneRelance))
            : message("info", "Aucune relance d'examen à faire aujourd'hui. Un appel noté dans la fenêtre (30, 7 ou 1 jour avant) compte comme relance faite.")),

        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Examens passés à renseigner"), h("p", {}, pluriel(aRenseigner.length, "apprenant", "apprenants"))),
          aRenseigner.length
            ? h("ul", { class: "liste" }, aRenseigner.map((a) => ligneExamen(a, { ...options, rapide: true })))
            : message("info", "Tout est à jour : chaque examen passé a sa présence et son résultat.")),

        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Taux par cohorte")),
          tauxVisibles.some((l) => Number(l.inscrits_examen))
            ? tableauTaux(tauxVisibles, tauxDepart)
            : message("info", "Aucun examen enregistré pour l'instant. Ajoutez la colonne « Date d'examen » au prochain import, ou saisissez les dates ci-dessous.")),

        blocTauxDepart,

        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Examens à venir"), h("p", {}, pluriel(aVenir.length, "apprenant", "apprenants"))),
          aVenir.length ? h("ul", { class: "liste" }, aVenir.map((a) => ligneExamen(a, options))) : message("info", "Aucun examen à venir.")),

        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Examens passés"), h("p", {}, pluriel(passes.length, "apprenant", "apprenants"))),
          passes.length ? h("ul", { class: "liste" }, passes.map((a) => ligneExamen(a, options))) : message("info", "Aucun examen passé.")),

        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Sans date d'examen"), h("p", {}, pluriel(sansDate.length, "apprenant en formation", "apprenants en formation"))),
          sansDate.length
            ? h("details", { class: "depliant" },
                h("summary", {}, "Afficher la liste"),
                h("ul", { class: "liste" }, sansDate.map((a) => ligneExamen(a, options))))
            : message("info", "Tous les apprenants en formation ont une date d'examen."))
      )
    );
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------------------
  // Dossier de preuves Qualiopi (administratrice et client)
  // ---------------------------------------------------------------------------

  // CSV pour Excel : point-virgule, BOM UTF-8, et protection contre les
  // cellules commençant par = + - @ (formules exécutées à l'ouverture).
  function telechargerCsv(nomFichier, entetes, lignes) {
    const cellule = (v) => {
      let t = v === null || v === undefined ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const texte = "﻿" + [entetes, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([texte], { type: "text/csv;charset=utf-8" }));
    const lien = h("a", { href: url, download: nomFichier });
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function nomFichier(texte) {
    return normaliserNom(texte).slice(0, 40) || "organisme";
  }
  function normaliserNom(texte) {
    return String(texte || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // Minuit à l'heure de Paris (heure d'été ou d'hiver), pour filtrer les appels.
  function debutJourParis(dateIso) {
    let decalage = "+01:00";
    try {
      const partie = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "longOffset" })
        .formatToParts(new Date(`${dateIso}T12:00:00Z`)).find((p) => p.type === "timeZoneName");
      if (partie) decalage = partie.value.replace("GMT", "") || "+00:00";
    } catch (e) { /* navigateur ancien : heure d'hiver par défaut */ }
    return `${dateIso}T00:00:00${decalage}`;
  }

  function dateHeureLisible(horodatage) {
    return new Date(horodatage).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
  }

  async function ecranPreuves(organismeId, periode) {
    const estAdmin = etat.profil && etat.profil.role === "admin";
    const entete = estAdmin ? [navigationAdmin("examens")] : [];
    afficher(...entete, h("p", { class: "chargement" }, "Préparation du dossier de preuves…"));

    const au = periode?.au || aujourdhui();
    const du = periode?.du || ajouterJours(au, -90);

    const [organisme, apprenants, appels, tauxCohortes] = await Promise.all([
      sb.from("organismes").select("id, nom, seuil_vert_jours, seuil_orange_jours, taux_presence_depart").eq("id", organismeId).maybeSingle(),
      toutLire(() => sb.from("apprenants")
        .select("id, identifiant_externe, prenom, nom, parcours, statut, avancement_pct, derniere_connexion, date_dernier_contact, date_inscription, date_entree_formation, date_sortie_formation, date_examen, presence_examen, resultat_examen")
        .eq("organisme_id", organismeId).order("nom").order("id")),
      toutLire(() => sb.from("appels")
        .select("id, apprenant_id, date_appel, canal, resultat, note_client, prochaine_action, date_prochaine_action")
        .eq("organisme_id", organismeId)
        .gte("date_appel", debutJourParis(du)).lt("date_appel", debutJourParis(ajouterJours(au, 1)))
        .order("date_appel").order("id")),
      sb.from("vue_taux_examen").select("*").eq("organisme_id", organismeId),
    ]);
    const erreur = organisme.error || apprenants.error || appels.error || tauxCohortes.error;
    if (erreur) return afficher(...entete, message("erreur", texteErreur(erreur)));
    if (!organisme.data) return afficher(...entete, message("info", "Cet organisme n'existe plus."));

    const org = organisme.data;
    const parId = new Map(apprenants.data.map((a) => [a.id, a]));
    const contacts = appels.data;
    const contactesIds = new Set(contacts.map((c) => c.apprenant_id));
    const jointsIds = new Set(contacts.filter((c) => c.resultat === "joint").map((c) => c.apprenant_id));
    const contactsParApprenant = new Map();
    for (const c of contacts) contactsParApprenant.set(c.apprenant_id, (contactsParApprenant.get(c.apprenant_id) || 0) + 1);
    const actifs = apprenants.data.filter((a) => a.statut === "actif");
    const examensPeriode = apprenants.data
      .filter((a) => a.date_examen && a.date_examen >= du && a.date_examen <= au)
      .sort((a, b) => a.date_examen.localeCompare(b.date_examen));
    const examensAVenir = apprenants.data
      .filter((a) => a.date_examen && a.date_examen > au && a.statut !== "abandon")
      .sort((a, b) => a.date_examen.localeCompare(b.date_examen));
    const total = totalTaux(tauxCohortes.data);
    const presentsPeriode = examensPeriode.filter((a) => a.presence_examen === "present").length;
    const absentsPeriode = examensPeriode.filter((a) => a.presence_examen === "absent").length;
    const nomAppr = (id) => (parId.has(id) ? nomApprenant(parId.get(id)) : "Apprenant");

    // --- Choix de la période ---
    const zonePeriode = h("div");
    const champDu = h("input", { type: "date", id: "preuves-du", value: du });
    const champAu = h("input", { type: "date", id: "preuves-au", value: au });
    const boutonPeriode = h("button", { type: "submit", class: "bouton bouton-secondaire bouton-petit" }, "Mettre à jour");
    const formulairePeriode = h("form", { class: "formulaire", novalidate: true },
      h("div", { class: "deux-colonnes" },
        h("label", { for: "preuves-du" }, "Du", champDu),
        h("label", { for: "preuves-au" }, "Au", champAu)),
      h("div", { class: "raccourcis" },
        h("span", { class: "aide" }, "Période :"),
        [["3 derniers mois", 90], ["6 derniers mois", 182], ["12 derniers mois", 365]].map(([texte, n]) =>
          h("button", { type: "button", class: "puce", onclick: () => ecranPreuves(organismeId, { du: ajouterJours(aujourdhui(), -n), au: aujourdhui() }) }, texte))),
      zonePeriode, boutonPeriode);
    formulairePeriode.addEventListener("submit", (evenement) => {
      evenement.preventDefault();
      if (!champDu.value || !champAu.value || champDu.value > champAu.value) return signaler(zonePeriode, "erreur", "Choisissez une date de début antérieure à la date de fin.");
      ecranPreuves(organismeId, { du: champDu.value, au: champAu.value });
    });

    // --- Exports ---
    const suffixe = `${nomFichier(org.nom)}-${du}-au-${au}`;
    const exporterContacts = () => telechargerCsv(`preuves-suivi-${suffixe}.csv`,
      ["Date", "Apprenant", "Identifiant", "Parcours", "Canal", "Résultat", "Compte rendu", "Suite prévue", "Date de la suite"],
      contacts.map((c) => {
        const a = parId.get(c.apprenant_id) || {};
        return [dateHeureLisible(c.date_appel), nomAppr(c.apprenant_id), a.identifiant_externe || "", a.parcours || "",
          LIBELLE_CANAL_APPEL[c.canal] || c.canal, LIBELLE_RESULTAT_APPEL[c.resultat] || c.resultat,
          c.note_client || "", c.prochaine_action || "", c.date_prochaine_action ? dateLisible(c.date_prochaine_action) : ""];
      }));
    const exporterExamens = () => telechargerCsv(`examens-${nomFichier(org.nom)}-${au}.csv`,
      ["Apprenant", "Identifiant", "Parcours", "Inscription", "Entrée en formation", "Sortie de formation", "Statut", "Date d'examen", "Présence", "Résultat"],
      apprenants.data.map((a) => [nomApprenant(a), a.identifiant_externe || "", a.parcours || "",
        a.date_inscription ? dateLisible(a.date_inscription) : "",
        a.date_entree_formation ? dateLisible(a.date_entree_formation) : "", a.date_sortie_formation ? dateLisible(a.date_sortie_formation) : "",
        LIBELLE_STATUT[a.statut] || a.statut,
        a.date_examen ? dateLisible(a.date_examen) : "", LIBELLE_PRESENCE[a.presence_examen] || "", LIBELLE_RESULTAT[a.resultat_examen] || ""]));

    const tableau = (entetes, lignes) => h("div", { class: "tableau-defilant" },
      h("table", { class: "tableau" },
        h("thead", {}, h("tr", {}, entetes.map((e) => h("th", {}, e)))),
        h("tbody", {}, lignes.map((l) => h("tr", {}, l.map((c) => h("td", {}, c === null || c === undefined || c === "" ? "—" : c)))))));

    // --- Le dossier lui-même ---
    const dossier = h("article", { class: "dossier" },
      h("header", { class: "dossier-entete" },
        h("p", { class: "surtitre" }, "Dossier de preuves · Qualiopi"),
        h("h1", {}, org.nom),
        h("p", { class: "chapo" }, `Suivi des apprenants en formation à distance, du ${dateLisible(du)} au ${dateLisible(au)}.`),
        h("p", { class: "aide" }, `Établi le ${dateLisible(aujourdhui())} par Fil Rouge Apprenants, prestataire du suivi. Données issues de la plateforme de suivi, horodatées à chaque saisie.`)),

      h("section", {},
        h("h2", {}, "Synthèse de la période"),
        h("div", { class: "compteurs" },
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, apprenants.data.length), h("span", { class: "compteur-libelle" }, "apprenants suivis")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, contacts.length), h("span", { class: "compteur-libelle" }, `tentatives de contact (${contactesIds.size} apprenants)`)),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, contacts.filter((c) => c.resultat === "joint").length), h("span", { class: "compteur-libelle" }, `contacts aboutis (${pourcentage(taux(contacts.filter((c) => c.resultat === "joint").length, contacts.length))} des tentatives)`)),
          h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, pourcentage(taux(jointsIds.size, contactesIds.size))), h("span", { class: "compteur-libelle" }, "joints au moins une fois"))),
        h("div", { class: "compteurs" },
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, examensPeriode.length), h("span", { class: "compteur-libelle" }, "examens sur la période")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, `${presentsPeriode} / ${presentsPeriode + absentsPeriode}`), h("span", { class: "compteur-libelle" }, "présents / renseignés")),
          h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, pourcentage(total.taux_presence)), h("span", { class: "compteur-libelle" }, "taux de présence (cumul)")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, pourcentage(total.taux_reussite)), h("span", { class: "compteur-libelle" }, "taux de réussite (cumul)")))),

      h("section", {},
        h("h2", {}, "Indicateur 12 · Prévention des ruptures de parcours"),
        h("p", {}, `Chaque apprenant sans contact depuis plus de ${org.seuil_vert_jours} jours est repéré, puis appelé en priorité au-delà de ${org.seuil_orange_jours} jours. Chaque action est datée, avec son résultat et la suite prévue. Le compte rendu ne reprend que les éléments utiles au parcours de formation.`),
        contacts.length
          ? tableau(["Date", "Apprenant", "Canal", "Résultat", "Compte rendu", "Suite prévue"],
              contacts.map((c) => [dateHeureLisible(c.date_appel), nomAppr(c.apprenant_id), LIBELLE_CANAL_APPEL[c.canal] || c.canal,
                LIBELLE_RESULTAT_APPEL[c.resultat] || c.resultat, c.note_client,
                [c.prochaine_action, c.date_prochaine_action ? `(${dateLisible(c.date_prochaine_action)})` : null].filter(Boolean).join(" ")]))
          : message("info", "Aucun contact enregistré sur cette période.")),

      h("section", {},
        h("h2", {}, "Indicateur 19 · Suivi de la formation à distance"),
        h("p", {}, `Situation des ${pluriel(actifs.length, "apprenant en formation", "apprenants en formation")} au ${dateLisible(aujourdhui())} : avancement sur la plateforme de formation, dernière connexion et dernier contact humain.`),
        actifs.length
          ? tableau(["Apprenant", "Parcours", "Avancement", "Dernière connexion", "Dernier contact", "Contacts sur la période"],
              actifs.map((a) => [nomApprenant(a), a.parcours,
                a.avancement_pct === null || a.avancement_pct === undefined ? "" : `${Math.round(a.avancement_pct)} %`,
                a.derniere_connexion ? dateLisible(a.derniere_connexion) : "", a.date_dernier_contact ? dateLisible(a.date_dernier_contact) : "",
                String(contactsParApprenant.get(a.id) || 0)]))
          : message("info", "Aucun apprenant en formation actuellement.")),

      h("section", {},
        h("h2", {}, "Présentation à l'examen"),
        h("p", {}, "Depuis la loi du 27 juin 2026, l'apprenant financé par le CPF doit se présenter à l'examen. Relances systématiques 30 jours, 7 jours et la veille de chaque session."),
        tauxCohortes.data.some((l) => Number(l.inscrits_examen)) ? tableauTaux(tauxCohortes.data, org.taux_presence_depart) : message("info", "Aucun examen enregistré."),
        examensPeriode.length
          ? h("div", { class: "pile pile-serree" }, h("h3", {}, "Examens de la période"),
              tableau(["Date", "Apprenant", "Parcours", "Présence", "Résultat"],
                examensPeriode.map((a) => [dateLisible(a.date_examen), nomApprenant(a), a.parcours,
                  LIBELLE_PRESENCE[a.presence_examen] || "à renseigner", LIBELLE_RESULTAT[a.resultat_examen] || ""])))
          : null,
        examensAVenir.length
          ? h("div", { class: "pile pile-serree" }, h("h3", {}, "Examens à venir"),
              tableau(["Date", "Apprenant", "Parcours", "Dernier contact"],
                examensAVenir.map((a) => [dateLisible(a.date_examen), nomApprenant(a), a.parcours, a.date_dernier_contact ? dateLisible(a.date_dernier_contact) : ""])))
          : null),

      h("section", {},
        h("h2", {}, "Indicateur 27 · Sous-traitance"),
        h("p", {}, "Le suivi téléphonique est confié à Fil Rouge Apprenants dans le cadre d'un contrat de sous-traitance écrit, à joindre à ce dossier avec l'accord de traitement des données (RGPD). Les éléments personnels confiés par les apprenants ne figurent pas dans les comptes rendus transmis à l'organisme.")),

      h("p", { class: "aide dossier-pied" }, "Numérotation des indicateurs : référentiel national qualité applicable au 1er novembre 2026. Ce dossier est une aide à la preuve ; l'appréciation de la conformité revient à l'organisme certificateur."));

    const actions = h("div", { class: "actions-ligne actions-impression" },
      h("button", { type: "button", class: "bouton", onclick: () => window.print() }, "Imprimer ou enregistrer en PDF"),
      h("button", { type: "button", class: "bouton bouton-secondaire", onclick: exporterContacts }, "Contacts (Excel)"),
      h("button", { type: "button", class: "bouton bouton-secondaire", onclick: exporterExamens }, "Examens (Excel)"));

    afficher(
      ...entete,
      h("div", { class: "pile" },
        h("div", { class: "masque-impression" },
          h("p", { class: "surtitre" }, estAdmin ? lienInterne(`examens/${organismeId}`, "← Examens du client") : lienInterne("", "← Vos apprenants")),
          h("p", { class: "chapo" }, "Ce dossier rassemble les preuves du suivi pour votre audit Qualiopi. Choisissez la période, puis imprimez-le ou enregistrez-le en PDF.")),
        h("div", { class: "carte carte-large masque-impression" }, formulairePeriode),
        actions,
        dossier)
    );
    window.scrollTo(0, 0);
  }

  // ===========================================================================
  // FICHE APPRENANT ET « NOTER UN APPEL » (étape 6)
  // ===========================================================================
  //   #/apprenant/<id>   pour l'administratrice, l'appelante (ses apprenants
  //                      confiés) et le client (lecture seule)
  // ===========================================================================

  const COULEUR_RESULTAT_APPEL = { joint: "vert", messagerie: "orange", injoignable: "rouge", refuse_suivi: "neutre" };
  // Suite proposée selon le résultat (modifiable avant d'enregistrer).
  const SUITE_PROPOSEE = {
    joint: ["Point d'étape", 7],
    messagerie: ["Rappeler", 2],
    injoignable: ["Rappeler à un autre moment de la journée", 1],
    refuse_suivi: ["", null],
  };
  const NOTE_PROPOSEE = {
    messagerie: "Message laissé, en attente de rappel.",
    injoignable: "Pas de réponse, pas de messagerie.",
  };

  function lienApprenant(a, texte) {
    return a && a.id ? lienInterne(`apprenant/${a.id}`, texte || nomApprenant(a)) : (texte || nomApprenant(a || {}));
  }

  // Mémorise l'ordre d'une liste pour proposer « Apprenant suivant » sur la fiche.
  function memoriserFile(lignes, retour) {
    etat.file = { ids: lignes.map((l) => l.id).filter(Boolean), retour };
  }

  function maintenantLocal() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  function dateHeureComplete(horodatage) {
    const d = new Date(horodatage);
    const jour = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
    const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
    return `${jour} à ${heure}`;
  }

  function joursDepuis(dateIso) {
    if (!dateIso) return null;
    return Math.round((new Date(`${aujourdhui()}T12:00:00Z`) - new Date(`${dateIso}T12:00:00Z`)) / 86400000);
  }

  // Formulaire « Noter un appel ».
  // options.sansNotes : sans « Compte rendu pour l'organisme » ni « Note interne »
  // (ils ont leurs propres onglets sur la fiche).
  // Statuts d'un appel : plusieurs possibles (ex. Répondeur + Email envoyé).
  const LIBELLE_STATUT_APPEL = {
    joint: "Joint·e",
    repondeur: "Répondeur",
    messagerie_impossible: "Message vocal impossible",
    faux_numero: "Faux numéro",
    injoignable: "Pas de réponse",
    rendez_vous: "Rendez-vous",
    a_relancer: "À relancer",
    suivi_15: "Suivi 15 jours",
    suivi_30: "Suivi 30 jours",
    email_envoye: "Email envoyé",
    sms_envoye: "SMS envoyé",
    refuse_suivi: "Refuse le suivi",
  };
  const COULEUR_STATUT_APPEL = {
    joint: "vert", rendez_vous: "vert", suivi_15: "vert", suivi_30: "vert",
    repondeur: "orange", messagerie_impossible: "orange", a_relancer: "orange", email_envoye: "orange", sms_envoye: "orange",
    faux_numero: "rouge", injoignable: "rouge", refuse_suivi: "neutre",
  };
  // Suite proposée selon les statuts cochés (le premier qui correspond).
  const SUITE_STATUT = [
    ["suivi_15", "Suivi 15 jours", 15],
    ["suivi_30", "Suivi 30 jours", 30],
    ["rendez_vous", "Rendez-vous", null],
    ["a_relancer", "Relancer", 2],
    ["faux_numero", "Demander le bon numéro à l'organisme", 1],
    ["repondeur", "Rappeler", 2],
    ["messagerie_impossible", "Rappeler", 2],
    ["injoignable", "Rappeler", 2],
    ["joint", "Point d'étape", 7],
  ];

  // Menu déroulant à choix multiples.
  function menuStatuts(nom, libelles) {
    const cases = Object.entries(libelles).map(([valeur, texte]) =>
      h("label", { class: "menu-statuts-option" }, h("input", { type: "checkbox", name: nom, value: valeur }), h("span", {}, texte)));
    const resume = h("span", { class: "menu-statuts-resume" }, "Choisir un ou plusieurs statuts");
    const menu = h("details", { class: "menu-statuts" },
      h("summary", {}, resume, h("span", { class: "menu-statuts-fleche", "aria-hidden": "true" }, "▾")),
      h("div", { class: "menu-statuts-liste", role: "group", "aria-label": "Statuts de l'appel" }, cases));
    const valeurs = () => cases.map((c) => c.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
    const majResume = () => {
      const v = valeurs();
      resume.replaceChildren(...(v.length ? v.map((x) => pastille(COULEUR_STATUT_APPEL[x] || "neutre", libelles[x])) : ["Choisir un ou plusieurs statuts"]));
    };
    menu.addEventListener("change", majResume);
    // Clic en dehors : le menu se referme.
    const fermer = (e) => {
      if (!document.body.contains(menu)) return document.removeEventListener("click", fermer);
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    };
    document.addEventListener("click", fermer);
    return { menu, valeurs };
  }

  function formulaireAppel(apprenant, apresEnregistrement, options = {}) {
    const zone = h("div");
    const statuts = menuStatuts("statut-appel", LIBELLE_STATUT_APPEL);
    const choixResultat = statuts.menu;
    const canal = champChoix("appel-canal", "Canal", LIBELLE_CANAL_APPEL, "telephone");
    const quand = champTexte("appel-date", "Date et heure", maintenantLocal(), { type: "datetime-local" });
    const noteClient = champTexte("appel-note-client", "Compte rendu pour l'organisme", "", {
      multiligne: true, placeholder: "Ex. : Joint·e. Reprend le module 4 cette semaine, objectif examen maintenu.",
    });
    const noteInterne = champTexte("appel-note-interne", "Note interne (jamais visible par l'organisme)", "", {
      multiligne: true, placeholder: "Ce que l'apprenant confie de personnel, conseils pour le prochain appel…",
    });
    const suite = champTexte("appel-suite", "Suite prévue", "", { placeholder: "Ex. : Point d'étape" });
    const dateSuite = champTexte("appel-date-suite", "Date de la suite", "", { type: "date" });
    const raccourcis = h("div", { class: "raccourcis" },
      h("span", { class: "aide" }, "Dans :"),
      [["1 j", 1], ["2 j", 2], ["7 j", 7], ["15 j", 15], ["1 mois", 30]].map(([texte, n]) =>
        h("button", { type: "button", class: "puce", onclick: () => { dateSuite.champ.value = ajouterJours(aujourdhui(), n); } }, texte)),
      h("button", { type: "button", class: "puce", onclick: () => { dateSuite.champ.value = ""; suite.champ.value = ""; } }, "Aucune"));
    const conseil = h("div");
    const commentaireAppel = champTexte("appel-commentaire", "Commentaire de l'appel (interne, jamais visible par l'organisme)", "", {
      multiligne: true, placeholder: "Ce qui s'est dit, ce qu'il faut retenir pour le prochain appel…",
    });
    const bouton = h("button", { class: "bouton", type: "submit", title: "Range l'appel dans l'historique et le publie dans les commentaires" }, "Enregistrer");
    const boutonHistorique = h("button", { class: "bouton bouton-secondaire", type: "button", title: "Range l'appel dans l'historique sans rien publier dans les commentaires" }, "Historique seulement");

    // Propositions automatiques tant que la personne n'a rien tapé.
    const toucheParUtilisateur = new Set();
    for (const c of [noteClient.champ, suite.champ, dateSuite.champ]) c.addEventListener("input", () => toucheParUtilisateur.add(c));
    choixResultat.addEventListener("change", () => {
      const choisis = statuts.valeurs();
      const regle = SUITE_STATUT.find(([cle]) => choisis.includes(cle));
      const [, texteSuite, jours] = regle || [null, "", null];
      if (!toucheParUtilisateur.has(suite.champ)) suite.champ.value = texteSuite;
      if (!toucheParUtilisateur.has(dateSuite.champ)) dateSuite.champ.value = jours ? ajouterJours(aujourdhui(), jours) : "";
      const refus = choisis.includes("refuse_suivi");
      signaler(conseil, refus ? "info" : null,
        refus ? "Si l'apprenant arrête sa formation, passez aussi son statut en « Abandon » (sous son nom, onglet Fiche)." : null);
    });

    const formulaire = h("form", { novalidate: true, class: "formulaire" },
      h("div", { class: "groupe" }, h("p", { class: "etiquette" }, "Statut de l'appel"), choixResultat),
      conseil,
      options.sansNotes ? commentaireAppel.bloc : null,
      options.sansNotes ? null : noteClient.bloc,
      options.sansNotes ? null : noteInterne.bloc,
      h("div", { class: "deux-colonnes" }, suite.bloc, dateSuite.bloc),
      raccourcis,
      h("details", { class: "depliant" },
        h("summary", {}, "Canal, date et heure"),
        h("div", { class: "deux-colonnes" }, canal.bloc, quand.bloc)),
      zone,
      h("div", { class: "actions-ligne" }, bouton, boutonHistorique),
      h("p", { class: "aide" }, "« Enregistrer » range l'appel dans l'historique et le publie dans les commentaires. « Historique seulement » le range sans le publier."));

    async function envoyer(publier, b) {
      const choisis = statuts.valeurs();
      if (!choisis.length) return signaler(zone, "erreur", "Choisissez au moins un statut.");
      const date = quand.champ.value ? new Date(quand.champ.value) : new Date();
      if (Number.isNaN(date.getTime())) return signaler(zone, "erreur", "La date et l'heure ne sont pas valables.");
      if (date.getTime() > Date.now() + 10 * 60000) return signaler(zone, "erreur", "La date de l'appel ne peut pas être dans le futur.");
      signaler(zone);
      occupe(b, true, "Enregistrement…");
      const { error } = options.sansNotes
        ? await sb.rpc("enregistrer_appel", {
            p_apprenant: apprenant.id,
            p_statuts: choisis,
            p_commentaire: commentaireAppel.champ.value,
            p_prochaine_action: suite.champ.value,
            p_date_prochaine_action: dateSuite.champ.value || null,
            p_canal: canal.champ.value,
            p_date_appel: date.toISOString(),
            p_publier: publier,
          })
        : await sb.rpc("noter_appel_statuts", {
            p_apprenant: apprenant.id,
            p_statuts: choisis,
            p_canal: canal.champ.value,
            p_date_appel: date.toISOString(),
            p_note_client: noteClient.champ.value,
            p_note_interne: noteInterne.champ.value,
            p_prochaine_action: suite.champ.value,
            p_date_prochaine_action: dateSuite.champ.value || null,
          });
      occupe(b, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
      apresEnregistrement(publier);
    }
    formulaire.addEventListener("submit", (evenement) => { evenement.preventDefault(); envoyer(true, bouton); });
    boutonHistorique.addEventListener("click", () => envoyer(false, boutonHistorique));
    return formulaire;
  }

  function ligneHistorique(appel, options) {
    const { peutSupprimer, apresSuppression } = options;
    const noteInterne = appel.notes_internes && appel.notes_internes.contenu;
    let suppression = null;
    if (peutSupprimer) {
      const zone = h("div");
      const demander = h("button", { type: "button", class: "bouton-lien bouton-lien-danger" }, "Supprimer");
      const confirmer = h("button", { type: "button", class: "bouton-lien bouton-lien-danger", hidden: true }, "Oui, supprimer cet appel");
      const annuler = h("button", { type: "button", class: "bouton-lien", hidden: true }, "Annuler");
      demander.addEventListener("click", () => { demander.hidden = true; confirmer.hidden = false; annuler.hidden = false; });
      annuler.addEventListener("click", () => { demander.hidden = false; confirmer.hidden = true; annuler.hidden = true; });
      confirmer.addEventListener("click", async () => {
        occupe(confirmer, true, "Suppression…");
        const { error } = await sb.from("appels").delete().eq("id", appel.id);
        occupe(confirmer, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        apresSuppression();
      });
      suppression = h("div", { class: "ligne-detail" }, h("div", { class: "actions-secondaires" }, demander, confirmer, annuler), zone);
    }
    return h("li", { class: "ligne ligne-echange" }, ...[
      h("span", { class: "ligne-titre" }, dateHeureComplete(appel.date_appel)),
      h("span", { class: "pastilles" },
        pastille("neutre", LIBELLE_CANAL_APPEL[appel.canal] || appel.canal),
        appel.statuts && appel.statuts.length
          ? appel.statuts.map((x) => pastille(COULEUR_STATUT_APPEL[x] || "neutre", LIBELLE_STATUT_APPEL[x] || x))
          : appel.resultat === "messagerie" && NOTE_MESSAGE_ENVOYE[appel.canal]
            ? pastille("vert", "Message envoyé")
            : pastille(COULEUR_RESULTAT_APPEL[appel.resultat] || "neutre", LIBELLE_RESULTAT_APPEL[appel.resultat] || appel.resultat)),
      appel.note_client ? h("span", { class: "ligne-detail texte-libre" }, appel.note_client) : null,
      appel.prochaine_action || appel.date_prochaine_action
        ? h("span", { class: "ligne-detail" }, "Suite : ", [appel.prochaine_action, appel.date_prochaine_action ? `le ${dateLisible(appel.date_prochaine_action)}` : null].filter(Boolean).join(" "))
        : null,
      noteInterne ? h("div", { class: "ligne-detail note-interne" }, h("strong", {}, "Commentaire (interne) · "), noteInterne, " ",
        peutSupprimer ? boutonEffacer(async () => {
          const r = await sb.from("notes_internes").delete().eq("appel_id", appel.id);
          if (!r.error) apresSuppression();
          return r;
        }, "Effacer la note") : null) : null,
      suppression,
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------------------
  // Bloc « Contacter » de la fiche apprenant (étape 8) : appel, WhatsApp, SMS,
  // email, avec un message tout prêt et modifiable. Tout est gratuit : le bouton
  // ouvre l'application du téléphone avec le texte écrit, la personne n'a plus
  // qu'à appuyer sur « Envoyer ». Ensuite, un clic l'ajoute à l'historique
  // (preuve de suivi Qualiopi). Fonctions pures dans contact.js.
  // ---------------------------------------------------------------------------
  const NOTE_MESSAGE_ENVOYE = { whatsapp: "Message WhatsApp envoyé", sms: "SMS envoyé", email: "Email envoyé" };

  // Fenêtre « Écrire un email » : s'ouvre sur la fiche, texte prêt et modifiable.
  // « Envoyer avec Gmail » ouvre la fenêtre de rédaction de la boîte Fil Rouge,
  // déjà remplie : il ne reste qu'à cliquer « Envoyer » dans Gmail.
  function fenetreEmail(a, { objet = "", texte = "", modele = null, apresEnvoi } = {}) {
    const C = window.FilRougeContact;
    const boite = (window.FIL_ROUGE_CONFIG || {}).emailFilRouge || "";
    const estAdmin = etat.profil?.role === "admin";
    const moi = (etat.profil?.nom_affiche || "").trim().split(" ")[0] || (estAdmin ? "Émilie" : "");
    const contexte = { prenom: a.prenom, moi, organisme: a.organismes?.nom, date_examen: a.date_examen, avancement_pct: a.avancement_pct };

    const choixModeles = { "": "— Message libre —", ...Object.fromEntries(Object.entries(C.MODELES).map(([cle, m]) => [cle, m.titre])) };
    const choix = champChoix("email-modele", "Message tout prêt", choixModeles, modele || "");
    const champObjet = champTexte("email-objet", "Objet", objet);
    const champTexteEmail = champTexte("email-texte", "Message", texte, { multiligne: true });
    champTexteEmail.champ.rows = 10;
    choix.champ.addEventListener("change", () => {
      if (!choix.champ.value) return;
      const r = C.remplir(choix.champ.value, contexte);
      champObjet.champ.value = r.objet || champObjet.champ.value;
      champTexteEmail.champ.value = r.texte;
    });

    const zone = h("div");
    // Administratrice : Gmail Fil Rouge. Appelante : sa propre messagerie (elle n'a pas la boîte Fil Rouge).
    const viaGmail = estAdmin && boite;
    const envoyer = h("button", { type: "submit", class: "bouton" }, viaGmail ? "Envoyer avec Gmail Fil Rouge" : "Ouvrir ma messagerie");
    const autre = viaGmail ? h("button", { type: "button", class: "bouton-lien" }, "Utiliser une autre messagerie") : null;
    const fermer = h("button", { type: "button", class: "bouton bouton-secondaire" }, "Annuler");

    const formulaire = h("form", { class: "formulaire", method: "dialog", novalidate: true },
      h("div", { class: "email-entete" },
        viaGmail ? h("p", {}, h("span", { class: "compteur-libelle" }, "De : "), boite) : null,
        h("p", {}, h("span", { class: "compteur-libelle" }, "À : "), `${nomApprenant(a)} <${a.email}>`)),
      choix.bloc, champObjet.bloc, champTexteEmail.bloc, zone,
      h("div", { class: "actions-ligne" }, envoyer, fermer),
      autre);
    const dialogue = h("dialog", { class: "dialogue", "aria-label": "Écrire un email" },
      h("div", { class: "dialogue-titre" }, h("h2", {}, "Écrire un email"),
        h("button", { type: "button", class: "dialogue-fermer", "aria-label": "Fermer" }, "×")),
      formulaire);

    const fin = () => { dialogue.close(); dialogue.remove(); };
    dialogue.querySelector(".dialogue-fermer").addEventListener("click", fin);
    fermer.addEventListener("click", fin);
    dialogue.addEventListener("cancel", () => setTimeout(() => dialogue.remove(), 0));

    function ouvrir(lien, nouvelOnglet) {
      if (!champObjet.champ.value.trim()) return signaler(zone, "erreur", "Indiquez un objet.");
      if (!champTexteEmail.champ.value.trim()) return signaler(zone, "erreur", "Le message est vide.");
      if (!lien) return signaler(zone, "erreur", "L'adresse email de l'apprenant n'est pas valide.");
      if (nouvelOnglet) window.open(lien, "_blank", "noopener"); else window.location.href = lien;
      fin();
      if (apresEnvoi) setTimeout(apresEnvoi, 300);
    }
    formulaire.addEventListener("submit", (evenement) => {
      evenement.preventDefault();
      const o = champObjet.champ.value, t = champTexteEmail.champ.value;
      ouvrir(viaGmail ? C.lienGmail(a.email, o, t, boite) : C.lienEmail(a.email, o, t), !!viaGmail);
    });
    if (autre) autre.addEventListener("click", () => ouvrir(C.lienEmail(a.email, champObjet.champ.value, champTexteEmail.champ.value), false));

    document.body.append(dialogue);
    dialogue.showModal();
    champTexteEmail.champ.focus();
  }

  function blocContacter(a, rafraichir) {
    const C = window.FilRougeContact;
    const surIphone = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const moi = (etat.profil?.nom_affiche || "").trim().split(" ")[0] || (etat.profil?.role === "admin" ? "Émilie" : "");
    const contexte = { prenom: a.prenom, moi, organisme: a.organismes?.nom, date_examen: a.date_examen, avancement_pct: a.avancement_pct };

    const choixModeles = Object.fromEntries(Object.entries(C.MODELES).map(([cle, m]) => [cle, m.titre]));
    const modele = champChoix("contact-modele", "Message tout prêt", choixModeles, C.modeleConseille(a, aujourdhui()));
    const texte = champTexte("contact-texte", "Texte du message (modifiable)", "", { multiligne: true });
    texte.champ.rows = 6;
    let objet = "";

    const appeler = a.telephone ? h("a", { class: "bouton", href: `tel:${a.telephone.replace(/[^\d+]/g, "")}` }, `📞 Appeler · ${a.telephone}`) : null;
    const whatsapp = h("a", { class: "bouton bouton-secondaire", target: "_blank", rel: "noopener" }, "💬 WhatsApp");
    const sms = h("a", { class: "bouton bouton-secondaire" }, "✉️ SMS");
    const email = h("button", { type: "button", class: "bouton bouton-secondaire" }, "📧 Email");
    const copierTexte = h("button", { type: "button", class: "bouton-lien" }, "Copier le texte");
    copierTexte.addEventListener("click", () => copier(texte.champ.value, copierTexte));

    function majLiens() {
      const liens = [
        [whatsapp, C.lienWhatsApp(a.telephone, texte.champ.value)],
        [sms, C.lienSms(a.telephone, texte.champ.value, surIphone)],
      ];
      email.hidden = !C.lienEmail(a.email, "", "");
      for (const [lien, adresse] of liens) {
        lien.hidden = !adresse;
        if (adresse) lien.setAttribute("href", adresse); else lien.removeAttribute("href");
      }
    }
    function chargerModele() {
      const r = C.remplir(modele.champ.value, contexte);
      texte.champ.value = r.texte;
      objet = r.objet;
      majLiens();
    }
    modele.champ.addEventListener("change", chargerModele);
    texte.champ.addEventListener("input", majLiens);
    chargerModele();

    // Après l'envoi : proposer de l'ajouter à l'historique.
    const zoneConfirmation = h("div");
    function proposerHistorique(canal) {
      const zone = h("div");
      const oui = h("button", { type: "button", class: "bouton bouton-petit" }, "Oui, l'ajouter à l'historique");
      const non = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "Non, pas envoyé");
      non.addEventListener("click", () => zoneConfirmation.replaceChildren());
      oui.addEventListener("click", async () => {
        occupe(oui, true, "Enregistrement…");
        const { error } = await sb.rpc("noter_appel", {
          p_apprenant: a.id,
          p_resultat: "messagerie",
          p_canal: canal,
          p_date_appel: new Date().toISOString(),
          p_note_client: `${NOTE_MESSAGE_ENVOYE[canal]} : ${C.MODELES[modele.champ.value].titre.toLowerCase()}.`,
          p_note_interne: "",
          p_prochaine_action: "",
          p_date_prochaine_action: null,
        });
        occupe(oui, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        rafraichir(`${NOTE_MESSAGE_ENVOYE[canal]} : ajouté à l'historique.`);
      });
      zoneConfirmation.replaceChildren(
        h("div", { class: "message message-action pile pile-serree" },
          h("strong", {}, `${NOTE_MESSAGE_ENVOYE[canal]} ?`),
          h("div", { class: "actions-ligne" }, oui, non),
          zone));
    }
    whatsapp.addEventListener("click", () => setTimeout(() => proposerHistorique("whatsapp"), 300));
    sms.addEventListener("click", () => setTimeout(() => proposerHistorique("sms"), 300));
    email.addEventListener("click", () => fenetreEmail(a, {
      objet, texte: texte.champ.value, modele: modele.champ.value,
      apresEnvoi: () => proposerHistorique("email"),
    }));

    const manque = !a.telephone && !a.email ? "Pas de numéro de téléphone ni d'adresse email sur la fiche."
      : !a.telephone ? "Pas de numéro de téléphone sur la fiche." : !a.email ? "Pas d'adresse email sur la fiche." : null;

    return h("section", {},
      h("div", { class: "section-titre" }, h("h2", {}, "Contacter")),
      h("div", { class: "carte carte-large pile pile-serree" },
        h("div", { class: "actions-ligne" }, appeler, whatsapp, sms, email),
        manque ? h("p", { class: "aide" }, manque) : null,
        h("div", { class: "formulaire" }, modele.bloc, texte.bloc),
        h("p", { class: "aide" }, "WhatsApp et SMS s'ouvrent avec ce texte déjà écrit. « Email » ouvre une fenêtre pour relire l'email avant de l'envoyer depuis la boîte Fil Rouge. ", copierTexte),
        zoneConfirmation));
  }

  // Deux compteurs bien séparés en haut de la fiche :
  //  - « Tentatives de contact » : tout ce qui a été noté, quel que soit le résultat
  //    (joint·e, message laissé, injoignable, refus) et le canal (appel, SMS, email) ;
  //  - « Contacts aboutis » : uniquement les fois où la personne a été réellement eue (résultat « Joint·e »).
  function blocCompteursContact(listeAppels) {
    const tentatives = listeAppels.length;
    const aboutis = listeAppels.filter((c) => c.resultat === "joint").length;
    const appelsTel = listeAppels.filter((c) => c.canal === "telephone").length;
    const messages = tentatives - appelsTel;
    const detailTentatives = messages
      ? `${pluriel(appelsTel, "appel", "appels")} + ${pluriel(messages, "message", "messages")} (SMS, email)`
      : "tous résultats confondus";
    const detailAboutis = tentatives
      ? `${Math.round((100 * aboutis) / tentatives)} % des tentatives`
      : "aucune tentative pour l'instant";
    return h("div", { class: "compteurs compteurs-deux", role: "group", "aria-label": "Bilan des contacts" },
      h("div", { class: "compteur" },
        h("span", { class: "compteur-valeur" }, String(tentatives)),
        h("span", { class: "compteur-titre" }, tentatives > 1 ? "tentatives de contact" : "tentative de contact"),
        h("span", { class: "compteur-libelle" }, detailTentatives)),
      h("div", { class: `compteur ${aboutis ? "compteur-vert" : ""}` },
        h("span", { class: "compteur-valeur" }, String(aboutis)),
        h("span", { class: "compteur-titre" }, aboutis > 1 ? "contacts aboutis" : "contact abouti"),
        h("span", { class: "compteur-libelle" }, `personne réellement eue · ${detailAboutis}`)));
  }

  // Bouton « Effacer » en deux temps (« Effacer » puis « Oui, effacer »).
  // Réservé à l'administratrice : renvoie null pour les autres.
  function boutonEffacer(action, texte = "Effacer") {
    if (etat.profil?.role !== "admin") return null;
    const zone = h("span");
    const demander = h("button", { type: "button", class: "bouton-lien bouton-lien-danger bouton-effacer" }, texte);
    const confirmer = h("button", { type: "button", class: "bouton-lien bouton-lien-danger bouton-effacer", hidden: true }, "Oui, effacer");
    const annuler = h("button", { type: "button", class: "bouton-lien bouton-effacer", hidden: true }, "Annuler");
    const basculer = (oui) => { demander.hidden = oui; confirmer.hidden = !oui; annuler.hidden = !oui; };
    demander.addEventListener("click", () => basculer(true));
    annuler.addEventListener("click", () => basculer(false));
    confirmer.addEventListener("click", async () => {
      occupe(confirmer, true, "…");
      const { error } = await action();
      occupe(confirmer, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
    });
    return h("span", { class: "effacer" }, demander, confirmer, annuler, zone);
  }

  // --- Fil de commentaires (bandeau de droite de la fiche) ---
  // Les plus récents en premier. Appels, notes internes et coaching s'y ajoutent
  // tout seuls (la base s'en charge) ; on peut aussi écrire en direct.
  const SOURCE_COMMENTAIRE = {
    manuel: ["💬", "Commentaire"],
    appel: ["📞", "Appel"],
    note_interne: ["🔒", "Note interne"],
    coaching: ["🎯", "Coaching"],
    compte_rendu: ["📄", "Compte rendu organisme"],
  };

  function blocCommentaires(a, liste) {
    const commentaires = (liste || []).slice();
    let filtre = "tous";
    const zone = h("div");
    const champ = h("textarea", { class: "commentaire-champ", rows: "3", maxlength: "4000", placeholder: "Écrire un commentaire…", "aria-label": "Nouveau commentaire" });
    const publier = h("button", { type: "submit", class: "bouton bouton-petit" }, "Publier");
    const formulaire = h("form", { class: "commentaire-formulaire", novalidate: true }, champ, h("div", { class: "commentaire-actions" }, h("span", { class: "aide" }, "Ctrl + Entrée pour publier"), publier), zone);
    const listeEl = h("ol", { class: "commentaires-liste" });
    const filtres = h("div", { class: "commentaires-filtres", role: "group", "aria-label": "Filtrer les commentaires" });

    function ligne(c) {
      const [icone, libelle] = SOURCE_COMMENTAIRE[c.source] || ["💬", "Commentaire"];
      return h("li", { class: `commentaire commentaire-${c.source}` },
        h("div", { class: "commentaire-tete" },
          h("span", { class: "commentaire-source" }, `${icone} ${libelle}`),
          h("span", { class: "commentaire-date" }, dateHeureComplete(c.cree_le))),
        h("p", { class: "commentaire-texte" }, c.contenu),
        h("div", { class: "commentaire-pied" },
          c.auteur_nom ? h("span", { class: "commentaire-auteur" }, c.auteur_nom) : h("span"),
          boutonEffacer(async () => {
            const r = await sb.from("commentaires").delete().eq("id", c.id);
            if (!r.error) { const i = commentaires.indexOf(c); if (i >= 0) commentaires.splice(i, 1); dessiner(); }
            return r;
          })));
    }
    function dessiner() {
      const compte = (src) => commentaires.filter((c) => src === "tous" || c.source === src).length;
      filtres.replaceChildren(...[["tous", "Tout"], ["manuel", "Commentaires"], ["appel", "Appels"], ["note_interne", "Notes"], ["coaching", "Coaching"], ["compte_rendu", "Comptes rendus"]]
        .filter(([cle]) => cle === "tous" || compte(cle))
        .map(([cle, texte]) => {
          const b = h("button", { type: "button", class: `filtre filtre-source-${cle}`, "aria-pressed": String(cle === filtre) }, texte, h("span", { class: "filtre-nombre" }, String(compte(cle))));
          b.addEventListener("click", () => { filtre = cle; dessiner(); });
          return b;
        }));
      const visibles = commentaires.filter((c) => filtre === "tous" || c.source === filtre);
      listeEl.replaceChildren(...(visibles.length ? visibles.map(ligne) : [h("li", { class: "aide" }, "Aucun commentaire pour l'instant.")]));
    }
    async function envoyer() {
      const texte = champ.value.trim();
      if (!texte) return;
      occupe(publier, true, "…");
      const { data, error } = await sb.from("commentaires")
        .insert({ apprenant_id: a.id, organisme_id: a.organisme_id, contenu: texte })
        .select("id, source, contenu, cree_le, auteur_nom").single();
      occupe(publier, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
      signaler(zone);
      champ.value = "";
      commentaires.unshift(data);
      filtre = "tous";
      dessiner();
    }
    formulaire.addEventListener("submit", (e) => { e.preventDefault(); envoyer(); });
    champ.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); envoyer(); } });
    dessiner();

    return h("section", { class: "commentaires" },
      h("div", { class: "commentaires-titre" }, h("h2", {}, "Commentaires"), h("span", { class: "aide" }, "🔒 Équipe Fil Rouge")),
      formulaire, filtres, listeEl);
  }

  // --- Situation personnelle (équipe Fil Rouge uniquement, jamais visible du client) ---
  const LIBELLE_SITUATION_PRO = {
    demandeur_emploi: "Demandeur·se d'emploi",
    salarie: "Salarié·e",
    independant: "Indépendant·e",
    etudiant: "Étudiant·e / alternant·e",
    sans_activite: "Sans activité (foyer, congé parental…)",
    autre: "Autre situation",
  };
  const LIBELLE_SITUATION_FAMILIALE = {
    celibataire: "Célibataire",
    en_couple: "En couple",
    marie_pacse: "Marié·e / pacsé·e",
    separe_divorce: "Séparé·e / divorcé·e",
    veuf: "Veuf·ve",
  };
  const EN_EMPLOI = ["salarie", "independant"];

  function ageDepuis(dateNaissance) {
    if (!dateNaissance) return null;
    const [ay, am, aj] = aujourdhui().split("-").map(Number);
    const [ny, nm, nj] = dateNaissance.split("-").map(Number);
    return ay - ny - (am < nm || (am === nm && aj < nj) ? 1 : 0);
  }

  function blocSituationPerso(a, sit, apresEnregistrement) {
    const f = sit || {};
    const age = ageDepuis(f.date_naissance);
    const travail = f.situation_pro
      ? LIBELLE_SITUATION_PRO[f.situation_pro] + (EN_EMPLOI.includes(f.situation_pro) && f.heures_travail !== null && f.heures_travail !== undefined ? ` · ${f.heures_travail} h/semaine` : "")
      : null;
    const enfants = f.nombre_enfants === null || f.nombre_enfants === undefined ? null
      : f.nombre_enfants === 0 ? "Pas d'enfant" : pluriel(f.nombre_enfants, "enfant", "enfants");
    const caseInfo = (libelle, valeur) => h("div", { class: "perso-case" },
      h("span", { class: "compteur-libelle" }, libelle),
      h("span", { class: valeur ? "perso-valeur" : "perso-valeur perso-vide" }, valeur || "à renseigner"));

    // Formulaire de modification
    const zone = h("div");
    const naissance = h("input", { type: "date", value: f.date_naissance || "", min: "1920-01-01", max: "2015-12-31" });
    const pro = champChoix("perso-pro", "Situation professionnelle", { "": "— Non renseignée —", ...LIBELLE_SITUATION_PRO }, f.situation_pro || "");
    const heures = h("input", { type: "number", min: "0", max: "70", step: "1", inputmode: "numeric", value: f.heures_travail ?? "" });
    const blocHeures = h("label", {}, "Heures de travail par semaine", heures);
    const famille = champChoix("perso-famille", "Situation familiale", { "": "— Non renseignée —", ...LIBELLE_SITUATION_FAMILIALE }, f.situation_familiale || "");
    const nbEnfants = h("input", { type: "number", min: "0", max: "15", step: "1", inputmode: "numeric", value: f.nombre_enfants ?? "" });
    const contraintes = champTexte("perso-contraintes", "Contraintes utiles au suivi (facultatif)", f.contraintes || "", { multiligne: true });
    contraintes.champ.rows = 2;
    contraintes.champ.maxLength = 500;
    contraintes.champ.placeholder = "Ex. : garde des enfants le mercredi, travaille en horaires décalés";
    const majHeures = () => { blocHeures.hidden = !EN_EMPLOI.includes(pro.champ.value); };
    pro.champ.addEventListener("change", majHeures);
    majHeures();
    const bouton = h("button", { type: "submit", class: "bouton bouton-petit" }, "Enregistrer");
    const formulaire = h("form", { class: "formulaire", novalidate: true },
      h("div", { class: "deux-colonnes" }, h("label", {}, "Date de naissance", naissance), h("label", {}, "Nombre d'enfants", nbEnfants)),
      h("div", { class: "deux-colonnes" }, pro.bloc, famille.bloc),
      blocHeures, contraintes.bloc, zone, bouton);
    const entier = (champ) => (champ.value === "" ? null : Math.round(Number(champ.value)));
    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      const h_ = entier(heures), e_ = entier(nbEnfants);
      if (h_ !== null && (h_ < 0 || h_ > 70)) return signaler(zone, "erreur", "Heures de travail : entre 0 et 70 par semaine.");
      if (e_ !== null && (e_ < 0 || e_ > 15)) return signaler(zone, "erreur", "Nombre d'enfants : entre 0 et 15.");
      if (naissance.value && (naissance.value < "1920-01-01" || naissance.value > "2015-12-31")) return signaler(zone, "erreur", "Vérifiez la date de naissance.");
      occupe(bouton, true, "Enregistrement…");
      const { error } = await sb.from("situation_personnelle").upsert({
        apprenant_id: a.id,
        organisme_id: a.organisme_id,
        date_naissance: naissance.value || null,
        situation_pro: pro.champ.value || null,
        heures_travail: EN_EMPLOI.includes(pro.champ.value) ? h_ : null,
        situation_familiale: famille.champ.value || null,
        nombre_enfants: e_,
        contraintes: contraintes.champ.value.trim() || null,
      }, { onConflict: "apprenant_id" });
      occupe(bouton, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
      apresEnregistrement();
    });
    const vide = !sit;
    const editeur = h("details", { class: "formation-modifier", open: vide ? true : null },
      h("summary", {}, vide ? "Renseigner la situation" : "Modifier"), formulaire);

    return h("section", { class: "carte carte-large perso", "aria-label": "Situation personnelle" },
      h("div", { class: "perso-entete" },
        h("p", { class: "surtitre" }, "Situation personnelle et professionnelle"),
        h("span", { class: "aide" }, "🔒 Visible par l'équipe Fil Rouge uniquement")),
      h("div", { class: "perso-grille" },
        caseInfo("Âge", age === null ? null : `${age} ans`),
        caseInfo("Situation pro", travail),
        caseInfo("Situation familiale", f.situation_familiale ? LIBELLE_SITUATION_FAMILIALE[f.situation_familiale] : null),
        caseInfo("Enfants", enfants)),
      f.contraintes ? h("p", { class: "perso-contraintes" }, f.contraintes) : null,
      editeur);
  }

  // Bandeau « Action de formation » en haut de la fiche : entrée officielle,
  // sortie, et où en est l'apprenant entre les deux. L'administratrice modifie les dates ici.
  // Durée lisible entre deux dates : « 6 mois (182 jours) ».
  function dureeLisible(debut, fin) {
    const jours = joursDepuis(debut) - joursDepuis(fin) + 1;
    const [y1, m1, d1] = debut.split("-").map(Number);
    const [y2, m2, d2] = fin.split("-").map(Number);
    const mois = Math.round(((y2 - y1) * 12 + (m2 - m1) + (d2 - d1 + 1) / 30.44) * 2) / 2;
    const texteMois = mois >= 1 ? `${String(mois).replace(".", ",")} mois` : null;
    const texteJours = pluriel(jours, "jour", "jours");
    return texteMois ? `${texteMois} (${texteJours})` : texteJours;
  }

  function blocActionFormation(a, estAdmin, apresEnregistrement) {
    const e = a.date_entree_formation, s = a.date_sortie_formation;
    const ajd = aujourdhui();
    let avancement = null, ou = null;
    if (e && s) {
      const total = Math.max(1, joursDepuis(e) - joursDepuis(s));
      const fait = Math.min(Math.max(joursDepuis(e), 0), total);
      avancement = Math.round((100 * fait) / total);
      ou = ajd < e ? `démarre ${ecartJours(e)}`
        : ajd > s ? `formation terminée depuis ${joursDepuis(s)} j`
        : `jour ${fait + 1} sur ${total + 1} · fin ${ecartJours(s)}`;
    } else if (e) {
      ou = ajd < e ? `démarre ${ecartJours(e)}` : `en formation depuis ${joursDepuis(e)} j`;
    }
    const case_ = (libelle, date) => h("div", { class: "formation-date" },
      h("span", { class: "compteur-libelle" }, libelle),
      h("span", { class: "formation-valeur" }, date ? dateLisible(date) : "à renseigner"));

    let editeur = null;
    if (estAdmin) {
      const zone = h("div");
      const champE = h("input", { type: "date", value: e || "", "aria-label": "Entrée en formation" });
      const champS = h("input", { type: "date", value: s || "", "aria-label": "Sortie de formation" });
      const bouton = h("button", { type: "submit", class: "bouton bouton-petit" }, "Enregistrer");
      const formulaire = h("form", { class: "editeur-examen", novalidate: true },
        h("label", {}, "Entrée officielle", champE), h("label", {}, "Sortie de formation", champS), bouton, zone);
      formulaire.addEventListener("submit", async (evenement) => {
        evenement.preventDefault();
        if (champE.value && champS.value && champS.value < champE.value) return signaler(zone, "erreur", "La sortie doit être après l'entrée en formation.");
        occupe(bouton, true, "Enregistrement…");
        const { error } = await sb.from("apprenants")
          .update({ date_entree_formation: champE.value || null, date_sortie_formation: champS.value || null }).eq("id", a.id);
        occupe(bouton, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        apresEnregistrement();
      });
      editeur = h("details", { class: "formation-modifier", open: !e && !s ? true : null },
        h("summary", {}, e || s ? "Modifier les dates" : "Renseigner les dates"), formulaire);
    }

    return h("section", { class: "formation formation-compacte", "aria-label": "Action de formation" },
      h("p", { class: "surtitre" }, "Action de formation"),
      h("div", { class: "formation-dates" },
        case_("Entrée officielle", e), h("span", { class: "formation-fleche", "aria-hidden": "true" }, "→"), case_("Sortie de formation", s),
        e && s ? h("div", { class: "formation-date formation-duree-bloc" },
          h("span", { class: "compteur-libelle" }, "Durée"),
          h("span", { class: "formation-valeur" }, dureeLisible(e, s))) : null),
      avancement !== null
        ? h("div", { class: "formation-barre", role: "progressbar", "aria-valuenow": String(avancement), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Avancée dans la période de formation" },
            (() => { const remplissage = h("span"); remplissage.style.width = `${avancement}%`; return remplissage; })())
        : null,
      ou ? h("p", { class: "aide" }, ou) : null,
      editeur);
  }

  async function ecranApprenant(id, info) {
    const role = etat.profil?.role;
    const estAdmin = role === "admin";
    const peutNoter = estAdmin || role === "appelante";
    const entete = () => (estAdmin ? [navigationAdmin("rappels")] : []);
    afficher(...entete(), h("p", { class: "chargement" }, "Chargement de la fiche…"));

    const [apprenant, appels, coaching, situation, commentaires, comptesRendus] = await Promise.all([
      sb.from("apprenants")
        .select("id, organisme_id, appelante_id, identifiant_externe, prenom, nom, telephone, email, parcours, date_inscription, date_entree_formation, date_sortie_formation, avancement_pct, derniere_connexion, statut, date_dernier_contact, cree_le, date_examen, presence_examen, resultat_examen, organismes ( nom, seuil_vert_jours, seuil_orange_jours )")
        .eq("id", id).maybeSingle(),
      sb.from("appels")
        .select(peutNoter
          ? "id, date_appel, canal, resultat, statuts, note_client, prochaine_action, date_prochaine_action, auteur_id, notes_internes ( contenu )"
          : "id, date_appel, canal, resultat, statuts, note_client, prochaine_action, date_prochaine_action")
        .eq("apprenant_id", id).order("date_appel", { ascending: false }).order("id"),
      sb.from("coaching").select("*").eq("apprenant_id", id).maybeSingle(),
      // Situation personnelle : équipe Fil Rouge seulement (la base refuse au client).
      peutNoter ? sb.from("situation_personnelle").select("*").eq("apprenant_id", id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      // Fil de commentaires : équipe Fil Rouge seulement.
      peutNoter
        ? sb.from("commentaires").select("id, source, contenu, cree_le, auteur_nom").eq("apprenant_id", id).order("cree_le", { ascending: false }).limit(300)
        : Promise.resolve({ data: [], error: null }),
      sb.from("comptes_rendus").select("id, contenu, cree_le, auteur_nom").eq("apprenant_id", id).order("cree_le", { ascending: false }),
    ]);
    const erreur = apprenant.error || appels.error || coaching.error || situation.error || commentaires.error || comptesRendus.error;
    if (erreur) return afficher(...entete(), message("erreur", texteErreur(erreur)));
    const retourParDefaut = estAdmin ? (apprenant.data ? `eleves/${apprenant.data.organisme_id}` : "rappels") : "";
    if (!apprenant.data) {
      return afficher(...entete(), message("info", "Cette fiche n'existe pas ou ne vous est pas accessible."), lienInterne(retourParDefaut, "← Retour à la liste"));
    }

    const a = apprenant.data;
    const org = a.organismes || {};
    if (estAdmin) { etat.dossierActif = a.organisme_id; marquerActif(); }
    const rafraichir = (texte) => ecranApprenant(id, texte);

    // Jours sans contact et couleur, comme dans « Qui rappeler ».
    const reference = a.date_dernier_contact || a.date_inscription || (a.cree_le || "").slice(0, 10);
    const jours = joursDepuis(reference);
    const couleur = jours === null ? "neutre" : jours <= (org.seuil_vert_jours ?? 7) ? "vert" : jours <= (org.seuil_orange_jours ?? 14) ? "orange" : "rouge";

    // Apprenant suivant dans la dernière liste consultée.
    const file = etat.file && etat.file.ids.includes(id) ? etat.file : null;
    const suivantId = file ? file.ids[file.ids.indexOf(id) + 1] : null;
    const retour = file ? file.retour : retourParDefaut;

    // --- Statut de l'apprenant : petit sélecteur sur la fiche (administratrice) ---
    let blocStatut = null;
    if (estAdmin) {
      const choix = h("select", { class: "statut-choix", "aria-label": "Statut de l'apprenant" },
        Object.entries(LIBELLE_STATUT).map(([v, t]) => h("option", { value: v }, t)));
      choix.value = a.statut;
      const zone = h("span");
      choix.addEventListener("change", async () => {
        choix.disabled = true;
        const { error } = await sb.from("apprenants").update({ statut: choix.value }).eq("id", id);
        choix.disabled = false;
        if (error) { choix.value = a.statut; return signaler(zone, "erreur", texteErreur(error)); }
        rafraichir(choix.value === "actif" ? "Statut enregistré : en formation." : `Statut enregistré : ${LIBELLE_STATUT[choix.value].toLowerCase()}. L'apprenant sort de « Qui rappeler ».`);
      });
      blocStatut = h("label", { class: "statut-fiche" }, h("span", { class: "compteur-libelle" }, "Statut"), choix, zone);
    }

    // --- Examen ---
    const resumeExamen = a.date_examen
      ? [`Le ${dateLisible(a.date_examen)} (${ecartJours(a.date_examen).replace("en retard de", "il y a")})`,
         a.presence_examen ? LIBELLE_PRESENCE[a.presence_examen] : null,
         a.resultat_examen ? LIBELLE_RESULTAT[a.resultat_examen] : null].filter(Boolean).join(" · ")
      : "Pas encore de date d'examen.";
    const blocExamen = h("div", { class: "pile-serree" },
      h("p", {}, resumeExamen),
      estAdmin ? editeurExamen(a, () => rafraichir("Examen enregistré.")) : null);


    const ligneHisto = (ap) => ligneHistorique(ap, { peutSupprimer: estAdmin, apresSuppression: () => rafraichir("Appel supprimé.") });
    const historique = appels.data.length
      ? h("ul", { class: "liste" }, appels.data.map(ligneHisto))
      : message("info", "Aucun appel pour l'instant.");

    // --- Notes internes : écrites ici ou lors d'un appel ; elles vont aussi dans le fil de commentaires ---
    const notesInternes = (commentaires.data || []).filter((c) => c.source === "note_interne");
    const panneauInternes = h("section", { class: "pile-serree" },
      h("div", { class: "section-titre" }, h("h2", {}, "Notes internes"), h("p", {}, "🔒 Équipe Fil Rouge uniquement")),
      peutNoter ? (() => {
        const zone = h("div");
        const champNote = h("textarea", { rows: "4", maxlength: "4000", class: "commentaire-champ", placeholder: "Écrire une note interne… (jamais visible par l'organisme)", "aria-label": "Nouvelle note interne" });
        const bouton = h("button", { type: "submit", class: "bouton bouton-petit" }, "Ajouter la note");
        const form = h("form", { class: "carte carte-large pile-serree zone-note-interne", novalidate: true }, champNote, zone, h("div", { class: "actions-ligne" }, bouton));
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const texte = champNote.value.trim();
          if (!texte) return signaler(zone, "erreur", "La note est vide.");
          occupe(bouton, true, "Enregistrement…");
          const { error } = await sb.from("commentaires").insert({ apprenant_id: a.id, organisme_id: a.organisme_id, source: "note_interne", contenu: texte });
          occupe(bouton, false);
          if (error) return signaler(zone, "erreur", texteErreur(error));
          rafraichir("Note interne ajoutée, aussi dans les commentaires.");
        });
        return form;
      })() : null,
      notesInternes.length
        ? h("ol", { class: "commentaires-liste" }, notesInternes.map((c) => h("li", { class: "commentaire commentaire-note_interne" },
            h("div", { class: "commentaire-tete" }, h("span", { class: "commentaire-source" }, "🔒 Note interne"), h("span", { class: "commentaire-date" }, dateHeureComplete(c.cree_le))),
            h("p", { class: "commentaire-texte" }, c.contenu),
            h("div", { class: "commentaire-pied" },
              c.auteur_nom ? h("span", { class: "commentaire-auteur" }, c.auteur_nom) : h("span"),
              boutonEffacer(async () => {
                const r = await sb.from("commentaires").delete().eq("id", c.id);
                if (!r.error) rafraichir("Note interne effacée.");
                return r;
              })))))
        : message("info", "Aucune note interne pour l'instant."));

    // --- Compte rendu pour l'organisme : ce que voit le client ---
    // Comptes rendus écrits ici (avec le dernier coaching ou le dernier appel en un clic)
    // + comptes rendus des appels, du plus récent au plus ancien.
    const texteAppel = (ap) => [
      `${dateLisible(ap.date_appel.slice(0, 10))} · ${LIBELLE_CANAL_APPEL[ap.canal] || ap.canal} · ${LIBELLE_RESULTAT_APPEL[ap.resultat] || ap.resultat}`,
      ap.note_client || "",
      ap.prochaine_action || ap.date_prochaine_action ? `Suite : ${[ap.prochaine_action, ap.date_prochaine_action ? `le ${dateLisible(ap.date_prochaine_action)}` : null].filter(Boolean).join(" ")}` : "",
    ].filter(Boolean).join("\n");
    const elements = [
      ...comptesRendus.data.map((cr) => ({ type: "ecrit", date: cr.cree_le, cr })),
      ...appels.data.filter((ap) => ap.note_client || ap.prochaine_action).map((ap) => ({ type: "appel", date: ap.date_appel, ap })),
    ].sort((x, y) => y.date.localeCompare(x.date));
    const texteCompteRendu = () => [
      `Compte rendu de suivi — ${nomApprenant(a)}${a.parcours ? ` (${a.parcours})` : ""}`, "",
      ...elements.slice().reverse().map((el) => el.type === "appel" ? texteAppel(el.ap) : `${dateLisible(el.date.slice(0, 10))} · Compte rendu\n${el.cr.contenu}`),
    ].join("\n\n");
    const copierCompteRendu = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "Copier tout le suivi");
    copierCompteRendu.addEventListener("click", () => copier(texteCompteRendu(), copierCompteRendu));

    let redaction = null;
    if (peutNoter) {
      const zone = h("div");
      const champCR = h("textarea", { rows: "8", maxlength: "6000", class: "commentaire-champ", placeholder: `Écrire le compte rendu pour ${org.nom || "l'organisme"}…`, "aria-label": "Compte rendu pour l'organisme" });
      const inserer = (texte) => {
        champCR.value = [champCR.value.trim(), texte].filter(Boolean).join("\n\n");
        champCR.focus();
      };
      // Dernier commentaire coaching (bandeau de droite) et dernier appel.
      const dernierCoaching = (commentaires.data || []).find((c) => c.source === "coaching");
      const dernierAppel = appels.data[0];
      const boutonCoaching = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit bouton-coaching", disabled: dernierCoaching ? null : true }, "＋ Dernier commentaire coaching");
      boutonCoaching.addEventListener("click", () => inserer(dernierCoaching.contenu.replace(/^Coaching( · [^\n]*)?\n\n/, "")));
      const boutonAppel = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit", disabled: dernierAppel ? null : true }, "＋ Dernier appel");
      boutonAppel.addEventListener("click", () => inserer(texteAppel(dernierAppel)));
      const publier = h("button", { type: "submit", class: "bouton" }, "Publier pour l'organisme");
      redaction = h("form", { class: "carte carte-large pile-serree", novalidate: true },
        h("div", { class: "actions-ligne" }, boutonCoaching, boutonAppel),
        champCR, zone,
        h("div", { class: "actions-ligne" }, publier),
        h("p", { class: "aide" }, `Publié, il est visible tout de suite par ${org.nom || "l'organisme"} et s'ajoute à tes commentaires. Ne mets jamais ici ce qui relève des notes internes.`));
      redaction.addEventListener("submit", async (e) => {
        e.preventDefault();
        const texte = champCR.value.trim();
        if (!texte) return signaler(zone, "erreur", "Le compte rendu est vide.");
        occupe(publier, true, "Publication…");
        const { error } = await sb.from("comptes_rendus").insert({ apprenant_id: a.id, organisme_id: a.organisme_id, contenu: texte });
        occupe(publier, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        rafraichir("Compte rendu publié pour l'organisme.");
      });
    }

    const panneauCompteRendu = h("section", { class: "pile-serree" },
      h("div", { class: "section-titre" }, h("h2", {}, "Compte rendu pour l'organisme"), h("p", {}, pluriel(elements.length, "élément", "éléments"))),
      redaction,
      elements.length && peutNoter ? h("div", { class: "actions-ligne" }, copierCompteRendu) : null,
      elements.length
        ? h("ul", { class: "liste" }, elements.map((el) => el.type === "ecrit"
            ? h("li", { class: "ligne ligne-echange" },
                h("span", { class: "ligne-titre" }, dateHeureComplete(el.cr.cree_le)),
                h("span", { class: "pastilles" }, pastille("vert", "Compte rendu")),
                h("span", { class: "ligne-detail texte-libre" }, el.cr.contenu),
                el.cr.auteur_nom ? h("span", { class: "ligne-detail aide" }, el.cr.auteur_nom) : null,
                h("span", { class: "ligne-detail" }, boutonEffacer(async () => {
                  const r = await sb.from("comptes_rendus").delete().eq("id", el.cr.id);
                  if (!r.error) rafraichir("Compte rendu effacé : l'organisme ne le voit plus.");
                  return r;
                }, "Effacer ce compte rendu")))
            : h("li", { class: "ligne ligne-echange" },
                h("span", { class: "ligne-titre" }, dateHeureComplete(el.ap.date_appel)),
                h("span", { class: "pastilles" }, pastille(COULEUR_RESULTAT_APPEL[el.ap.resultat] || "neutre", LIBELLE_RESULTAT_APPEL[el.ap.resultat] || el.ap.resultat)),
                el.ap.note_client ? h("span", { class: "ligne-detail texte-libre" }, el.ap.note_client) : null,
                el.ap.prochaine_action || el.ap.date_prochaine_action
                  ? h("span", { class: "ligne-detail" }, "Suite : ", [el.ap.prochaine_action, el.ap.date_prochaine_action ? `le ${dateLisible(el.ap.date_prochaine_action)}` : null].filter(Boolean).join(" "))
                  : null,
                h("span", { class: "ligne-detail" }, boutonEffacer(async () => {
                  const r = await sb.from("appels").update({ note_client: null, prochaine_action: null, date_prochaine_action: null }).eq("id", el.ap.id);
                  if (!r.error) rafraichir("Compte rendu de l'appel effacé (l'appel reste dans l'historique).");
                  return r;
                }, "Effacer ce compte rendu")))))
        : message("info", "Aucun compte rendu pour l'instant."));

    // --- Onglets en haut de la fiche ---
    const memo = etat.ongletFiche && etat.ongletFiche.id === id ? etat.ongletFiche : { id, onglet: lireRoute().onglet || "fiche", partie: lireRoute().partie || "stage" };
    etat.ongletFiche = memo;
    // Contacter : sur la fiche. Noter l'appel (résultat, suite prévue, date) : onglet Statut.
    const blocContacterFiche = peutNoter ? blocContacter(a, rafraichir) : null;
    const panneauStatut = peutNoter
      ? h("section", { class: "pile-serree" },
          h("div", { class: "section-titre" }, h("h2", {}, "Statut de l'appel"), h("p", {}, "Résultat, suite prévue et date de la suite")),
          h("p", { class: "aide" }, "Le compte rendu pour l'organisme et les notes internes s'écrivent dans leurs onglets."),
          h("div", { class: "carte carte-large" }, formulaireAppel(a, (publie) => rafraichir(publie
            ? "Appel enregistré et publié dans les commentaires. Le compteur repart à zéro."
            : "Appel rangé dans l'historique (non publié). Le compteur repart à zéro."), { sansNotes: true })),
          h("div", { class: "section-titre" }, h("h2", {}, "Historique"), h("p", {}, pluriel(appels.data.length, "contact", "contacts"))),
          appels.data.length
            ? h("ul", { class: "liste" }, appels.data.map(ligneHisto))
            : message("info", "Aucun appel pour l'instant."))
      : null;
    const panneauHistorique = h("section", { class: "pile-serree" },
      h("div", { class: "section-titre" }, h("h2", {}, "Historique d'appels"), h("p", {}, pluriel(appels.data.length, "contact", "contacts"))),
      historique);
    const panneauCoaching = blocCoachingFiche(a, coaching.data, peutNoter, rafraichir, clientPeut("voir_examens") ? blocExamen : null, memo);
    const nb = (n) => (n ? ` (${n})` : "");
    // Onglet « Fiche » : identité, action de formation, situation, chiffres.
    // Chaque autre onglet s'ouvre seul, à la place de la fiche.
    const panneauFiche = h("div", { class: "pile" });
    // Client : seulement les rubriques autorisées dans « Accès clients ».
    const listeOnglets = peutNoter
      ? [["fiche", "Fiche", panneauFiche],
         ["historique", `Historique d'appels${nb(appels.data.length)}`, panneauHistorique],
         ["internes", `Notes internes${nb(notesInternes.length)}`, panneauInternes],
         ["compte-rendu", "Compte rendu organisme", panneauCompteRendu],
         ["coaching", "Coaching", panneauCoaching],
         ["statut", "Statut", panneauStatut]]
      : [["fiche", "Fiche", panneauFiche],
         clientPeut("voir_comptes_rendus") ? ["compte-rendu", `Comptes rendus${nb(comptesRendus.data.length)}`, panneauCompteRendu] : null,
         clientPeut("voir_comptes_rendus") ? ["historique", `Historique d'appels${nb(appels.data.length)}`, panneauHistorique] : null,
         clientPeut("voir_coaching") ? ["coaching", "Coaching", panneauCoaching] : null].filter(Boolean);
    const ongletsFiche = barreOnglets("fiche", listeOnglets,
      memo.onglet, (cle) => {
        memo.onglet = cle;
        const cible = `#/apprenant/${a.id}/${cle}${cle === "coaching" ? `/${memo.partie}` : ""}`;
        if (window.location.hash !== cible) history.replaceState(null, "", cible);
        hautFiche.classList.toggle("fiche-haut-onglet", cle !== "fiche");
        window.scrollTo(0, 0);
      }, { separe: true });

    // Rappel du nom quand un autre onglet que « Fiche » est ouvert.
    const hautFiche = h("div", { class: `fiche-haut${memo.onglet !== "fiche" ? " fiche-haut-onglet" : ""}` },
      h("p", { class: "surtitre" }, lienInterne(retour, "← Retour à la liste")),
      h("p", { class: "fiche-rappel" }, h("strong", {}, nomApprenant(a)), " · ", [org.nom, a.parcours].filter(Boolean).join(" · ")),
      h("div", { class: "onglets-fiche onglets-haut" }, ongletsFiche.barre));

    // Onglet « Fiche » : identité avec l'action de formation juste à côté, puis les chiffres.
    panneauFiche.append(
        h("div", { class: "fiche-entete" },
         h("div", { class: "fiche-identite" },
          h("h1", {}, nomApprenant(a)),
          h("p", { class: "fiche-ecole" }, org.nom || "École non renseignée",
            a.identifiant_externe ? h("span", { class: "aide" }, ` · ${a.identifiant_externe}`) : null),
          h("p", { class: "fiche-diplome" }, a.parcours || "Formation non renseignée"),
          h("p", { class: "chapo" },
            a.statut === "actif"
              ? pastille(couleur, jours === null ? "jamais contacté·e" : `${jours} j sans contact`)
              : pastille("neutre", LIBELLE_STATUT[a.statut]),
            " ", pastilleSortie(a)),
          blocStatut),
         blocActionFormation(a, estAdmin, () => rafraichir("Dates de formation enregistrées."))),
        h("div", { class: "compteurs" },
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, a.avancement_pct === null || a.avancement_pct === undefined ? "—" : `${Math.round(a.avancement_pct)} %`), h("span", { class: "compteur-libelle" }, "avancement")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur compteur-valeur-date" }, a.derniere_connexion ? dateLisible(a.derniere_connexion) : "—"), h("span", { class: "compteur-libelle" }, "dernière connexion")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur compteur-valeur-date" }, a.date_dernier_contact ? dateLisible(a.date_dernier_contact) : "—"), h("span", { class: "compteur-libelle" }, "dernier contact")),
          clientPeut("voir_examens") ? h("div", { class: "compteur" }, h("span", { class: "compteur-valeur compteur-valeur-date" }, a.date_examen ? dateLisible(a.date_examen) : "—"), h("span", { class: "compteur-libelle" }, "examen")) : null),
        clientPeut("voir_comptes_rendus") ? blocCompteursContact(appels.data) : null,
        blocContacterFiche);

    // Trois colonnes sur ordinateur : situation à gauche, fiche au centre, commentaires à droite.
    // Le client ne voit ni la situation ni les commentaires : une seule colonne.
    afficher(
      h("div", { class: `fiche-page${peutNoter ? "" : " fiche-page-seule"}` },
        peutNoter
          ? h("aside", { class: "fiche-gauche", "aria-label": "Situation personnelle et professionnelle" },
              blocSituationPerso(a, situation.data, () => rafraichir("Situation personnelle enregistrée.")))
          : null,
        h("div", { class: "fiche-centre pile" },
          hautFiche,
          info ? message("info", info) : null,
          suivantId
            ? h("p", { class: "message message-action" }, lienInterne(`apprenant/${suivantId}`, "Apprenant suivant dans la liste →"))
            : null,
          ongletsFiche),
        peutNoter
          ? h("aside", { class: "fiche-droite", "aria-label": "Commentaires" }, blocCommentaires(a, commentaires.data))
          : null)
    );
    window.scrollTo(0, 0);
  }

  // ===========================================================================
  // ACCÈS : comptes clients et appelantes (étape 7)
  // ===========================================================================
  //   #/acces   créer un compte, désactiver / réactiver, voir qui a accès à quoi
  // La création passe par la fonction serveur « gerer-comptes ».
  // ===========================================================================

  function adresseSite() {
    return /^https?:$/.test(window.location.protocol) ? window.location.origin + window.location.pathname : "https://filrouge-apprenant.github.io/";
  }

  function messageBienvenue(role, nom) {
    const bonjour = nom ? `Bonjour ${nom.split(" ")[0]},` : "Bonjour,";
    return role === "client"
      ? `${bonjour}\n\nVotre espace de suivi Fil Rouge Apprenants est prêt. Vous y retrouvez vos apprenants, les comptes rendus d'appel, le suivi jusqu'à l'examen et votre dossier de preuves Qualiopi.\n\nPour vous connecter : ${adresseSite()}\nSaisissez votre adresse email, puis ouvrez le lien de connexion que vous recevrez (pensez à vérifier les courriers indésirables).\n\nÀ bientôt,\nÉmilie Rachas\nFil Rouge Apprenants`
      : `${bonjour}\n\nTon accès à la plateforme Fil Rouge Apprenants est prêt. Tu y trouveras les apprenants qui te sont confiés et le bouton « Noter un appel ».\n\nPour te connecter : ${adresseSite()}\nSaisis ton adresse email, puis ouvre le lien de connexion reçu (vérifie les courriers indésirables).\n\nÀ bientôt,\nÉmilie`;
  }

  async function copier(texte, bouton) {
    try {
      await navigator.clipboard.writeText(texte);
      const avant = bouton.textContent;
      bouton.textContent = "Copié ✓";
      setTimeout(() => { bouton.textContent = avant; }, 2000);
    } catch (e) {
      bouton.textContent = "Copie impossible : sélectionnez le texte";
    }
  }

  // --- Droits qu'un client peut voir dans son espace (cases à cocher) ---
  const DROITS_CLIENT = [
    ["voir_comptes_rendus", "Comptes rendus d'appel", "Historique des appels et notes écrites pour l'organisme"],
    ["voir_examens", "Suivi des examens", "Dates, relances J-30 / J-7 / J-1, taux de présence et de réussite"],
    ["voir_coaching", "Coaching", "Stage, projet métier, organisation"],
    ["voir_avis", "Avis des apprenants", "Uniquement ceux que vous débloquez dans « Satisfaction »"],
    ["voir_preuves", "Dossier Qualiopi", "Dossier de preuves et exports"],
  ];
  const LIBELLE_DROIT_COURT = { voir_comptes_rendus: "comptes rendus", voir_examens: "examens", voir_coaching: "coaching", voir_avis: "avis", voir_preuves: "Qualiopi" };
  const ALERTE_EXPIRATION_JOURS = 30;

  // Le client connecté a-t-il ce droit ? (Pour les autres rôles : oui.)
  function clientPeut(cle) {
    return !etat.profil || etat.profil.role !== "client" || etat.profil[cle] !== false;
  }

  function joursAvant(dateIso) {
    return Math.round((new Date(`${dateIso}T12:00:00Z`) - new Date(`${aujourdhui()}T12:00:00Z`)) / 86400000);
  }

  function ajouterMois(dateIso, n) {
    const d = new Date(`${dateIso}T12:00:00Z`);
    const jour = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(jour, dernier));
    return d.toISOString().slice(0, 10);
  }

  // État d'un compte : code, couleur de pastille, texte.
  function etatCompte(p) {
    const auj = aujourdhui();
    if (!p.actif) return { code: "desactive", couleur: "neutre", texte: "Désactivé" };
    if (p.acces_debut && p.acces_debut > auj) return { code: "a_venir", couleur: "neutre", texte: `Commence le ${dateLisible(p.acces_debut)}` };
    if (p.acces_fin && p.acces_fin < auj) return { code: "expire", couleur: "rouge", texte: `Expiré le ${dateLisible(p.acces_fin)}` };
    if (p.acces_fin) {
      const n = joursAvant(p.acces_fin);
      if (n <= ALERTE_EXPIRATION_JOURS) return { code: "bientot", couleur: "orange", texte: n === 0 ? "Dernier jour" : `Expire dans ${n} j` };
    }
    return { code: "actif", couleur: "vert", texte: "Actif" };
  }

  function textePeriode(p) {
    if (!p.acces_debut && !p.acces_fin) return "Accès sans limite";
    if (!p.acces_fin) return `Depuis le ${dateLisible(p.acces_debut)}, sans limite`;
    return p.acces_debut ? `Du ${dateLisible(p.acces_debut)} au ${dateLisible(p.acces_fin)}` : `Jusqu'au ${dateLisible(p.acces_fin)} inclus`;
  }

  function texteDerniereConnexion(horodatage) {
    if (!horodatage) return "Jamais connecté·e";
    const n = -joursAvant(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(horodatage)));
    return `Dernière connexion : ${n === 0 ? "aujourd'hui" : n === 1 ? "hier" : `il y a ${n} j`}`;
  }

  // Cases à cocher des droits d'un client.
  function casesDroits(prefixe, valeurs) {
    const cases = {};
    const bloc = h("fieldset", { class: "droits" },
      h("legend", {}, "Ce que ce client voit dans son espace"),
      h("p", { class: "aide" }, "La liste de ses apprenants et leurs alertes restent toujours visibles."),
      DROITS_CLIENT.map(([cle, titre, aide]) => {
        const c = h("input", { type: "checkbox", id: `${prefixe}-${cle}`, name: cle });
        c.checked = valeurs ? valeurs[cle] !== false : true;
        cases[cle] = c;
        return h("label", { class: "case", for: `${prefixe}-${cle}` }, c,
          h("span", {}, h("span", { class: "case-titre" }, titre), h("span", { class: "case-aide" }, aide)));
      }));
    return { bloc, valeurs: () => Object.fromEntries(Object.entries(cases).map(([k, c]) => [k, c.checked])) };
  }

  // Dates d'accès + raccourcis (+1 mois, +3 mois, +1 an, sans limite).
  function champsPeriode(prefixe, p) {
    const debut = champTexte(`${prefixe}-debut`, "Début de l'accès", p?.acces_debut || "", { type: "date", aide: "Vide = dès maintenant." });
    const fin = champTexte(`${prefixe}-fin`, "Fin de l'accès (jour inclus)", p?.acces_fin || "", { type: "date", aide: "Vide = sans limite. Le lendemain, le compte ne voit plus rien (rien n'est effacé)." });
    const depart = () => {
      const auj = aujourdhui();
      return fin.champ.value && fin.champ.value > auj ? fin.champ.value : auj;
    };
    const raccourci = (texte, action) => {
      const b = h("button", { type: "button", class: "puce" }, texte);
      b.addEventListener("click", () => { fin.champ.value = action(); });
      return b;
    };
    const raccourcis = h("div", { class: "raccourcis" },
      h("span", { class: "aide" }, "Prolonger :"),
      raccourci("+1 mois", () => ajouterMois(depart(), 1)),
      raccourci("+3 mois", () => ajouterMois(depart(), 3)),
      raccourci("+1 an", () => ajouterMois(depart(), 12)),
      raccourci("Sans limite", () => ""));
    return {
      bloc: h("div", { class: "pile-serree" }, debut.bloc, fin.bloc, raccourcis),
      valeurs: () => ({ acces_debut: debut.champ.value || null, acces_fin: fin.champ.value || null }),
      verifier: () => (debut.champ.value && fin.champ.value && fin.champ.value < debut.champ.value ? "La fin de l'accès est avant son début." : null),
    };
  }

  // organismePrechoisi : venu de la fiche d'un client, le formulaire « Nouveau
  // compte » s'ouvre directement avec cet organisme déjà choisi.
  async function ecranAcces(info, organismePrechoisi) {
    afficher(h("p", { class: "chargement" }, "Chargement des accès…"));

    const [comptes, organismes, confies] = await Promise.all([
      sb.rpc("comptes_acces"),
      sb.from("organismes").select("id, nom, organismes_suivi_commercial ( etape, date_debut_contrat )").order("nom"),
      sb.from("apprenants").select("appelante_id").not("appelante_id", "is", null),
    ]);
    const erreur = comptes.error || organismes.error || confies.error;
    if (erreur) return afficher(message("erreur", texteErreur(erreur)));

    const nomOrganisme = new Map(organismes.data.map((o) => [o.id, o.nom]));
    const nbConfies = new Map();
    for (const a of confies.data) nbConfies.set(a.appelante_id, (nbConfies.get(a.appelante_id) || 0) + 1);
    const estClient = (o) => (o.organismes_suivi_commercial?.etape || "prospect") === "client";
    const autres = comptes.data.filter((p) => p.id !== etat.profil.id);

    // --- Compteurs ---
    const parEtat = { actif: 0, bientot: 0, expire: 0, desactive: 0, a_venir: 0 };
    for (const p of autres) parEtat[etatCompte(p).code] += 1;
    const compteurs = h("div", { class: "compteurs" },
      h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, parEtat.actif + parEtat.bientot), h("span", { class: "compteur-libelle" }, "comptes actifs")),
      h("div", { class: "compteur compteur-orange" }, h("span", { class: "compteur-valeur" }, parEtat.bientot), h("span", { class: "compteur-libelle" }, `expirent sous ${ALERTE_EXPIRATION_JOURS} j`)),
      h("div", { class: "compteur compteur-rouge" }, h("span", { class: "compteur-valeur" }, parEtat.expire), h("span", { class: "compteur-libelle" }, "accès expirés")),
      h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, parEtat.desactive + parEtat.a_venir), h("span", { class: "compteur-libelle" }, "désactivés ou à venir")));

    // --- Une ligne de compte, avec son panneau « Gérer » ---
    function ligneCompte(p) {
      const e = etatCompte(p);
      const zoneLigne = h("div");
      const panneau = h("div", { class: "ligne-edition carte carte-large pile-serree", hidden: true });
      const gerer = h("button", { type: "button", class: "bouton-lien", "aria-expanded": "false" }, "Gérer l'accès");
      gerer.addEventListener("click", () => {
        panneau.hidden = !panneau.hidden;
        gerer.setAttribute("aria-expanded", String(!panneau.hidden));
        gerer.textContent = panneau.hidden ? "Gérer l'accès" : "Fermer";
      });

      const periode = champsPeriode(`c-${p.id}`, p);
      const droits = p.role === "client" ? casesDroits(`d-${p.id}`, p) : null;
      const zone = h("div");
      const enregistrer = h("button", { type: "submit", class: "bouton bouton-petit" }, "Enregistrer");
      const form = h("form", { class: "formulaire", novalidate: true }, periode.bloc, droits ? droits.bloc : null, zone, h("div", { class: "actions-ligne" }, enregistrer));
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const probleme = periode.verifier();
        if (probleme) return signaler(zone, "erreur", probleme);
        occupe(enregistrer, true, "Enregistrement…");
        const { error } = await sb.from("profils").update({ ...periode.valeurs(), ...(droits ? droits.valeurs() : {}) }).eq("id", p.id);
        occupe(enregistrer, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        ecranAcces(`Accès de ${p.nom_affiche || p.email} enregistré.`);
      });

      const basculer = h("button", { type: "button", class: p.actif ? "bouton-lien bouton-lien-danger" : "bouton-lien" }, p.actif ? "Couper l'accès maintenant" : "Réactiver l'accès");
      basculer.addEventListener("click", async () => {
        occupe(basculer, true, "…");
        const { error } = await sb.from("profils").update({ actif: !p.actif }).eq("id", p.id);
        occupe(basculer, false);
        if (error) return signaler(zoneLigne, "erreur", texteErreur(error));
        ecranAcces(p.actif ? `Accès de ${p.nom_affiche || p.email} coupé. Rien n'est effacé.` : `Accès de ${p.nom_affiche || p.email} réactivé.`);
      });
      panneau.append(form, h("p", { class: "aide" }, basculer));

      const droitsTexte = p.role === "client"
        ? (() => {
            const oui = DROITS_CLIENT.filter(([k]) => p[k] !== false).map(([k]) => LIBELLE_DROIT_COURT[k]);
            const non = DROITS_CLIENT.filter(([k]) => p[k] === false).map(([k]) => LIBELLE_DROIT_COURT[k]);
            return h("span", { class: "ligne-detail" },
              non.length === 0 ? "Voit tout : apprenants, " + oui.join(", ") : `Voit : apprenants${oui.length ? ", " + oui.join(", ") : ""}`,
              non.length ? h("span", { class: "droits-masques" }, ` · Masqué : ${non.join(", ")}`) : null);
          })()
        : h("span", { class: "ligne-detail" }, pluriel(nbConfies.get(p.id) || 0, "apprenant confié", "apprenants confiés"));

      return h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, p.nom_affiche || p.email),
        h("span", { class: "pastilles" }, pastille(e.couleur, e.texte)),
        h("span", { class: "ligne-detail" }, [p.nom_affiche ? p.email : null, textePeriode(p), texteDerniereConnexion(p.derniere_connexion)].filter(Boolean).join(" · ")),
        droitsTexte,
        h("div", { class: "ligne-detail" }, gerer, zoneLigne),
        panneau);
    }

    // --- Comptes regroupés par client ---
    const clients = autres.filter((p) => p.role === "client");
    const appelantes = autres.filter((p) => p.role === "appelante");
    const parOrganisme = new Map();
    for (const p of clients) {
      if (!parOrganisme.has(p.organisme_id)) parOrganisme.set(p.organisme_id, []);
      parOrganisme.get(p.organisme_id).push(p);
    }
    const ordre = [...parOrganisme.keys()].sort((x, y) => (nomOrganisme.get(x) || "").localeCompare(nomOrganisme.get(y) || "", "fr"));
    const clientsSansCompte = organismes.data.filter((o) => estClient(o) && !parOrganisme.has(o.id));

    const sectionClients = h("section", { class: "pile" },
      h("div", { class: "section-titre" }, h("h2", {}, "Comptes clients"), h("p", {}, pluriel(clients.length, "compte", "comptes"))),
      clients.length
        ? ordre.map((orgId) => h("div", { class: "groupe-acces" },
            h("h3", {}, nomOrganisme.get(orgId) || "Organisme supprimé"),
            h("ul", { class: "liste" }, parOrganisme.get(orgId).map(ligneCompte))))
        : message("info", "Aucun compte client pour l'instant. Créez-le avec « Nouveau compte » ci-dessus."),
      clientsSansCompte.length
        ? h("p", { class: "message message-action" }, `Client${clientsSansCompte.length > 1 ? "s" : ""} signé${clientsSansCompte.length > 1 ? "s" : ""} sans accès à son espace : `, clientsSansCompte.map((o) => o.nom).join(", "), ".")
        : null);

    const sectionAppelantes = appelantes.length
      ? h("section", { class: "pile-serree" },
          h("div", { class: "section-titre" }, h("h2", {}, "Appelantes"), h("p", {}, pluriel(appelantes.length, "compte", "comptes"))),
          h("ul", { class: "liste" }, appelantes.map(ligneCompte)))
      : null;

    // --- Nouveau compte ---
    const choixOrganismes = Object.fromEntries([["", "— Choisir l'organisme —"],
      ...organismes.data.filter(estClient).map((o) => [o.id, o.nom]),
      ...organismes.data.filter((o) => !estClient(o)).map((o) => [o.id, `${o.nom} (pas encore client)`])]);
    const zone = h("div");
    const zoneResultat = h("div");
    const email = champTexte("acces-email", "Adresse email", "", { type: "email", inputmode: "email", autocomplete: "off", obligatoire: true });
    const nom = champTexte("acces-nom", "Prénom et nom", "", { placeholder: "Ex. : Sophie Durand" });
    const role = champChoix("acces-role", "Type de compte", { client: "Client (lecture seule)", appelante: "Appelante (renfort d'appels)" }, "client");
    const organisme = champChoix("acces-organisme", "Organisme", choixOrganismes, organismePrechoisi && organismePrechoisi in choixOrganismes ? organismePrechoisi : "");
    const periode = champsPeriode("nouveau", null);
    const droits = casesDroits("nouveau-droit", null);
    const blocClient = h("div", { class: "pile-serree" }, organisme.bloc, droits.bloc);
    const majRole = () => { blocClient.hidden = role.champ.value !== "client"; };
    role.champ.addEventListener("change", majRole);
    majRole();
    const bouton = h("button", { class: "bouton", type: "submit" }, "Créer le compte");
    const formulaire = h("form", { class: "formulaire", novalidate: true }, email.bloc, nom.bloc, role.bloc, blocClient, periode.bloc, zone, bouton);

    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      const adresse = email.champ.value.trim();
      const refuser = (texte) => { signaler(zone, "erreur", texte); zone.scrollIntoView({ behavior: "smooth", block: "center" }); };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adresse)) return refuser("Indiquez une adresse email valable.");
      if (role.champ.value === "client" && !organisme.champ.value) return refuser("Choisissez l'organisme de ce client, juste au-dessus.");
      const probleme = periode.verifier();
      if (probleme) return refuser(probleme);
      signaler(zone);
      occupe(bouton, true, "Création…");
      const { data, error } = await sb.functions.invoke("gerer-comptes", {
        body: { action: "creer", email: adresse, nom_affiche: nom.champ.value.trim(), role: role.champ.value, organisme_id: organisme.champ.value || null },
      });
      if (error) {
        occupe(bouton, false);
        let texte = "Le compte n'a pas pu être créé. Réessayez dans un instant.";
        try { const corps = await error.context.json(); if (corps && corps.erreur) texte = corps.erreur; } catch (e) { /* message par défaut */ }
        return signaler(zone, "erreur", texte);
      }
      // Période et droits enregistrés juste après la création.
      const { error: erreurDroits } = await sb.from("profils")
        .update({ ...periode.valeurs(), ...(role.champ.value === "client" ? droits.valeurs() : {}) })
        .eq("id", data.id);
      occupe(bouton, false);
      const texteBienvenue = messageBienvenue(role.champ.value, nom.champ.value.trim());
      const boutonCopier = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "Copier le message");
      boutonCopier.addEventListener("click", () => copier(texteBienvenue, boutonCopier));
      zoneResultat.replaceChildren(
        h("div", { class: "carte carte-large pile pile-serree" },
          erreurDroits ? message("erreur", "Compte créé, mais la durée ou les droits n'ont pas été enregistrés : réglez-les avec « Gérer l'accès ».") : null,
          h("p", { class: "message message-action" }, h("strong", {}, `Compte créé pour ${data.email}. `), "Envoyez-lui ce message :"),
          h("p", { class: "texte-libre message-a-envoyer" }, texteBienvenue),
          h("div", { class: "actions-ligne" },
            boutonCopier,
            h("a", { class: "bouton bouton-secondaire bouton-petit", href: `mailto:${data.email}?subject=${encodeURIComponent("Votre accès Fil Rouge Apprenants")}&body=${encodeURIComponent(texteBienvenue)}` }, "Ouvrir dans ma messagerie"),
            h("button", { type: "button", class: "bouton bouton-petit", onclick: () => ecranAcces() }, "Voir le tableau à jour"))));
      formulaire.reset();
      majRole();
      zoneResultat.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const nouveau = h("details", { class: "carte carte-large depliant" },
      h("summary", {}, h("strong", {}, "Nouveau compte")),
      h("div", { class: "pile-serree" },
        h("p", { class: "aide" }, "Rappel : aucune donnée réelle d'apprenant avant la signature du contrat de sous-traitance et de l'accord RGPD avec le client."),
        formulaire));

    if (organismePrechoisi) nouveau.open = true;

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Accès clients"),
          h("h1", {}, "Comptes et droits d'accès"),
          h("p", { class: "chapo" }, "Qui a accès, jusqu'à quand, et à quoi. Chaque client ne voit que ses apprenants ; vous choisissez en plus les rubriques de son espace.")),
        info ? message("info", info) : null,
        compteurs,
        nouveau,
        zoneResultat,
        sectionClients,
        sectionAppelantes,
        h("p", { class: "aide" }, "Couper l'accès ou dépasser la date de fin bloque tout immédiatement, sans rien effacer. Ces règles sont appliquées par la base de données elle-même, pas seulement à l'écran. Pour confier un apprenant à une appelante, ouvrez sa fiche."))
    );
    if (organismePrechoisi) {
      nouveau.scrollIntoView({ block: "start" });
      email.champ.focus();
    } else {
      window.scrollTo(0, 0);
    }
  }

  // Bloc « Confié à » de la fiche apprenant (administratrice).
  async function blocConfieA(apprenant, rafraichir) {
    const { data, error } = await sb.from("profils").select("id, email, nom_affiche").eq("role", "appelante").eq("actif", true).order("nom_affiche");
    if (error) return message("erreur", texteErreur(error));
    const choix = Object.fromEntries([["", "Moi (personne d'autre)"], ...data.map((p) => [p.id, p.nom_affiche || p.email])]);
    if (apprenant.appelante_id && !(apprenant.appelante_id in choix)) choix[apprenant.appelante_id] = "Appelante désactivée";
    const zone = h("div");
    const champ = champChoix("fiche-appelante", "Appels assurés par", choix, apprenant.appelante_id || "");
    const bouton = h("button", { type: "submit", class: "bouton bouton-secondaire bouton-petit" }, "Enregistrer");
    const formulaire = h("form", { class: "formulaire", novalidate: true }, champ.bloc, zone, bouton);
    formulaire.addEventListener("submit", async (evenement) => {
      evenement.preventDefault();
      occupe(bouton, true, "Enregistrement…");
      const { error: erreurMaj } = await sb.from("apprenants").update({ appelante_id: champ.champ.value || null }).eq("id", apprenant.id);
      occupe(bouton, false);
      if (erreurMaj) return signaler(zone, "erreur", texteErreur(erreurMaj));
      rafraichir("Suivi attribué.");
    });
    return h("section", {},
      h("div", { class: "section-titre" }, h("h2", {}, "Qui appelle cet apprenant ?")),
      h("div", { class: "carte carte-large" },
        data.length ? null : h("p", { class: "aide" }, "Aucune appelante pour l'instant. Créez son compte dans l'onglet Accès."),
        formulaire));
  }

  async function accueilClient(profil) {
    afficher(h("p", { class: "chargement" }, "Chargement de vos apprenants…"));

    const [organisme, apprenants, tauxCohortes, examensAVenir] = await Promise.all([
      sb.from("organismes").select("nom, taux_presence_depart").eq("id", profil.organisme_id).maybeSingle(),
      sb.from("vue_qui_rappeler").select("id, identifiant_externe, prenom, nom, parcours, jours_sans_contact, alerte, date_entree_formation, date_sortie_formation, tentatives, aboutis"),
      sb.from("vue_taux_examen").select("*"),
      sb.from("vue_relances_examen").select("id", { count: "exact", head: true }),
    ]);
    const erreur = organisme.error || apprenants.error || tauxCohortes.error || examensAVenir.error;
    if (erreur) return afficher(message("erreur", texteErreur(erreur)));
    const totalExamens = totalTaux(tauxCohortes.data);
    const avis = clientPeut("voir_avis") ? await blocAvisClient() : null;
    const voitExamens = clientPeut("voir_examens");
    const voitPreuves = clientPeut("voir_preuves");

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Espace client"),
          h("h1", {}, organisme.data?.nom || "Vos apprenants"),
          h("p", { class: "chapo" }, "Le suivi de vos apprenants, mis à jour après chaque appel.")
        ),
        blocCompteurs(compterAlertes(apprenants.data), apprenants.data.length),
        voitPreuves && !voitExamens
          ? h("div", { class: "actions-ligne" }, h("a", { href: "#/preuves", class: "bouton bouton-petit" }, "Dossier de preuves Qualiopi"))
          : null,
        voitExamens ? h("section", {},
          h("div", { class: "section-titre" },
            h("h2", {}, "Jusqu'à l'examen")),
          voitPreuves ? h("div", { class: "actions-ligne" },
            h("a", { href: "#/preuves", class: "bouton bouton-petit" }, "Dossier de preuves Qualiopi")) : null,
          h("div", { class: "compteurs" },
            h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, examensAVenir.count || 0), h("span", { class: "compteur-libelle" }, "examens à venir")),
            h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, pourcentage(totalExamens.taux_presence)), h("span", { class: "compteur-libelle" }, "taux de présence")),
            h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, pourcentage(totalExamens.taux_reussite)), h("span", { class: "compteur-libelle" }, "taux de réussite")),
            h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, totalExamens.presents + totalExamens.absents), h("span", { class: "compteur-libelle" }, "examens renseignés"))),
          tauxCohortes.data.some((l) => Number(l.inscrits_examen)) ? tableauTaux(tauxCohortes.data, organisme.data?.taux_presence_depart) : null) : null,
        avis,
        h("section", {},
          h("div", { class: "section-titre" },
            h("h2", {}, "Vos apprenants"),
            h("p", {}, "Les plus urgents en premier")),
          (memoriserFile(trierParUrgence(apprenants.data), ""), listeApprenants(trierParUrgence(apprenants.data))))
      )
    );
  }

  async function accueilAppelante(profil) {
    afficher(h("p", { class: "chargement" }, "Chargement de vos apprenants…"));
    const { data, error } = await sb
      .from("vue_qui_rappeler")
      .select("id, identifiant_externe, prenom, nom, parcours, telephone, jours_sans_contact, alerte, date_entree_formation, date_sortie_formation, tentatives, aboutis");
    if (error) return afficher(message("erreur", texteErreur(error)));
    memoriserFile(trierParUrgence(data), "");

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Appels"),
          h("h1", {}, "Qui rappeler en premier ?"),
          h("p", { class: "chapo" }, "Les apprenants qui vous sont confiés, les plus urgents en premier.")
        ),
        listeApprenants(trierParUrgence(data))
      )
    );
  }

  // ===========================================================================
  // SATISFACTION (#/satisfaction) — administratrice uniquement
  // ===========================================================================
  // 1. Émilie déclenche l'envoi, élève par élève : le bouton ouvre sa
  //    messagerie avec l'email et le lien personnel déjà écrits.
  // 2. Les réponses arrivent ici, et nulle part ailleurs (« nouvelle » tant
  //    qu'elle ne les a pas vues).
  // 3. Rien ne part chez le client tant qu'elle n'a pas débloqué la réponse.
  //    Les réponses débloquées apparaissent dans l'espace client et dans le
  //    récap mensuel qu'elle envoie elle-même.
  // ===========================================================================

  const LIBELLE_FREQUENCE = { pas_assez: "pas assez d'appels", juste: "nombre d'appels juste bien", trop: "trop d'appels" };

  function moyenne(valeurs) {
    const v = valeurs.filter((x) => x !== null && x !== undefined);
    return v.length ? v.reduce((a, b) => a + Number(b), 0) / v.length : null;
  }
  function note(v, sur) {
    return v === null || v === undefined ? "–" : `${Number(v).toFixed(1).replace(".", ",").replace(",0", "")}/${sur}`;
  }

  function texteEmailQuestionnaire(a, organisme, lien) {
    const moi = (etat.profil?.nom_affiche || "").trim().split(" ")[0] || "Émilie";
    return {
      objet: "Votre avis sur votre suivi de formation (2 minutes)",
      texte: `Bonjour ${a.prenom || ""},\n\nDepuis le début de votre formation avec ${organisme}, je vous accompagne par téléphone pour vous aider à avancer jusqu'à votre examen.\n\nJ'aimerais savoir ce que vous pensez de ces appels : ce qui vous aide, et ce que je peux améliorer. Cela prend 2 minutes :\n\n${lien}\n\nMerci beaucoup, et bon courage pour la suite !\n\n${moi}\nFil Rouge Apprenants`,
    };
  }

  function texteRecap(organisme, contactNom, mois, reponses, activite) {
    const bonjour = contactNom ? `Bonjour ${contactNom.split(" ")[0]},` : "Bonjour,";
    const nps = reponses.filter((r) => r.recommandation !== null);
    const promoteurs = nps.filter((r) => r.recommandation >= 9).length;
    const detracteurs = nps.filter((r) => r.recommandation <= 6).length;
    const lignes = [
      bonjour, "",
      `Voici le récapitulatif du suivi de vos apprenants par Fil Rouge Apprenants pour ${mois}.`, "",
    ];
    if (activite && activite.tentatives) {
      lignes.push("Suivi téléphonique du mois :",
        `• ${pluriel(activite.tentatives, "tentative de contact", "tentatives de contact")} (appels, messages)`,
        `• ${pluriel(activite.aboutis, "contact abouti", "contacts aboutis")}, c'est-à-dire d'échange réel avec l'apprenant`,
        `• ${pluriel(activite.apprenantsJoints, "apprenant joint", "apprenants joints")} sur ${pluriel(activite.apprenantsContactes, "apprenant contacté", "apprenants contactés")}`, "");
    }
    if (!reponses.length) {
      lignes.push("Le détail de chaque contact est disponible dans votre espace Fil Rouge :", adresseSite(),
        "", "Belle journée,", "Émilie Rachas", "Fil Rouge Apprenants");
      return lignes.join("\n");
    }
    lignes.push(...[
      "Satisfaction de vos apprenants :",
      `• ${pluriel(reponses.length, "réponse", "réponses")}`,
      `• Note globale des appels : ${note(moyenne(reponses.map((r) => r.note_globale)), 5)}`,
      `• Écoute : ${note(moyenne(reponses.map((r) => r.note_ecoute)), 5)}`,
      `• Clarté des informations : ${note(moyenne(reponses.map((r) => r.note_clarte)), 5)}`,
      `• Aide pour avancer : ${note(moyenne(reponses.map((r) => r.note_utilite)), 5)}`,
      nps.length ? `• Recommandation : ${note(moyenne(nps.map((r) => r.recommandation)), 10)} (${promoteurs} très favorables, ${detracteurs} réservés)` : null,
    ].filter((l) => l !== null));
    const commentaires = reponses.filter((r) => r.point_fort || r.amelioration);
    if (commentaires.length) {
      lignes.push("", "Ce que disent vos apprenants :");
      for (const r of commentaires) {
        const qui = r.anonyme ? "Anonyme" : nomApprenant(r.apprenants || {});
        if (r.point_fort) lignes.push(`• ${qui} : « ${r.point_fort} »`);
        if (r.amelioration) lignes.push(`• ${qui}, à améliorer : « ${r.amelioration} »`);
      }
    }
    lignes.push("", "Ces réponses sont aussi disponibles dans votre espace Fil Rouge, utilisables comme preuve Qualiopi (recueil des appréciations des bénéficiaires) :", adresseSite(),
      "", "Belle journée,", "Émilie Rachas", "Fil Rouge Apprenants");
    return lignes.join("\n");
  }

  async function ecranSatisfaction(organismeId) {
    afficher(h("p", { class: "chargement" }, "Chargement des questionnaires…"));
    const [orgs, appr, sat] = await Promise.all([
      sb.from("organismes").select("id, nom, organismes_suivi_commercial ( contact_nom, contact_email, etape )").order("nom"),
      sb.from("apprenants").select("id, prenom, nom, identifiant_externe, email, statut, organisme_id").order("nom").order("prenom"),
      sb.from("satisfaction").select("*, apprenants ( prenom, nom, identifiant_externe )").order("cree_le", { ascending: false }),
    ]);
    const erreur = orgs.error || appr.error || sat.error;
    if (erreur) return afficher(message("erreur", texteErreur(erreur)));

    const nomOrg = new Map(orgs.data.map((o) => [o.id, o.nom]));
    const suiviDe = (o) => (Array.isArray(o.organismes_suivi_commercial) ? o.organismes_suivi_commercial[0] : o.organismes_suivi_commercial) || {};
    const avecEleves = orgs.data.filter((o) => appr.data.some((a) => a.organisme_id === o.id));
    if (organismeId && !nomOrg.has(organismeId)) organismeId = null;
    const filtreOrg = (x) => !organismeId || x.organisme_id === organismeId;

    const lignes = sat.data.filter(filtreOrg);
    const reponses = lignes.filter((s) => s.repondu_le).sort((a, b) => b.repondu_le.localeCompare(a.repondu_le));
    const nouvelles = new Set(reponses.filter((s) => !s.lu_le).map((s) => s.id));
    const dernierPar = new Map(); // apprenant → questionnaire le plus récent
    for (const s of sat.data) if (!dernierPar.has(s.apprenant_id)) dernierPar.set(s.apprenant_id, s);

    // Les réponses affichées ici sont désormais « lues ».
    if (nouvelles.size) {
      sb.from("satisfaction").update({ lu_le: new Date().toISOString() }).in("id", [...nouvelles]).then(() => chargerMenu());
    }

    // --- Choix du client -------------------------------------------------------
    const choixOrg = champChoix("sat-organisme", "Client", { "": "Tous les clients", ...Object.fromEntries(avecEleves.map((o) => [o.id, o.nom])) }, organismeId || "");
    choixOrg.champ.addEventListener("change", () => aller(choixOrg.champ.value ? `satisfaction/${choixOrg.champ.value}` : "satisfaction"));

    // --- Réponses reçues -------------------------------------------------------
    function carteReponse(s) {
      const zone = h("div");
      const bouton = h("button", { type: "button", class: s.partage_client ? "bouton bouton-secondaire bouton-petit" : "bouton bouton-petit" },
        s.partage_client ? "Masquer au client" : "Débloquer pour le client");
      bouton.addEventListener("click", async () => {
        occupe(bouton, true, "Enregistrement…");
        const partage = !s.partage_client;
        const { error } = await sb.from("satisfaction").update({ partage_client: partage, partage_le: partage ? new Date().toISOString() : null }).eq("id", s.id);
        occupe(bouton, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        s.partage_client = partage;
        carte.replaceWith(carteReponse(s));
      });
      const details = [
        ["Écoute", note(s.note_ecoute, 5)], ["Clarté", note(s.note_clarte, 5)], ["Aide pour avancer", note(s.note_utilite, 5)],
        ["Recommandation", note(s.recommandation, 10)],
      ].filter(([, v]) => v !== "–");
      const carte = h("li", { class: "carte carte-large sat-reponse" },
        h("div", { class: "sat-entete" },
          h("span", { class: "ligne-titre" }, lienInterne(`apprenant/${s.apprenant_id}`, nomApprenant(s.apprenants || {}))),
          h("span", { class: "pastilles" },
            nouvelles.has(s.id) ? pastille("orange", "Nouvelle") : null,
            s.partage_client ? pastille("vert", "Visible par le client") : pastille("neutre", "Privée"),
            s.anonyme ? pastille("neutre", "Souhaite rester anonyme") : null)),
        h("p", { class: "ligne-detail" }, `${nomOrg.get(s.organisme_id) || ""} · reçue le ${dateHeureLisible(s.repondu_le)}`),
        h("p", { class: "sat-note" }, h("strong", {}, `Note globale : ${note(s.note_globale, 5)}`),
          details.length ? ` · ${details.map(([k, v]) => `${k} ${v}`).join(" · ")}` : "",
          s.frequence ? ` · ${LIBELLE_FREQUENCE[s.frequence]}` : ""),
        s.point_fort ? h("p", { class: "sat-citation" }, h("span", { class: "aide" }, "Ce qui l'a aidé·e : "), `« ${s.point_fort} »`) : null,
        s.amelioration ? h("p", { class: "sat-citation" }, h("span", { class: "aide" }, "À améliorer : "), `« ${s.amelioration} »`) : null,
        h("div", { class: "actions-ligne" }, bouton),
        zone);
      return carte;
    }

    // --- Envoyer le questionnaire ----------------------------------------------
    let recherche = "";
    const champRecherche = h("input", { type: "search", class: "recherche", placeholder: "Rechercher un élève", "aria-label": "Rechercher un élève", autocomplete: "off" });
    const zoneEleves = h("div");
    champRecherche.addEventListener("input", () => { recherche = champRecherche.value; dessinerEleves(); });

    function ligneEnvoi(a) {
      const s = dernierPar.get(a.id);
      const zone = h("div", { class: "ligne-edition" });
      const etatEnvoi = !s ? pastille("neutre", "Jamais envoyé")
        : s.repondu_le ? pastille("vert", `Répondu le ${dateLisible(s.repondu_le.slice(0, 10))}`)
        : s.envoye_le ? pastille("orange", `Envoyé le ${dateLisible(s.envoye_le.slice(0, 10))}, sans réponse`)
        : pastille("neutre", "Jamais envoyé");
      const libelle = s && !s.repondu_le && s.envoye_le ? "Relancer" : s && s.repondu_le ? "Renvoyer un questionnaire" : "Envoyer le questionnaire";
      const bouton = h("button", { type: "button", class: s && s.repondu_le ? "bouton bouton-secondaire bouton-petit" : "bouton bouton-petit", disabled: !a.email || null }, libelle);
      bouton.addEventListener("click", async () => {
        occupe(bouton, true, "Préparation…");
        const { data, error } = await sb.rpc("preparer_questionnaire", { p_apprenant: a.id });
        occupe(bouton, false);
        if (error || !data?.[0]) return signaler(zone, "erreur", texteErreur(error));
        const { id, lien } = data[0];
        const mail = texteEmailQuestionnaire(a, nomOrg.get(a.organisme_id) || "votre organisme", lien);
        const adresse = window.FilRougeContact.lienEmail(a.email, mail.objet, mail.texte);
        const ouvrir = h("a", { class: "bouton bouton-petit", href: adresse }, "📧 Ouvrir ma messagerie");
        const copie = h("button", { type: "button", class: "bouton-lien" }, "Copier le lien seul");
        copie.addEventListener("click", () => copier(lien, copie));
        const confirmer = h("button", { type: "button", class: "bouton bouton-secondaire bouton-petit" }, "C'est envoyé ✓");
        confirmer.addEventListener("click", async () => {
          occupe(confirmer, true, "Enregistrement…");
          const maintenant = new Date().toISOString();
          const r = await sb.from("satisfaction").update({ envoye_le: maintenant }).eq("id", id).select("*").single();
          occupe(confirmer, false);
          if (r.error) return signaler(zone, "erreur", texteErreur(r.error));
          dernierPar.set(a.id, r.data);
          ligne.replaceWith(ligneEnvoi(a));
        });
        zone.replaceChildren(h("div", { class: "message message-action pile pile-serree" },
          h("span", {}, `Email prêt pour ${a.email}, avec son lien personnel. Ouvrez votre messagerie, envoyez, puis confirmez ici.`),
          h("div", { class: "actions-ligne" }, ouvrir, confirmer, copie)));
      });
      const ligne = h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, lienInterne(`apprenant/${a.id}`, nomApprenant(a))),
        h("span", { class: "pastilles" }, etatEnvoi),
        h("span", { class: "ligne-detail" }, [organismeId ? null : nomOrg.get(a.organisme_id), a.email || "pas d'email sur la fiche", LIBELLE_STATUT[a.statut]].filter(Boolean).join(" · ")),
        h("div", { class: "ligne-edition" }, h("div", { class: "actions-ligne" }, bouton)),
        zone);
      return ligne;
    }

    function dessinerEleves() {
      const q = pourRecherche(recherche);
      const visibles = appr.data.filter(filtreOrg).filter((a) => a.statut !== "abandon")
        .filter((a) => !q || pourRecherche([a.prenom, a.nom, a.identifiant_externe, a.email].join(" ")).includes(q));
      zoneEleves.replaceChildren(visibles.length
        ? h("ul", { class: "liste" }, visibles.map(ligneEnvoi))
        : message("info", q ? "Aucun élève ne correspond à cette recherche." : "Aucun élève dans ce dossier."));
    }
    dessinerEleves();

    // --- Récap mensuel au client ----------------------------------------------
    function blocRecap() {
      if (!organismeId) return h("p", { class: "aide" }, "Choisissez un client en haut de la page pour préparer son récap du mois.");
      const org = orgs.data.find((o) => o.id === organismeId);
      const suivi = suiviDe(org);
      const moisDispo = [...new Set(reponses.map((r) => r.repondu_le.slice(0, 7)))];
      const courant = aujourdhui().slice(0, 7);
      if (!moisDispo.includes(courant)) moisDispo.unshift(courant);
      const choixMois = champChoix("sat-mois", "Mois", Object.fromEntries(moisDispo.map((m) => [m, moisLisible(m)])), moisDispo[0]);
      const zone = h("div");
      async function preparer() {
        const m = choixMois.champ.value;
        const partagees = reponses.filter((r) => r.partage_client && r.repondu_le.startsWith(m));
        const privees = reponses.filter((r) => !r.partage_client && r.repondu_le.startsWith(m)).length;
        // Activité du mois : tentatives de contact et contacts aboutis.
        zone.replaceChildren(h("p", { class: "chargement" }, "Calcul du mois…"));
        const debut = `${m}-01`;
        const moisSuivant = ajouterJours(`${m}-28`, 7).slice(0, 7) + "-01";
        const res = await toutLire(() => sb.from("appels").select("id, apprenant_id, resultat")
          .eq("organisme_id", organismeId).gte("date_appel", debutJourParis(debut)).lt("date_appel", debutJourParis(moisSuivant)).order("id"));
        if (choixMois.champ.value !== m) return; // un autre mois a été choisi entre-temps
        if (res.error) return zone.replaceChildren(message("erreur", texteErreur(res.error)));
        const ap = res.data;
        const activite = {
          tentatives: ap.length,
          aboutis: ap.filter((c) => c.resultat === "joint").length,
          apprenantsContactes: new Set(ap.map((c) => c.apprenant_id)).size,
          apprenantsJoints: new Set(ap.filter((c) => c.resultat === "joint").map((c) => c.apprenant_id)).size,
        };
        if (!partagees.length && !activite.tentatives) {
          return zone.replaceChildren(message("info", privees
            ? `${pluriel(privees, "réponse reçue", "réponses reçues")} ce mois-ci, mais aucune n'est débloquée et aucun appel n'est noté. Débloquez celles à transmettre, puis revenez ici.`
            : "Aucun appel noté ni aucune réponse ce mois-ci."));
        }
        const texte = champTexte("sat-recap", "Récap (modifiable)", texteRecap(org.nom, suivi.contact_nom, moisLisible(m).toLowerCase(), partagees, activite), { multiligne: true });
        texte.champ.rows = 14;
        const objet = `Suivi de vos apprenants — ${moisLisible(m)}`;
        const envoyer = h("a", { class: "bouton bouton-petit" }, "📧 Envoyer au client");
        const majLien = () => {
          const l = window.FilRougeContact.lienEmail(suivi.contact_email, objet, texte.champ.value);
          envoyer.hidden = !l;
          if (l) envoyer.setAttribute("href", l);
        };
        texte.champ.addEventListener("input", majLien);
        majLien();
        const copie = h("button", { type: "button", class: "bouton-lien" }, "Copier le texte");
        copie.addEventListener("click", () => copier(texte.champ.value, copie));
        zone.replaceChildren(h("div", { class: "pile pile-serree" },
          h("p", { class: "aide" }, `${pluriel(activite.tentatives, "tentative", "tentatives")} et ${pluriel(activite.aboutis, "contact abouti", "contacts aboutis")} ce mois-ci · ${pluriel(partagees.length, "réponse débloquée incluse", "réponses débloquées incluses")}${privees ? ` · ${pluriel(privees, "réponse privée non incluse", "réponses privées non incluses")}` : ""}.`),
          h("div", { class: "formulaire" }, texte.bloc),
          h("div", { class: "actions-ligne" }, envoyer, copie),
          suivi.contact_email ? null : h("p", { class: "aide" }, "Pas d'email de contact sur la fiche de ce client : copiez le texte, ou ajoutez l'email dans sa fiche.")));
      }
      choixMois.champ.addEventListener("change", preparer);
      preparer();
      return h("div", { class: "carte carte-large pile pile-serree" }, h("div", { class: "formulaire" }, choixMois.bloc), zone);
    }

    const nbEnvoyes = lignes.filter((s) => s.envoye_le).length;
    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Qualité"),
          h("h1", {}, "Satisfaction des élèves"),
          h("p", { class: "chapo" }, "Vous envoyez le questionnaire, les réponses arrivent ici. Le client ne voit que celles que vous débloquez.")),
        h("div", { class: "formulaire" }, choixOrg.bloc),
        h("div", { class: "compteurs" },
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, nbEnvoyes), h("span", { class: "compteur-libelle" }, "questionnaires envoyés")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, reponses.length), h("span", { class: "compteur-libelle" }, "réponses")),
          h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, note(moyenne(reponses.map((r) => r.note_globale)), 5)), h("span", { class: "compteur-libelle" }, "note globale moyenne")),
          h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, note(moyenne(reponses.map((r) => r.recommandation)), 10)), h("span", { class: "compteur-libelle" }, "recommandation"))),
        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Réponses reçues"), nouvelles.size ? h("p", {}, pluriel(nouvelles.size, "nouvelle", "nouvelles")) : null),
          reponses.length ? h("ul", { class: "liste sat-liste" }, reponses.map(carteReponse)) : message("info", "Aucune réponse pour l'instant.")),
        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Envoyer le questionnaire"), h("p", {}, "Un lien personnel par élève, une seule réponse possible")),
          champRecherche, zoneEleves),
        h("section", {},
          h("div", { class: "section-titre" }, h("h2", {}, "Récap mensuel au client"), h("p", {}, "Appels du mois + réponses débloquées")),
          blocRecap())));
    window.scrollTo(0, 0);
  }

  // Espace client : les avis débloqués par Émilie (rien d'autre).
  async function blocAvisClient() {
    const { data, error } = await sb.rpc("satisfaction_resultats");
    if (error || !data || !data.length) return null;
    return h("section", {},
      h("div", { class: "section-titre" }, h("h2", {}, "Avis de vos apprenants"), h("p", {}, "Sur les appels de suivi")),
      h("div", { class: "compteurs" },
        h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, note(moyenne(data.map((r) => r.note_globale)), 5)), h("span", { class: "compteur-libelle" }, "note globale moyenne")),
        h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, note(moyenne(data.map((r) => r.recommandation)), 10)), h("span", { class: "compteur-libelle" }, "recommandation")),
        h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, data.length), h("span", { class: "compteur-libelle" }, "réponses"))),
      h("ul", { class: "liste" }, data.map((r) => h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, r.apprenant),
        h("span", { class: "pastilles" }, pastille("neutre", `${note(r.note_globale, 5)}`)),
        h("span", { class: "ligne-detail" }, [
          dateLisible(r.repondu_le.slice(0, 10)),
          r.point_fort ? `« ${r.point_fort} »` : null,
          r.amelioration ? `À améliorer : « ${r.amelioration} »` : null,
        ].filter(Boolean).join(" · "))))));
  }

  // ===========================================================================
  // MENU LATÉRAL (administratrice, étape 9)
  // ===========================================================================
  // Sur ordinateur : colonne à gauche, toujours visible. Sur téléphone : volet
  // qui s'ouvre avec le bouton « Menu ». Groupes dépliables :
  //   Prospects · Clients · Élèves (un dossier par client) · Coaching
  // Les groupes ouverts sont retenus dans ce navigateur (simple confort).
  // ===========================================================================

  const menu = document.getElementById("menu-lateral");
  const boutonMenu = document.getElementById("bouton-menu");
  const voile = document.getElementById("voile");
  const CLE_GROUPES = "filrouge.menu.groupes";
  let signatureMenu = "";

  function lireGroupesOuverts() {
    try {
      const v = JSON.parse(localStorage.getItem(CLE_GROUPES) || "null");
      return Array.isArray(v) ? v : ["eleves"];
    } catch (e) {
      return ["eleves"];
    }
  }
  function memoriserGroupes() {
    try {
      localStorage.setItem(CLE_GROUPES, JSON.stringify([...menu.querySelectorAll("details[open]")].map((d) => d.dataset.groupe)));
    } catch (e) { /* confort seulement */ }
  }

  function ouvrirMenu(ouvert) {
    document.body.classList.toggle("menu-ouvert", ouvert);
    boutonMenu.setAttribute("aria-expanded", String(ouvert));
    voile.hidden = !ouvert;
  }
  boutonMenu.addEventListener("click", () => ouvrirMenu(!document.body.classList.contains("menu-ouvert")));
  voile.addEventListener("click", () => ouvrirMenu(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") ouvrirMenu(false); });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) ouvrirMenu(false); });

  function menuVisible() {
    // Sur la fiche élève, on ne voit que la fiche : pas de menu latéral.
    return Boolean(etat.profil && etat.profil.role === "admin" && !zoneCompte.hidden && !["apprenant", "organisme"].includes(lireRoute().nom));
  }

  function etapeDe(o) {
    const s = Array.isArray(o.organismes_suivi_commercial) ? o.organismes_suivi_commercial[0] : o.organismes_suivi_commercial;
    return (s && s.etape) || "prospect";
  }

  // Échéances du mois écoulé : calculées à la première ouverture de la
  // plateforme dans le mois (pas besoin de tâche programmée côté serveur).
  // Une échéance déjà calculée ou payée n'est pas touchée.
  let echeancesVerifiees = false;
  async function calculerEcheancesManquantes() {
    if (echeancesVerifiees) return 0;
    echeancesVerifiees = true;
    const moisCourant = premierDuMois(aujourdhui());
    const [a, m] = moisCourant.split("-").map(Number);
    const moisEcoule = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
    const [contrats, deja] = await Promise.all([
      sb.from("contrats").select("organisme_id, date_debut, date_fin"),
      sb.from("echeances").select("organisme_id").eq("mois", moisEcoule),
    ]);
    if (contrats.error || deja.error) return 0;
    const faits = new Set(deja.data.map((e) => e.organisme_id));
    const aFaire = contrats.data.filter((c) =>
      !faits.has(c.organisme_id) && c.date_debut < moisCourant && (!c.date_fin || c.date_fin >= moisEcoule));
    let n = 0;
    for (const c of aFaire) {
      const { error } = await sb.rpc("calculer_echeance", { p_organisme: c.organisme_id, p_mois: moisEcoule });
      if (!error) n += 1;
    }
    return n;
  }

  async function chargerMenu() {
    if (!menuVisible()) return;
    await calculerEcheancesManquantes();
    const [orgs, appr, urgents, avis, comptes, impayes] = await Promise.all([
      sb.from("organismes").select("id, nom, organismes_suivi_commercial ( etape )").order("nom"),
      sb.from("apprenants").select("organisme_id, statut"),
      sb.from("vue_qui_rappeler").select("id").eq("alerte", "rouge"),
      sb.from("satisfaction").select("id", { count: "exact", head: true }).not("repondu_le", "is", null).is("lu_le", null),
      sb.rpc("comptes_acces"),
      sb.from("vue_echeances").select("id", { count: "exact", head: true }).not("relance_due", "is", null),
    ]);
    if (orgs.error || appr.error || urgents.error) return;
    const total = new Map();
    const actifs = new Map();
    for (const a of appr.data) {
      total.set(a.organisme_id, (total.get(a.organisme_id) || 0) + 1);
      if (a.statut === "actif") actifs.set(a.organisme_id, (actifs.get(a.organisme_id) || 0) + 1);
    }
    const donnees = {
      prospects: orgs.data.filter((o) => !["client", "perdu"].includes(etapeDe(o))).map((o) => ({ id: o.id, nom: o.nom })),
      clients: orgs.data.filter((o) => etapeDe(o) === "client").map((o) => ({ id: o.id, nom: o.nom })),
      // Un dossier par client, et par organisme qui a déjà des élèves (test gratuit).
      dossiers: orgs.data.filter((o) => etapeDe(o) === "client" || total.has(o.id)).map((o) => ({ id: o.id, nom: o.nom, n: actifs.get(o.id) || 0 })),
      urgents: urgents.data.length,
      avis: avis.error ? 0 : avis.count || 0,
      // Accès à traiter : expirent bientôt, ou expirés mais encore actifs.
      impayes: impayes.error ? 0 : impayes.count || 0,
      acces: comptes.error ? 0 : comptes.data.filter((p) => ["bientot", "expire"].includes(etatCompte(p).code)).length,
    };
    const signature = JSON.stringify(donnees);
    if (signature !== signatureMenu) {
      signatureMenu = signature;
      dessinerMenu(donnees);
    }
    marquerActif();
  }

  function dessinerMenu(d) {
    const ouverts = new Set(lireGroupesOuverts());
    const lien = (chemin, texte, extra) =>
      h("a", { href: `#/${chemin}`, class: "menu-lien", "data-chemin": chemin }, h("span", { class: "menu-texte" }, texte), extra || null);
    const nombre = (n, alerte) => h("span", { class: alerte ? "menu-nombre menu-nombre-alerte" : "menu-nombre" }, String(n));
    const vide = (texte) => h("p", { class: "menu-vide" }, texte);
    const groupe = (cle, titre, enfants) => {
      const g = h("details", { class: "menu-groupe", "data-groupe": cle },
        h("summary", {}, h("span", {}, titre)),
        h("div", { class: "menu-sous" }, enfants));
      g.open = ouverts.has(cle);
      g.addEventListener("toggle", memoriserGroupes);
      return g;
    };

    menu.replaceChildren(
      h("div", { class: "menu-haut" },
        lien("", "Tableau de bord"),
        lien("rappels", "À rappeler", d.urgents ? nombre(d.urgents, true) : null),
        lien("examens", "Relances d'examen"),
        lien("satisfaction", "Satisfaction", d.avis ? nombre(d.avis, true) : null),
        lien("acces", "Accès clients", d.acces ? nombre(d.acces, true) : null),
        lien("impayes", "Impayés", d.impayes ? nombre(d.impayes, true) : null)),
      groupe("prospects", "Prospects", [
        lien("prospection", "Tous les centres à démarcher"),
        lien("nouveau", "Ajouter un centre"),
        d.prospects.length ? h("div", { class: "menu-liste" }, d.prospects.map((o) => lien(`organisme/${o.id}`, o.nom))) : vide("Aucun centre en cours."),
      ]),
      groupe("clients", "Clients", [
        d.clients.length ? d.clients.map((o) => lien(`organisme/${o.id}`, o.nom)) : vide("Pas encore de client signé."),
      ]),
      groupe("eleves", "Élèves", [
        d.dossiers.length
          ? d.dossiers.map((o) => lien(`eleves/${o.id}`, [h("span", { class: "icone-dossier", "aria-hidden": "true" }), o.nom], nombre(o.n)))
          : vide("Les dossiers apparaissent dès qu'un client a des élèves."),
      ]));
  }

  // Met en avant l'entrée de la page affichée (et ouvre son groupe).
  function marquerActif() {
    const chemin = (window.location.hash || "#/").replace(/^#\/?/, "");
    let actif = null;
    for (const a of menu.querySelectorAll(".menu-lien")) {
      a.removeAttribute("aria-current");
      const c = a.dataset.chemin;
      const correspond = c === chemin || (c !== "" && chemin.startsWith(`${c}/`));
      if (correspond && (!actif || c.length > actif.dataset.chemin.length)) actif = a;
    }
    if (!actif && etat.dossierActif) actif = menu.querySelector(`[data-chemin="eleves/${etat.dossierActif}"]`);
    if (actif) {
      actif.setAttribute("aria-current", "page");
      const g = actif.closest("details");
      if (g && !g.open) g.open = true;
    }
  }

  // ===========================================================================
  // DOSSIER ÉLÈVES D'UN CLIENT (#/eleves/<id>)
  // ===========================================================================
  // Un dossier = les élèves d'un seul client. Rien n'est mélangé : la base
  // range chaque élève dans le dossier de son organisme (cloisonnement).
  // ===========================================================================

  function pourRecherche(texte) {
    return String(texte || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  async function ecranDossierEleves(organismeId) {
    afficher(h("p", { class: "chargement" }, "Ouverture du dossier…"));
    const [org, appr, compteurs] = await Promise.all([
      sb.from("organismes").select("id, nom, seuil_vert_jours, seuil_orange_jours").eq("id", organismeId).maybeSingle(),
      sb.from("apprenants")
        .select("id, identifiant_externe, prenom, nom, parcours, avancement_pct, statut, date_dernier_contact, date_inscription, cree_le, date_examen, date_entree_formation, date_sortie_formation")
        .eq("organisme_id", organismeId).order("nom").order("prenom"),
      toutLire(() => sb.from("vue_contacts_apprenant").select("apprenant_id, tentatives, aboutis").eq("organisme_id", organismeId).order("apprenant_id")),
    ]);
    const erreur = org.error || appr.error || compteurs.error;
    const contactsDe = new Map((compteurs.data || []).map((c) => [c.apprenant_id, c]));
    if (erreur) return afficher(message("erreur", texteErreur(erreur)));
    if (!org.data) return afficher(message("info", "Ce dossier n'existe pas ou n'est plus accessible."));

    const o = org.data;
    const eleves = appr.data;
    let statutChoisi = "actif";
    let recherche = "";

    const filtres = h("div", { class: "filtres", role: "group", "aria-label": "Statut des élèves" });
    const champ = h("input", { type: "search", class: "recherche", placeholder: "Rechercher : nom, identifiant, parcours", "aria-label": "Rechercher un élève", autocomplete: "off" });
    const zoneListe = h("div");
    champ.addEventListener("input", () => { recherche = champ.value; dessiner(); });

    const couleurPour = (jours) => (jours === null ? "neutre" : jours <= (o.seuil_vert_jours ?? 7) ? "vert" : jours <= (o.seuil_orange_jours ?? 14) ? "orange" : "rouge");

    function ligneEleve(a) {
      const jours = joursDepuis(a.date_dernier_contact || a.date_inscription || (a.cree_le || "").slice(0, 10));
      return h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, lienInterne(`apprenant/${a.id}`, nomApprenant(a))),
        h("span", { class: "pastilles" },
          a.statut === "actif" ? pastille(couleurPour(jours), jours === null ? "jamais contacté·e" : `${jours} j sans contact`) : pastille("neutre", LIBELLE_STATUT[a.statut]),
          pastilleSortie(a)),
        h("span", { class: "ligne-detail" }, [
          a.parcours,
          a.identifiant_externe,
          texteFormation(a),
          texteContacts(contactsDe.get(a.id)),
          a.avancement_pct === null || a.avancement_pct === undefined ? null : `${Math.round(a.avancement_pct)} % du parcours`,
          a.date_examen ? `examen le ${dateLisible(a.date_examen)}` : null,
        ].filter(Boolean).join(" · ")));
    }

    function dessiner() {
      filtres.replaceChildren(...Object.entries(LIBELLE_STATUT).map(([statut, texte]) => {
        const b = h("button", { type: "button", class: "filtre", "aria-pressed": String(statut === statutChoisi) },
          texte, h("span", { class: "filtre-nombre" }, String(eleves.filter((a) => a.statut === statut).length)));
        b.addEventListener("click", () => { statutChoisi = statut; dessiner(); });
        return b;
      }));
      const q = pourRecherche(recherche);
      const visibles = eleves
        .filter((a) => a.statut === statutChoisi)
        .filter((a) => !q || pourRecherche([a.prenom, a.nom, a.identifiant_externe, a.parcours].join(" ")).includes(q));
      memoriserFile(visibles, `eleves/${organismeId}`);
      zoneListe.replaceChildren(visibles.length
        ? h("ul", { class: "liste" }, visibles.map(ligneEleve))
        : message("info", !eleves.length
            ? "Ce dossier est vide. Importez le fichier d'élèves envoyé par ce client."
            : q ? "Aucun élève ne correspond à cette recherche." : "Aucun élève avec ce statut."));
    }
    dessiner();

    const nbActifs = eleves.filter((a) => a.statut === "actif").length;
    afficher(
      h("div", { class: "pile" },
        h("div", { class: "entete-dossier" },
          h("span", { class: "icone-dossier icone-dossier-grande", "aria-hidden": "true" }),
          h("div", {},
            h("h1", {}, o.nom),
            h("p", { class: "chapo" }, `Dossier élèves : ${pluriel(nbActifs, "élève en formation", "élèves en formation")}, ${pluriel(eleves.length, "au total", "au total")}.`))),
        h("div", { class: "actions-ligne" },
          h("a", { class: "bouton bouton-petit", href: `#/import/${o.id}` }, "Importer des élèves"),
          h("a", { class: "bouton bouton-secondaire bouton-petit", href: `#/rappels/${o.id}` }, "Qui rappeler"),
          h("a", { class: "bouton bouton-secondaire bouton-petit", href: `#/examens/${o.id}` }, "Examens et preuves"),
          h("a", { class: "bouton bouton-secondaire bouton-petit", href: `#/organisme/${o.id}` }, "Fiche du client")),
        h("section", {}, champ, filtres, zoneListe)));
    window.scrollTo(0, 0);
  }

  // ===========================================================================
  // COACHING : stage, projet, organisation (#/coaching/<type>)
  // ===========================================================================
  // L'examen garde son écran (#/examens). Chaque écran classe les élèves en
  // formation par situation, du plus urgent au plus avancé ; un filtre limite
  // l'affichage au dossier d'un seul client.
  // ===========================================================================

  const LIBELLE_STAGE = {
    non_concerne: "Pas de stage dans ce parcours",
    a_chercher: "Stage à trouver",
    structure_trouvee: "Structure trouvée",
    convention_envoyee: "Convention envoyée, en attente de signature",
    convention_signee: "Convention signée",
    en_cours: "En stage",
    termine: "Stage terminé",
  };
  const LIBELLE_SITUATION = {
    reconversion: "En reconversion",
    en_emploi: "En emploi",
    en_recherche: "En recherche d'emploi",
    creation_activite: "Création d'activité",
    autre: "Autre situation",
  };

  function ficheDe(a) {
    return (Array.isArray(a.coaching) ? a.coaching[0] : a.coaching) || null;
  }

  const ECRANS_COACHING = {
    stage: {
      titre: "Stage",
      chapo: "Où en est chaque élève de sa recherche de stage et de sa convention. Les conventions à faire signer passent en premier.",
      groupe: (f) => (f ? f.stage_statut : "a_renseigner"),
      ordre: ["convention_envoyee", "a_chercher", "structure_trouvee", "a_renseigner", "convention_signee", "en_cours", "termine", "non_concerne"],
      replies: ["termine", "non_concerne"],
      libelles: { ...LIBELLE_STAGE, a_renseigner: "Situation de stage à renseigner" },
      detail: (f) => f && [
        f.stage_structure,
        f.stage_debut ? `du ${dateLisible(f.stage_debut)}` : null,
        f.stage_fin ? `au ${dateLisible(f.stage_fin)}` : null,
      ].filter(Boolean).join(" "),
    },
    projet: {
      titre: "Projet",
      chapo: "Le métier visé par chaque élève et sa situation : c'est ce qui le fait tenir jusqu'à l'examen.",
      groupe: (f) => (f && (f.projet_metier || f.projet_situation) ? (f.projet_situation || "autre") : "a_renseigner"),
      ordre: ["a_renseigner", "en_recherche", "reconversion", "creation_activite", "en_emploi", "autre"],
      replies: [],
      libelles: { ...LIBELLE_SITUATION, a_renseigner: "Projet à définir avec l'élève" },
      detail: (f) => f && [f.projet_metier ? `Métier visé : ${f.projet_metier}` : null, f.projet_note].filter(Boolean).join(" — "),
    },
    organisation: {
      titre: "Organisation",
      chapo: "Le temps que chaque élève consacre à sa formation, ses créneaux et son objectif du mois.",
      groupe: (f) => {
        if (!f || !f.orga_objectif) return "sans_objectif";
        if (f.orga_date_fin_visee && joursDepuis(f.orga_date_fin_visee) >= -30) return "fin_proche";
        return "avec_objectif";
      },
      ordre: ["sans_objectif", "fin_proche", "avec_objectif"],
      replies: [],
      libelles: { sans_objectif: "Pas d'objectif fixé ce mois-ci", fin_proche: "Fin de parcours visée dans moins de 30 jours", avec_objectif: "Objectif du mois fixé" },
      detail: (f) => f && [
        f.orga_objectif ? `Objectif : ${f.orga_objectif}` : null,
        f.orga_heures_semaine !== null && f.orga_heures_semaine !== undefined ? `${f.orga_heures_semaine} h par semaine` : null,
        f.orga_creneaux,
        f.orga_date_fin_visee ? `fin visée le ${dateLisible(f.orga_date_fin_visee)}` : null,
      ].filter(Boolean).join(" · "),
    },
  };

  async function ecranCoaching(type, organismeId) {
    const ecran = ECRANS_COACHING[type];
    if (!ecran) return accueilAdmin(etat.profil);
    afficher(h("p", { class: "chargement" }, `Chargement : ${ecran.titre.toLowerCase()}…`));

    const { data, error } = await sb.from("apprenants")
      .select("id, organisme_id, prenom, nom, identifiant_externe, parcours, avancement_pct, organismes ( nom ), coaching ( * )")
      .eq("statut", "actif").order("nom");
    if (error) return afficher(message("erreur", texteErreur(error)));

    const organismes = new Map();
    for (const a of data) organismes.set(a.organisme_id, a.organismes?.nom || "Organisme");
    const choix = h("select", { "aria-label": "Dossier client" },
      h("option", { value: "" }, "Tous les clients"),
      [...organismes].sort((x, y) => x[1].localeCompare(y[1], "fr")).map(([id, nom]) => h("option", { value: id }, nom)));
    choix.value = organismeId && organismes.has(organismeId) ? organismeId : "";
    choix.addEventListener("change", () => aller(`coaching/${type}${choix.value ? `/${choix.value}` : ""}`));

    const visibles = data.filter((a) => !choix.value || a.organisme_id === choix.value);
    const groupes = new Map(ecran.ordre.map((cle) => [cle, []]));
    for (const a of visibles) {
      const cle = ecran.groupe(ficheDe(a));
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(a);
    }
    memoriserFile([...groupes.values()].flat(), `coaching/${type}${choix.value ? `/${choix.value}` : ""}`);

    const ligne = (a) => {
      const detail = ecran.detail(ficheDe(a));
      return h("li", { class: "ligne" },
        h("span", { class: "ligne-titre" }, lienInterne(`apprenant/${a.id}`, nomApprenant(a))),
        h("span", { class: "pastilles" }, choix.value ? null : pastille("neutre", a.organismes?.nom || "")),
        h("span", { class: "ligne-detail" }, [a.parcours, detail].filter(Boolean).join(" · ")));
    };

    const sections = [...groupes].filter(([, liste]) => liste.length).map(([cle, liste]) => {
      const titre = h("div", { class: "section-titre" }, h("h2", {}, ecran.libelles[cle] || cle), h("p", {}, pluriel(liste.length, "élève", "élèves")));
      const corps = h("ul", { class: "liste" }, liste.map(ligne));
      return ecran.replies.includes(cle)
        ? h("details", { class: "depliant section-repliee" }, h("summary", {}, `${ecran.libelles[cle]} (${liste.length})`), corps)
        : h("section", {}, titre, corps);
    });

    afficher(
      h("div", { class: "pile" },
        h("div", {},
          h("h1", {}, ecran.titre),
          h("p", { class: "chapo" }, ecran.chapo)),
        h("label", { class: "choix-dossier" }, "Dossier", choix),
        sections.length ? sections : message("info", "Aucun élève en formation dans ce dossier."),
        h("p", { class: "aide" }, "Pour compléter une situation, ouvrez la fiche de l'élève, partie « Coaching ».")));
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------------------
  // Onglets (fiche apprenant). Changer d'onglet ne recharge rien : l'adresse
  // est mise à jour pour pouvoir y revenir (#/apprenant/<id>/coaching/stage).
  // ---------------------------------------------------------------------------
  function barreOnglets(nom, onglets, actif, surChangement, options = {}) {
    const boutons = [];
    const panneaux = [];
    const choisir = (cle, focus) => {
      onglets.forEach(([c], i) => {
        const oui = c === cle;
        boutons[i].setAttribute("aria-selected", String(oui));
        boutons[i].tabIndex = oui ? 0 : -1;
        panneaux[i].hidden = !oui;
        if (oui && focus) boutons[i].focus();
      });
      surChangement(cle);
    };
    onglets.forEach(([cle, texte, contenuPanneau], i) => {
      const b = h("button", { type: "button", role: "tab", class: "onglet-fiche", id: `onglet-${nom}-${cle}`, "aria-controls": `panneau-${nom}-${cle}` }, texte);
      b.addEventListener("click", () => choisir(cle));
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const j = (i + (e.key === "ArrowRight" ? 1 : onglets.length - 1)) % onglets.length;
        choisir(onglets[j][0], true);
      });
      boutons.push(b);
      panneaux.push(h("div", { role: "tabpanel", id: `panneau-${nom}-${cle}`, "aria-labelledby": `onglet-${nom}-${cle}`, class: "panneau-onglet" }, contenuPanneau));
    });
    const barre = h("div", { role: "tablist", class: "barre-onglets", "aria-label": options.libelle || (nom === "fiche" ? "Parties de la fiche" : "Coaching") }, boutons);
    const bloc = options.separe
      ? h("div", { class: `onglets-fiche onglets-${nom}` }, panneaux)
      : h("div", { class: `onglets-fiche onglets-${nom}` }, barre, panneaux);
    bloc.barre = barre;
    const depart = onglets.some(([c]) => c === actif) ? actif : onglets[0][0];
    onglets.forEach(([c], i) => {
      boutons[i].setAttribute("aria-selected", String(c === depart));
      boutons[i].tabIndex = c === depart ? 0 : -1;
      panneaux[i].hidden = c !== depart;
    });
    return bloc;
  }


  // ===========================================================================
  // COMPTABILITÉ D'UN CLIENT (onglet de la fiche organisme) et page IMPAYÉS
  // ===========================================================================
  // Contrat (PDF signé dans le dossier sécurisé « contrats »), échéancier :
  // mois payés, à payer, en retard, mois en cours (estimation), mois à venir.
  // Le calcul mensuel et les relances (J+3, J+15, J+30) tournent seuls dans
  // la base ; ici on voit, on corrige, on marque « payée ».
  // ===========================================================================

  const LIBELLE_MODE_PAIEMENT = { prelevement: "Prélèvement automatique", virement: "Virement" };
  const LIBELLE_BASE_FACTURATION = { appels_aboutis: "Appels aboutis (joint·e)", tous_les_appels: "Tous les appels passés" };
  const LIBELLE_RELANCE = { 1: "Rappel (J+3)", 2: "Relance (J+15)", 3: "Mise en demeure (J+30)" };
  const LIBELLE_CANAL_RELANCE = { email: "Email", telephone: "Appel", courrier: "Courrier", autre: "Autre" };
  const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  function euros(n) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  }
  function moisLettres(dateIso) {
    const [a, m] = dateIso.split("-").map(Number);
    const t = `${MOIS_FR[m - 1]} ${a}`;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function premierDuMois(dateIso) { return `${dateIso.slice(0, 7)}-01`; }
  function moisSuivant(dateIso) {
    const [a, m] = dateIso.split("-").map(Number);
    return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  }
  function tarifGrille(nbApprenants) {
    return nbApprenants < 20 ? 20 : nbApprenants <= 150 ? 15 : 12;
  }
  function pastilleEcheance(e) {
    if (e.statut === "payee") return pastille("vert", `Payée${e.payee_le ? " le " + dateLisible(e.payee_le) : ""}`);
    if (e.statut === "annulee") return pastille("neutre", "Annulée");
    if (e.statut === "en_retard") return pastille("rouge", `En retard de ${e.jours_retard} j`);
    return pastille("orange", `À payer avant le ${dateLisible(e.date_echeance)}`);
  }

  function blocComptabilite(org, suivi) {
    const zone = h("div", { class: "pile" }, h("p", { class: "chargement" }, "Chargement de la comptabilité…"));
    const recharger = (info) => charger(info);

    async function charger(info) {
      const debutMois = premierDuMois(aujourdhui());
      const [contrat, echeances, relances, appelsMois, actifs] = await Promise.all([
        sb.from("contrats").select("*").eq("organisme_id", org.id).maybeSingle(),
        sb.from("vue_echeances").select("*").eq("organisme_id", org.id).order("mois"),
        sb.from("relances_paiement").select("id, echeance_id, niveau, canal, faite_le, note").eq("organisme_id", org.id).order("faite_le", { ascending: false }),
        sb.from("appels").select("id, canal, resultat").eq("organisme_id", org.id).gte("date_appel", debutJourParis(debutMois)),
        sb.from("apprenants").select("id", { count: "exact", head: true }).eq("organisme_id", org.id).eq("statut", "actif"),
      ]);
      const erreur = contrat.error || echeances.error || relances.error || appelsMois.error || actifs.error;
      if (erreur) {
        const pasEncore = /contrats|echeances|relances_paiement|does not exist|schema cache/i.test(erreur.message || "");
        return zone.replaceChildren(message(pasEncore ? "info" : "erreur", pasEncore
          ? "La comptabilité n'est pas encore activée dans la base : il reste le script à coller dans Supabase."
          : texteErreur(erreur)));
      }
      const c = contrat.data;
      const liste = echeances.data;
      const parMois = new Map(liste.map((e) => [e.mois, e]));
      const relancesPar = new Map();
      for (const r of relances.data) {
        if (!relancesPar.has(r.echeance_id)) relancesPar.set(r.echeance_id, []);
        relancesPar.get(r.echeance_id).push(r);
      }

      // --- Compteurs ---
      const actives = liste.filter((e) => e.statut !== "annulee");
      const encaisse = actives.filter((e) => e.statut === "payee").reduce((t, e) => t + Number(e.montant), 0);
      const enRetard = actives.filter((e) => e.statut === "en_retard");
      const aPayer = actives.filter((e) => e.statut === "a_payer");
      const compteurs = h("div", { class: "compteurs" },
        h("div", { class: "compteur" }, h("span", { class: "compteur-valeur" }, euros(actives.reduce((t, e) => t + Number(e.montant), 0))), h("span", { class: "compteur-libelle" }, "facturé")),
        h("div", { class: "compteur compteur-vert" }, h("span", { class: "compteur-valeur" }, euros(encaisse)), h("span", { class: "compteur-libelle" }, "encaissé")),
        h("div", { class: "compteur compteur-orange" }, h("span", { class: "compteur-valeur" }, euros(aPayer.reduce((t, e) => t + Number(e.montant), 0))), h("span", { class: "compteur-libelle" }, "à venir (non échu)")),
        h("div", { class: `compteur${enRetard.length ? " compteur-rouge" : ""}` }, h("span", { class: "compteur-valeur" }, euros(enRetard.reduce((t, e) => t + Number(e.montant), 0))), h("span", { class: "compteur-libelle" }, pluriel(enRetard.length, "impayé en retard", "impayés en retard"))));

      // --- Contrat ---
      const blocContrat = await formulaireContrat(org, suivi, c, recharger);

      // --- Échéancier ---
      let sectionEcheancier = null;
      if (c) {
        const tarifBase = c.tarif_fixe ? Number(c.tarif_fixe) : tarifGrille(actifs.count || 0);
        const aboutis = appelsMois.data.filter((a) => ["telephone", "visio"].includes(a.canal) && (c.base_facturation === "tous_les_appels" || a.resultat === "joint")).length;
        const debut = premierDuMois(c.date_debut);
        const moisCourant = premierDuMois(aujourdhui());
        let fin = c.date_fin ? premierDuMois(c.date_fin) : moisSuivant(moisSuivant(moisSuivant(moisCourant)));
        const lignes = [];
        for (let m = debut, garde = 0; m <= fin && garde < 60; m = moisSuivant(m), garde += 1) lignes.push(m);
        for (const e of liste) if (!lignes.includes(e.mois)) lignes.push(e.mois);
        lignes.sort().reverse();

        const ligneMois = (m) => {
          const e = parMois.get(m);
          if (e) return ligneEcheance(e, relancesPar.get(e.id) || [], recharger);
          const zoneL = h("div");
          if (m === moisCourant) {
            return h("li", { class: "ligne" },
              h("span", { class: "ligne-titre" }, `${moisLettres(m)} · en cours`),
              h("span", { class: "pastilles" }, pastille("neutre", `≈ ${euros(aboutis * tarifBase)}`)),
              h("span", { class: "ligne-detail" }, `${pluriel(aboutis, "appel facturable", "appels facturables")} à ce jour × ${euros(tarifBase)}. Calcul définitif à ta première connexion du mois prochain.`));
          }
          if (m > moisCourant) {
            const estimation = (actifs.count || 0) * tarifBase;
            return h("li", { class: "ligne ligne-a-venir" },
              h("span", { class: "ligne-titre" }, moisLettres(m)),
              h("span", { class: "pastilles" }, pastille("neutre", `prévue ≈ ${euros(estimation)}`)),
              h("span", { class: "ligne-detail" }, `Estimation : ${pluriel(actifs.count || 0, "apprenant en formation", "apprenants en formation")} × 1 appel × ${euros(tarifBase)}.`));
          }
          const calculer = h("button", { type: "button", class: "bouton bouton-petit" }, "Calculer cette échéance");
          calculer.addEventListener("click", async () => {
            occupe(calculer, true, "Calcul…");
            const { error } = await sb.rpc("calculer_echeance", { p_organisme: org.id, p_mois: m });
            occupe(calculer, false);
            if (error) return signaler(zoneL, "erreur", texteErreur(error));
            recharger(`Échéance de ${moisLettres(m).toLowerCase()} calculée.`);
          });
          return h("li", { class: "ligne" },
            h("span", { class: "ligne-titre" }, moisLettres(m)),
            h("span", { class: "pastilles" }, pastille("neutre", "pas encore calculée")),
            h("div", { class: "ligne-detail" }, calculer, zoneL));
        };
        sectionEcheancier = h("section", { class: "pile-serree" },
          h("div", { class: "section-titre" }, h("h2", {}, "Échéancier"), h("p", {}, pluriel(liste.length, "échéance", "échéances"))),
          h("p", { class: "aide" }, `À ta première connexion de chaque mois, l'échéance du mois écoulé est calculée : ${LIBELLE_BASE_FACTURATION[c.base_facturation].toLowerCase()} × ${c.tarif_fixe ? euros(c.tarif_fixe) + " (tarif du contrat)" : "la grille (20 € sous 20 apprenants, 15 € jusqu'à 150, 12 € au-delà)"}, à régler sous ${c.delai_paiement_jours} jours.`),
          h("ul", { class: "liste" }, lignes.map(ligneMois)));
      }

      // --- Relances ---
      const sectionRelances = c ? h("section", { class: "pile-serree" },
        h("div", { class: "section-titre" }, h("h2", {}, "Relances d'impayés"), h("p", {}, pluriel(relances.data.length, "relance faite", "relances faites"))),
        message(c.alertes_relance ? "info" : "erreur", c.alertes_relance
          ? "Aucun envoi automatique : la plateforme t'alerte quand une relance est à faire (rappel à J+3, relance à J+15, mise en demeure à J+30, au moins 7 jours entre deux), et c'est toi qui relances, par email ou par téléphone."
          : "Alertes de relance coupées pour ce client (réglage du contrat)."),
        relances.data.length
          ? h("ul", { class: "liste" }, relances.data.map((r) => {
              const e = liste.find((x) => x.id === r.echeance_id);
              return h("li", { class: "ligne" },
                h("span", { class: "ligne-titre" }, LIBELLE_RELANCE[r.niveau]),
                h("span", { class: "pastilles" }, pastille(r.niveau === 3 ? "rouge" : "orange", `${LIBELLE_CANAL_RELANCE[r.canal]} · ${dateHeureComplete(r.faite_le)}`)),
                h("span", { class: "ligne-detail" }, [e ? `${e.reference} · ${moisLettres(e.mois)} · ${euros(e.montant)}` : null].filter(Boolean).join(" · ")),
                r.note ? h("span", { class: "ligne-detail texte-libre" }, r.note) : null);
            }))
          : h("p", { class: "aide" }, "Aucune relance faite pour l'instant.")) : null;

      const totalRetard = enRetard.reduce((t, e) => t + Number(e.montant), 0);
      const bandeauImpaye = enRetard.length
        ? h("div", { class: "bandeau-impaye", role: "alert" },
            h("span", { class: "bandeau-impaye-mot" }, "Impayé"),
            h("span", { class: "bandeau-impaye-montant" }, euros(totalRetard)),
            h("span", { class: "bandeau-impaye-detail" }, `${pluriel(enRetard.length, "échéance en retard", "échéances en retard")} · la plus ancienne depuis ${pluriel(Math.max(...enRetard.map((e) => e.jours_retard)), "jour", "jours")}`))
        : null;

      zone.replaceChildren(...[
        bandeauImpaye,
        info ? message("info", info) : null,
        c ? compteurs : null,
        blocContrat,
        sectionEcheancier,
        sectionRelances].filter(Boolean));
    }
    charger();
    return zone;
  }

  function ligneEcheance(e, relancesEch, recharger) {
    const zoneL = h("div");
    const actions = h("div", { class: "actions-ligne" });
    const bouton = (texte, classe, action) => {
      const b = h("button", { type: "button", class: classe }, texte);
      b.addEventListener("click", async () => {
        occupe(b, true, "…");
        const { error } = await action();
        occupe(b, false);
        if (error) return signaler(zoneL, "erreur", texteErreur(error));
        recharger();
      });
      return b;
    };
    const maj = (valeurs) => () => sb.from("echeances").update(valeurs).eq("id", e.id);

    if (e.statut === "payee") {
      actions.append(bouton("Annuler le paiement", "bouton-lien", maj({ payee_le: null })));
    } else if (e.statut !== "annulee") {
      const datePaiement = h("input", { type: "date", "aria-label": "Date du paiement" });
      datePaiement.value = aujourdhui();
      actions.append(
        h("span", { class: "paiement-ligne" }, datePaiement,
          bouton("Marquer payée", "bouton bouton-petit", () => sb.from("echeances").update({ payee_le: datePaiement.value || aujourdhui() }).eq("id", e.id))),
        bouton("Recalculer", "bouton-lien", () => sb.rpc("calculer_echeance", { p_organisme: e.organisme_id, p_mois: e.mois })),
        bouton(e.alertes_suspendues ? "Réactiver les alertes" : "Mettre les alertes en pause", "bouton-lien", maj({ alertes_suspendues: !e.alertes_suspendues })),
        bouton("Annuler l'échéance", "bouton-lien bouton-lien-danger", maj({ annulee: true })));
    } else {
      actions.append(bouton("Rétablir l'échéance", "bouton-lien", maj({ annulee: false })));
    }

    // Relance : alerte quand elle est due ; c'est l'administratrice qui relance
    // (email prérempli dans Gmail Fil Rouge, ou appel), puis qui la note.
    const blocRelance = e.statut === "en_retard" && (e.derniere_relance || 0) < 3
      ? blocRelanceEcheance(e, recharger)
      : null;

    const detail = [
      e.reference,
      `${pluriel(e.nb_appels, "appel", "appels")} × ${euros(e.tarif_unitaire)}`,
      `${pluriel(e.nb_apprenants, "apprenant suivi", "apprenants suivis")}`,
      `échéance ${dateLisible(e.date_echeance)}`,
      relancesEch.length ? `${LIBELLE_RELANCE[Math.max(...relancesEch.map((r) => r.niveau))]} faite le ${dateLisible(relancesEch[0].faite_le.slice(0, 10))}` : null,
      e.alertes_suspendues && e.statut !== "payee" ? "alertes en pause" : null,
    ].filter(Boolean).join(" · ");

    return h("li", { class: `ligne${e.statut === "en_retard" ? " ligne-retard" : ""}` },
      h("span", { class: "ligne-titre" }, `${moisLettres(e.mois)} · ${euros(e.montant)}`),
      h("span", { class: "pastilles" }, pastilleEcheance(e)),
      h("span", { class: "ligne-detail" }, detail),
      h("div", { class: "ligne-detail pile-serree" }, blocRelance, actions, zoneL));
  }

  // Bloc « Relance à faire » d'une échéance en retard.
  function blocRelanceEcheance(e, recharger) {
    const C = window.FilRougeContact;
    const boite = (window.FIL_ROUGE_CONFIG || {}).emailFilRouge || "";
    const niveau = e.relance_due || Math.min(3, (e.derniere_relance || 0) + 1);
    const dest = e.email_facturation || e.contact_email || "";
    const tel = e.contact_telephone || "";
    const zone = h("div");
    const zoneNote = h("div");

    const canal = champChoix(`relance-canal-${e.id}`, "Comment as-tu relancé ?", LIBELLE_CANAL_RELANCE, "email");
    const note = champTexte(`relance-note-${e.id}`, "Note (facultatif)", "", { multiligne: true, placeholder: "Ex. : la comptable promet un virement vendredi." });
    note.champ.rows = 2;
    const noter = h("button", { type: "button", class: "bouton bouton-petit" }, `Noter : ${LIBELLE_RELANCE[niveau]} faite`);
    noter.addEventListener("click", async () => {
      occupe(noter, true, "Enregistrement…");
      const { error } = await sb.from("relances_paiement").insert({ echeance_id: e.id, organisme_id: e.organisme_id, niveau, canal: canal.champ.value, note: note.champ.value.trim() || null });
      occupe(noter, false);
      if (error) return signaler(zoneNote, "erreur", texteErreur(error));
      recharger();
    });
    const formNote = h("div", { class: "pile-serree" }, canal.bloc, note.bloc, h("div", { class: "actions-ligne" }, noter), zoneNote);
    const ouvrirNote = (valeurCanal) => { canal.champ.value = valeurCanal; details.open = true; };

    // Email prérempli avec le texte de la relance.
    const email = h("button", { type: "button", class: "bouton bouton-petit" }, "📧 Préparer l'email");
    email.addEventListener("click", async () => {
      if (!dest) return signaler(zone, "erreur", "Pas d'email de facturation ni de contact : complète le contrat ou le suivi commercial.");
      const fenetre = window.open("about:blank", "_blank");
      const { data, error } = await sb.rpc("apercu_relance", { p_echeance: e.id, p_niveau: niveau });
      if (error || !data || !data[0]) { if (fenetre) fenetre.close(); return signaler(zone, "erreur", texteErreur(error || { message: "Texte indisponible." })); }
      const lien = C.lienGmail(dest, data[0].objet, data[0].texte, boite);
      if (fenetre) fenetre.location.href = lien; else window.location.href = lien;
      ouvrirNote("email");
    });
    const appeler = tel ? h("a", { class: "bouton bouton-secondaire bouton-petit", href: `tel:${tel.replace(/[^\d+]/g, "")}` }, `📞 Appeler · ${tel}`) : null;
    if (appeler) appeler.addEventListener("click", () => ouvrirNote("telephone"));

    // Texte / script d'appel, chargé à la demande.
    const texte = h("details", {}, h("summary", { class: "bouton-lien" }, "Voir le texte de la relance"));
    texte.addEventListener("toggle", async () => {
      if (!texte.open || texte.dataset.charge) return;
      texte.dataset.charge = "1";
      const { data, error } = await sb.rpc("apercu_relance", { p_echeance: e.id, p_niveau: niveau });
      texte.append(error ? message("erreur", texteErreur(error)) : h("div", { class: "pile-serree" },
        h("p", {}, h("strong", {}, data[0].objet)), h("p", { class: "texte-libre message-a-envoyer" }, data[0].texte)));
    });
    const details = h("details", { class: "depliant" }, h("summary", { class: "bouton-lien" }, "J'ai relancé : noter la relance"), formNote);

    const due = Boolean(e.relance_due);
    return h("div", { class: `relance-bloc${due ? " relance-due" : ""}` },
      h("p", { class: "relance-titre" }, due
        ? `⚠️ Relance à faire : ${LIBELLE_RELANCE[niveau]}`
        : `Prochaine relance : ${LIBELLE_RELANCE[niveau]}${e.alertes_suspendues ? " (alertes en pause)" : (e.derniere_relance_le ? " — attendre 7 jours après la précédente" : "")}`),
      h("div", { class: "actions-ligne" }, email, appeler),
      texte, details, zone);
  }

  async function formulaireContrat(org, suivi, c, recharger) {
    const zone = h("div");
    const debut = champTexte("contrat-debut", "Début du contrat", c?.date_debut || suivi.date_debut_contrat || aujourdhui(), { type: "date", obligatoire: true });
    const fin = champTexte("contrat-fin", "Fin du contrat", c?.date_fin || "", { type: "date", aide: "Vide = sans date de fin (reconduction)." });
    const mode = champChoix("contrat-mode", "Paiement", LIBELLE_MODE_PAIEMENT, c?.mode_paiement || "prelevement");
    const base = champChoix("contrat-base", "Ce qui est facturé", LIBELLE_BASE_FACTURATION, c?.base_facturation || "appels_aboutis");
    const tarif = champTexte("contrat-tarif", "Prix d'un appel (€)", c?.tarif_fixe ?? "", { inputmode: "decimal", aide: "Vide = grille : 20 € sous 20 apprenants, 15 € jusqu'à 150, 12 € au-delà." });
    const delai = champTexte("contrat-delai", "Délai de paiement (jours)", String(c?.delai_paiement_jours ?? 30), { inputmode: "numeric", aide: "30 jours maximum conseillé ; 60 jours au plus (loi)." });
    const email = champTexte("contrat-email", "Email de facturation", c?.email_facturation || suivi.contact_email || "", { type: "email", inputmode: "email", aide: "Reçoit les relances. Vide = email du contact." });
    const mandat = champTexte("contrat-mandat", "Référence du mandat de prélèvement", c?.reference_mandat || "", { aide: "Fournie par GoCardless ou Stripe une fois le prélèvement mis en place." });
    const notes = champTexte("contrat-notes", "Notes", c?.notes || "", { multiligne: true });
    const relancesAuto = h("input", { type: "checkbox", id: "contrat-relances" });
    relancesAuto.checked = c ? c.alertes_relance : true;
    const blocMandat = h("div", {}, mandat.bloc);
    const majMode = () => { blocMandat.hidden = mode.champ.value !== "prelevement"; };
    mode.champ.addEventListener("change", majMode);
    majMode();

    // --- PDF du contrat signé ---
    const zonePdf = h("div");
    const fichier = h("input", { type: "file", accept: "application/pdf", id: "contrat-pdf", class: "champ-fichier" });
    let lienPdf = null;
    if (c?.fichier_chemin) {
      const { data } = await sb.storage.from("contrats").createSignedUrl(c.fichier_chemin, 3600);
      lienPdf = data?.signedUrl
        ? h("a", { class: "bouton bouton-secondaire bouton-petit", href: data.signedUrl, target: "_blank", rel: "noopener" }, `📄 Ouvrir le contrat${c.fichier_nom ? " · " + c.fichier_nom : ""}`)
        : h("p", { class: "aide" }, "Le contrat est enregistré, mais il n'a pas pu être ouvert. Rechargez la page.");
    }
    const deposer = h("button", { type: "button", class: "bouton bouton-petit" }, c?.fichier_chemin ? "Remplacer le PDF" : "Déposer le PDF");
    deposer.addEventListener("click", async () => {
      const f = fichier.files && fichier.files[0];
      if (!c) return signaler(zonePdf, "erreur", "Enregistre d'abord le contrat (bouton plus bas), puis dépose le PDF.");
      if (!f) return signaler(zonePdf, "erreur", "Choisis d'abord le fichier PDF.");
      if (f.type !== "application/pdf") return signaler(zonePdf, "erreur", "Le contrat doit être un PDF.");
      if (f.size > 10 * 1024 * 1024) return signaler(zonePdf, "erreur", "Le PDF dépasse 10 Mo.");
      occupe(deposer, true, "Envoi…");
      const chemin = `${org.id}/contrat-${Date.now()}.pdf`;
      const envoi = await sb.storage.from("contrats").upload(chemin, f, { contentType: "application/pdf", upsert: false });
      if (envoi.error) { occupe(deposer, false); return signaler(zonePdf, "erreur", texteErreur(envoi.error)); }
      const { error } = await sb.from("contrats").update({ fichier_chemin: chemin, fichier_nom: f.name.slice(0, 150) }).eq("organisme_id", org.id);
      if (!error && c.fichier_chemin) await sb.storage.from("contrats").remove([c.fichier_chemin]);
      occupe(deposer, false);
      if (error) return signaler(zonePdf, "erreur", texteErreur(error));
      recharger("Contrat PDF enregistré.");
    });
    const blocPdf = h("div", { class: "pile-serree bloc-pdf" },
      h("p", { class: "case-titre" }, "Contrat signé (PDF)"),
      lienPdf || h("p", { class: "aide" }, "Aucun PDF déposé."),
      h("div", { class: "actions-ligne" }, fichier, deposer),
      h("p", { class: "aide" }, "Rangé dans un dossier sécurisé : toi seule peux l'ouvrir."),
      zonePdf);

    const enregistrer = h("button", { type: "submit", class: "bouton" }, c ? "Enregistrer le contrat" : "Créer le contrat");
    const form = h("form", { class: "formulaire", novalidate: true },
      h("div", { class: "deux-colonnes" }, debut.bloc, fin.bloc),
      h("div", { class: "deux-colonnes" }, mode.bloc, base.bloc),
      h("div", { class: "deux-colonnes" }, tarif.bloc, delai.bloc),
      email.bloc, blocMandat,
      h("label", { class: "case", for: "contrat-relances" }, relancesAuto,
        h("span", {}, h("span", { class: "case-titre" }, "M'alerter quand une relance est à faire"),
          h("span", { class: "case-aide" }, "Rappel à J+3, relance à J+15, mise en demeure à J+30. Rien n'est envoyé tout seul : c'est toi qui relances."))),
      notes.bloc, zone, enregistrer);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const t = tarif.champ.value.trim().replace(",", ".");
      const d = Number(delai.champ.value.trim());
      if (!debut.champ.value) return signaler(zone, "erreur", "Indique la date de début du contrat.");
      if (fin.champ.value && fin.champ.value < debut.champ.value) return signaler(zone, "erreur", "La fin du contrat est avant son début.");
      if (t && !(Number(t) > 0)) return signaler(zone, "erreur", "Le prix d'un appel doit être un nombre, par exemple 15.");
      if (!Number.isInteger(d) || d < 0 || d > 60) return signaler(zone, "erreur", "Le délai de paiement doit être entre 0 et 60 jours.");
      const mail = email.champ.value.trim();
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return signaler(zone, "erreur", "L'email de facturation n'est pas valable.");
      occupe(enregistrer, true, "Enregistrement…");
      const { error } = await sb.from("contrats").upsert({
        organisme_id: org.id,
        date_debut: debut.champ.value,
        date_fin: fin.champ.value || null,
        mode_paiement: mode.champ.value,
        base_facturation: base.champ.value,
        tarif_fixe: t ? Number(t) : null,
        delai_paiement_jours: d,
        email_facturation: mail || null,
        alertes_relance: relancesAuto.checked,
        reference_mandat: mandat.champ.value.trim() || null,
        notes: notes.champ.value.trim() || null,
      }, { onConflict: "organisme_id" });
      occupe(enregistrer, false);
      if (error) return signaler(zone, "erreur", texteErreur(error));
      recharger(c ? "Contrat enregistré." : "Contrat créé : l'échéancier est prêt.");
    });

    const resume = c
      ? [`Depuis le ${dateLisible(c.date_debut)}${c.date_fin ? ` jusqu'au ${dateLisible(c.date_fin)}` : ", sans date de fin"}`,
         LIBELLE_MODE_PAIEMENT[c.mode_paiement],
         c.tarif_fixe ? `${euros(c.tarif_fixe)} l'appel` : "tarif selon la grille",
         `paiement à ${c.delai_paiement_jours} jours`].join(" · ")
      : null;
    return h("section", { class: "pile-serree" },
      h("div", { class: "section-titre" }, h("h2", {}, "Contrat"), resume ? h("p", {}, c.fichier_chemin ? "PDF déposé" : "PDF à déposer") : null),
      c ? null : message("info", "Pas encore de contrat pour cet organisme. Renseigne-le : l'échéancier et les relances se mettent en place tout seuls."),
      resume ? h("p", { class: "chapo" }, resume) : null,
      c ? blocPdf : null,
      c ? h("details", { class: "carte carte-large depliant" }, h("summary", {}, "Modifier le contrat"), form) : h("div", { class: "carte carte-large" }, form));
  }

  // Page « Impayés » : relances à faire, échéances en retard, à encaisser.
  async function ecranImpayes(info) {
    afficher(h("p", { class: "chargement" }, "Chargement des impayés…"));
    const { data, error } = await sb.from("vue_echeances").select("*").in("statut", ["en_retard", "a_payer"]).order("date_echeance");
    if (error) return afficher(message("info", "La comptabilité n'est pas encore activée dans la base : il reste le script à coller dans Supabase."));
    const recharger = (texte) => { ecranImpayes(texte); chargerMenu(); };
    const aFaire = data.filter((e) => e.relance_due).sort((a, b) => b.jours_retard - a.jours_retard);
    const retard = data.filter((e) => e.statut === "en_retard" && !e.relance_due).sort((a, b) => b.jours_retard - a.jours_retard);
    const aVenir = data.filter((e) => e.statut === "a_payer");
    const somme = (l) => euros(l.reduce((t, e) => t + Number(e.montant), 0));
    const titreClient = (e) => h("p", { class: "groupe-client" }, lienInterne(`organisme/${e.organisme_id}/compta`, e.organisme_nom));
    const ligneAvecClient = (e) => h("div", {}, titreClient(e), h("ul", { class: "liste" }, ligneEcheance(e, [], recharger)));
    afficher(h("div", { class: "pile" },
      h("div", {},
        h("p", { class: "surtitre" }, "Comptabilité"),
        h("h1", {}, "Impayés et relances"),
        h("p", { class: "chapo" }, "Rien ne part tout seul : la plateforme te signale chaque relance à faire, tu relances par email ou par téléphone, puis tu la notes.")),
      info ? message("info", info) : null,
      h("div", { class: "compteurs compteurs-trois" },
        h("div", { class: `compteur${aFaire.length ? " compteur-rouge" : ""}` }, h("span", { class: "compteur-valeur" }, String(aFaire.length)), h("span", { class: "compteur-libelle" }, aFaire.length > 1 ? "relances à faire" : "relance à faire")),
        h("div", { class: `compteur${data.some((e) => e.statut === "en_retard") ? " compteur-rouge" : ""}` }, h("span", { class: "compteur-valeur" }, somme(data.filter((e) => e.statut === "en_retard"))), h("span", { class: "compteur-libelle" }, "en retard")),
        h("div", { class: "compteur compteur-orange" }, h("span", { class: "compteur-valeur" }, somme(aVenir)), h("span", { class: "compteur-libelle" }, "à encaisser (non échu)"))),
      h("section", { class: "pile-serree" },
        h("div", { class: "section-titre" }, h("h2", {}, "Relances à faire"), h("p", {}, String(aFaire.length))),
        aFaire.length ? h("div", { class: "pile" }, aFaire.map(ligneAvecClient)) : message("info", "Aucune relance à faire aujourd'hui.")),
      retard.length ? h("section", { class: "pile-serree" },
        h("div", { class: "section-titre" }, h("h2", {}, "En retard, relance déjà faite"), h("p", {}, String(retard.length))),
        h("div", { class: "pile" }, retard.map(ligneAvecClient))) : null,
      h("section", { class: "pile-serree" },
        h("div", { class: "section-titre" }, h("h2", {}, "À encaisser"), h("p", {}, String(aVenir.length))),
        aVenir.length ? h("div", { class: "pile" }, aVenir.map(ligneAvecClient)) : h("p", { class: "aide" }, "Rien en attente."))));
    if (document.activeElement && document.activeElement.type === "date") document.activeElement.blur();
    window.scrollTo(0, 0);
  }

  // ===========================================================================
  // ÉCHANGES AVEC UN ORGANISME : un sous-onglet par canal
  // ===========================================================================
  // Email    : fenêtre Gmail de la boîte Fil Rouge, déjà remplie.
  // Téléphone: lance l'appel (tel:) depuis l'appareil utilisé.
  // WhatsApp : ouvre la conversation (WhatsApp Web sur ordinateur).
  // SMS      : ouvre l'application SMS (téléphone).
  // Après chaque action : « Noter dans l'historique », déjà rempli.
  // Un nouveau canal = une entrée de plus dans CANAUX_CONTACT.
  // ===========================================================================

  const CANAUX_CONTACT = [
    ["email", "📧 Email"],
    ["telephone", "📞 Téléphone"],
    ["whatsapp", "💬 WhatsApp"],
    ["sms", "✉️ SMS"],
  ];
  let canalOrganismeMemo = "email";

  function blocCanauxOrganisme(org, suivi, apresNote) {
    const C = window.FilRougeContact;
    const boite = (window.FIL_ROUGE_CONFIG || {}).emailFilRouge || "";
    const surIphone = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const prenomContact = (suivi.contact_nom || "").trim().split(" ")[0];
    const salutation = `Bonjour${prenomContact ? " " + prenomContact : ""},`;
    const signature = "Émilie Rachas\nFil Rouge Apprenants";

    // Note rapide dans l'historique, proposée après l'action.
    function noter(zone, canal, texteParDefaut) {
      const champ = h("textarea", { class: "commentaire-champ", rows: "2", "aria-label": "Résumé de l'échange" });
      champ.value = texteParDefaut;
      const ok = h("button", { type: "button", class: "bouton bouton-petit" }, "Ajouter à l'historique");
      const non = h("button", { type: "button", class: "bouton-lien" }, "Pas maintenant");
      const retour = h("div");
      non.addEventListener("click", () => zone.replaceChildren());
      ok.addEventListener("click", async () => {
        if (!champ.value.trim()) return signaler(retour, "erreur", "Écris l'échange en une phrase.");
        occupe(ok, true, "Ajout…");
        const { error } = await insererEchange({ organisme_id: org.id, date_echange: aujourdhui(), canal, resume: champ.value.trim(), auteur_id: etat.profil.id });
        occupe(ok, false);
        if (error) return signaler(retour, "erreur", texteErreur(error));
        apresNote();
      });
      zone.replaceChildren(h("div", { class: "carte carte-large pile-serree note-echange" },
        h("p", { class: "aide" }, "C'est fait ? Note-le dans l'historique (modifiable) :"),
        champ, retour, h("div", { class: "actions-ligne" }, ok, non)));
      champ.focus();
    }

    const champNumero = (prefixe, libelle) => champTexte(`${prefixe}-numero`, libelle, suivi.contact_telephone || "", { type: "tel", inputmode: "tel", placeholder: "06 12 34 56 78" });
    const champMessage = (prefixe, texte) => {
      const c = champTexte(`${prefixe}-message`, "Message (modifiable)", texte, { multiligne: true });
      c.champ.rows = 6;
      return c;
    };
    const sansContact = (quoi) => h("p", { class: "aide" }, `Pas de ${quoi} enregistré pour ce contact : tape-le ici, ou complète-le dans l'onglet Suivi commercial.`);

    // --- Email ---
    const zoneEmail = h("div");
    const dest = champTexte("canal-email-dest", "Destinataire", suivi.contact_email || "", { type: "email", inputmode: "email" });
    const objet = champTexte("canal-email-objet", "Objet", `Fil Rouge Apprenants — ${org.nom}`);
    const corpsEmail = champMessage("canal-email", `${salutation}\n\n\n\nBelle journée,\n${signature}`);
    const ouvrirEmail = h("a", { class: "bouton", target: "_blank", rel: "noopener" }, "Ouvrir dans Gmail (boîte Fil Rouge)");
    const majEmail = () => {
      const lien = C.lienGmail(dest.champ.value, objet.champ.value, corpsEmail.champ.value, boite);
      if (lien) ouvrirEmail.setAttribute("href", lien); else ouvrirEmail.removeAttribute("href");
      ouvrirEmail.classList.toggle("bouton-inactif", !lien);
    };
    [dest, objet, corpsEmail].forEach((c) => c.champ.addEventListener("input", majEmail));
    majEmail();
    ouvrirEmail.addEventListener("click", (e) => {
      if (!ouvrirEmail.getAttribute("href")) { e.preventDefault(); return signaler(zoneEmail, "erreur", "Indique une adresse email valable."); }
      noter(zoneEmail, "email", `Email envoyé : ${objet.champ.value.trim()}`);
    });
    const panneauEmail = h("div", { class: "carte carte-large pile-serree" },
      suivi.contact_email ? null : sansContact("email"),
      h("p", { class: "aide" }, `L'email part de ${boite || "la boîte Fil Rouge"}, avec ta signature.`),
      dest.bloc, objet.bloc, corpsEmail.bloc,
      h("div", { class: "actions-ligne" }, ouvrirEmail), zoneEmail);

    // --- Téléphone ---
    const zoneTel = h("div");
    const numTel = champNumero("canal-tel", "Numéro à appeler");
    const appeler = h("a", { class: "bouton" }, "📞 Appeler");
    const majTel = () => {
      const n = numTel.champ.value.replace(/[^\d+]/g, "");
      if (n.length >= 6) appeler.setAttribute("href", `tel:${n}`); else appeler.removeAttribute("href");
      appeler.textContent = n.length >= 6 ? `📞 Appeler · ${numTel.champ.value.trim()}` : "📞 Appeler";
    };
    numTel.champ.addEventListener("input", majTel);
    majTel();
    appeler.addEventListener("click", (e) => {
      if (!appeler.getAttribute("href")) { e.preventDefault(); return signaler(zoneTel, "erreur", "Indique un numéro de téléphone."); }
      noter(zoneTel, "telephone", "Appel : ");
    });
    const panneauTel = h("div", { class: "carte carte-large pile-serree" },
      suivi.contact_telephone ? null : sansContact("téléphone"),
      h("p", { class: "aide" }, "L'appel part de l'appareil sur lequel tu cliques : ton téléphone, ou ton ordinateur s'il est relié à un téléphone. Quand tu auras ta ligne pro, il suffira d'appeler depuis ce téléphone."),
      numTel.bloc, h("div", { class: "actions-ligne" }, appeler), zoneTel);

    // --- WhatsApp ---
    const zoneWa = h("div");
    const numWa = champNumero("canal-wa", "Numéro WhatsApp");
    const messageWa = champMessage("canal-wa", `${salutation}\n\n\n\n${signature}`);
    const ouvrirWa = h("a", { class: "bouton", target: "_blank", rel: "noopener" }, "💬 Ouvrir WhatsApp");
    const majWa = () => {
      const lien = C.lienWhatsApp(numWa.champ.value, messageWa.champ.value);
      if (lien) ouvrirWa.setAttribute("href", lien); else ouvrirWa.removeAttribute("href");
    };
    [numWa, messageWa].forEach((c) => c.champ.addEventListener("input", majWa));
    majWa();
    ouvrirWa.addEventListener("click", (e) => {
      if (!ouvrirWa.getAttribute("href")) { e.preventDefault(); return signaler(zoneWa, "erreur", "Indique un numéro de téléphone."); }
      noter(zoneWa, "whatsapp", "Message WhatsApp envoyé : ");
    });
    const panneauWa = h("div", { class: "carte carte-large pile-serree" },
      suivi.contact_telephone ? null : sansContact("téléphone"),
      h("p", { class: "aide" }, "Sur ordinateur, s'ouvre dans WhatsApp Web ; sur téléphone, dans l'application. Le message est déjà écrit, il ne reste qu'à l'envoyer."),
      numWa.bloc, messageWa.bloc, h("div", { class: "actions-ligne" }, ouvrirWa), zoneWa);

    // --- SMS ---
    const zoneSms = h("div");
    const numSms = champNumero("canal-sms", "Numéro");
    const messageSms = champMessage("canal-sms", `${salutation} \n\nÉmilie, Fil Rouge Apprenants`);
    const ouvrirSms = h("a", { class: "bouton" }, "✉️ Ouvrir les SMS");
    const majSms = () => {
      const lien = C.lienSms(numSms.champ.value, messageSms.champ.value, surIphone);
      if (lien) ouvrirSms.setAttribute("href", lien); else ouvrirSms.removeAttribute("href");
    };
    [numSms, messageSms].forEach((c) => c.champ.addEventListener("input", majSms));
    majSms();
    ouvrirSms.addEventListener("click", (e) => {
      if (!ouvrirSms.getAttribute("href")) { e.preventDefault(); return signaler(zoneSms, "erreur", "Indique un numéro de téléphone."); }
      noter(zoneSms, "sms", "SMS envoyé : ");
    });
    const panneauSms = h("div", { class: "carte carte-large pile-serree" },
      suivi.contact_telephone ? null : sansContact("téléphone"),
      h("p", { class: "aide" }, "Fonctionne depuis un téléphone (sur ordinateur, seulement s'il est relié à un téléphone)."),
      numSms.bloc, messageSms.bloc, h("div", { class: "actions-ligne" }, ouvrirSms), zoneSms);

    const panneaux = { email: panneauEmail, telephone: panneauTel, whatsapp: panneauWa, sms: panneauSms };
    return barreOnglets("canaux", CANAUX_CONTACT.map(([cle, texte]) => [cle, texte, panneaux[cle]]),
      canalOrganismeMemo, (cle) => { canalOrganismeMemo = cle; }, { libelle: "Canal de contact" });
  }

  // Onglet « Coaching » de la fiche : Stage, Examen, Projet, Organisation.
  function blocCoachingFiche(a, fiche, peutModifier, rafraichir, contenuExamen, memo) {
    const f = fiche || {};
    const vide = (v) => (v === undefined || v === null ? "" : v);
    const texte = (c) => c.champ.value.trim() || null;
    const majAdresse = () => {
      const cible = `#/apprenant/${a.id}/${memo.onglet}${memo.onglet === "coaching" ? `/${memo.partie}` : ""}`;
      if (window.location.hash !== cible) history.replaceState(null, "", cible);
    };

    // Un formulaire par partie, avec deux façons d'enregistrer :
    //  - « Enregistrer <partie> » (en haut à droite) : commentaire de cette partie seulement ;
    //  - « Enregistrer » (en bas) : commentaire complet Stage + Examen + Projet + Organisation.
    const NOM_PARTIE = { stage: "stage", examen: "examen", projet: "projet", organisation: "organisation" };
    function formulairePartie(partie, champTete, autresChamps, valeurs, verifier) {
      const zone = h("div");
      const boutonPartie = h("button", { class: "bouton bouton-secondaire bouton-petit bouton-partie", type: "button", title: "Enregistre et ajoute un commentaire avec seulement cette partie" }, `Enregistrer ${NOM_PARTIE[partie]}`);
      const bouton = h("button", { class: "bouton", type: "submit", title: "Enregistre et met à jour le commentaire complet du coaching" }, "Enregistrer");
      async function enregistrer(mode, b) {
        const probleme = verifier ? verifier() : null;
        if (probleme) return signaler(zone, "erreur", probleme);
        signaler(zone);
        occupe(b, true, "Enregistrement…");
        const { error } = await sb.rpc("enregistrer_coaching", { p_apprenant: a.id, p_partie: partie, p_mode: mode, p_valeurs: valeurs() });
        occupe(b, false);
        if (error) return signaler(zone, "erreur", texteErreur(error));
        rafraichir(mode === "partie" ? `Enregistré : commentaire « ${NOM_PARTIE[partie]} » ajouté.` : "Coaching enregistré : commentaire complet mis à jour.");
      }
      boutonPartie.addEventListener("click", () => enregistrer("partie", boutonPartie));
      const form = h("form", { class: "formulaire", novalidate: true },
        h("div", { class: "coaching-tete" }, h("div", { class: "coaching-tete-champ" }, champTete), boutonPartie),
        autresChamps, zone, bouton);
      form.addEventListener("submit", (evenement) => { evenement.preventDefault(); enregistrer("tout", bouton); });
      return h("div", { class: "carte carte-large" }, form);
    }
    const champLibre = (id, valeur, exemple) => {
      const c = champTexte(id, "Notes libres (visibles par l'organisme)", vide(valeur), { multiligne: true, placeholder: exemple });
      c.champ.rows = 4;
      c.champ.maxLength = 2000;
      return c;
    };
    const lecture = (lignes) => {
      const utiles = lignes.filter(([, v]) => v);
      return utiles.length
        ? h("dl", { class: "resume-coaching" }, utiles.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]))
        : message("info", "Rien de renseigné pour l'instant.");
    };

    // --- Stage ---
    let stage;
    if (peutModifier) {
      const statut = champChoix("co-stage-statut", "Situation", LIBELLE_STAGE, f.stage_statut || "non_concerne");
      const debut = champTexte("co-stage-debut", "Début du stage", vide(f.stage_debut), { type: "date" });
      const fin = champTexte("co-stage-fin", "Fin du stage", vide(f.stage_fin), { type: "date" });
      const noteStage = champLibre("co-stage-note", f.stage_note, "Ex. : crèche Les Petits Pas à Lormont, tutrice Mme Martin, convention envoyée le 12/10…");
      stage = formulairePartie("stage", statut.bloc, [h("div", { class: "deux-colonnes" }, debut.bloc, fin.bloc), noteStage.bloc],
        () => ({ stage_statut: statut.champ.value, stage_debut: debut.champ.value, stage_fin: fin.champ.value, stage_note: noteStage.champ.value }),
        () => (debut.champ.value && fin.champ.value && fin.champ.value < debut.champ.value ? "La fin du stage est avant son début." : null));
    } else {
      stage = lecture([["Situation", LIBELLE_STAGE[f.stage_statut || "non_concerne"]],
        ["Dates", [f.stage_debut ? `du ${dateLisible(f.stage_debut)}` : null, f.stage_fin ? `au ${dateLisible(f.stage_fin)}` : null].filter(Boolean).join(" ")],
        ["Notes", f.stage_note]]);
    }

    // --- Projet ---
    let projet;
    if (peutModifier) {
      const metier = champTexte("co-projet-metier", "Métier visé", vide(f.projet_metier), { placeholder: "Ex. : auxiliaire de crèche" });
      const situation = champChoix("co-projet-situation", "Situation de l'élève", { "": "— Non renseignée —", ...LIBELLE_SITUATION }, f.projet_situation || "");
      const note = champTexte("co-projet-note", "Ce qui le motive, ses freins (visible par l'organisme)", vide(f.projet_note), { multiligne: true });
      projet = formulairePartie("projet", metier.bloc, [situation.bloc, note.bloc],
        () => ({ projet_metier: metier.champ.value, projet_situation: situation.champ.value, projet_note: note.champ.value }));
    } else {
      projet = lecture([["Métier visé", f.projet_metier], ["Situation", f.projet_situation ? LIBELLE_SITUATION[f.projet_situation] : null], ["Motivation", f.projet_note]]);
    }

    // --- Organisation ---
    let organisation;
    if (peutModifier) {
      const heures = champTexte("co-orga-heures", "Heures par semaine", vide(f.orga_heures_semaine), { type: "number", inputmode: "numeric" });
      heures.champ.min = "0";
      heures.champ.max = "60";
      const finVisee = champTexte("co-orga-fin", "Fin de parcours visée", vide(f.orga_date_fin_visee), { type: "date" });
      const creneaux = champTexte("co-orga-creneaux", "Créneaux disponibles", vide(f.orga_creneaux), { placeholder: "Ex. : mardi et jeudi soir" });
      const objectif = champTexte("co-orga-objectif", "Objectif du mois", vide(f.orga_objectif), { placeholder: "Ex. : terminer les modules 4 et 5" });
      const noteOrga = champLibre("co-orga-note", f.orga_note, "Ex. : révise le soir après le travail, garde des enfants le mercredi…");
      organisation = formulairePartie("organisation", h("div", { class: "deux-colonnes" }, heures.bloc, finVisee.bloc), [creneaux.bloc, objectif.bloc, noteOrga.bloc],
        () => ({ orga_heures_semaine: heures.champ.value, orga_date_fin_visee: finVisee.champ.value, orga_creneaux: creneaux.champ.value, orga_objectif: objectif.champ.value, orga_note: noteOrga.champ.value }),
        () => {
          const n = heures.champ.value === "" ? null : Number(heures.champ.value);
          return n !== null && (!Number.isInteger(n) || n < 0 || n > 60) ? "Heures par semaine : un nombre entier entre 0 et 60." : null;
        });
    } else {
      organisation = lecture([["Objectif du mois", f.orga_objectif],
        ["Temps disponible", f.orga_heures_semaine !== null && f.orga_heures_semaine !== undefined ? `${f.orga_heures_semaine} h par semaine` : null],
        ["Créneaux", f.orga_creneaux], ["Fin visée", f.orga_date_fin_visee ? dateLisible(f.orga_date_fin_visee) : null], ["Notes", f.orga_note]]);
    }

    // --- Examen : date, présence, résultat (fiche) + notes libres ---
    let examen;
    if (peutModifier) {
      const noteExamen = champLibre("co-examen-note", f.examen_note, "Ex. : convocation reçue, centre d'examen à Mérignac, stressée par l'oral…");
      if (etat.profil?.role === "admin") {
        // Date, présence, résultat et notes : un seul formulaire.
        const date = champTexte("co-examen-date", "Date d'examen", vide(a.date_examen), { type: "date" });
        const presence = champChoix("co-examen-presence", "Présence", { "": "À venir / inconnue", present: "Présent·e", absent: "Absent·e" }, a.presence_examen || "");
        const resultat = champChoix("co-examen-resultat", "Résultat", { "": "Inconnu", reussi: "Réussi", echoue: "Échoué" }, a.resultat_examen || "");
        const majResultat = () => { resultat.champ.disabled = presence.champ.value !== "present"; if (resultat.champ.disabled) resultat.champ.value = ""; };
        presence.champ.addEventListener("change", majResultat);
        majResultat();
        examen = formulairePartie("examen", date.bloc, [h("div", { class: "deux-colonnes" }, presence.bloc, resultat.bloc), noteExamen.bloc],
          () => ({ date_examen: date.champ.value, presence_examen: presence.champ.value, resultat_examen: resultat.champ.value, examen_note: noteExamen.champ.value }),
          () => (!date.champ.value && presence.champ.value ? "Indiquez d'abord la date de l'examen." : null));
      } else {
        // Appelante : la date d'examen se lit, les notes s'écrivent.
        examen = h("div", { class: "pile" }, contenuExamen,
          formulairePartie("examen", noteExamen.bloc, [], () => ({ examen_note: noteExamen.champ.value })));
      }
    } else {
      examen = h("div", { class: "pile" }, contenuExamen, f.examen_note ? lecture([["Notes", f.examen_note]]) : null);
    }

    const sousOnglets = barreOnglets("coaching", [
      ["stage", "Stage", stage],
      ["examen", "Examen", examen],
      ["projet", "Projet", projet],
      ["organisation", "Organisation", organisation],
    ].filter(([, , contenu]) => contenu), memo.partie, (cle) => { memo.partie = cle; majAdresse(); });

    return sousOnglets;
  }

  // ---------------------------------------------------------------------------
  // Déconnexion et démarrage
  // ---------------------------------------------------------------------------

  boutonDeconnexion.addEventListener("click", async () => {
    await sb.auth.signOut();
    zoneCompte.hidden = true;
    etat.profil = null;
    ecranEmail("Déconnexion effectuée. À bientôt.");
  });

  sb.auth.onAuthStateChange((evenement) => {
    if (evenement === "SIGNED_OUT") {
      zoneCompte.hidden = true;
    }
  });

  aiguiller().catch(() => {
    afficher(message("erreur", "Impossible de joindre le serveur. Vérifiez votre connexion internet, puis rechargez la page."));
  });
})();
