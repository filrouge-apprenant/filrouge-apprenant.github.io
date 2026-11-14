/* =============================================================================
 * Abdel — moteur de calcul des simulateurs publics (sécurité et nettoyage)
 * Sans interface : utilisé par les pages publiques, le CRM et les tests (Node).
 *
 * Principe : comparer honnêtement « recruter en interne » et « externaliser ».
 * Toutes les hypothèses sont visibles et datées ; aucune n'est cachée au visiteur.
 * Les minima de salaire viennent des conventions collectives 2026 (sources ci-dessous).
 * ============================================================================= */
(function (racine) {
  'use strict';

  const HYPOTHESES = {
    maj: '14/11/2026',
    heuresPayeesAn: 1820,          // 35 h × 52 semaines (salaire versé, congés et fériés compris)
    heuresTravailleesETP: 1607,    // durée légale annuelle d'un temps plein (congés et fériés déduits)
    absenteisme: 0.05,             // arrêts, absences : hypothèse moyenne
    charges: 0.15,                 // charges patronales nettes après réduction générale, mutuelle, prévoyance : hypothèse
    encadrement: 0.05,             // temps de planning, de gestion et de management
    secu: {
      taux: 12.42, majNuit: 0.10, majDimanche: 0.10,
      source: 'Convention collective prévention-sécurité (IDCC 1351), agent coefficient 120 au 1er janvier 2026 : 1 883,85 € brut / mois',
      annexesETP: 1050,            // tenue et équipement 300 €, recyclage carte pro 150 €, suivi médical de nuit 100 €, recrutement et turnover 500 €
      annexesDetail: 'tenue et équipement, recyclage de la carte professionnelle, suivi médical (travail de nuit), recrutement et remplacement des départs',
    },
    net: {
      taux: 12.52, majNuit: 0.20,
      source: 'Convention collective de la propreté (IDCC 3043), agent de service ASP au 1er avril 2026 : 12,52 € brut / heure',
      annexesETP: 530,             // tenue 150 €, suivi médical 80 €, recrutement 300 €
      annexesDetail: 'tenue, suivi médical, recrutement',
    },
  };

  const PLAGES_SECU = {
    nuit: { l: 'Nuit (19 h – 7 h)', h: 12, nuit: 9 },
    jour: { l: 'Jour (7 h – 19 h)', h: 12, nuit: 0 },
    h24: { l: '24 h sur 24', h: 24, nuit: 9 },
    soiree: { l: 'Fermeture et soirée (18 h – 23 h)', h: 5, nuit: 2 },
  };

  // Ratios moyens indicatifs de nettoyage (m² traités par heure, prestation standard).
  const LOCAUX = {
    bureaux: { l: 'Bureaux', m2h: 200 },
    commerce: { l: 'Commerce, showroom', m2h: 180 },
    sante: { l: 'Cabinet médical, paramédical', m2h: 120 },
    atelier: { l: 'Entrepôt, atelier (zones de vie et sols)', m2h: 350 },
    communes: { l: 'Parties communes d\'immeuble', m2h: 250 },
    erp: { l: 'Salle, ERP, salle de sport', m2h: 150 },
  };

  const n = v => { const x = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const borne = (v, min, max) => Math.min(max, Math.max(min, n(v)));
  const arrondi = (v, pas) => Math.round(v / pas) * pas;

  function coutInterne(act, heuresAn, heuresNuitAn, heuresDimAn) {
    const H = HYPOTHESES, c = H[act];
    const etp = heuresAn / (H.heuresTravailleesETP * (1 - H.absenteisme));
    const salaireBase = etp * c.taux * H.heuresPayeesAn;
    const majorations = c.taux * ((c.majNuit || 0) * heuresNuitAn + (c.majDimanche || 0) * heuresDimAn);
    const brut = salaireBase + majorations;
    const charges = brut * H.charges;
    const annexes = etp * c.annexesETP;
    const encadrement = (brut + charges) * H.encadrement;
    const total = brut + charges + annexes + encadrement;
    return {
      etp, agentsMin: Math.max(1, Math.ceil(etp - 0.05)),
      couvertureUnAgent: heuresAn ? Math.min(1, (H.heuresTravailleesETP * (1 - H.absenteisme)) / heuresAn) : 1,
      brut, majorations, charges, annexes, encadrement, total, mensuel: total / 12,
      parHeure: heuresAn ? total / heuresAn : 0,
    };
  }

  /* ---------- Sécurité ---------- */
  function securite(e) {
    const agents = borne(e.agents || 1, 1, 6);
    const plage = PLAGES_SECU[e.plage] || PLAGES_SECU.nuit;
    const jours = borne(e.jours || 7, 1, 7);
    const dimanche = jours === 7 || !!e.dimanche;
    const heuresJour = agents * plage.h;
    const heuresSemaine = heuresJour * jours;
    const heuresAn = heuresSemaine * 52;
    const heuresMois = heuresAn / 12;
    const heuresNuitAn = agents * plage.nuit * jours * 52;
    const heuresDimAn = dimanche ? heuresJour * 52 : 0;
    const interne = coutInterne('secu', heuresAn, heuresNuitAn, heuresDimAn);
    const tarif = n(e.tarif);
    const externe = tarif ? { parHeure: tarif, mensuel: heuresMois * tarif, annuel: heuresAn * tarif } : null;
    return { act: 'secu', agents, plage: e.plage in PLAGES_SECU ? e.plage : 'nuit', plageLibelle: plage.l, jours, dimanche, heuresJour, heuresSemaine, heuresMois, heuresAn, heuresNuitAn, interne, externe };
  }

  /* ---------- Nettoyage ---------- */
  function nettoyage(e) {
    const type = LOCAUX[e.locaux] ? e.locaux : 'bureaux';
    const surface = borne(e.surface || 0, 0, 50000);
    const passages = borne(e.passages || 1, 1, 7);
    const approfondi = !!e.approfondi;
    const ratio = LOCAUX[type].m2h * (approfondi ? 0.75 : 1);
    const heuresPassage = surface ? Math.max(1, arrondi(surface / ratio, 0.5)) : 0;
    const heuresSemaine = heuresPassage * passages;
    const heuresMois = heuresSemaine * 52 / 12;
    const heuresAn = heuresSemaine * 52;
    const produitsAbdel = e.produits === 'abdel';
    const tarif = produitsAbdel ? n(e.tarifProduits) : n(e.tarifClient);
    const nuitAn = e.horaires === 'nuit' ? heuresAn : 0;
    const interne = coutInterne('net', heuresAn, nuitAn, 0);
    const externe = tarif ? { parHeure: tarif, mensuel: heuresMois * tarif, annuel: heuresAn * tarif } : null;
    return { act: 'net', locaux: type, locauxLibelle: LOCAUX[type].l, surface, passages, approfondi, ratio, heuresPassage, heuresSemaine, heuresMois, heuresAn, produitsAbdel, horaires: e.horaires || 'journee', interne, externe };
  }

  // Résumé texte (fiche CRM, e-mail de notification).
  function resume(r) {
    const f = (v, d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v || 0);
    const e = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
    if (r.act === 'secu') {
      return `${r.agents} agent${r.agents > 1 ? 's' : ''} · ${r.plageLibelle} · ${r.jours} j/7 → ${f(r.heuresMois)} h/mois. En interne : ${f(r.interne.etp, 1)} équivalents temps plein, environ ${e(r.interne.mensuel)}/mois.`
        + (r.externe ? ` Avec Abdel : environ ${e(r.externe.mensuel)} HT/mois.` : '');
    }
    return `${r.locauxLibelle} · ${f(r.surface)} m² · ${r.passages} passage${r.passages > 1 ? 's' : ''}/semaine${r.approfondi ? ' (approfondi)' : ''} → ${f(r.heuresPassage, 1)} h par passage, ${f(r.heuresMois)} h/mois. Produits fournis par ${r.produitsAbdel ? 'Abdel' : 'le client'}.`
      + (r.externe ? ` Estimation : ${e(r.externe.mensuel)} HT/mois.` : '');
  }

  const api = { HYPOTHESES, PLAGES_SECU, LOCAUX, securite, nettoyage, resume, coutInterne };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.AbdelCalcul = api;
})(typeof window !== 'undefined' ? window : globalThis);
