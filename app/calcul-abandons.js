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
 * 15 € de 20 à 150, 12 € au-delà), un appel par apprenant suivi et par mois.
 * Deux formules (17/11/2026) : suivi = 'risque' (on n'appelle que les apprenants
 * à risque, pendant dureeSuiviMois) ou 'tous' (tous les inscrits, tout le parcours).
 * ============================================================================= */
(function (racine) {
  'use strict';

  const HYPOTHESES = {
    maj: '16/11/2026',
    tauxAbandon: 20,          // % — valeur de départ, à remplacer par le chiffre du centre
    pertePart: 50,            // % du prix d'une formation perdu en moyenne par abandon (hypothèse, hors CPF)
    assiduiteAbandon: 20,     // CPF : avancement moyen de l'apprenant quand il abandonne (%)
    dureeMois: 6,             // durée moyenne d'un parcours
    risquePct: 25,            // % des inscrits repérés « à risque » (pas connectés depuis 2 à 4 semaines, en retard)
    dureeSuiviMois: 3,        // mois de suivi d'un apprenant à risque (le temps de le remettre sur les rails)
    minutesParAppel: 15,      // préparation + appel + compte rendu, pour le temps libéré
  };

  const n = (v) => { const x = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const borne = (v, min, max) => Math.min(max, Math.max(min, n(v)));

  function tarifAppel(apprenantsSuivis) {
    return apprenantsSuivis < 20 ? 20 : apprenantsSuivis <= 150 ? 15 : 12;
  }

  /**
   * e = { apprenantsAn, prixFormation, tauxAbandon, dureeMois, pertePart, evitesPct, financement, assiduiteAbandon,
   *       suivi ('tous' par défaut | 'risque'), risquePct, dureeSuiviMois }
   * financement = 'cpf' : la part perdue suit les paliers de Mon Compte Formation
   * (Conditions particulières OF, v14 déc. 2025, art. 6.3.2) : sous 25 % d'assiduité
   * le centre touche un forfait de 25 % ; de 25 à 80 % le prorata ; au-delà de 80 %
   * 100 %. Sans système de relance prouvable, la Caisse des dépôts peut retirer le
   * plancher de 25 % : perteSansPlancher le chiffre.
   * Renvoie tous les montants annuels, arrondis à l'euro par l'affichage seulement.
   */
  function calculer(e) {
    const H = HYPOTHESES;
    const apprenantsAn = Math.round(borne(e.apprenantsAn, 1, 100000));
    const prix = borne(e.prixFormation, 0, 100000);
    const taux = borne(e.tauxAbandon == null || e.tauxAbandon === '' ? H.tauxAbandon : e.tauxAbandon, 0, 100) / 100;
    const duree = borne(e.dureeMois || H.dureeMois, 1, 36);
    const cpf = e.financement === 'cpf';
    const assid = borne(e.assiduiteAbandon == null || e.assiduiteAbandon === '' ? H.assiduiteAbandon : e.assiduiteAbandon, 0, 100) / 100;
    const payeCpf = assid > 0.8 ? 1 : Math.max(0.25, assid);
    const perte = cpf ? 1 - payeCpf
      : borne(e.pertePart == null || e.pertePart === '' ? H.pertePart : e.pertePart, 0, 100) / 100;
    const perteSansPlancher = cpf ? 1 - (assid > 0.8 ? 1 : assid) : perte;
    const evites = borne(e.evitesPct || 0, 0, 100) / 100;

    const abandonsAn = apprenantsAn * taux;
    const coutUnAbandon = prix * perte;
    const coutAbandonsAn = abandonsAn * coutUnAbandon;
    const coutAbandonsSansPlancher = abandonsAn * prix * perteSansPlancher;

    // Qui est suivi : tous les inscrits pendant tout le parcours, ou seulement
    // les apprenants à risque pendant quelques mois.
    const risque = e.suivi === 'risque';
    const risquePct = borne(e.risquePct == null || e.risquePct === '' ? H.risquePct : e.risquePct, 1, 100) / 100;
    const dureeSuivi = risque ? Math.min(duree, borne(e.dureeSuiviMois || H.dureeSuiviMois, 1, 36)) : duree;
    const suivisAn = risque ? Math.round(apprenantsAn * risquePct) : apprenantsAn;
    // Apprenants suivis en même temps (moyenne) = entrées par an × durée du suivi / 12.
    const suivisEnMoyenne = suivisAn * Math.min(dureeSuivi, 12) / 12;
    const tarif = tarifAppel(suivisEnMoyenne);
    const appelsAn = suivisAn * dureeSuivi;            // un appel par apprenant suivi et par mois de suivi
    const coutFilRougeAn = appelsAn * tarif;
    const coutFilRougeMois = coutFilRougeAn / 12;
    const coutParApprenant = dureeSuivi * tarif;

    const equilibreAbandons = coutUnAbandon > 0 ? coutFilRougeAn / coutUnAbandon : Infinity;
    const equilibrePct = abandonsAn > 0 ? equilibreAbandons / abandonsAn : Infinity;

    const abandonsEvites = abandonsAn * evites;
    const gainBrut = abandonsEvites * coutUnAbandon;
    const solde = gainBrut - coutFilRougeAn;

    const heuresLibereesMois = (appelsAn / 12) * H.minutesParAppel / 60;

    return {
      apprenantsAn, prix, taux, duree, perte, evites, cpf, assid, perteSansPlancher, coutAbandonsSansPlancher,
      abandonsAn, coutUnAbandon, coutAbandonsAn,
      risque, risquePct, dureeSuivi, suivisAn, risqueSousTaux: risque && risquePct < taux,
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
