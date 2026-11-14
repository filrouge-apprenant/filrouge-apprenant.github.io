/* =====================================================================
 * CRM Abdel — logique métier (sans interface)
 * Fonctions pures : scoring, calculs de contrats, statistiques.
 * Utilisable dans le navigateur (variables globales) et testable avec Node.
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- Pipeline : 14 statuts, 7 colonnes ---------- */
  const STATUSES = [
    ['identifie', 'Prospect identifié'],
    ['a_qualifier', 'Prospect à qualifier'],
    ['qualifie', 'Prospect qualifié'],
    ['contact', 'Premier contact effectué'],
    ['decideur', 'Décideur joint'],
    ['interet', 'Intérêt manifesté'],
    ['besoin', 'Besoin identifié'],
    ['rdv', 'Rendez-vous programmé'],
    ['propo', 'Proposition à préparer'],
    ['devis', 'Devis envoyé'],
    ['nego', 'Négociation'],
    ['gagne', 'Contrat gagné'],
    ['perdu', 'Contrat perdu'],
    ['relance', 'Relance ultérieure'],
  ];
  const STATUS_LABEL = Object.fromEntries(STATUSES);
  const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s[0], i]));

  const COLUMNS = [
    { id: 'c1', label: 'À qualifier', statuses: ['identifie', 'a_qualifier'] },
    { id: 'c2', label: 'Qualifiés', statuses: ['qualifie'] },
    { id: 'c3', label: 'En contact', statuses: ['contact', 'decideur', 'interet'] },
    { id: 'c4', label: 'Besoin & RDV', statuses: ['besoin', 'rdv'] },
    { id: 'c5', label: 'Devis', statuses: ['propo', 'devis'] },
    { id: 'c6', label: 'Négociation', statuses: ['nego'] },
    { id: 'c7', label: 'Clôturés / plus tard', statuses: ['gagne', 'perdu', 'relance'] },
  ];

  /* Probabilité de signature par étape (sert au prévisionnel pondéré). */
  const PROB = {
    identifie: 0.02, a_qualifier: 0.03, qualifie: 0.05, contact: 0.08, decideur: 0.10,
    interet: 0.15, besoin: 0.20, rdv: 0.30, propo: 0.40, devis: 0.50, nego: 0.70,
    gagne: 1, perdu: 0, relance: 0.05,
  };
  const CLOSED = ['gagne', 'perdu'];
  const OPPORTUNITY = ['besoin', 'rdv', 'propo', 'devis', 'nego'];
  const NOT_YET_CONTACTED = ['identifie', 'a_qualifier', 'qualifie'];

  /* ---------- Scoring /100, explicable ---------- */
  const CRITERIA = [
    { k: 'besoin', l: 'Besoin identifié', pts: 20, proof: true },
    { k: 'recurrent', l: 'Besoin récurrent', pts: 10 },
    { k: 'multisites', l: 'Plusieurs sites à couvrir', pts: 10 },
    { k: 'nuit', l: 'Présence de nuit / horaires décalés', pts: 8 },
    { k: 'weekend', l: 'Besoin le week-end', pts: 7 },
    { k: 'ao', l: "Appel d'offres en cours", pts: 10, proof: true },
    { k: 'recherche', l: 'Recherche active de prestataire', pts: 10, proof: true },
    { k: 'echeance', l: 'Contrat actuel arrivant à échéance', pts: 5, proof: true },
  ];
  // + volume horaire (15, automatique) + décideur joignable (5, automatique) = 100

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  function totalHours(p) { return num(p.hoursSecu) + num(p.hoursNet); }

  function hasDecisionMaker(p) {
    const c = p.contacts || {};
    const named = ['dirigeant', 'securite', 'achats', 'sg', 'site'].some(k => (c[k] || '').trim());
    const reachable = !!((p.phone || '').trim() || (p.email || '').trim());
    return named && reachable;
  }

  function score(p) {
    const reasons = [];
    let total = 0;
    const cr = p.criteria || {};
    for (const c of CRITERIA) {
      const v = cr[c.k];
      if (!v || !v.on) continue;
      const proof = (v.proof || '').trim();
      if (c.proof && !proof) {
        reasons.push({ l: c.l, pts: 0, why: 'coché mais sans preuve : 0 point tant que la preuve n\'est pas saisie' });
        continue;
      }
      total += c.pts;
      reasons.push({ l: c.l, pts: c.pts, why: proof || 'déclaré' });
    }
    const h = totalHours(p);
    let vol = 0;
    if (h >= 300) vol = 15; else if (h >= 150) vol = 10; else if (h >= 40) vol = 5;
    if (vol) { total += vol; reasons.push({ l: 'Volume horaire estimé', pts: vol, why: Math.round(h) + ' h/mois' }); }
    if (hasDecisionMaker(p)) { total += 5; reasons.push({ l: 'Décideur identifié et joignable', pts: 5, why: 'nom + coordonnées renseignés' }); }
    total = Math.min(100, total);
    return { total, band: band(total), reasons };
  }

  function band(s) {
    if (s >= 80) return { key: 'tres', label: 'Priorité très élevée' };
    if (s >= 60) return { key: 'chaud', label: 'Prospect chaud' };
    if (s >= 40) return { key: 'travail', label: 'À travailler' };
    return { key: 'faible', label: 'Priorité faible' };
  }

  /* ---------- Tarifs & valeur ---------- */
  const DEFAULT_SETTINGS = {
    rateSecu: 27,
    rateNetClient: 24,   // le client fournit les produits
    rateNetProduits: 27, // Abdel fournit les produits
    costHourSecu: '',    // coût horaire chargé d'un agent (à renseigner)
    costHourNet: '',
    nightCostPct: 10,    // majorations de coût : indicatives, à confirmer avec la convention collective
    sundayCostPct: 10,
    companyNet: 'Abdel (nettoyage)',
    companySecu: '',
    cnaps: '',
    userName: 'Émilie',
    lastBackup: '',
    commHour: 1,     // ma commission : € par heure de contrat et par mois (offre d'Abdel)
    commMonths: 0,   // durée de la commission en mois (0 = tant que le client reste)
    commRdv: 0,      // prime par rendez-vous obtenu (€)
  };

  function rateNet(p, s) { return p.netProduits ? num(s.rateNetProduits) : num(s.rateNetClient); }

  function monthlyValue(p, s) {
    return num(p.hoursSecu) * num(s.rateSecu) + num(p.hoursNet) * rateNet(p, s);
  }

  /* ---------- Calculateur de contrat ---------- */
  // Mois = semaine × 52 / 12 (méthode standard, évite l'approximation « × 4 »).
  function calcContract(i) {
    const agents = num(i.agents), hpd = num(i.hoursPerDay), dpw = num(i.daysPerWeek);
    const rate = num(i.rate);
    const night = num(i.nightShare) / 100, sunday = num(i.sundayShare) / 100;
    const hoursDay = agents * hpd;
    const hoursWeek = hoursDay * dpw;
    const hoursMonth = hoursWeek * 52 / 12;
    const hoursYear = hoursWeek * 52;
    const billRate = rate * (1 + night * num(i.billNightPct) / 100 + sunday * num(i.billSundayPct) / 100);
    const caMonth = hoursMonth * billRate;
    const caYear = hoursYear * billRate;
    const out = { hoursDay, hoursWeek, hoursMonth, hoursYear, billRate, caMonth, caYear, hasCost: false };
    const costHour = i.costHour === '' || i.costHour == null ? null : num(i.costHour);
    if (costHour != null && costHour > 0) {
      const costRate = costHour * (1 + night * num(i.costNightPct) / 100 + sunday * num(i.costSundayPct) / 100);
      const fees = num(i.travel) + num(i.supplies) + num(i.supervision) + num(i.otherFees);
      const costMonth = hoursMonth * costRate + fees;
      const marginMonth = caMonth - costMonth;
      Object.assign(out, {
        hasCost: true, costRate, fees, costMonth,
        marginMonth, marginYear: marginMonth * 12,
        marginPct: caMonth ? marginMonth / caMonth * 100 : 0,
        marginPerHour: hoursMonth ? marginMonth / hoursMonth : 0,
      });
    }
    return out;
  }

  /* ---------- Dates ---------- */
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

  /* ---------- Tableau de bord ---------- */
  function dashboard(prospects, s, act) {
    const list = prospects.filter(p => act === 'secu' ? p.secu : act === 'net' ? p.net : true);
    const t = today();
    const reached = (p, st) => (p.reached || []).includes(st) || p.status === st;
    const value = p => act === 'secu' ? num(p.hoursSecu) * num(s.rateSecu)
      : act === 'net' ? num(p.hoursNet) * rateNet(p, s) : monthlyValue(p, s);
    const hours = p => act === 'secu' ? num(p.hoursSecu) : act === 'net' ? num(p.hoursNet) : totalHours(p);
    const open = list.filter(p => !CLOSED.includes(p.status));
    const sum = (arr, f) => arr.reduce((a, p) => a + f(p), 0);
    return {
      total: list.length,
      contacted: list.filter(p => num(p.callCount) > 0 || !NOT_YET_CONTACTED.includes(p.status)).length,
      toContact: list.filter(p => num(p.callCount) === 0 && NOT_YET_CONTACTED.includes(p.status)).length,
      rdv: list.filter(p => reached(p, 'rdv')).length,
      devisAsked: list.filter(p => reached(p, 'propo')).length,
      devisSent: list.filter(p => reached(p, 'devis')).length,
      won: list.filter(p => p.status === 'gagne').length,
      lost: list.filter(p => p.status === 'perdu').length,
      followUps: open.filter(p => p.nextDate && p.nextDate <= t).length,
      hot: open.filter(p => score(p).total >= 60).length,
      opportunities: list.filter(p => OPPORTUNITY.includes(p.status)).length,
      potentialCA: sum(open, value),
      potentialHours: sum(open, hours),
      negoValue: sum(list.filter(p => p.status === 'nego'), value),
      signedCA: sum(list.filter(p => p.status === 'gagne'), value),
      signedHours: sum(list.filter(p => p.status === 'gagne'), hours),
      forecast: sum(list.filter(p => p.status !== 'perdu'), p => value(p) * (PROB[p.status] || 0)),
    };
  }

  /* ---------- Statistiques ---------- */
  function stats(prospects, events, s) {
    const calls = events.filter(e => e.type === 'call');
    const callsBy = {};
    calls.forEach(e => { callsBy[e.pid] = (callsBy[e.pid] || 0) + 1; });
    const contacted = prospects.filter(p => (callsBy[p.id] || 0) > 0 || !NOT_YET_CONTACTED.includes(p.status));
    const reached = (p, st) => (p.reached || []).includes(st) || p.status === st;
    const won = prospects.filter(p => p.status === 'gagne');
    const lost = prospects.filter(p => p.status === 'perdu');
    const pct = (a, b) => b ? a / b * 100 : null;
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const devisSent = prospects.filter(p => reached(p, 'devis'));
    const out = {
      contacted: contacted.length,
      conversion: pct(won.length, contacted.length),
      refusal: pct(lost.length, contacted.length),
      response: pct(contacted.filter(p => reached(p, 'decideur') || STATUS_ORDER[p.status] >= STATUS_ORDER.decideur && p.status !== 'relance').length, contacted.length),
      rdvRate: pct(contacted.filter(p => reached(p, 'rdv')).length, contacted.length),
      quoteAccept: pct(won.length, devisSent.length),
      callsBeforeWin: avg(won.map(p => callsBy[p.id] || 0)),
      followUpsAvg: avg(contacted.map(p => Math.max(0, (callsBy[p.id] || 0) - 1))),
      daysToWin: avg(won.filter(p => p.createdAt && p.wonAt).map(p => daysBetween(p.createdAt.slice(0, 10), p.wonAt.slice(0, 10)))),
      revenue: won.reduce((a, p) => a + monthlyValue(p, s), 0),
      hoursSold: won.reduce((a, p) => a + totalHours(p), 0),
      wonCount: won.length,
    };
    const group = keyFn => {
      const g = {};
      prospects.forEach(p => {
        const keys = [].concat(keyFn(p)).filter(Boolean);
        keys.forEach(k => {
          g[k] = g[k] || { n: 0, contacted: 0, won: 0, ca: 0 };
          g[k].n++;
          if (contacted.includes(p)) g[k].contacted++;
          if (p.status === 'gagne') { g[k].won++; g[k].ca += monthlyValue(p, s); }
        });
      });
      return g;
    };
    out.bySector = group(p => p.sector || 'Non renseigné');
    out.bySource = group(p => p.source || 'Non renseignée');
    out.byActivity = group(p => [p.secu ? 'Sécurité' : null, p.net ? 'Nettoyage' : null]);
    // Comparaison mensuelle (6 derniers mois)
    const months = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push(m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'));
    }
    const statusEv = events.filter(e => e.type === 'status');
    out.monthly = months.map(m => ({
      month: m,
      newProspects: prospects.filter(p => (p.createdAt || '').startsWith(m)).length,
      calls: calls.filter(e => (e.date || e.ts || '').startsWith(m)).length,
      rdv: statusEv.filter(e => e.to === 'rdv' && (e.ts || '').startsWith(m)).length,
      devis: statusEv.filter(e => e.to === 'devis' && (e.ts || '').startsWith(m)).length,
      won: statusEv.filter(e => e.to === 'gagne' && (e.ts || '').startsWith(m)).length,
      ca: prospects.filter(p => p.status === 'gagne' && (p.wonAt || '').startsWith(m)).reduce((a, p) => a + monthlyValue(p, s), 0),
    }));
    return out;
  }

  /* ---------- Doublons ---------- */
  function normName(n) {
    return (n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(sas|sasu|sarl|eurl|sa|sci|snc)\b/g, '').replace(/[^a-z0-9]/g, '');
  }
  function dupKey(p) {
    const siren = (p.siren || '').replace(/\D/g, '').slice(0, 9);
    return siren.length === 9 ? 'siren:' + siren : 'nom:' + normName(p.name) + ':' + (p.cp || '').trim();
  }
  function findDuplicate(p, list) {
    const k = dupKey(p);
    return list.find(o => o.id !== p.id && dupKey(o) === k) || null;
  }

  /* ---------- Interlocuteur à demander au téléphone ----------
   * Les champs « Interlocuteurs » mélangent des personnes (« Prénom Nom — Fonction (source) »)
   * et des consignes (« Nom non public — demander au standard… », « Achats possiblement centralisés… »).
   * Seul un vrai nom de personne est renvoyé ; sinon la première consigne utile. */
  const CONTACT_ORDER = {
    secu: ['securite', 'site', 'sg', 'dirigeant', 'achats'],
    net: ['sg', 'site', 'achats', 'dirigeant', 'securite'],
  };
  const MOT_NOM = /^(M\.|Mme|Mlle|Pr|Dr|[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*|de|du|des|la|le|van|von|d['’][A-Za-zÀ-ÖØ-öø-ÿ'’-]+)$/;
  const PAS_UN_NOM = /\b(nom|non|standard|demander|responsable|directeur|directrice|service|achats?|accueil|siège|groupe|cellule|direction|contact|poste|linkedin|chargée?|gestionnaire|inconnu)\b/i;
  const casse = s => s === s.toUpperCase() && /[A-Z]{2}/.test(s)
    ? s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s;
  function personName(texte) {
    const v = String(texte || '').trim();
    // Une personne est toujours suivie de sa fonction : « Nom — Fonction » ou « Nom (Fonction) ».
    const sep = v.search(/\s+[—–]\s+|\s+-\s+|\s*\(/);
    if (sep <= 0) return '';
    let nom = v.slice(0, sep).trim().split(/\s+et\s+|\s*[,;/]\s*/)[0].trim();
    if (!nom || nom.length > 50 || PAS_UN_NOM.test(nom) || /\d|:/.test(nom)) return '';
    const mots = nom.split(/\s+/);
    if (mots.length < 2 || mots.length > 5 || !mots.every(m => MOT_NOM.test(m))) return '';
    if (!mots.some(m => /^[A-ZÀ-ÖØ-Þ]/.test(m) && !/^(M\.|Mme|Mlle|Pr|Dr)$/.test(m))) return '';
    return mots.map(casse).join(' ');
  }
  function contactFunction(texte, nom) {
    const v = String(texte || '').trim();
    const apres = v.replace(/^[^—–(]*?(\s+[—–-]\s+|\s*\()/, '');
    return apres === v ? '' : apres.split(/\s*[(;]|\)/)[0].trim().slice(0, 80);
  }
  function contactToCall(contacts, activite) {
    const c = contacts || {};
    const ordre = CONTACT_ORDER[activite === 'net' ? 'net' : 'secu'];
    // Consigne du champ prioritaire (ex. « demander au standard le responsable sécurité ») : affichée en plus du nom.
    const conseil = k => String(c[k] || '').trim().replace(/^nom non public[^—–-]*[—–-]\s*/i, '').slice(0, 160);
    let consigne = '';
    for (const k of ordre) {
      const v = String(c[k] || '');
      const nom = /non précisée/i.test(v) ? '' : personName(v);
      if (nom) return { nom, fonction: contactFunction(v, nom), champ: k, consigne };
      if (!consigne && v.trim()) consigne = conseil(k);
    }
    // Pas de nom : on garde la consigne la plus utile pour le standard (dans le même ordre).
    for (const k of ordre) {
      const v = String(c[k] || '').trim();
      if (v) return { nom: '', fonction: '', champ: k, consigne: conseil(k) };
    }
    return { nom: '', fonction: '', champ: '', consigne: '' };
  }

  const api = {
    personName, contactToCall,
    STATUSES, STATUS_LABEL, STATUS_ORDER, COLUMNS, PROB, CLOSED, OPPORTUNITY, NOT_YET_CONTACTED,
    CRITERIA, DEFAULT_SETTINGS, num, totalHours, hasDecisionMaker, score, band, rateNet,
    monthlyValue, calcContract, today, daysBetween, dashboard, stats, normName, dupKey, findDuplicate,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
