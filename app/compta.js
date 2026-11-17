/* =============================================================================
 * Fil Rouge Apprenants — moteur de l'onglet « Compta » (administratrice seule)
 * Sans interface : utilisé par la plateforme (#/compta) et par les tests (Node).
 *
 * Trois questions, un seul calcul :
 *   1. Ce que je gagne        : appels facturés, cotisations URSSAF, net.
 *   2. Ce que paie le centre  : la même somme, vue du client.
 *   3. Ce que récupère le centre : les élèves « sauvés » (qui vont au bout au
 *      lieu d'abandonner) × la part du prix qu'il aurait perdue.
 *
 * Pourquoi un élève sauvé ne rapporte pas tout le prix de la formation :
 *   CPF (Mon Compte Formation, conditions particulières OF, art. 6.3.2) :
 *   un élève qui abandonne paie quand même — 25 % minimum sous 25 %
 *   d'assiduité, au prorata entre 25 et 80 %, 100 % au-delà de 80 %.
 *   Le centre ne récupère donc que la part qu'il aurait perdue.
 *   Hors CPF (OPCO, financement perso…) : part perdue réglable (50 % par défaut).
 *
 * Cotisations micro-entreprise, prestations de services commerciales (BIC),
 * taux 2026 : 21,2 % + 0,3 % de formation professionnelle = 21,5 %.
 * ACRE pour une création après le 1er juillet 2026 : 15,9 % + 0,3 % = 16,2 %
 * (première année). Plafond du chiffre d'affaires : 83 600 €.
 * ============================================================================= */
(function (racine) {
  'use strict';

  const TAUX = {
    maj: '17/11/2026',
    acre: 16.2,      // %, 1re année avec l'ACRE (création après le 01/07/2026)
    normal: 21.5,    // %, taux plein (cotisations + formation professionnelle)
    plafondCA: 83600,
  };

  const DEFAUTS = {
    apprenants: 10, prixFormation: 2000, sauves: 3, financement: 'cpf',
    assiduiteAbandon: 20, pertePart: 50, dureeMois: 6, appelsParMois: 1,
    tarifFixe: '', taux: TAUX.acre,
  };

  const n = (v) => { const x = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const borne = (v, min, max) => Math.min(max, Math.max(min, n(v)));
  const ouDefaut = (v, d) => (v == null || v === '' ? d : v);

  // Grille du contrat client : 20 € sous 20 apprenants, 15 € jusqu'à 150, 12 € au-delà.
  function tarifAppel(apprenants) {
    return apprenants < 20 ? 20 : apprenants <= 150 ? 15 : 12;
  }

  // Part du prix qu'un abandon fait perdre au centre (0 à 1).
  function partPerdue(financement, assiduiteAbandonPct, pertePartPct) {
    if (financement === 'cpf') {
      const a = borne(assiduiteAbandonPct, 0, 100) / 100;
      const paye = a > 0.8 ? 1 : Math.max(0.25, a);
      return 1 - paye;
    }
    return borne(pertePartPct, 0, 100) / 100;
  }

  /**
   * e = { apprenants, prixFormation, sauves, financement ('cpf' | 'autre'),
   *       assiduiteAbandon, pertePart, dureeMois, appelsParMois, tarifFixe, taux }
   * Montants en euros, sur toute la durée du suivi (pas d'arrondi ici).
   */
  function simuler(e = {}) {
    const apprenants = Math.round(borne(ouDefaut(e.apprenants, DEFAUTS.apprenants), 0, 100000));
    const prix = borne(ouDefaut(e.prixFormation, DEFAUTS.prixFormation), 0, 100000);
    const sauves = Math.min(apprenants, Math.round(borne(ouDefaut(e.sauves, 0), 0, 100000)));
    const financement = e.financement === 'autre' ? 'autre' : 'cpf';
    const duree = borne(ouDefaut(e.dureeMois, DEFAUTS.dureeMois), 1, 36);
    const appelsParMois = borne(ouDefaut(e.appelsParMois, DEFAUTS.appelsParMois), 0, 10);
    const tarifGrille = tarifAppel(apprenants);
    const tarif = n(e.tarifFixe) > 0 ? n(e.tarifFixe) : tarifGrille;
    const taux = borne(ouDefaut(e.taux, DEFAUTS.taux), 0, 100) / 100;

    // 1. Ce que je gagne
    const appels = apprenants * appelsParMois * duree;
    const chiffreAffaires = appels * tarif;
    const parMois = chiffreAffaires / duree;
    const cotisations = chiffreAffaires * taux;
    const net = chiffreAffaires - cotisations;
    const netParMois = net / duree;

    // 2 et 3. Ce que paie et ce que récupère le centre
    const perte = partPerdue(financement, ouDefaut(e.assiduiteAbandon, DEFAUTS.assiduiteAbandon), ouDefaut(e.pertePart, DEFAUTS.pertePart));
    const valeurUnSauve = prix * perte;
    const recupere = sauves * valeurUnSauve;
    const coutCentre = chiffreAffaires;
    const solde = recupere - coutCentre;
    const multiple = coutCentre > 0 ? recupere / coutCentre : 0;
    // Élèves à sauver pour que le suivi soit remboursé.
    const equilibre = valeurUnSauve > 0 ? Math.ceil(coutCentre / valeurUnSauve - 1e-9) : Infinity;
    const coutParApprenant = apprenants > 0 ? coutCentre / apprenants : 0;
    // Ce que le centre aurait cru récupérer (prix entier) : pour l'explication.
    const prixEntier = sauves * prix;

    return {
      apprenants, prix, sauves, financement, duree, appelsParMois, tarif, tarifGrille,
      tarifFixe: n(e.tarifFixe) > 0, taux,
      appels, chiffreAffaires, parMois, cotisations, net, netParMois,
      perte, valeurUnSauve, recupere, coutCentre, solde, multiple, equilibre,
      coutParApprenant, prixEntier,
    };
  }

  /**
   * Chiffres réels de l'activité, à partir des lignes lues dans Supabase.
   * organismes : [{ id, nom, etape }] ; echanges : [{ organisme_id, canal }]
   * apprenants : [{ organisme_id, statut }] ; appels : [{ organisme_id, date_appel }]
   * echeances  : [{ organisme_id, mois, montant, statut }] (vue_echeances)
   * jour : 'AAAA-MM-JJ' (aujourd'hui)
   */
  function bilan({ organismes = [], echanges = [], apprenants = [], appels = [], echeances = [], jour, taux = TAUX.acre }) {
    const annee = String(jour).slice(0, 4);
    const moisCourant = String(jour).slice(0, 7);
    const clients = organismes.filter((o) => o.etape === 'client');
    const appelesTel = new Set(echanges.filter((x) => x.canal === 'telephone').map((x) => x.organisme_id));
    const contactes = organismes.filter((o) => o.etape !== 'prospect' || echanges.some((x) => x.organisme_id === o.id));
    const appelsProspection = echanges.filter((x) => x.canal === 'telephone').length;
    const actifs = apprenants.filter((a) => a.statut === 'actif');
    const termines = apprenants.filter((a) => a.statut === 'termine').length;
    const abandons = apprenants.filter((a) => a.statut === 'abandon').length;
    const sortis = termines + abandons;

    const valides = echeances.filter((x) => x.statut !== 'annulee');
    const deLAnnee = valides.filter((x) => String(x.mois).slice(0, 4) === annee);
    const somme = (l) => l.reduce((t, x) => t + n(x.montant), 0);
    const facture = somme(deLAnnee);
    const encaisse = somme(deLAnnee.filter((x) => x.statut === 'payee'));
    const enRetard = somme(valides.filter((x) => x.statut === 'en_retard'));
    const aEncaisser = somme(valides.filter((x) => x.statut === 'a_payer'));
    const cotisations = encaisse * (n(taux) / 100);

    const parClient = clients.concat(organismes.filter((o) => o.etape !== 'client' && apprenants.some((a) => a.organisme_id === o.id)))
      .map((o) => {
        const ech = valides.filter((x) => x.organisme_id === o.id);
        return {
          id: o.id, nom: o.nom, etape: o.etape,
          apprenants: apprenants.filter((a) => a.organisme_id === o.id && a.statut === 'actif').length,
          appelsMois: appels.filter((x) => x.organisme_id === o.id && String(x.date_appel).slice(0, 7) === moisCourant).length,
          facture: somme(ech.filter((x) => String(x.mois).slice(0, 4) === annee)),
          encaisse: somme(ech.filter((x) => String(x.mois).slice(0, 4) === annee && x.statut === 'payee')),
          enRetard: somme(ech.filter((x) => x.statut === 'en_retard')),
        };
      })
      .sort((a, b) => b.facture - a.facture || b.apprenants - a.apprenants);

    return {
      annee,
      clients: clients.length,
      prospects: organismes.filter((o) => !['client', 'perdu'].includes(o.etape)).length,
      contactes: contactes.length,
      appelesTel: appelesTel.size,
      appelsProspection,
      transformation: contactes.length ? clients.length / contactes.length : 0,
      apprenantsSuivis: actifs.length,
      termines, abandons,
      tauxAbandon: sortis ? abandons / sortis : null,
      appelsMois: appels.filter((x) => String(x.date_appel).slice(0, 7) === moisCourant).length,
      facture, encaisse, enRetard, aEncaisser, cotisations, net: encaisse - cotisations,
      partPlafond: facture / TAUX.plafondCA,
      parClient,
    };
  }

  const euros = (v) => Number.isFinite(v)
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(v))
    : '—';
  const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v * 100)} %`);

  const api = { TAUX, DEFAUTS, tarifAppel, partPerdue, simuler, bilan, euros, pct };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.FilRougeCompta = api;
})(typeof window !== 'undefined' ? window : globalThis);
