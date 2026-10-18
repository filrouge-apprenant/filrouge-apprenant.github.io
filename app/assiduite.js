// =============================================================================
// Fil Rouge Apprenants — assiduité des apprenants et export anonymisé
// =============================================================================
// Fonctions « pures » (sans écran ni base). Testées avec node :
// tests/assiduite.test.js
//
// 1. evaluer() classe un apprenant en trois niveaux d'après les données du
//    fichier du client (aucune IA, un simple calcul) :
//      - « risque » : à appeler en priorité, risque de décrochage
//      - « moyen »  : un signal faible, à surveiller
//      - « assidu » : se connecte et avance au rythme attendu
//    et « inconnu » quand le fichier ne donne ni avancement ni connexion.
//
// 2. anonymiser() prépare un fichier sans nom, téléphone, email ni date de
//    naissance : chaque apprenant devient un code (« A-3F9C2B »), tiré de son
//    numéro interne. Le même code s'affiche dans la plateforme, à côté du nom :
//    seule l'administratrice peut faire le lien.
// =============================================================================

(function (racine) {
  "use strict";

  // Seuils (jours, points de pourcentage). Un point de risque par signal
  // faible, deux par signal fort ; 3 points ou plus = à risque.
  const SEUILS = {
    connexionMoyen: 10,     // pas connecté·e depuis plus de 10 jours
    connexionRisque: 21,    // … plus de 21 jours
    retardMoyen: 10,        // 10 points de retard sur le rythme attendu
    retardRisque: 25,       // 25 points de retard
    tentativesSansReponse: 3, // 3 tentatives sans jamais joindre l'apprenant
    scoreRisque: 3,
  };

  const LIBELLES = {
    risque: "à risque",
    moyen: "à surveiller",
    assidu: "assidu·e",
    inconnu: "non évalué",
  };

  function jours(depuisIso, aujourdhuiIso) {
    if (!depuisIso) return null;
    const a = Date.parse(`${String(depuisIso).slice(0, 10)}T12:00:00Z`);
    const b = Date.parse(`${aujourdhuiIso}T12:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  // Avancement attendu à la date du jour, d'après les dates d'entrée et de sortie.
  function avancementAttendu(a, aujourdhuiIso) {
    const ecoules = jours(a.date_entree_formation, aujourdhuiIso);
    const total = a.date_entree_formation && a.date_sortie_formation
      ? jours(a.date_entree_formation, String(a.date_sortie_formation).slice(0, 10))
      : null;
    if (ecoules === null || !total || total <= 0) return null;
    return Math.max(0, Math.min(100, (100 * ecoules) / total));
  }

  function nombre(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // a : une ligne de vue_qui_rappeler (avancement_pct, derniere_connexion,
  //     date_entree_formation, date_sortie_formation, tentatives, aboutis)
  // Renvoie { niveau, libelle, score, raisons[] }.
  function evaluer(a, aujourdhuiIso) {
    const raisons = [];
    let score = 0;
    const avancement = nombre(a.avancement_pct);
    const sansConnexion = jours(a.derniere_connexion, aujourdhuiIso);

    if (avancement === null && sansConnexion === null) {
      return { niveau: "inconnu", libelle: LIBELLES.inconnu, score: 0,
        raisons: ["ni avancement ni dernière connexion dans le fichier du client"] };
    }

    if (sansConnexion !== null) {
      if (sansConnexion > SEUILS.connexionRisque) { score += 2; raisons.push(`pas connecté·e depuis ${sansConnexion} j`); }
      else if (sansConnexion > SEUILS.connexionMoyen) { score += 1; raisons.push(`pas connecté·e depuis ${sansConnexion} j`); }
    }

    const attendu = avancementAttendu(a, aujourdhuiIso);
    if (avancement !== null && attendu !== null) {
      const retard = Math.round(attendu - avancement);
      if (retard >= SEUILS.retardRisque) { score += 2; raisons.push(`${retard} points de retard sur le rythme attendu`); }
      else if (retard >= SEUILS.retardMoyen) { score += 1; raisons.push(`${retard} points de retard sur le rythme attendu`); }
    }

    const finDepassee = jours(a.date_sortie_formation, aujourdhuiIso);
    if (finDepassee !== null && finDepassee > 0 && avancement !== null && avancement < 100) {
      score += 2; raisons.push(`fin de formation dépassée à ${Math.round(avancement)} %`);
    }

    const tentatives = nombre(a.tentatives) || 0;
    const aboutis = nombre(a.aboutis) || 0;
    if (tentatives >= SEUILS.tentativesSansReponse && aboutis === 0) {
      score += 1; raisons.push(`injoignable (${tentatives} tentatives sans réponse)`);
    }

    const niveau = score >= SEUILS.scoreRisque ? "risque" : score > 0 ? "moyen" : "assidu";
    return { niveau, libelle: LIBELLES[niveau], score, raisons };
  }

  // Couleur de pastille pour l'écran.
  const COULEUR = { risque: "rouge", moyen: "orange", assidu: "vert", inconnu: "neutre" };
  const ORDRE = { risque: 0, moyen: 1, inconnu: 2, assidu: 3 };

  function compter(evaluations) {
    const total = { risque: 0, moyen: 0, assidu: 0, inconnu: 0 };
    for (const e of evaluations) total[e.niveau]++;
    return total;
  }

  // Lignes du fichier anonymisé. Aucune donnée qui identifie la personne :
  // ni nom, ni prénom, ni téléphone, ni email, ni identifiant du client.
  const ENTETES_ANONYMES = ["Code apprenant", "Parcours", "Avancement (%)", "Avancement attendu (%)",
    "Jours depuis la dernière connexion", "Jours depuis le dernier contact", "Mois de formation écoulés",
    "Mois de formation restants", "Tentatives de contact", "Contacts aboutis", "Assiduité", "Signaux"];

  // Code court et stable, tiré du numéro interne (UUID) de l'apprenant.
  function code(a) {
    return "A-" + String(a.id || "").replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
  }

  function anonymiser(lignes, aujourdhuiIso) {
    return lignes.map((a) => {
      const e = evaluer(a, aujourdhuiIso);
      const attendu = avancementAttendu(a, aujourdhuiIso);
      const ecoules = jours(a.date_entree_formation, aujourdhuiIso);
      const restants = a.date_sortie_formation ? -jours(a.date_sortie_formation, aujourdhuiIso) : null;
      const mois = (j) => (j === null || j === undefined ? "" : (j / 30.4).toFixed(1));
      const avancement = nombre(a.avancement_pct);
      return [
        code(a),
        a.parcours || "",
        avancement === null ? "" : Math.round(avancement),
        attendu === null ? "" : Math.round(attendu),
        jours(a.derniere_connexion, aujourdhuiIso) ?? "",
        a.jours_sans_contact ?? "",
        mois(ecoules),
        mois(restants),
        nombre(a.tentatives) ?? 0,
        nombre(a.aboutis) ?? 0,
        e.libelle,
        e.raisons.join(" ; "),
      ];
    });
  }

  const api = { SEUILS, LIBELLES, COULEUR, ORDRE, evaluer, avancementAttendu, compter, code, anonymiser, ENTETES_ANONYMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.FilRougeAssiduite = api;
})(typeof window !== "undefined" ? window : globalThis);
