// =============================================================================
// Fil Rouge Apprenants — Entraînement aux appels (#/entrainement)
// =============================================================================
// Les appelantes s'entraînent à appeler des apprenants FICTIFS joués par l'IA.
//
//   #/entrainement                      choix du scénario, derniers résultats
//                                       (admin : résultats de toutes les appelantes
//                                       et gestion des scénarios)
//   #/entrainement/appel/<scenario>     l'appel (voix ou écrit), avec chrono
//   #/entrainement/resultat/<session>   la note sur 20 et l'évaluation détaillée
//   #/entrainement/scenario/<id|nouveau> modifier / créer un scénario (admin)
//
// La voix utilise ce que le navigateur sait faire tout seul (gratuit) :
//   - reconnaissance vocale (Chrome, Edge, Android) pour ce que dit l'appelante ;
//   - synthèse vocale pour la voix de l'apprenant.
// Sans reconnaissance vocale (Firefox, certains iPhone), on passe en écrit.
//
// L'IA est appelée uniquement par la fonction serveur « simulation-appel ».
// Sécurité : tout le texte est inséré avec textContent (via h), jamais innerHTML.
// =============================================================================

(function () {
  "use strict";

  const DIFFICULTES = { facile: "Facile", moyen: "Moyen", difficile: "Difficile" };
  const PASTILLE_DIFFICULTE = { facile: "pastille-vert", moyen: "pastille-orange", difficile: "pastille-rouge" };
  const SILENCE_AVANT_ENVOI = 1800; // ms de silence avant d'envoyer ce que l'appelante a dit
  const PRENOMS_FEMININS = /^(claire|sandrine|accueil|julie|mme|sarah|nadia|fatima|julie|madame|mme|marie|lea|léa|emma|chloe|chloé|camille|ines|inès|amina|sophie|laura|manon|clara|lucie|nathalie|sandrine|isabelle|aurelie|aurélie|emilie|émilie|karima|yasmine|samira)\b/i;

  window.FilRougeEntrainement = function (outils) {
    const { sb, h, afficher, message, texteErreur, champTexte, champChoix } = outils;
    const estAdmin = () => outils.role() === "admin";
    let appelEnCours = null; // pour couper micro et voix quand on quitte l'écran

    // -------------------------------------------------------------------------
    // Petits outils
    // -------------------------------------------------------------------------
    const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const voixDisponible = () => Boolean(Reconnaissance && window.speechSynthesis);

    function lien(chemin, ...enfants) {
      return h("a", { href: `#/${chemin}`, class: "lien-interne" }, ...enfants);
    }
    function pastilleDifficulte(d) {
      return h("span", { class: `pastille ${PASTILLE_DIFFICULTE[d] || "pastille-neutre"}` }, DIFFICULTES[d] || d);
    }
    function pastilleNote(n) {
      if (n === null || n === undefined) return h("span", { class: "pastille pastille-neutre" }, "Non noté");
      const classe = n >= 14 ? "pastille-vert" : n >= 10 ? "pastille-orange" : "pastille-rouge";
      return h("span", { class: `pastille ${classe}` }, `${n}/20`);
    }
    function duree(s) {
      if (!s && s !== 0) return "";
      const m = Math.floor(s / 60);
      return `${m} min ${String(s % 60).padStart(2, "0")} s`;
    }
    function dateCourte(iso) {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    function prenom(nom) { return String(nom || "").trim().split(/\s+/)[0] || "l'apprenant"; }

    // Appel à la fonction serveur, avec un message d'erreur lisible
    async function serveur(corps) {
      const { data, error } = await sb.functions.invoke("simulation-appel", { body: corps });
      if (error) {
        let texte = "L'IA ne répond pas pour le moment. Réessayez dans un instant.";
        try {
          const detail = await error.context?.json?.();
          if (detail?.erreur) texte = detail.erreur;
        } catch { /* message par défaut */ }
        throw new Error(texte);
      }
      return data;
    }

    function arreterAppel() {
      if (!appelEnCours) return;
      appelEnCours.fermer();
      appelEnCours = null;
    }
    window.addEventListener("hashchange", () => {
      if (appelEnCours && !window.location.hash.startsWith("#/entrainement/appel/")) arreterAppel();
    });

    // -------------------------------------------------------------------------
    // Aiguillage
    // -------------------------------------------------------------------------
    function route(morceaux) {
      const [sous, brut] = morceaux;
      const id = brut ? String(brut).split("?")[0] : brut;
      if (sous === "appel" && id) return ecranAppel(id);
      if (sous === "resultat" && id) return ecranResultat(id);
      if (sous === "scenario" && id && estAdmin()) return ecranScenario(id);
      // Administratrice : l'entraînement, c'est la prospection B2B des centres de formation.
      // Le suivi des apprenants (appelantes) reste accessible par « equipe ».
      if (estAdmin() && sous !== "equipe") return ecranVente();
      return ecranAccueil();
    }

    // -------------------------------------------------------------------------
    // Accueil : scénarios + résultats
    // -------------------------------------------------------------------------
    async function ecranAccueil() {
      arreterAppel();
      afficher(h("p", { class: "chargement" }, "Chargement de l'entraînement…"));
      const admin = estAdmin();
      const [scen, sess] = await Promise.all([
        sb.from("entrainement_scenarios").select("id, type, titre, difficulte, apprenant_nom, formation, actif, ordre").order("ordre").order("titre"),
        sb.from("entrainement_sessions")
          .select("id, appelante_id, scenario_titre, statut, debut, duree_secondes, note_sur_20, profils ( nom_affiche, email )")
          .eq("statut", "terminee").order("debut", { ascending: false }).limit(admin ? 60 : 20),
      ]);
      if (scen.error || sess.error) return afficher(message("erreur", texteErreur(scen.error || sess.error)));

      const actifs = scen.data.filter((s) => s.actif && s.type !== "prospect");
      const liste = actifs.length
        ? h("ul", { class: "liste" }, actifs.map((s) =>
          h("li", { class: "ligne" },
            h("div", { class: "ligne-titre" }, s.titre),
            h("div", { class: "pastilles" }, pastilleDifficulte(s.difficulte),
              h("a", { class: "bouton bouton-petit", href: `#/entrainement/appel/${s.id}` }, "Appeler")),
            h("div", { class: "ligne-detail" }, `${s.apprenant_nom} · ${s.formation}`))))
        : message("info", admin ? "Aucun scénario actif : ajoutez-en un plus bas." : "Aucun scénario disponible pour le moment.");

      const mesSessions = sess.data.filter((x) => !admin || x.appelante_id === outils.monId());
      const autres = admin ? sess.data : [];
      const moyenne = (lst) => {
        const n = lst.filter((x) => x.note_sur_20 !== null);
        return n.length ? Math.round((n.reduce((a, x) => a + x.note_sur_20, 0) / n.length) * 10) / 10 : null;
      };
      const ligneSession = (x, avecNom) => h("li", { class: "ligne" },
        h("div", { class: "ligne-titre" }, lien(`entrainement/resultat/${x.id}`, avecNom ? `${x.profils?.nom_affiche || x.profils?.email || "Appelante"} — ${x.scenario_titre}` : x.scenario_titre)),
        h("div", { class: "pastilles" }, pastilleNote(x.note_sur_20)),
        h("div", { class: "ligne-detail" }, `${dateCourte(x.debut)} · ${duree(x.duree_secondes)}`));

      const blocMoi = h("section", { class: "pile pile-serree" },
        h("div", { class: "section-titre" }, h("h2", {}, admin ? "Mes appels d'essai" : "Mes derniers appels"),
          mesSessions.length ? h("span", { class: "aide" }, `Moyenne : ${String(moyenne(mesSessions)).replace(".", ",")}/20 sur ${mesSessions.length} appel${mesSessions.length > 1 ? "s" : ""}`) : null),
        mesSessions.length ? h("ul", { class: "liste" }, mesSessions.map((x) => ligneSession(x, false)))
          : h("p", { class: "aide" }, "Vos appels d'entraînement et leurs notes apparaîtront ici."));

      let blocEquipe = null;
      let blocScenarios = null;
      if (admin) {
        const equipe = autres.filter((x) => x.appelante_id !== outils.monId());
        // Synthèse par appelante : nombre d'appels, moyenne, dernière note
        const parPersonne = new Map();
        for (const x of equipe) {
          const nom = x.profils?.nom_affiche || x.profils?.email || "Appelante";
          if (!parPersonne.has(nom)) parPersonne.set(nom, []);
          parPersonne.get(nom).push(x);
        }
        blocEquipe = h("section", { class: "pile pile-serree" },
          h("h2", {}, "Résultats des appelantes"),
          equipe.length
            ? [
              h("ul", { class: "liste" }, [...parPersonne.entries()].map(([nom, lst]) => h("li", { class: "ligne" },
                h("div", { class: "ligne-titre" }, nom),
                h("div", { class: "pastilles" }, h("span", { class: "pastille pastille-neutre" }, `${lst.length} appel${lst.length > 1 ? "s" : ""}`), pastilleNote(moyenne(lst) === null ? null : Math.round(moyenne(lst)))),
                h("div", { class: "ligne-detail" }, `Moyenne ${String(moyenne(lst)).replace(".", ",")}/20 · dernier appel le ${dateCourte(lst[0].debut)}`)))),
              h("details", { class: "depliant" }, h("summary", {}, "Tous les appels de l'équipe"),
                h("ul", { class: "liste" }, equipe.map((x) => ligneSession(x, true)))),
            ]
            : h("p", { class: "aide" }, "Quand une appelante s'entraîne, sa note et l'évaluation détaillée apparaissent ici."));

        blocScenarios = h("section", { class: "pile pile-serree" },
          h("div", { class: "section-titre" }, h("h2", {}, "Gérer les scénarios"),
            h("a", { class: "bouton bouton-petit bouton-secondaire", href: "#/entrainement/scenario/nouveau" }, "Ajouter un scénario")),
          h("p", { class: "aide" }, "Les prospects fictifs (appels de vente) sont dans ", lien("entrainement", "Entraînement à la prospection"), "."),
          h("ul", { class: "liste" }, scen.data.filter((x) => x.type !== "prospect").map((s) => h("li", { class: "ligne" },
            h("div", { class: "ligne-titre" }, lien(`entrainement/scenario/${s.id}`, s.titre)),
            h("div", { class: "pastilles" }, s.actif ? pastilleDifficulte(s.difficulte) : h("span", { class: "pastille pastille-neutre" }, "Masqué")),
            h("div", { class: "ligne-detail" }, `${s.apprenant_nom} · ${s.formation}`)))));
      }

      afficher(h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, "Entraînement"),
          h("h1", {}, "S'entraîner aux appels"),
          h("p", { class: "chapo" }, "Un apprenant fictif, joué par l'IA, décroche. Menez l'appel comme un vrai, puis raccrochez : vous recevez une note sur 20 et des conseils précis.")),
        voixDisponible() ? null : message("info", "Ce navigateur ne reconnaît pas la voix : l'appel se fera par écrit. Pour parler à voix haute, ouvrez la plateforme dans Google Chrome."),
        h("section", { class: "pile pile-serree" }, h("h2", {}, "Choisir un apprenant à appeler"), liste),
        blocMoi, blocEquipe, blocScenarios));
    }

    // -------------------------------------------------------------------------
    // L'appel
    // -------------------------------------------------------------------------
    async function ecranAppel(scenarioId) {
      arreterAppel();
      afficher(h("p", { class: "chargement" }, "Préparation de l'appel…"));
      const { data: s, error } = await sb.from("entrainement_scenarios")
        .select("id, type, titre, difficulte, apprenant_nom, formation, financement, progression, derniere_connexion, contexte, objectif_appel")
        .eq("id", scenarioId).maybeSingle();
      if (error) return afficher(message("erreur", texteErreur(error)));
      if (!s) return afficher(message("erreur", "Ce scénario n'existe pas ou n'est plus disponible."), lien("entrainement", "← Retour à l'entraînement"));

      const vente = s.type === "prospect";
      const fiche = h("div", { class: "carte carte-large entr-fiche" },
        h("div", { class: "section-titre" }, h("h2", {}, s.apprenant_nom), pastilleDifficulte(s.difficulte)),
        h("dl", { class: "entr-infos" },
          h("dt", {}, vente ? "Organisme" : "Formation"), h("dd", {}, s.formation),
          s.financement ? [h("dt", {}, vente ? "Taille" : "Financement"), h("dd", {}, s.financement)] : null,
          s.progression !== null ? [h("dt", {}, "Progression"), h("dd", {}, `${s.progression} %`)] : null,
          s.derniere_connexion ? [h("dt", {}, vente ? "Origine du contact" : "Dernière connexion"), h("dd", {}, s.derniere_connexion)] : null),
        h("p", {}, s.contexte),
        h("p", { class: "entr-objectif" }, h("strong", {}, "Objectif de l'appel : "), s.objectif_appel));

      const avecVoix = voixDisponible();
      const choixMode = avecVoix
        ? champChoix("entr-mode", "Comment voulez-vous mener l'appel ?", { voix: "À voix haute (micro + haut-parleur)", ecrit: "Par écrit" }, "voix")
        : null;
      const zone = h("div");
      const texteAppeler = vente ? "📞 Lancer l'appel" : `Appeler ${prenom(s.apprenant_nom)}`;
      s.texteAppeler = texteAppeler;
      const boutonAppeler = h("button", { class: "bouton", type: "button" }, texteAppeler);
      boutonAppeler.addEventListener("click", () => {
        const mode = choixMode ? choixMode.champ.value : "ecrit";
        demarrerAppel(s, mode, boutonAppeler, zone);
      });

      afficher(h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, vente ? lien("entrainement", "← Entraînement à la prospection") : lien(estAdmin() ? "entrainement/equipe" : "entrainement", "← Entraînement")),
          h("h1", {}, s.titre),
          h("p", { class: "chapo" }, vente ? "Lis la fiche comme avant un vrai appel de prospection, garde ton script à côté, puis lance l'appel." : "Lisez la fiche comme avant un vrai appel. Quand vous êtes prête, appelez.")),
        fiche,
        h("div", { class: "pile pile-serree entr-depart" },
          choixMode ? choixMode.bloc : null,
          avecVoix && window.FilRougeVoix ? window.FilRougeVoix.reglage(h) : null,
          avecVoix ? h("p", { class: "aide" }, "Avec la voix : parlez normalement, la phrase part toute seule après un court silence. Utilisez un casque pour éviter l'écho. Le navigateur vous demandera l'autorisation d'utiliser le micro.") : null,
          zone,
          h("div", { class: "actions" }, boutonAppeler))));
    }

    async function demarrerAppel(s, mode, boutonAppeler, zoneErreur) {
      boutonAppeler.disabled = true;
      boutonAppeler.textContent = "Ça sonne…";
      zoneErreur.replaceChildren();
      let depart;
      try {
        depart = await serveur({ action: "demarrer", scenario_id: s.id, mode });
      } catch (e) {
        boutonAppeler.disabled = false;
        boutonAppeler.textContent = s.texteAppeler || `Appeler ${prenom(s.apprenant_nom)}`;
        return zoneErreur.replaceChildren(message("erreur", e.message));
      }
      const sessionId = depart.session_id;
      const debut = Date.now();
      let termine = false;
      let occupe = false;

      // ---- Éléments de l'écran
      const fil = h("div", { class: "entr-fil", "aria-live": "polite" });
      const chrono = h("span", { class: "entr-chrono" }, "0:00");
      const etatTexte = h("p", { class: "entr-etat" });
      const zone = h("div");
      const saisie = h("textarea", { id: "entr-saisie", rows: "2", placeholder: mode === "voix" ? "Ce que vous dites s'affiche ici (vous pouvez aussi taper)" : "Tapez ce que vous dites à l'apprenant…", maxlength: "600" });
      const boutonEnvoyer = h("button", { class: "bouton bouton-petit", type: "button" }, "Envoyer");
      const boutonMicro = mode === "voix" ? h("button", { class: "bouton bouton-petit bouton-secondaire entr-micro", type: "button", "aria-pressed": "false" }, "Couper le micro") : null;
      const boutonSon = mode === "voix" ? h("button", { class: "bouton-lien", type: "button" }, "Couper le son") : null;
      const boutonRaccrocher = h("button", { class: "bouton bouton-danger", type: "button" }, "Raccrocher");

      const ajouter = (qui, texte) => {
        fil.append(h("div", { class: `entr-bulle entr-${qui}` },
          h("span", { class: "entr-qui" }, qui === "apprenant" ? (s.type === "prospect" ? "Prospect" : s.apprenant_nom) : "Vous"), h("span", {}, texte)));
        fil.scrollTop = fil.scrollHeight;
      };

      // ---- Voix de l'apprenant (synthèse vocale du navigateur)
      let sonActif = true;
      const V = window.FilRougeVoix;
      const synth = V && V.dispo ? { cancel: () => V.arreter() } : null;
      const genre = PRENOMS_FEMININS.test(s.apprenant_nom) ? "f" : "m";
      const parler = (texte) => {
        if (mode !== "voix" || !sonActif || !synth) return Promise.resolve();
        return V.parler(texte, { genre });
      };

      // ---- Micro de l'appelante (reconnaissance vocale du navigateur)
      let micro = null;
      let microVoulu = mode === "voix";
      let ecoute = false;
      let texteFinal = "";
      let minuterieSilence = null;

      const majEtat = (texte) => { etatTexte.textContent = texte; };
      const ecouter = () => {
        if (mode !== "voix" || !microVoulu || termine || occupe || ecoute) return;
        if (!micro) {
          micro = new Reconnaissance();
          micro.lang = "fr-FR";
          micro.continuous = true;
          micro.interimResults = true;
          micro.onresult = (ev) => {
            let provisoire = "";
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const r = ev.results[i];
              if (r.isFinal) texteFinal += `${r[0].transcript} `;
              else provisoire += r[0].transcript;
            }
            saisie.value = (texteFinal + provisoire).trim();
            clearTimeout(minuterieSilence);
            minuterieSilence = setTimeout(() => { if (saisie.value.trim()) envoyer(); }, SILENCE_AVANT_ENVOI);
          };
          micro.onerror = (ev) => {
            if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
              microVoulu = false;
              zone.replaceChildren(message("erreur", "Le micro est bloqué. Autorisez-le dans le navigateur (icône à gauche de l'adresse), ou continuez par écrit."));
              if (boutonMicro) { boutonMicro.textContent = "Activer le micro"; boutonMicro.setAttribute("aria-pressed", "true"); }
            }
          };
          micro.onend = () => {
            ecoute = false;
            // Chrome coupe l'écoute après un long silence : on relance tant qu'on veut écouter.
            if (microVoulu && !termine && !occupe) setTimeout(ecouter, 200);
            else if (!termine && !occupe) majEtat("Micro coupé : tapez votre réponse.");
          };
        }
        try {
          micro.start();
          ecoute = true;
          majEtat("À vous, je vous écoute…");
        } catch { /* déjà lancé */ }
      };
      const couperMicro = () => {
        clearTimeout(minuterieSilence);
        if (micro && ecoute) { try { micro.abort(); } catch { /* rien */ } }
        ecoute = false;
      };

      // ---- Un tour de parole
      async function envoyer() {
        clearTimeout(minuterieSilence);
        const texte = saisie.value.trim();
        if (!texte || occupe || termine) return;
        occupe = true;
        couperMicro();
        texteFinal = "";
        saisie.value = "";
        zone.replaceChildren();
        ajouter("appelante", texte);
        boutonEnvoyer.disabled = true;
        majEtat(`${prenom(s.apprenant_nom)} réfléchit…`);
        try {
          const r = await serveur({ action: "repondre", session_id: sessionId, texte });
          if (termine) return;
          ajouter("apprenant", r.reponse);
          majEtat(mode === "voix" && sonActif ? `${prenom(s.apprenant_nom)} parle…` : "À vous.");
          await parler(r.reponse);
          if (r.raccroche) {
            majEtat(`${prenom(s.apprenant_nom)} a raccroché.`);
            return raccrocher();
          }
        } catch (e) {
          zone.replaceChildren(message("erreur", e.message));
          saisie.value = texte; // rien n'est perdu
          fil.lastChild?.remove();
        } finally {
          occupe = false;
          boutonEnvoyer.disabled = false;
        }
        if (!termine) {
          majEtat(mode === "voix" && microVoulu ? "À vous, je vous écoute…" : "À vous.");
          ecouter();
          if (mode !== "voix") saisie.focus();
        }
      }

      // ---- Fin de l'appel et évaluation
      async function raccrocher() {
        if (termine) return;
        termine = true;
        clearInterval(minuterie);
        couperMicro();
        synth?.cancel();
        appelEnCours = null;
        const secondes = Math.round((Date.now() - debut) / 1000);
        const evaluer = async () => {
        afficher(h("div", { class: "pile" },
          h("p", { class: "surtitre" }, "Entraînement"),
          h("h1", {}, "Appel terminé"),
          h("p", { class: "chargement" }, "L'IA évalue votre appel selon la grille Fil Rouge… (10 à 20 secondes)")));
        try {
          const r = await serveur({ action: "terminer", session_id: sessionId, duree_secondes: secondes });
          if (r.annule) {
            return afficher(h("div", { class: "pile" },
              h("h1", {}, "Appel trop court"),
              message("info", "Il faut au moins deux répliques pour obtenir une évaluation. Cet essai n'a pas été compté."),
              h("div", { class: "actions" },
                h("a", { class: "bouton", href: `#/entrainement/appel/${s.id}` }, "Recommencer"),
                s.type === "prospect" ? lien("entrainement", "Choisir un autre prospect") : lien("entrainement", "Choisir un autre apprenant"))));
          }
          window.location.hash = `#/entrainement/resultat/${sessionId}`;
        } catch (e) {
          afficher(h("div", { class: "pile" },
            h("h1", {}, "Évaluation impossible pour l'instant"),
            message("erreur", e.message),
            h("p", { class: "aide" }, "Votre appel est bien enregistré : réessayez dans quelques secondes."),
            h("div", { class: "actions" },
              h("button", { class: "bouton", type: "button", onclick: evaluer }, "Réessayer l'évaluation"),
              lien("entrainement", "← Retour à l'entraînement"))));
        }
        };
        return evaluer();
      }

      // ---- Branchements
      boutonEnvoyer.addEventListener("click", envoyer);
      saisie.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); envoyer(); }
      });
      // Dès qu'on tape au clavier, on n'envoie plus automatiquement après un silence
      saisie.addEventListener("input", () => clearTimeout(minuterieSilence));
      boutonRaccrocher.addEventListener("click", raccrocher);
      boutonMicro?.addEventListener("click", () => {
        microVoulu = !microVoulu;
        boutonMicro.textContent = microVoulu ? "Couper le micro" : "Activer le micro";
        boutonMicro.setAttribute("aria-pressed", String(!microVoulu));
        if (microVoulu) ecouter(); else { couperMicro(); majEtat("Micro coupé : tapez votre réponse."); }
      });
      boutonSon?.addEventListener("click", () => {
        sonActif = !sonActif;
        if (!sonActif) synth?.cancel();
        boutonSon.textContent = sonActif ? "Couper le son" : "Remettre le son";
      });

      const minuterie = setInterval(() => {
        const t = Math.round((Date.now() - debut) / 1000);
        chrono.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      }, 1000);

      appelEnCours = {
        fermer() {
          termine = true;
          clearInterval(minuterie);
          couperMicro();
          synth?.cancel();
        },
      };

      afficher(h("div", { class: "pile" },
        h("div", { class: "entr-tete" },
          h("div", {},
            h("p", { class: "surtitre" }, "Appel en cours"),
            h("h1", {}, s.apprenant_nom)),
          h("div", { class: "entr-tete-droite" }, h("span", { class: "entr-voyant", "aria-hidden": "true" }), chrono)),
        h("details", { class: "depliant" }, h("summary", {}, "Revoir la fiche et l'objectif"),
          h("p", {}, s.type === "prospect" ? `${s.formation} · ${s.financement || ""} · ${s.derniere_connexion || ""}` : `${s.formation} · ${s.progression ?? "?"} % · dernière connexion : ${s.derniere_connexion || "?"}`),
          h("p", {}, s.contexte),
          h("p", {}, h("strong", {}, "Objectif : "), s.objectif_appel)),
        fil,
        etatTexte,
        zone,
        h("div", { class: "entr-saisie" },
          h("label", { for: "entr-saisie", class: "entr-label-cache" }, "Votre réplique"),
          saisie,
          h("div", { class: "actions" }, boutonEnvoyer, boutonMicro, boutonSon)),
        h("div", { class: "actions entr-fin" }, boutonRaccrocher,
          h("span", { class: "aide" }, "Raccrochez quand l'appel est fini : l'évaluation arrive tout de suite."))));

      ajouter("apprenant", depart.reponse);
      majEtat(mode === "voix" ? `${prenom(s.apprenant_nom)} décroche…` : "À vous : présentez-vous.");
      await parler(depart.reponse);
      if (!termine) {
        majEtat(mode === "voix" ? "À vous, je vous écoute…" : "À vous : présentez-vous.");
        ecouter();
        if (mode !== "voix") saisie.focus();
      }
    }

    // -------------------------------------------------------------------------
    // Résultat
    // -------------------------------------------------------------------------
    async function ecranResultat(sessionId) {
      arreterAppel();
      afficher(h("p", { class: "chargement" }, "Chargement du résultat…"));
      const { data: x, error } = await sb.from("entrainement_sessions")
        .select("id, appelante_id, scenario_id, scenario_titre, mode, statut, debut, duree_secondes, transcription, note_sur_20, evaluation, profils ( nom_affiche, email )")
        .eq("id", sessionId).maybeSingle();
      if (error) return afficher(message("erreur", texteErreur(error)));
      if (!x) return afficher(message("erreur", "Résultat introuvable."), lien("entrainement", "← Retour à l'entraînement"));

      const ev = x.evaluation || {};
      const criteres = ev.criteres || [];
      const mienne = x.appelante_id === outils.monId();
      const vente = criteres.some((c) => c.cle === "accroche");
      const qui = mienne ? "Votre appel" : `Appel de ${x.profils?.nom_affiche || x.profils?.email || "l'appelante"}`;

      const blocCriteres = h("ul", { class: "liste entr-criteres" }, criteres.map((c) =>
        h("li", { class: "ligne" },
          h("div", { class: "ligne-titre" }, c.nom),
          h("div", { class: "entr-jauge", role: "img", "aria-label": `${c.note} sur 5` },
            [1, 2, 3, 4, 5].map((i) => h("span", { class: i <= c.note ? "entr-point entr-point-plein" : "entr-point" })),
            h("span", { class: "entr-jauge-texte" }, `${c.note}/5`)),
          c.commentaire ? h("div", { class: "ligne-detail" }, c.commentaire) : null)));

      const listeTexte = (titre, lst) => (lst && lst.length
        ? h("div", { class: "pile pile-serree" }, h("h3", {}, titre), h("ul", { class: "entr-puces" }, lst.map((t) => h("li", {}, t))))
        : null);

      afficher(h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, lien("entrainement", "← Entraînement")),
          h("h1", {}, x.scenario_titre),
          h("p", { class: "chapo" }, `${qui} · ${dateCourte(x.debut)} · ${duree(x.duree_secondes)} · ${x.mode === "voix" ? "à voix haute" : "par écrit"}`)),
        x.statut !== "terminee"
          ? message("info", "Cet appel n'a pas été terminé : pas d'évaluation.")
          : h("div", { class: "entr-note" },
            h("span", { class: "entr-note-chiffre" }, String(x.note_sur_20 ?? "–")), h("span", { class: "entr-note-sur" }, "/20"),
            h("span", { class: `pastille ${ev.frein_decouvert ? "pastille-vert" : "pastille-orange"}` },
              vente ? (ev.frein_decouvert ? "Étape suivante obtenue" : "Pas encore d'étape suivante")
                : (ev.frein_decouvert ? "Vrai frein découvert" : "Vrai frein pas encore découvert"))),
        criteres.length ? h("section", { class: "pile pile-serree" }, h("h2", {}, "Critère par critère"), blocCriteres) : null,
        h("div", { class: "deux-colonnes" }, listeTexte("Points forts", ev.points_forts), listeTexte("À améliorer", ev.a_ameliorer)),
        ev.phrase_modele ? h("div", { class: "message message-action" }, h("strong", {}, "Phrase à essayer la prochaine fois : "), `« ${ev.phrase_modele} »`) : null,
        h("details", { class: "depliant" }, h("summary", {}, "Relire la conversation"),
          h("div", { class: "entr-fil entr-fil-relecture" }, (x.transcription || []).map((r) =>
            h("div", { class: `entr-bulle entr-${r.qui}` }, h("span", { class: "entr-qui" }, r.qui === "apprenant" ? (vente ? "Prospect" : "Apprenant") : (vente ? "Vous" : "Appelante")), h("span", {}, r.texte))))),
        h("div", { class: "actions" },
          mienne && x.scenario_id ? h("a", { class: "bouton", href: `#/entrainement/appel/${x.scenario_id}` }, "Refaire cet appel") : null,
          vente ? lien("entrainement", "Choisir un autre prospect") : lien("entrainement", "Choisir un autre apprenant"),
          estAdmin() ? h("button", {
            class: "bouton-lien bouton-lien-danger", type: "button",
            onclick: async () => {
              if (!window.confirm("Supprimer définitivement cet appel d'entraînement ?")) return;
              const { error: e } = await sb.from("entrainement_sessions").delete().eq("id", x.id);
              if (e) return window.alert(texteErreur(e));
              window.location.hash = "#/entrainement";
            },
          }, "Supprimer cet appel") : null)));
    }

    // -------------------------------------------------------------------------
    // Créer / modifier un scénario (administratrice)
    // -------------------------------------------------------------------------
    async function ecranScenario(id) {
      arreterAppel();
      const nouveau = id === "nouveau";
      let s = { type: (/nouveau\/prospect/.test(window.location.hash) ? "prospect" : "apprenant"), titre: "", difficulte: "moyen", apprenant_nom: "", formation: "", financement: "CPF", progression: null, derniere_connexion: "", contexte: "", objectif_appel: "", actif: true, ordre: 100 };
      let personnage = "";
      if (!nouveau) {
        afficher(h("p", { class: "chargement" }, "Chargement du scénario…"));
        const [a, b] = await Promise.all([
          sb.from("entrainement_scenarios").select("*").eq("id", id).maybeSingle(),
          sb.from("entrainement_personas").select("personnage").eq("scenario_id", id).maybeSingle(),
        ]);
        if (a.error) return afficher(message("erreur", texteErreur(a.error)));
        if (!a.data) return afficher(message("erreur", "Scénario introuvable."), lien("entrainement", "← Retour"));
        s = a.data;
        personnage = b.data?.personnage || "";
      }

      const titre = champTexte("sc-titre", "Titre du scénario", s.titre, { obligatoire: true, placeholder: "Ex. : Ne se connecte plus depuis 3 semaines" });
      const difficulte = champChoix("sc-difficulte", "Difficulté", DIFFICULTES, s.difficulte);
      const typeSc = champChoix("sc-type", "Type d'appel", { apprenant: "Suivi d'un apprenant (appelantes)", prospect: "Vente à un prospect (toi seule)" }, s.type || "apprenant");
      const nom = champTexte("sc-nom", "Nom de l'apprenant (fictif)", s.apprenant_nom, { obligatoire: true });
      const formation = champTexte("sc-formation", "Formation", s.formation, { obligatoire: true, placeholder: "Ex. : CAP Pâtissier (12 mois)" });
      const financement = champTexte("sc-financement", "Financement", s.financement);
      const progression = champTexte("sc-progression", "Progression (%)", s.progression ?? "", { inputmode: "numeric" });
      const connexion = champTexte("sc-connexion", "Dernière connexion", s.derniere_connexion, { placeholder: "Ex. : Il y a 12 jours" });
      const contexte = champTexte("sc-contexte", "Ce que l'appelante voit avant l'appel", s.contexte, { multiligne: true, obligatoire: true });
      const objectif = champTexte("sc-objectif", "Objectif de l'appel", s.objectif_appel, { multiligne: true, obligatoire: true });
      const perso = champTexte("sc-perso", "Personnage joué par l'IA (caché à l'appelante)", personnage, {
        multiligne: true, obligatoire: true,
        aide: "Décrivez qui il est, comment il parle, son VRAI frein (qu'il ne dit pas tout de suite), et ce qui le fait s'ouvrir ou se braquer. Écrivez « Tu es… ».",
      });
      perso.champ.rows = 8;
      const ordre = champTexte("sc-ordre", "Ordre d'affichage", String(s.ordre), { inputmode: "numeric", aide: "Plus petit = plus haut dans la liste." });
      const actif = h("input", { type: "checkbox", id: "sc-actif" });
      actif.checked = s.actif;
      const zone = h("div");
      const bouton = h("button", { class: "bouton", type: "submit" }, nouveau ? "Créer le scénario" : "Enregistrer");

      const formulaire = h("form", { class: "formulaire", novalidate: true },
        typeSc.bloc, titre.bloc, difficulte.bloc, nom.bloc, formation.bloc, financement.bloc, progression.bloc, connexion.bloc,
        contexte.bloc, objectif.bloc, perso.bloc, ordre.bloc,
        h("label", { for: "sc-actif", class: "case-titre" }, h("span", {}, actif, " Proposé aux appelantes")),
        zone, bouton);

      formulaire.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const valeur = (c) => c.champ.value.trim();
        if (!valeur(titre) || !valeur(nom) || !valeur(formation) || !valeur(contexte) || !valeur(objectif) || !valeur(perso)) {
          return zone.replaceChildren(message("erreur", "Remplissez le titre, le nom, la formation, ce que voit l'appelante, l'objectif et le personnage."));
        }
        const p = valeur(progression) === "" ? null : Number(valeur(progression));
        if (p !== null && !(Number.isInteger(p) && p >= 0 && p <= 100)) return zone.replaceChildren(message("erreur", "La progression est un nombre entier entre 0 et 100."));
        bouton.disabled = true;
        const donnees = {
          type: typeSc.champ.value, titre: valeur(titre).slice(0, 120), difficulte: difficulte.champ.value, apprenant_nom: valeur(nom).slice(0, 80),
          formation: valeur(formation).slice(0, 150), financement: valeur(financement).slice(0, 80) || null, progression: p,
          derniere_connexion: valeur(connexion).slice(0, 120) || null, contexte: valeur(contexte).slice(0, 1500),
          objectif_appel: valeur(objectif).slice(0, 600), actif: actif.checked, ordre: Number(valeur(ordre)) || 100,
        };
        let scenarioId = id;
        if (nouveau) {
          const { data, error } = await sb.from("entrainement_scenarios").insert(donnees).select("id").single();
          if (error) { bouton.disabled = false; return zone.replaceChildren(message("erreur", texteErreur(error))); }
          scenarioId = data.id;
        } else {
          const { error } = await sb.from("entrainement_scenarios").update(donnees).eq("id", id);
          if (error) { bouton.disabled = false; return zone.replaceChildren(message("erreur", texteErreur(error))); }
        }
        const { error: e2 } = await sb.from("entrainement_personas").upsert({ scenario_id: scenarioId, personnage: valeur(perso).slice(0, 4000) });
        bouton.disabled = false;
        if (e2) return zone.replaceChildren(message("erreur", texteErreur(e2)));
        window.location.hash = typeSc.champ.value === "prospect" ? "#/entrainement" : "#/entrainement/equipe";
      });

      const boutonSupprimer = nouveau ? null : h("button", {
        class: "bouton-lien bouton-lien-danger", type: "button",
        onclick: async () => {
          if (!window.confirm("Supprimer ce scénario ? Les résultats déjà obtenus sont conservés.")) return;
          const { error } = await sb.from("entrainement_scenarios").delete().eq("id", id);
          if (error) return zone.replaceChildren(message("erreur", texteErreur(error)));
          window.location.hash = "#/entrainement";
        },
      }, "Supprimer ce scénario");

      afficher(h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, lien("entrainement", "← Entraînement")),
          h("h1", {}, nouveau ? "Nouveau scénario" : s.titre),
          h("p", { class: "chapo" }, "Un apprenant 100 % fictif : n'utilisez jamais les informations d'un vrai apprenant.")),
        h("div", { class: "carte carte-large" }, formulaire),
        boutonSupprimer ? h("div", { class: "actions" }, boutonSupprimer) : null));
    }

    // -------------------------------------------------------------------------
    // Entraînement à la prospection (administratrice) : #/entrainement
    // -------------------------------------------------------------------------
    async function chargerVente() {
      const scen = await sb.from("entrainement_scenarios").select("id, titre, difficulte, apprenant_nom, formation, actif, ordre")
        .eq("type", "prospect").eq("domaine", "filrouge").order("ordre").order("titre");
      if (scen.error) throw scen.error;
      const ids = scen.data.map((x) => x.id);
      const sess = ids.length
        ? await sb.from("entrainement_sessions").select("id, scenario_id, scenario_titre, debut, duree_secondes, note_sur_20")
          .eq("appelante_id", outils.monId()).eq("statut", "terminee").in("scenario_id", ids).order("debut", { ascending: false }).limit(30)
        : { data: [] };
      if (sess.error) throw sess.error;
      return { scenarios: scen.data, sessions: sess.data };
    }

    async function ecranVente() {
      arreterAppel();
      afficher(h("p", { class: "chargement" }, "Chargement du simulateur…"));
      let d;
      try { d = await chargerVente(); } catch (e) { return afficher(message("erreur", texteErreur(e))); }
      const actifs = d.scenarios.filter((x) => x.actif);
      const moyenne = d.sessions.length ? Math.round(d.sessions.reduce((a, x) => a + (x.note_sur_20 || 0), 0) / d.sessions.length * 10) / 10 : null;
      afficher(h("div", { class: "pile" },
        h("div", {},
          h("p", { class: "surtitre" }, lien("tableau-de-bord", "← Tableau de bord")),
          h("h1", {}, "Entraînement à la prospection"),
          h("p", { class: "chapo" }, "Un dirigeant d'organisme de formation fictif, joué par l'IA, décroche. Tu déroules ton script, tu traites ses objections, puis tu raccroches : note sur 20, conseils et la phrase à essayer la prochaine fois.")),
        voixDisponible() ? null : message("info", "Ce navigateur ne reconnaît pas la voix : l'appel se fera par écrit. Pour parler à voix haute, utilise Chrome ou Edge."),
        h("section", { class: "pile pile-serree" }, h("h2", {}, "Choisir un prospect à appeler"),
          actifs.length ? h("ul", { class: "liste" }, actifs.map((x) => h("li", { class: "ligne" },
            h("div", { class: "ligne-titre" }, x.titre),
            h("div", { class: "pastilles" }, pastilleDifficulte(x.difficulte),
              h("a", { class: "bouton bouton-petit", href: `#/entrainement/appel/${x.id}` }, "Appeler")),
            h("div", { class: "ligne-detail" }, `${x.apprenant_nom} · ${x.formation}`))))
            : message("info", "Aucun prospect fictif actif.")),
        h("section", { class: "pile pile-serree" },
          h("div", { class: "section-titre" }, h("h2", {}, "Mes appels de vente"),
            moyenne !== null ? h("span", { class: "aide" }, `Moyenne : ${String(moyenne).replace(".", ",")}/20 sur ${d.sessions.length} appel${d.sessions.length > 1 ? "s" : ""}`) : null),
          d.sessions.length ? h("ul", { class: "liste" }, d.sessions.map((x) => h("li", { class: "ligne" },
            h("div", { class: "ligne-titre" }, lien(`entrainement/resultat/${x.id}`, x.scenario_titre)),
            h("div", { class: "pastilles" }, pastilleNote(x.note_sur_20)),
            h("div", { class: "ligne-detail" }, `${dateCourte(x.debut)} · ${duree(x.duree_secondes)}`))))
            : h("p", { class: "aide" }, "Tes appels d'entraînement et leurs notes apparaîtront ici.")),
        h("section", { class: "pile pile-serree" },
          h("div", { class: "section-titre" }, h("h2", {}, "Gérer les prospects fictifs"),
            h("a", { class: "bouton bouton-petit bouton-secondaire", href: "#/entrainement/scenario/nouveau/prospect" }, "Ajouter un prospect")),
          h("ul", { class: "liste" }, d.scenarios.map((x) => h("li", { class: "ligne" },
            h("div", { class: "ligne-titre" }, lien(`entrainement/scenario/${x.id}`, x.titre)),
            h("div", { class: "pastilles" }, x.actif ? pastilleDifficulte(x.difficulte) : h("span", { class: "pastille pastille-neutre" }, "Masqué")))))),
        h("p", { class: "aide" }, "Les appels de suivi d'apprenants servent à former tes appelantes : ", lien("entrainement/equipe", "voir leurs scénarios et leurs résultats"), ".")));
    }

    // Carte du tableau de bord : lancer un appel d'entraînement en un clic.
    function carteVente() {
      const corps = h("div", { class: "pile pile-serree" }, h("p", { class: "aide" }, "Chargement…"));
      const carte = h("section", { class: "carte simu-vente" },
        h("div", { class: "section-titre" }, h("h2", {}, "🎧 Simulateur d'appel"), lien("entrainement", "Tout voir")),
        h("p", { class: "aide" }, "Entraîne-toi à vendre Fil Rouge : un prospect fictif décroche, tu déroules ton script, il te fait ses objections."),
        corps);
      chargerVente().then((d) => {
        const actifs = d.scenarios.filter((x) => x.actif);
        if (!actifs.length) return corps.replaceChildren(h("p", { class: "aide" }, "Aucun prospect fictif : ", lien("entrainement", "en ajouter un"), "."));
        const choix = h("select", { id: "simu-vente-choix", "aria-label": "Prospect à appeler" },
          h("option", { value: "" }, "🎲 Un prospect au hasard"),
          ...actifs.map((x) => h("option", { value: x.id }, `${x.titre} (${DIFFICULTES[x.difficulte] || x.difficulte})`)));
        const go = h("button", { type: "button", class: "bouton" }, "📞 M'entraîner");
        go.addEventListener("click", () => {
          const id = choix.value || actifs[Math.floor(Math.random() * actifs.length)].id;
          window.location.hash = `#/entrainement/appel/${id}`;
        });
        const derniere = d.sessions[0];
        corps.replaceChildren(choix, go,
          derniere ? h("p", { class: "aide" }, "Dernier appel : ", lien(`entrainement/resultat/${derniere.id}`, `${derniere.note_sur_20 ?? "–"}/20`), ` (${derniere.scenario_titre})`) : null);
      }).catch(() => corps.replaceChildren(h("p", { class: "aide" }, "Simulateur indisponible pour le moment.")));
      return carte;
    }

    return { route, carteVente };
  };
})();
