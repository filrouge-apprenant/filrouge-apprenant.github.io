/* =============================================================================
 * Fil Rouge Apprenants — moteur du simulateur « Combien vous coûtent les abandons ? »
 * Sans interface : utilisé par la page publique (simulateur.html), par la
 * plateforme (#/acquisition/simulateur) et par les tests (Node).
 *
 * Principe : un calcul honnête, dont toutes les hypothèses sont visibles et
 * modifiables par le visiteur. Aucun résultat n'est promis : on montre le coût
 * des abandons, le coût du suivi Fil Rouge et le point d'équilibre (combien
 * d'abandons il faudrait éviter pour que le suivi soit remboursé).
 * Tarifs : grille du contrat client (20 € l'appel sous 20 apprenants suivis,
 * 15 € de 20 à 150, 12 € au-delà), un appel par apprenant et par mois.
 * ============================================================================= */
(function (racine) {
  'use strict';

  const HYPOTHESES = {
    maj: '16/11/2026',
    tauxAbandon: 20,          // % — valeur de départ, à remplacer par le chiffre du centre
    pertePart: 50,            // % du prix d'une formation perdu en moyenne par abandon (hypothèse)
    dureeMois: 6,             // durée moyenne d'un parcours
    minutesParAppel: 15,      // préparation + appel + compte rendu, pour le temps libéré
  };

  const n = (v) => { const x = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const borne = (v, min, max) => Math.min(max, Math.max(min, n(v)));

  function tarifAppel(apprenantsSuivis) {
    return apprenantsSuivis < 20 ? 20 : apprenantsSuivis <= 150 ? 15 : 12;
  }

  /**
   * e = { apprenantsAn, prixFormation, tauxAbandon, dureeMois, pertePart, evitesPct }
   * Renvoie tous les montants annuels, arrondis à l'euro par l'affichage seulement.
   */
  function calculer(e) {
    const H = HYPOTHESES;
    const apprenantsAn = Math.round(borne(e.apprenantsAn, 1, 100000));
    const prix = borne(e.prixFormation, 0, 100000);
    const taux = borne(e.tauxAbandon == null || e.tauxAbandon === '' ? H.tauxAbandon : e.tauxAbandon, 0, 100) / 100;
    const duree = borne(e.dureeMois || H.dureeMois, 1, 36);
    const perte = borne(e.pertePart == null || e.pertePart === '' ? H.pertePart : e.pertePart, 0, 100) / 100;
    const evites = borne(e.evitesPct || 0, 0, 100) / 100;

    const abandonsAn = apprenantsAn * taux;
    const coutUnAbandon = prix * perte;
    const coutAbandonsAn = abandonsAn * coutUnAbandon;

    // Apprenants en cours en même temps (moyenne) = entrées par an × durée / 12.
    const suivisEnMoyenne = apprenantsAn * Math.min(duree, 12) / 12;
    const tarif = tarifAppel(suivisEnMoyenne);
    const appelsAn = apprenantsAn * duree;             // un appel par apprenant et par mois de parcours
    const coutFilRougeAn = appelsAn * tarif;
    const coutFilRougeMois = coutFilRougeAn / 12;
    const coutParApprenant = duree * tarif;

    const equilibreAbandons = coutUnAbandon > 0 ? coutFilRougeAn / coutUnAbandon : Infinity;
    const equilibrePct = abandonsAn > 0 ? equilibreAbandons / abandonsAn : Infinity;

    const abandonsEvites = abandonsAn * evites;
    const gainBrut = abandonsEvites * coutUnAbandon;
    const solde = gainBrut - coutFilRougeAn;

    const heuresLibereesMois = (appelsAn / 12) * H.minutesParAppel / 60;

    return {
      apprenantsAn, prix, taux, duree, perte, evites,
      abandonsAn, coutUnAbandon, coutAbandonsAn,
      suivisEnMoyenne, tarif, appelsAn, coutFilRougeAn, coutFilRougeMois, coutParApprenant,
      equilibreAbandons, equilibrePct,
      abandonsEvites, gainBrut, solde, heuresLibereesMois,
    };
  }

  const euros = (v) => Number.isFinite(v)
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v))
    : '—';
  const nombre = (v, dec = 0) => Number.isFinite(v)
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(v)
    : '—';

  const api = { HYPOTHESES, calculer, tarifAppel, euros, nombre };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.FilRougeCalculAbandons = api;
})(typeof window !== 'undefined' ? window : globalThis);
