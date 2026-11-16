// =============================================================================
// Fil Rouge Apprenants — voix de lecture (synthèse vocale du navigateur)
// =============================================================================
// Une seule façon de parler pour toute la plateforme (objections, scripts,
// simulateurs d'appel), plus naturelle que la voix par défaut :
//   1. on choisit la MEILLEURE voix française disponible : les voix
//      « naturelles » (Microsoft Edge : Denise, Henri, Vivienne, Rémi…),
//      puis les voix améliorées (iPhone, Mac), puis Google, puis le reste ;
//   2. le texte est nettoyé (emojis, puces, tirets, guillemets) et lu phrase
//      par phrase, avec un débit et une intonation qui varient un peu et de
//      courtes pauses : c'est ce qui casse l'effet « robot » ;
//   3. la voix choisie est mémorisée sur cet appareil (réglage « Voix »).
// Gratuit, tout se passe dans le navigateur : rien n'est envoyé ailleurs.
// =============================================================================

(function () {
  "use strict";

  const synth = window.speechSynthesis || null;
  const dispo = Boolean(synth && window.SpeechSynthesisUtterance);
  const CLE = "filrouge-voix";

  const FEMININES = /(denise|eloise|éloïse|vivienne|brigitte|coralie|jacqueline|yvette|celeste|céleste|josephine|joséphine|ariane|charline|sylvie|hortense|julie|amélie|amelie|audrey|aurélie|aurelie|marie|virginie|léa|lea|chantal|caroline|female|femme|google français)/i;
  const MASCULINES = /(henri|remy|rémi|remi|alain|claude|jerome|jérôme|maurice|yves|paul|thomas|nicolas|daniel|antoine|fabrice|gerard|gérard|guillaume|lucien|jean|jacques|male|homme)/i;

  // Genre d'un personnage d'après son nom (« Claire Martin, directrice », « Mme Petit », « M. Durand »).
  const PRENOMS_F = /^(mme|madame|mlle|mademoiselle|accueil|standardiste|claire|sandrine|sophie|hélène|helene|patricia|julie|marie|nathalie|isabelle|catherine|christine|sylvie|valérie|valerie|céline|celine|émilie|emilie|aurélie|aurelie|camille|léa|lea|manon|chloé|chloe|sarah|laura|lucie|pauline|caroline|stéphanie|stephanie|virginie|audrey|élodie|elodie|karima|fatima|nadia|samira|yasmine|amina|inès|ines|leila|leïla|anne|annie|agnès|agnes|brigitte|martine|monique|françoise|francoise|nicole|véronique|veronique|corinne|florence|laurence|delphine|sabrina|jessica|mélanie|melanie|charlotte|alice|emma|jade|louise|zoé|zoe|clara|mathilde|margaux|océane|oceane|justine|marion|morgane|amandine|séverine|severine|béatrice|beatrice)\b/i;
  const PRENOMS_M = /^(m\.|mr|monsieur|marc|thomas|karim|philippe|nicolas|julien|pierre|jean|paul|michel|alain|patrick|christophe|stéphane|stephane|laurent|david|olivier|éric|eric|frédéric|frederic|sébastien|sebastien|vincent|antoine|maxime|kevin|kévin|mohamed|ahmed|youssef|rachid|mehdi|abdel|bruno|didier|franck|gilles|hugo|lucas|louis|romain|thierry|xavier|yann|yves)\b/i;
  function genreDe(nom) {
    const t = String(nom || "").trim();
    if (PRENOMS_F.test(t)) return "f";
    if (PRENOMS_M.test(t)) return "m";
    return "";
  }

  function lireReglage() {
    try { return window.localStorage.getItem(CLE) || ""; } catch (e) { return ""; }
  }
  function ecrireReglage(nom) {
    try { if (nom) window.localStorage.setItem(CLE, nom); else window.localStorage.removeItem(CLE); } catch (e) { /* stockage indisponible */ }
  }

  // Note de qualité d'une voix (plus c'est haut, plus c'est naturel).
  function qualite(v) {
    let n = 0;
    if (/natural|naturel|neural|online/i.test(v.name)) n += 100;
    if (/premium|enhanced|amélioré|ameliore|siri/i.test(v.name)) n += 80;
    if (/google/i.test(v.name)) n += 50;
    if (/^fr[-_]FR/i.test(v.lang)) n += 10;
    if (!v.localService) n += 5;
    return n;
  }

  function voixFrancaises() {
    if (!dispo) return [];
    return synth.getVoices().filter((v) => /^fr([-_]|$)/i.test(v.lang)).sort((a, b) => qualite(b) - qualite(a));
  }

  // Les voix arrivent parfois après le chargement de la page (Chrome, Edge).
  let pret = null;
  function voixPretes() {
    if (!dispo) return Promise.resolve([]);
    if (voixFrancaises().length) return Promise.resolve(voixFrancaises());
    if (!pret) {
      pret = new Promise((resolve) => {
        const fin = () => resolve(voixFrancaises());
        synth.addEventListener("voiceschanged", fin, { once: true });
        setTimeout(fin, 1500);
      });
    }
    return pret;
  }
  if (dispo) voixPretes();

  // genre : "f", "m" ou "" (indifférent). Le réglage de l'appareil passe avant,
  // sauf si l'on demande explicitement l'autre genre (personnage d'un simulateur).
  // genre "f" / "m" : une voix de femme ou d'homme, la plus naturelle possible.
  // Sans genre : la voix choisie dans le réglage, sinon la plus naturelle.
  function choisir(genre) {
    const liste = voixFrancaises();
    if (!liste.length) return null;
    const memo = liste.find((v) => v.name === lireReglage());
    const genreVoix = (v) => (FEMININES.test(v.name) ? "f" : MASCULINES.test(v.name) ? "m" : "");
    if (!genre) return memo || liste[0];
    if (memo && genreVoix(memo) === genre) return memo;
    return liste.find((v) => genreVoix(v) === genre) || null;
  }

  // Texte prêt à être dit : sans emoji, puces, balises de mise en forme.
  function nettoyer(texte) {
    return String(texte || "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
      .replace(/^[\s>*•\-–—·]+/gm, "")
      .replace(/[«»"“”]/g, "")
      .replace(/\s+[–—]\s+/g, ", ")
      .replace(/\.{3}|…/g, ", ")
      .replace(/\s*\/\s*/g, " ou ")
      .replace(/\bHT\b/g, "hors taxes")
      .replace(/\bCPF\b/g, "C P F")
      .replace(/(\d)\s?%/g, "$1 pour cent")
      .replace(/([.!?:;])?\s*\n{2,}\s*/g, (m, p) => (p ? `${p} ` : ". "))
      .replace(/([.!?:;,])?\s*\n\s*/g, (m, p) => (p ? `${p} ` : ", "))
      .replace(/\s+/g, " ")
      .trim();
  }

  // Découpe en phrases courtes (les longues phrases font « robot » et Chrome
  // coupe parfois la lecture au bout d'une quinzaine de secondes).
  function phrases(texte) {
    const morceaux = nettoyer(texte).match(/[^.!?;:]+[.!?;:]*\s*/g) || [];
    const sortie = [];
    for (const m of morceaux) {
      const t = m.trim();
      if (!t) continue;
      if (t.length <= 180) { sortie.push(t); continue; }
      // Phrase très longue : on coupe aux virgules.
      let courant = "";
      for (const bout of t.split(/(?<=,)\s+/)) {
        if ((courant + " " + bout).length > 160 && courant) { sortie.push(courant); courant = bout; } else courant = courant ? `${courant} ${bout}` : bout;
      }
      if (courant) sortie.push(courant);
    }
    return sortie;
  }

  let generation = 0;
  function arreter() {
    generation++;
    if (dispo) synth.cancel();
  }

  // Lit le texte. Renvoie une promesse résolue à la fin (ou à l'arrêt).
  // options : { genre: "f" | "m", vitesse: 1, hauteur: 1 }
  function parler(texte, options = {}) {
    if (!dispo) return Promise.resolve();
    arreter();
    const ma = generation;
    const liste = phrases(texte);
    return voixPretes().then(() => new Promise((resolve) => {
      let voix = choisir(options.genre || "");
      let hauteur = options.hauteur || 1;
      if (!voix && options.genre) {
        // Pas de voix du bon genre sur cet appareil : la plus naturelle, en grave ou en aigu.
        voix = choisir("");
        hauteur = options.genre === "m" ? 0.78 : 1.18;
      }
      const naturelle = voix && qualite(voix) >= 80;
      const base = options.vitesse || (naturelle ? 1.0 : 1.06);
      let i = 0;
      const suivante = () => {
        if (ma !== generation || i >= liste.length) return resolve();
        const u = new SpeechSynthesisUtterance(liste[i++]);
        u.lang = "fr-FR";
        if (voix) u.voice = voix;
        // Légères variations, comme quelqu'un qui parle vraiment.
        u.rate = Math.max(0.8, Math.min(1.25, base + (Math.random() * 0.08 - 0.04)));
        u.pitch = Math.max(0.8, Math.min(1.2, hauteur + (Math.random() * 0.06 - 0.03)));
        u.onend = () => setTimeout(suivante, /[?!]$/.test(u.text) ? 260 : 160);
        u.onerror = () => resolve();
        synth.speak(u);
      };
      suivante();
    }));
  }

  // Petit réglage « Voix » (menu + bouton Tester), pour n'importe quel écran.
  function reglage(h) {
    const menu = h("select", { id: "reglage-voix", "aria-label": "Voix de lecture" });
    const tester = h("button", { type: "button", class: "bouton-lien" }, "Tester");
    const conseil = h("p", { class: "aide" });
    const remplir = () => {
      const liste = voixFrancaises();
      const memo = lireReglage();
      menu.replaceChildren(h("option", { value: "" }, "Automatique (la plus naturelle)"),
        ...liste.map((v) => h("option", { value: v.name }, `${v.name.replace(/\s*-\s*French.*$/i, "").replace(/^Microsoft\s+/i, "")}${qualite(v) >= 80 ? " ★ naturelle" : ""}`)));
      menu.value = liste.some((v) => v.name === memo) ? memo : "";
      const naturelles = liste.filter((v) => qualite(v) >= 80).length;
      conseil.textContent = !liste.length ? "Aucune voix française sur ce navigateur."
        : naturelles ? `${naturelles} voix naturelle${naturelles > 1 ? "s" : ""} (★) sur cet appareil.`
          : "Pas de voix naturelle sur ce navigateur : ouvrez la plateforme dans Microsoft Edge pour avoir les voix naturelles gratuites (Denise, Henri, Vivienne…).";
    };
    menu.addEventListener("change", () => { ecrireReglage(menu.value); parler("Bonjour ! Voilà ma voix. Ça vous convient ?"); });
    tester.addEventListener("click", () => parler("Bonjour, je suis bien chez Fil Rouge Apprenants ? Oui, je vous écoute, allez-y."));
    voixPretes().then(remplir);
    remplir();
    return h("div", { class: "reglage-voix" }, h("label", { for: "reglage-voix" }, "Voix", menu), tester, conseil);
  }

  window.FilRougeVoix = { dispo, parler, arreter, reglage, choisir, nettoyer, genreDe };
})();
