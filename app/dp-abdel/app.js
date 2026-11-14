/* =============================================================================
 * CRM Abdel — application
 * Connexion par code reçu par email + double authentification (comme Fil Rouge).
 * Données : tables Supabase abdel_prospects, abdel_appels_offres, abdel_parametres
 * (une ligne = un document JSON). L'historique est rangé dans chaque fiche.
 * Recherche d'entreprises et veille BOAMP : fonction serveur « abdel-recherche ».
 * ============================================================================= */
(function () {
  'use strict';
  const C = window.Core, R = window.RefData, CFG = window.ABDEL_CONFIG;
  const contenu = document.querySelector('#contenu .contenu-interieur');
  const menu = document.getElementById('menu-lateral');

  if (!window.supabase || !CFG) {
    contenu.innerHTML = '<p class="message message-erreur">La page n\'a pas pu se charger complètement. Vérifie ta connexion internet puis recharge.</p>';
    return;
  }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseCle, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  /* ------------------------------------------------------------------ */
  /* État et utilitaires                                                 */
  /* ------------------------------------------------------------------ */
  const S = {
    email: '', prospects: {}, ao: {}, params: { ...C.DEFAULT_SETTINGS }, pret: false,
    filtres: {}, recherche: null, veille: null, calc: null, assistant: null, ongletFiche: {},
  };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
  const eur2 = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0);
  const nf = (n, d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n || 0);
  const pct = n => n == null ? '—' : nf(n, 1) + ' %';
  const fd = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const fdt = iso => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? fd(iso) : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const nowISO = () => new Date().toISOString();
  const today = C.today;
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  const clone = o => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  function setPath(o, p, v) { const ks = p.split('.'); let c = o; ks.slice(0, -1).forEach(k => { if (c[k] == null || typeof c[k] !== 'object') c[k] = {}; c = c[k]; }); c[ks[ks.length - 1]] = v; }
  const opt = (v, l, sel) => `<option value="${esc(v)}"${String(sel ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  const liste = () => Object.values(S.prospects);
  const aos = () => Object.values(S.ao);
  const segLabel = id => { const s = R.SEGMENTS.find(x => x.id === id); return s ? s.l : (id || ''); };
  const prenom = () => S.params.userName || 'Émilie';

  function notif(msg, erreur) {
    const el = document.createElement('div');
    el.className = 'notif' + (erreur ? ' erreur' : '');
    el.textContent = msg;
    document.getElementById('notifs').appendChild(el);
    setTimeout(() => el.remove(), erreur ? 7000 : 3200);
  }
  function dialogue(html, boutons) {
    return new Promise(resolve => {
      const fond = document.createElement('div');
      fond.className = 'dialogue-fond';
      fond.innerHTML = `<div class="dialogue" role="dialog" aria-modal="true"><div>${html}</div><div class="actions">${boutons.map((b, i) => `<button type="button" class="bouton ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
      fond.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { fond.remove(); resolve(boutons[+b.dataset.i].value); } });
      document.body.appendChild(fond);
      const premier = fond.querySelector('button'); if (premier) premier.focus();
    });
  }
  function occupe(bouton, oui, texte) {
    if (!bouton) return;
    if (oui) { bouton.dataset.texte = bouton.textContent; bouton.textContent = texte || '…'; bouton.disabled = true; }
    else { bouton.textContent = bouton.dataset.texte || bouton.textContent; bouton.disabled = false; }
  }

  /* ------------------------------------------------------------------ */
  /* Connexion (code par email + double authentification)                */
  /* ------------------------------------------------------------------ */
  function afficherConnexion(html) {
    menu.hidden = true; document.getElementById('bouton-menu').hidden = true; document.getElementById('zone-compte').hidden = true;
    contenu.innerHTML = html;
    const champ = contenu.querySelector('input'); if (champ) champ.focus();
  }
  function ecranEmail(message) {
    afficherConnexion(`<div class="pile">
      <div><p class="surtitre">Connexion</p><h1>Ton espace de prospection</h1><p class="chapo">Saisis ton adresse email : tu reçois un code à usage unique. C'est le même compte que Fil Rouge.</p></div>
      <div class="carte carte-etroite"><form class="formulaire" id="f-email" novalidate>
        <label for="champ-email">Adresse email<input id="champ-email" type="email" autocomplete="email" inputmode="email" required value="${esc(S.email)}"></label>
        ${message ? `<p class="message message-erreur">${esc(message)}</p>` : ''}<div id="zone-email"></div>
        <button class="bouton" type="submit">Recevoir mon code</button></form></div></div>`);
    document.getElementById('f-email').addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('champ-email').value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return (document.getElementById('zone-email').innerHTML = '<p class="message message-erreur">Adresse email invalide.</p>');
      const b = e.target.querySelector('button'); occupe(b, true, 'Envoi…');
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      occupe(b, false);
      if (error && !/signups not allowed|not found/i.test(error.message)) {
        return (document.getElementById('zone-email').innerHTML = `<p class="message message-erreur">${/rate|seconds/i.test(error.message) ? 'Trop de demandes : patiente une minute avant de redemander un code.' : 'Envoi impossible pour le moment. Réessaie dans un instant.'}</p>`);
      }
      S.email = email; ecranCode();
    });
  }
  function ecranCode() {
    afficherConnexion(`<div class="pile">
      <div><p class="surtitre">Connexion</p><h1>Vérifie ta boîte mail</h1><p class="chapo">Si l'adresse ${esc(S.email)} a un compte, un code vient de partir. Il est valable une heure.</p></div>
      <div class="carte carte-etroite"><form class="formulaire" id="f-code" novalidate>
        <label for="champ-code">Code reçu par email<input id="champ-code" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></label>
        <div id="zone-code"></div><button class="bouton" type="submit">Valider</button>
        <div class="actions petit"><button class="bouton-lien" type="button" id="autre-email">Changer d'adresse</button></div></form></div></div>`);
    document.getElementById('autre-email').addEventListener('click', () => ecranEmail());
    document.getElementById('f-code').addEventListener('submit', async e => {
      e.preventDefault();
      const code = document.getElementById('champ-code').value.replace(/\D/g, '');
      if (code.length < 6) return (document.getElementById('zone-code').innerHTML = '<p class="message message-erreur">Saisis les chiffres du code.</p>');
      const b = e.target.querySelector('button[type=submit]'); occupe(b, true, 'Vérification…');
      const { error } = await sb.auth.verifyOtp({ email: S.email, token: code, type: 'email' });
      occupe(b, false);
      if (error) return (document.getElementById('zone-code').innerHTML = '<p class="message message-erreur">Code incorrect ou expiré. Redemande un code si besoin.</p>');
      aiguiller();
    });
  }
  async function ecranMfa() {
    const { data } = await sb.auth.mfa.listFactors();
    const facteur = (data && data.totp || []).find(f => f.status === 'verified');
    if (!facteur) return ecranMessage('Double authentification à activer', 'Pour protéger tes données, le CRM exige la double authentification. Active-la depuis Fil Rouge (même compte), puis reviens ici.');
    afficherConnexion(`<div class="pile">
      <div><p class="surtitre">Sécurité</p><h1>Double authentification</h1><p class="chapo">Ouvre ton application d'authentification et saisis le code à 6 chiffres affiché pour Fil Rouge.</p></div>
      <div class="carte carte-etroite"><form class="formulaire" id="f-mfa" novalidate>
        <label for="champ-mfa">Code de l'application<input id="champ-mfa" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
        <div id="zone-mfa"></div><button class="bouton" type="submit">Valider</button></form></div></div>`);
    document.getElementById('f-mfa').addEventListener('submit', async e => {
      e.preventDefault();
      const code = document.getElementById('champ-mfa').value.replace(/\D/g, '');
      const b = e.target.querySelector('button'); occupe(b, true, 'Vérification…');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: facteur.id, code });
      occupe(b, false);
      if (error) return (document.getElementById('zone-mfa').innerHTML = '<p class="message message-erreur">Code incorrect. Attends le code suivant et réessaie.</p>');
      aiguiller();
    });
  }
  function ecranMessage(titre, texte) {
    afficherConnexion(`<div class="pile"><div><p class="surtitre">Accès</p><h1>${esc(titre)}</h1><p class="chapo">${esc(texte)}</p></div>
      <div><button class="bouton bouton-secondaire" id="deco" type="button">Se déconnecter</button></div></div>`);
    document.getElementById('deco').addEventListener('click', deconnexion);
  }
  async function deconnexion() { await sb.auth.signOut(); S.prospects = {}; S.ao = {}; S.pret = false; location.hash = '#/'; ecranEmail(); }

  async function aiguiller() {
    const { data: session } = await sb.auth.getSession();
    if (!session || !session.session) return ecranEmail();
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== 'aal2') {
      if (aal && aal.nextLevel === 'aal2') return ecranMfa();
      return ecranMessage('Double authentification à activer', 'Pour protéger tes données, le CRM exige la double authentification. Active-la depuis Fil Rouge (même compte), puis reviens ici.');
    }
    const { data: membre, error } = await sb.rpc('abdel_suis_membre');
    if (error || !membre) return ecranMessage('Accès non autorisé', 'Ce compte n\'a pas accès au CRM Abdel.');
    S.email = session.session.user.email;
    try { await chargerTout(); } catch (e) { contenu.innerHTML = `<p class="message message-erreur">Lecture des données impossible : ${esc(e.message || e)}. Recharge la page.</p>`; return; }
    document.getElementById('zone-compte').hidden = false;
    document.getElementById('compte-libelle').textContent = S.email;
    document.getElementById('bouton-menu').hidden = false;
    menu.hidden = false;
    S.pret = true;
    route();
  }

  /* ------------------------------------------------------------------ */
  /* Données                                                             */
  /* ------------------------------------------------------------------ */
  async function lireTable(table) {
    let tout = [], de = 0;
    for (;;) {
      const { data, error } = await sb.from(table).select('id,data').range(de, de + 999);
      if (error) throw error;
      tout = tout.concat(data); if (data.length < 1000) break; de += 1000;
    }
    return tout;
  }
  async function chargerTout() {
    const [p, a, s] = await Promise.all([lireTable('abdel_prospects'), lireTable('abdel_appels_offres'), lireTable('abdel_parametres')]);
    S.prospects = {}; p.forEach(r => { S.prospects[r.id] = { ...r.data, id: r.id }; });
    S.ao = {}; a.forEach(r => { S.ao[r.id] = { ...r.data, id: r.id }; });
    const m = s.find(r => r.id === 'main'); S.params = { ...C.DEFAULT_SETTINGS, ...(m ? m.data : {}) };
    S.chargeA = Date.now();
    await chargerCorbeille();
  }
  /* Corbeille de l'agent Tri (fiches et appels d'offres périmés, gardés 30 jours). Facultative : si la table manque, on l'ignore. */
  async function chargerCorbeille() {
    try {
      const { data, error } = await sb.from('abdel_corbeille').select('id,table_origine,id_origine,raison,supprime_le,purge_apres,data').order('supprime_le', { ascending: false }).limit(300);
      S.corbeille = error ? [] : (data || []);
    } catch (_) { S.corbeille = []; }
  }
  async function restaurerCorbeille(idCb) {
    const it = (S.corbeille || []).find(x => x.id === idCb); if (!it) return;
    const d = clone(it.data); delete d._cree_le;
    if (it.table_origine === 'abdel_prospects') {
      d.garder = true; // l'agent Tri ne la retirera plus
      d.history = [...(d.history || []), { type: 'note', ts: nowISO(), text: 'Fiche restaurée depuis la corbeille (' + it.raison + ')' }];
      d.updatedAt = nowISO();
    }
    if (!(await ecrire(it.table_origine, it.id_origine, d))) return;
    if (it.table_origine === 'abdel_prospects') S.prospects[it.id_origine] = { ...d, id: it.id_origine };
    else S.ao[it.id_origine] = { ...d, id: it.id_origine };
    await effacer('abdel_corbeille', it.id);
    S.corbeille = S.corbeille.filter(x => x.id !== idCb);
    notif('Restauré : ' + (d.name || d.buyer || 'élément'));
    rafraichir();
  }
  function blocCorbeille() {
    const items = S.corbeille || [];
    const ligne = it => {
      const d = it.data || {};
      const nom = it.table_origine === 'abdel_prospects' ? (d.name || 'Fiche') : (d.buyer || 'Appel d\'offres') + (d.object ? ' — ' + d.object : '');
      return `<li class="ligne sans-score"><div><div class="ligne-titre">${esc(nom)}</div><div class="ligne-detail">${it.table_origine === 'abdel_prospects' ? 'Prospect' : 'Appel d\'offres'} · ${esc(it.raison)} · retiré le ${fd(it.supprime_le)} · effacé le ${fd(it.purge_apres)}</div></div>
        <button class="bouton bouton-petit bouton-secondaire" type="button" data-action="restaurer-corbeille" data-id="${esc(it.id)}">Restaurer</button></li>`;
    };
    return `<section class="carte pile-serree"><h3>Corbeille du tri automatique</h3>
      <p class="aide">Chaque matin, l'agent Tri retire les appels d'offres dont la date limite est passée et les prospects jamais appelés dont l'annonce est trop vieille (offre d'emploi : 30 jours ; chantier ou implantation : 60 jours). Ils restent ici 30 jours. Une fiche restaurée n'est plus jamais retirée automatiquement.</p>
      ${items.length ? `<ul class="liste">${items.map(ligne).join('')}</ul>` : '<p class="aide">Corbeille vide.</p>'}</section>`;
  }
  /* Retour d'un appel passé avec « Appeler » : ouvre le formulaire de la bonne fiche avec la durée pré-remplie. */
  function retourAppel(ap) {
    const minutes = Math.max(1, Math.round((Date.now() - ap.debut) / 60000));
    const cible = `#/prospect/${encodeURIComponent(ap.id)}/suivi`;
    const remplir = () => {
      const f = document.getElementById('f-appel'); if (!f) return;
      if (f.elements.duration && !f.elements.duration.value) f.elements.duration.value = minutes;
      f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (location.hash !== cible) { location.hash = cible; setTimeout(remplir, 400); } else remplir();
    notif(`Appel terminé (environ ${minutes} min) : note le résultat.`);
  }
  /* Recharge les données quand on revient sur l'onglet : évite d'écraser ce que l'agent Contacts a écrit entre-temps. */
  document.addEventListener('visibilitychange', async () => {
    const ap = S.appelEnCours;
    if (document.visibilityState === 'hidden') { if (ap) ap.parti = true; return; }
    if (ap && ap.parti) { S.appelEnCours = null; return retourAppel(ap); }
    if (document.visibilityState !== 'visible' || !S.pret || !S.chargeA || Date.now() - S.chargeA < 120000) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    try { await chargerTout(); rafraichir(); } catch (_) { /* hors ligne : on garde les données en mémoire */ }
  });
  function messageErreur(err) {
    const m = (err && (err.message || err.code)) || '';
    if (/JWT|expired|401/i.test(m)) return 'Ta session a expiré : reconnecte-toi.';
    if (/row-level|permission|42501/i.test(m)) return 'Accès refusé par la base (reconnecte-toi avec la double authentification).';
    if (/Failed to fetch|network/i.test(m)) return 'Pas de connexion internet : rien n\'a été enregistré.';
    return 'Enregistrement impossible : ' + m;
  }
  async function ecrire(table, id, data) {
    const doc = clone(data); delete doc.id;
    const { error } = await sb.from(table).upsert({ id, data: doc });
    if (error) { notif(messageErreur(error), true); return false; }
    return true;
  }
  async function effacer(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { notif(messageErreur(error), true); return false; }
    return true;
  }
  async function appelServeur(corps) {
    const { data, error } = await sb.functions.invoke('abdel-recherche', { body: corps });
    if (error) {
      let msg = 'La recherche n\'a pas abouti.';
      try { const j = await error.context.json(); if (j && j.erreur) msg = j.erreur; } catch (_) { }
      throw new Error(msg);
    }
    return data;
  }

  /* Prospects */
  function prospectVide(act) {
    return {
      name: '', siren: '', siret: '', address: '', cp: '', city: '', website: '', sector: '', size: '',
      secu: act !== 'net', net: act === 'net', netProduits: true,
      contacts: { dirigeant: '', securite: '', achats: '', sg: '', site: '' },
      phone: '', email: '', linkedin: '', source: '', discoveredAt: today(), need: '',
      hoursSecu: '', hoursNet: '', notes: '', status: 'identifie', reached: ['identifie'], criteria: {},
      nextAction: '', nextDate: '', rdvDate: '', lastCallDate: '', callCount: 0, optOut: false, history: [],
    };
  }
  function avecStatut(p, vers) {
    if (p.status === vers) return p;
    p.history = [...(p.history || []), { type: 'status', from: p.status, to: vers, ts: nowISO() }];
    p.status = vers;
    p.reached = Array.from(new Set([...(p.reached || []), vers]));
    if (vers === 'gagne') p.wonAt = nowISO();
    return p;
  }
  async function enregistrerProspect(p) {
    const doc = clone(p);
    if (!doc.id) { doc.id = uid(); doc.createdAt = nowISO(); doc.history = [...(doc.history || []), { type: 'create', ts: doc.createdAt }]; }
    doc.updatedAt = nowISO();
    doc.reached = Array.from(new Set([...(doc.reached || []), doc.status]));
    if (!(await ecrire('abdel_prospects', doc.id, doc))) return null;
    S.prospects[doc.id] = doc;
    return doc;
  }
  async function changerStatut(id, vers) {
    const p = S.prospects[id]; if (!p || p.status === vers) return;
    if (await enregistrerProspect(avecStatut(clone(p), vers))) notif(`${p.name} → ${C.STATUS_LABEL[vers]}`);
  }
  const relancesDues = () => liste().filter(p => !C.CLOSED.includes(p.status) && !p.optOut && p.nextDate && p.nextDate <= today());

  /* ------------------------------------------------------------------ */
  /* Menu et navigation                                                  */
  /* ------------------------------------------------------------------ */
  const MENU = [
    { titre: null, liens: [['', 'Tableau de bord', '◎'], ['session', 'Session d\'appels', '▶'], ['relances', 'Appels et relances', '☎'], ['pipeline', 'Pipeline commercial', '⇢']] },
    { titre: 'Prospects', liens: [['securite', 'Prospects sécurité', '🛡', 'secu'], ['nettoyage', 'Prospects nettoyage', '✦'], ['recherche', 'Recherche de prospects', '⌕'], ['sites', 'Sites de prospection', '↗']] },
    { titre: 'Contrats', liens: [['ao', 'Appels d\'offres', '§'], ['calculateur', 'Calculateur de contrats', '∑']] },
    { titre: 'Pilotage', liens: [['stats', 'Statistiques', '▤'], ['assistant', 'Assistant', '✧'], ['parametres', 'Paramètres', '⚙']] },
  ];
  function routeActuelle() {
    const h = (location.hash || '#/').replace(/^#\/?/, '');
    const [nom, id, sous] = h.split('/');
    return { nom: nom || '', id: id ? decodeURIComponent(id) : '', sous: sous || '' };
  }
  function dessinerMenu(r) {
    const due = relancesDues().length;
    const actif = r.nom === 'prospect' ? (S.prospects[r.id] && !S.prospects[r.id].secu ? 'nettoyage' : 'securite') : r.nom === 'nouveau' ? (r.id === 'net' ? 'nettoyage' : 'securite') : r.nom;
    menu.innerHTML = MENU.map(g => `<div class="menu-groupe">${g.titre ? `<p class="menu-titre">${esc(g.titre)}</p>` : ''}
      ${g.liens.map(([k, l, ico, cls]) => `<a class="menu-lien ${cls || ''}" href="#/${k}"${actif === k ? ' aria-current="page"' : ''}><span class="ico" aria-hidden="true">${ico}</span>${esc(l)}${k === 'relances' && due ? `<span class="nb">${due}</span>` : ''}</a>`).join('')}</div>`).join('');
  }
  function route() {
    if (!S.pret) return;
    document.body.classList.remove('menu-ouvert'); document.getElementById('voile').hidden = true;
    const r = routeActuelle();
    dessinerMenu(r);
    const pages = {
      '': pAccueil, relances: pRelances, pipeline: pPipeline, securite: () => pListe('secu'), nettoyage: () => pListe('net'),
      recherche: pRecherche, sites: pSites, ao: pAO, calculateur: pCalc, stats: pStats, assistant: pAssistant, parametres: pParametres,
      prospect: () => pFiche(r.id, r.sous), nouveau: () => pNouveau(r.id), session: pSession,
    };
    contenu.innerHTML = (pages[r.nom] || pAccueil)(r);
    apresRendu(r);
    window.scrollTo(0, 0);
  }
  function rafraichir() { const y = window.scrollY; route(); window.scrollTo(0, y); }

  /* ------------------------------------------------------------------ */
  /* Morceaux réutilisables                                              */
  /* ------------------------------------------------------------------ */
  const tete = (sur, titre, chapo, actions, cls) => `<div class="entete"><div><p class="surtitre ${cls || ''}">${esc(sur)}</p><h1>${esc(titre)}</h1>${chapo ? `<p class="chapo">${chapo}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
  const compteur = (v, l, cls, href) => href ? `<a class="compteur ${cls || ''}" href="${href}"><span class="compteur-valeur">${v}</span><span class="compteur-libelle">${esc(l)}</span></a>`
    : `<div class="compteur ${cls || ''}"><span class="compteur-valeur">${v}</span><span class="compteur-libelle">${esc(l)}</span></div>`;
  const scoreRond = p => { const s = C.score(p); return `<span class="score ${s.band.key}" title="${esc(s.band.label)} · score sur 100">${s.total}</span>`; };
  function pastilleStatut(p) {
    const k = p.status;
    const cls = k === 'gagne' ? 'p-vert' : k === 'perdu' ? 'p-rouge' : ['nego', 'devis', 'propo', 'rdv'].includes(k) ? 'p-safran' : 'p-neutre';
    return `<span class="pastille ${cls}">${esc(C.STATUS_LABEL[k] || k)}</span>`;
  }
  const pastillesAct = p => (p.secu ? '<span class="pastille p-encre">Sécurité</span>' : '') + (p.net ? '<span class="pastille p-menthe">Nettoyage</span>' : '');
  /* Signal chaud : l'agent Leads a noté un nouveau signal (offre d'emploi, appel d'offres, ouverture…)
     depuis moins de 14 jours, et Émilie n'a pas appelé depuis. */
  function signalChaud(p) {
    if (C.CLOSED.includes(p.status) || p.optOut) return null;
    const limite = addDays(today(), -14);
    const evs = (p.history || []).filter(e => e.type === 'note' && /nouveau signal|fiche créée par l'agent leads/i.test(e.text || '') && (e.ts || '').slice(0, 10) >= limite)
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const dernier = evs[0];
    if (!dernier) return null;
    if (p.lastCallDate && p.lastCallDate >= dernier.ts.slice(0, 10)) return null;
    return { ts: dernier.ts, texte: String(dernier.text || '').replace(/^(nouveau signal|fiche créée par l'agent leads)\s*:\s*/i, '') };
  }
  const signauxChauds = () => liste().map(p => ({ p, sg: signalChaud(p) })).filter(x => x.sg).sort((a, b) => b.sg.ts.localeCompare(a.sg.ts)).map(x => x.p);
  function ligneProspect(p, mode) {
    const s = S.params, v = C.monthlyValue(p, s);
    const sg = signalChaud(p);
    const retard = p.nextDate && p.nextDate < today();
    const detail = [p.city, segLabel(p.sector), mode === 'tel' && p.phone ? '☎ ' + p.phone : '', mode === 'signal' && sg ? sg.texte : p.nextAction].filter(Boolean).map(esc).join(' · ');
    const droite = mode === 'relance'
      ? `<span class="pastille ${retard ? 'p-rouge' : 'p-safran'}">${retard ? 'En retard · ' : ''}${fd(p.nextDate)}</span>`
      : mode === 'dernier' ? `<span class="petit doux">Dernier appel : ${fd(p.lastCallDate)}</span>` : '';
    return `<li><a class="ligne" href="#/prospect/${encodeURIComponent(p.id)}">${scoreRond(p)}
      <div><div class="ligne-titre">${esc(p.name)}${p.optOut ? ' <span class="pastille p-rouge">Ne plus contacter</span>' : ''}</div><div class="ligne-detail">${detail || '&nbsp;'}</div></div>
      <div class="ligne-droite"><div class="pastilles">${sg ? `<span class="pastille p-feu" title="${esc(sg.texte)}">🔥 Nouveau signal · ${fd(sg.ts)}</span>` : ''}${pastillesAct(p)}${pastilleStatut(p)}</div>${droite || (v ? `<span class="ligne-montant">${eur(v)}<span class="petit doux"> /mois</span></span>` : '')}</div></a></li>`;
  }
  const listeProspects = (arr, mode, vide) => arr.length ? `<ul class="liste">${arr.map(p => ligneProspect(p, mode)).join('')}</ul>` : `<p class="message message-info">${vide || 'Aucun prospect ici pour l\'instant.'}</p>`;

  /* ------------------------------------------------------------------ */
  /* Tableau de bord                                                     */
  /* ------------------------------------------------------------------ */
  function pAccueil() {
    const s = S.params;
    const alertes = [];
    const due = relancesDues().length;
    if (due) alertes.push(`<p class="message message-action"><b>${due} relance${due > 1 ? 's' : ''} à faire aujourd'hui.</b> <a href="#/relances">Ouvrir ma journée →</a></p>`);
    aos().filter(t => t.deadline && !['depose', 'gagne', 'perdu', 'abandonne'].includes(t.status)).forEach(t => {
      const j = C.daysBetween(today(), t.deadline);
      if (j >= 0 && j <= 15) alertes.push(`<p class="message ${j <= 2 ? 'message-erreur' : 'message-encre'}"><b>Appel d'offres J-${j}</b> · ${esc(t.object)} (${esc(t.buyer)}). <a href="#/ao/${encodeURIComponent(t.id)}">Voir →</a></p>`);
    });
    const bloc = act => {
      const d = C.dashboard(liste(), s, act);
      const base = act === 'secu' ? '#/securite' : '#/nettoyage';
      return `<div class="compteurs">
        ${compteur(d.total, 'prospects', 'compteur-encre', base)}${compteur(d.toContact, 'à contacter', '', base)}${compteur(d.contacted, 'contactés')}${compteur(d.hot, 'chauds (score ≥ 60)', 'compteur-safran')}
        ${compteur(d.opportunities, 'opportunités en cours')}${compteur(d.followUps, 'relances à faire', d.followUps ? 'compteur-rouge' : '', '#/relances')}${compteur(d.rdv, 'rendez-vous obtenus')}${compteur(d.devisAsked, 'devis demandés')}
        ${compteur(d.devisSent, 'devis envoyés')}${compteur(d.won, 'contrats signés', 'compteur-vert')}${compteur(d.lost, 'contrats perdus')}${compteur(nf(d.potentialHours) + ' h', 'volume horaire potentiel / mois')}
      </div>
      <div class="compteurs">
        ${compteur(eur(d.potentialCA), 'CA potentiel / mois', 'compteur-argent')}${compteur(nf(d.potentialHours * 12) + ' h', 'heures potentielles / an', 'compteur-argent')}
        ${compteur(eur(d.negoValue), 'en négociation / mois', 'compteur-argent')}${compteur(eur(d.signedCA), 'CA signé / mois', 'compteur-argent compteur-vert')}
      </div>
      <p class="aide">Prévisionnel pondéré : <b>${eur(d.forecast)} HT / mois</b> (chaque prospect compte selon sa probabilité de signature à son étape).</p>`;
    };
    const chauds = signauxChauds();
    const top = liste().filter(p => !C.CLOSED.includes(p.status) && !p.optOut)
      .sort((a, b) => (signalChaud(b) ? 1 : 0) - (signalChaud(a) ? 1 : 0) || C.score(b).total - C.score(a).total || C.monthlyValue(b, s) - C.monthlyValue(a, s)).slice(0, 8);
    return `<div class="pile">
      ${tete('Tableau de bord', `Bonjour ${prenom()}`, 'Vue d\'ensemble de ta prospection pour Abdel. La sécurité passe en premier.')}
      ${alertes.join('')}
      <div class="actions"><a class="bouton bouton-session" href="#/session">▶ Démarrer une session d'appels</a></div>
      ${chauds.length ? `<section class="espace espace-feu"><div class="espace-tete"><h2>🔥 Signaux chauds</h2><span class="pastille p-feu">${chauds.length}</span></div>
        <p class="aide">Un besoin vient d'apparaître (offre d'emploi, appel d'offres, ouverture…) et tu n'as pas encore appelé : c'est le meilleur moment.</p>${listeProspects(chauds.slice(0, 8), 'signal')}</section>` : ''}
      ${liste().length ? '' : `<p class="message message-encre"><b>Ta base est vide.</b> Commence par la <a href="#/recherche">recherche de prospects</a> (entreprises réelles de la métropole, données officielles), ou importe un fichier Excel depuis <a href="#/parametres">Paramètres</a>.</p>`}
      <section class="espace espace-secu"><div class="espace-tete"><h2>🛡 Sécurité privée</h2><span class="pastille p-encre">Priorité</span></div>${bloc('secu')}</section>
      <section class="espace espace-net"><div class="espace-tete"><h2>✦ Nettoyage professionnel</h2></div>${bloc('net')}</section>
      <section><div class="section-titre"><h2>À travailler en premier</h2><p>signaux chauds, puis score et valeur</p></div>${listeProspects(top, '', 'Aucun prospect ouvert.')}</section>
      <p class="aide">CA = chiffre d'affaires HT, pas le bénéfice. Mois = semaine × 52 / 12.</p></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Appels et relances                                                  */
  /* ------------------------------------------------------------------ */
  function pRelances() {
    const t = today();
    const ouverts = liste().filter(p => !C.CLOSED.includes(p.status) && !p.optOut);
    const sections = [
      ['🔥 Signaux chauds : à appeler en priorité', signauxChauds(), 'signal'],
      ['Relances du jour et en retard', ouverts.filter(p => p.nextDate && p.nextDate <= t).sort((a, b) => a.nextDate.localeCompare(b.nextDate)), 'relance'],
      ['Rendez-vous du jour', liste().filter(p => p.rdvDate && p.rdvDate.slice(0, 10) === t), 'tel'],
      ['Devis en attente de réponse', ouverts.filter(p => p.status === 'devis'), 'relance'],
      ['Prospects chauds sans appel depuis 7 jours', ouverts.filter(p => C.score(p).total >= 60 && (!p.lastCallDate || C.daysBetween(p.lastCallDate, t) >= 7)), 'dernier'],
      ['À appeler : jamais contactés, meilleurs scores d\'abord', ouverts.filter(p => !C.num(p.callCount) && C.NOT_YET_CONTACTED.includes(p.status)).sort((a, b) => C.score(b).total - C.score(a).total).slice(0, 25), 'tel'],
      ['Sans nouvelles depuis 15 jours ou plus', ouverts.filter(p => p.lastCallDate && C.daysBetween(p.lastCallDate, t) >= 15), 'dernier'],
    ];
    return `<div class="pile">${tete('Appels et relances', 'Ma journée', 'Après chaque appel : ouvre la fiche, onglet « Suivi », et note l\'appel. La date de relance est obligatoire : c\'est elle qui te remet le prospect ici au bon moment.', '<a class="bouton bouton-session" href="#/session">▶ Démarrer une session d\'appels</a>')}
      ${sections.map(([titre, arr, mode]) => `<section><div class="section-titre"><h2>${esc(titre)}</h2><p>${arr.length}</p></div>${listeProspects(arr, mode, 'Rien pour le moment.')}</section>`).join('')}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Listes de prospects                                                 */
  /* ------------------------------------------------------------------ */
  function pListe(act) {
    const cle = 'l_' + act;
    const f = S.filtres[cle] || (S.filtres[cle] = { q: '', band: '', city: '', status: '', tri: 'score' });
    const tous = liste().filter(p => act === 'secu' ? p.secu : p.net);
    let arr = tous.slice();
    if (f.q) { const q = f.q.toLowerCase(); arr = arr.filter(p => [p.name, p.city, p.siren, p.need, p.notes, Object.values(p.contacts || {}).join(' ')].join(' ').toLowerCase().includes(q)); }
    if (f.city) arr = arr.filter(p => p.city === f.city);
    if (f.status) arr = arr.filter(p => p.status === f.status);
    const parBande = k => arr.filter(p => C.score(p).band.key === k).length;
    if (f.band) arr = arr.filter(p => C.score(p).band.key === f.band);
    const s = S.params;
    const tris = { score: (a, b) => C.score(b).total - C.score(a).total, valeur: (a, b) => C.monthlyValue(b, s) - C.monthlyValue(a, s), relance: (a, b) => (a.nextDate || '9').localeCompare(b.nextDate || '9'), recent: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''), nom: (a, b) => (a.name || '').localeCompare(b.name || '') };
    arr.sort(tris[f.tri] || tris.score);
    const bandes = [['', 'Tous', arr.length + (f.band ? 0 : 0)], ['tres', 'Très élevée'], ['chaud', 'Chauds'], ['travail', 'À travailler'], ['faible', 'Faible']];
    return `<div class="pile">${tete(act === 'secu' ? 'Prospects' : 'Prospects', act === 'secu' ? 'Sécurité privée' : 'Nettoyage professionnel', `${tous.length} entreprise${tous.length > 1 ? 's' : ''} dans ta base.`, `<a class="bouton ${act === 'net' ? 'bouton-menthe' : ''}" href="#/nouveau/${act}">+ Ajouter</a><a class="bouton bouton-secondaire" href="#/recherche">Chercher des entreprises</a>`, act === 'net' ? 'menthe' : '')}
      <div class="pile-serree">
        <div class="filtres">${bandes.map(([k, l]) => `<button type="button" class="filtre" data-filtre="${cle}.band" data-valeur="${k}" aria-pressed="${f.band === k}">${esc(l)} <span class="filtre-nb">${k ? parBande(k) : ''}</span></button>`).join('')}</div>
        <div class="barre-filtres">
          <input type="search" placeholder="Rechercher (nom, ville, contact…)" value="${esc(f.q)}" data-filtre="${cle}.q" data-direct="1" aria-label="Rechercher">
          <select data-filtre="${cle}.city" aria-label="Commune">${opt('', 'Toutes les communes', f.city)}${R.COMMUNES.map(c => opt(c[0], c[0], f.city)).join('')}</select>
          <select data-filtre="${cle}.status" aria-label="Statut">${opt('', 'Tous les statuts', f.status)}${C.STATUSES.map(x => opt(x[0], x[1], f.status)).join('')}</select>
          <select data-filtre="${cle}.tri" aria-label="Tri">${opt('score', 'Tri : score', f.tri)}${opt('valeur', 'Tri : valeur', f.tri)}${opt('relance', 'Tri : date de relance', f.tri)}${opt('recent', 'Tri : plus récents', f.tri)}${opt('nom', 'Tri : nom', f.tri)}</select>
        </div></div>
      <section><div class="section-titre"><h2>${arr.length} résultat${arr.length > 1 ? 's' : ''}</h2><p><button class="bouton-lien" type="button" data-action="exporter" data-quoi="${act}">Exporter en Excel</button></p></div>${listeProspects(arr)}</section></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Recherche de prospects (API officielle)                             */
  /* ------------------------------------------------------------------ */
  function pRecherche() {
    const f = S.filtres.rech || (S.filtres.rech = { act: 'secu', seg: 'logistique', commune: 'Mérignac', rayon: '5', taille: '10', q: '' });
    const segs = R.SEGMENTS.filter(x => x.act === f.act || x.act === 'both');
    if (!segs.some(x => x.id === f.seg)) f.seg = segs[0].id;
    const seg = R.SEGMENTS.find(x => x.id === f.seg);
    const com = R.COMMUNES.find(c => c[0] === f.commune);
    const lieu = com ? com[0] : 'Bordeaux';
    const q = encodeURIComponent(seg.q + ' ' + lieu);
    const metier = f.act === 'secu' ? 'agent de sécurité' : 'agent d\'entretien';
    const liens = [
      ['Google Maps', `https://www.google.com/maps/search/${q}`], ['PagesJaunes', `https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=${encodeURIComponent(seg.q)}&ou=${encodeURIComponent(lieu)}`],
      ['Indeed : qui recrute ?', `https://fr.indeed.com/jobs?q=${encodeURIComponent(metier)}&l=${encodeURIComponent(lieu)}`],
      ['LinkedIn : décideurs', `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((f.act === 'secu' ? 'responsable sécurité ' : 'services généraux ') + seg.q + ' Bordeaux')}`],
    ];
    const r = S.recherche;
    let resultats = '';
    if (r && r.charge) resultats = '<p class="chargement">Recherche dans le registre officiel…</p>';
    else if (r && r.erreur) resultats = `<p class="message message-erreur">${esc(r.erreur)}</p>`;
    else if (r && r.data) {
      const d = r.data;
      resultats = `<div class="section-titre"><h2>${nf(d.total || 0)} entreprise${d.total > 1 ? 's' : ''} trouvée${d.total > 1 ? 's' : ''}</h2><p>page ${d.page} / ${d.pages || 1}</p></div>
        ${d.resultats.length ? `<ul class="liste">${d.resultats.map((e, i) => {
          const et = (e.etablissements && e.etablissements[0]) || e.siege || {};
          const deja = liste().find(p => (p.siren && p.siren === e.siren && (!p.siret || p.siret === et.siret)));
          return `<li class="ligne sans-score"><div><div class="ligne-titre">${esc(et.enseigne || e.nom)}${et.enseigne && et.enseigne !== e.nom ? ` <span class="doux petit">(${esc(e.nom)})</span>` : ''}</div>
            <div class="ligne-detail">${esc(et.adresse || '')}</div>
            <div class="ligne-detail">${esc(R.TRANCHES[et.effectif || e.effectif] ? 'Effectif : ' + R.TRANCHES[et.effectif || e.effectif] + ' salariés' : 'Effectif non renseigné')} · NAF ${esc(et.naf || e.naf || '')}${e.nbEtabOuverts > 1 ? ` · ${e.nbEtabOuverts} établissements` : ''}${e.dirigeants.length ? ' · ' + esc(e.dirigeants[0]) : ''}</div></div>
            <div class="ligne-droite"><div class="pastilles">${e.opposition ? '<span class="pastille p-rouge" title="L\'entreprise s\'oppose à l\'utilisation de ses données à des fins de prospection">Opposition prospection</span>' : ''}${e.categorie ? `<span class="pastille p-neutre">${esc(e.categorie)}</span>` : ''}</div>
            ${deja ? `<a class="bouton bouton-petit bouton-secondaire" href="#/prospect/${encodeURIComponent(deja.id)}">Déjà dans le CRM</a>` : `<button class="bouton bouton-petit" type="button" data-action="ajouter-resultat" data-i="${i}">Ajouter au CRM</button>`}</div></li>`;
        }).join('')}</ul>` : '<p class="message message-info">Aucune entreprise ne correspond. Élargis le rayon ou change la taille.</p>'}
        ${d.pages > d.page ? `<div class="actions"><button class="bouton bouton-secondaire" type="button" data-action="rech-suite">Page suivante</button></div>` : ''}
        <p class="aide">Source : API Recherche d'entreprises (État), données INSEE et RNE. « Opposition prospection » : l'entreprise a demandé que ses données ne servent pas à la prospection ; tu peux l'appeler sur sa ligne pro mais pas utiliser les fichiers pour la démarcher en masse.</p>`;
    }
    return `<div class="pile">${tete('Prospects', 'Recherche de prospects', 'Entreprises réelles et en activité de Bordeaux Métropole, issues du registre officiel. Choisis une cible, un lieu et un rayon : ajoute ensuite les meilleures au CRM en un clic.')}
      <form class="carte formulaire" id="f-recherche">
        <div class="filtres">${[['secu', '🛡 Sécurité'], ['net', '✦ Nettoyage']].map(([k, l]) => `<button type="button" class="filtre" data-filtre="rech.act" data-valeur="${k}" aria-pressed="${f.act === k}">${l}</button>`).join('')}</div>
        <div class="deux-colonnes">
          <label>Cible<select name="seg">${segs.map(x => opt(x.id, (x.hot ? '★ ' : '') + x.l, f.seg)).join('')}</select></label>
          <label>Commune<select name="commune">${opt('', 'Toute la métropole (28 communes)', f.commune)}${R.COMMUNES.map(c => opt(c[0], c[0] + ' (' + c[1] + ')', f.commune)).join('')}</select></label>
          <label>Rayon autour de la commune<select name="rayon">${['2', '5', '10', '20'].map(k => opt(k, k + ' km', f.rayon)).join('')}</select></label>
          <label>Taille de l'entreprise<select name="taille">${R.TAILLES_RECHERCHE.map(t => opt(t[0], t[1], f.taille)).join('')}</select></label>
        </div>
        <label>Mot-clé (facultatif)<input type="text" name="q" value="${esc(f.q)}" placeholder="ex. : entrepôt, hôtel, résidence…"></label>
        <p class="aide">★ cible à fort volume horaire. Le rayon ne s'applique que si une commune est choisie.</p>
        <div class="actions"><button class="bouton" type="submit">Lancer la recherche</button></div>
      </form>
      <section class="pile-serree">${resultats}</section>
      <section><div class="section-titre"><h2>Compléter à la main</h2><p>${esc(seg.l)} · ${esc(lieu)}</p></div>
        <ul class="liste">${liens.map(l => `<li><a class="ligne sans-score" href="${esc(l[1])}" target="_blank" rel="noopener"><span class="ligne-titre">${esc(l[0])}</span><span class="doux">Ouvrir ↗</span></a></li>`).join('')}</ul></section></div>`;
  }
  async function lancerRecherche(page) {
    const f = S.filtres.rech;
    const seg = R.SEGMENTS.find(x => x.id === f.seg);
    const com = R.COMMUNES.find(c => c[0] === f.commune);
    const taille = R.TAILLES_RECHERCHE.find(t => t[0] === f.taille) || R.TAILLES_RECHERCHE[0];
    const corps = { action: 'entreprises', page: page || 1, naf: (seg.api && seg.api.naf) || [], section: seg.api && seg.api.section, tranches: taille[2] };
    if (f.q) corps.q = f.q; else if (seg.api && seg.api.q) corps.q = seg.api.q;
    if (com && !corps.q) { corps.lat = com[2]; corps.long = com[3]; corps.radius = +f.rayon; }
    else if (com) corps.cp = [com[1]];
    else corps.cp = Array.from(new Set(R.COMMUNES.map(c => c[1])));
    S.recherche = { charge: true, corps }; rafraichir();
    try { S.recherche = { data: await appelServeur(corps), corps }; }
    catch (e) { S.recherche = { erreur: e.message, corps }; }
    rafraichir();
  }
  async function ajouterResultat(i, bouton) {
    const e = S.recherche.data.resultats[i];
    const et = (e.etablissements && e.etablissements[0]) || e.siege || {};
    const f = S.filtres.rech;
    const p = prospectVide(f.act);
    p.name = et.enseigne || e.nom; p.siren = e.siren; p.siret = et.siret || '';
    const m = String(et.adresse || '').match(/^(.*?)\s*(\d{5})\s+(.+)$/);
    p.address = m ? m[1] : (et.adresse || ''); p.cp = et.cp || (m && m[2]) || ''; p.city = communeNom(et.ville || (m && m[3]) || '');
    p.sector = f.seg; p.size = R.sizeFromTranche(et.effectif || e.effectif); p.source = 'Annuaire des Entreprises';
    if (e.dirigeants[0]) p.contacts.dirigeant = e.dirigeants[0];
    p.registry = { source: 'API Recherche d\'entreprises (INSEE, RNE)', at: today(), naf: et.naf || e.naf, effectif: R.TRANCHES[et.effectif || e.effectif] || '', etablissements: e.nbEtabOuverts, opposition: e.opposition };
    if (e.opposition) p.notes = 'Attention : opposition à l\'utilisation de ses données pour la prospection (registre INSEE).';
    if (e.nbEtabOuverts > 1) p.notes = (p.notes ? p.notes + '\n' : '') + `${e.nbEtabOuverts} établissements ouverts : piste multisites à vérifier.`;
    occupe(bouton, true, 'Ajout…');
    const ok = await enregistrerProspect(p);
    if (ok) { notif(p.name + ' ajouté au CRM'); rafraichir(); } else occupe(bouton, false);
  }
  function communeNom(v) {
    const cle = x => String(x).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-']/g, ' ').replace(/\s+/g, ' ').trim();
    const c = R.COMMUNES.find(x => cle(x[0]) === cle(v));
    return c ? c[0] : String(v).toLowerCase().replace(/(^|[\s-])\S/g, x => x.toUpperCase());
  }

  /* ------------------------------------------------------------------ */
  /* Sites de prospection                                                */
  /* ------------------------------------------------------------------ */
  function pSites() {
    const cls = { connecteur: 'p-vert', claude: 'p-encre', lien: 'p-neutre', payant: 'p-orange' };
    return `<div class="pile">${tete('Prospects', 'Sites de prospection', 'Les sources utiles, classées par usage. Le niveau d\'intégration est affiché tel qu\'il est : ce qui est branché au CRM fonctionne depuis le CRM, le reste s\'ouvre dans un nouvel onglet.')}
      <div class="filtres">${Object.entries(R.AUTO_LABEL).map(([k, l]) => `<span class="pastille ${cls[k]}">${esc(l)}</span>`).join('')}</div>
      ${R.SITE_CATEGORIES.map(cat => `<section><div class="section-titre"><h2>${esc(cat.label)}</h2><p>${R.SITES.filter(s => s.cat === cat.id).length} sites</p></div>
        <ul class="liste">${R.SITES.filter(s => s.cat === cat.id).map(s => `<li class="ligne sans-score"><div><div class="ligne-titre">${esc(s.name)}</div>
          <div class="ligne-detail"><b>Ce qu'on y trouve :</b> ${esc(s.info)}</div><div class="ligne-detail"><b>Utilité :</b> ${esc(s.use)}</div><div class="ligne-detail">${esc(s.url.replace('https://', ''))} · sécurité et nettoyage</div></div>
          <div class="ligne-droite"><span class="pastille ${cls[s.auto]}">${esc(R.AUTO_LABEL[s.auto])}</span><a class="bouton bouton-petit bouton-secondaire" href="${esc(s.url)}" target="_blank" rel="noopener">Ouvrir ↗</a></div></li>`).join('')}</ul></section>`).join('')}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Pipeline                                                            */
  /* ------------------------------------------------------------------ */
  function pPipeline() {
    const f = S.filtres.pipe || (S.filtres.pipe = { act: '' });
    const arr = liste().filter(p => !f.act || (f.act === 'secu' ? p.secu : p.net));
    const s = S.params;
    return `<div class="pile">${tete('Prospection', 'Pipeline commercial', 'Fais glisser une carte d\'une colonne à l\'autre, ou change l\'étape dans la liste de la carte. Chaque changement est inscrit dans l\'historique du prospect.')}
      <div class="filtres">${[['', 'Tout'], ['secu', '🛡 Sécurité'], ['net', '✦ Nettoyage']].map(([k, l]) => `<button type="button" class="filtre" data-filtre="pipe.act" data-valeur="${k}" aria-pressed="${f.act === k}">${l}</button>`).join('')}</div>
      <div class="tableau-pipeline">${C.COLUMNS.map(col => {
        const cartes = arr.filter(p => col.statuses.includes(p.status)).sort((a, b) => C.score(b).total - C.score(a).total);
        const val = cartes.reduce((a, p) => a + C.monthlyValue(p, s), 0);
        return `<div class="colonne" data-colonne="${col.id}"><div class="colonne-tete"><b>${esc(col.label)}</b><div class="petit doux">${cartes.length} · ${eur(val)}/mois</div></div>
          <div class="colonne-corps">${cartes.map(p => `<div class="carte-pipe ${p.secu ? '' : 'net'}" draggable="true" data-id="${esc(p.id)}">
            <a class="ligne-titre" href="#/prospect/${encodeURIComponent(p.id)}">${esc(p.name)}</a>
            <div class="petit doux">Score ${C.score(p).total}${C.monthlyValue(p, s) ? ' · ' + eur(C.monthlyValue(p, s)) : ''}</div>
            <select data-action-change="statut" data-id="${esc(p.id)}" aria-label="Étape">${C.STATUSES.map(x => opt(x[0], x[1], p.status)).join('')}</select></div>`).join('') || '<p class="petit doux">—</p>'}</div></div>`;
      }).join('')}</div></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Fiche prospect                                                      */
  /* ------------------------------------------------------------------ */
  function pNouveau(act) {
    act = act === 'net' ? 'net' : 'secu';
    return `<div class="pile">${tete(act === 'secu' ? 'Prospect sécurité' : 'Prospect nettoyage', 'Nouveau prospect', 'Commence par le nom : tu complètes le reste dans la fiche, ou automatiquement depuis le registre officiel.', '', act === 'net' ? 'menthe' : '')}
      <form class="carte carte-etroite formulaire" id="f-nouveau" data-act="${act}">
        <label>Nom de l'entreprise<input type="text" name="name" required></label>
        <label>Ville<input type="text" name="city" list="communes"></label>
        <datalist id="communes">${R.COMMUNES.map(c => `<option value="${esc(c[0])}">`).join('')}</datalist>
        <label>Source<select name="source">${opt('', '—')}${R.SOURCES.map(x => opt(x, x)).join('')}</select></label>
        <div class="actions"><button class="bouton" type="submit">Créer la fiche</button><a class="bouton-lien" href="#/${act === 'net' ? 'nettoyage' : 'securite'}">Annuler</a></div></form></div>`;
  }

  function pFiche(id, onglet) {
    const p = S.prospects[id];
    if (!p) return `<div class="pile">${tete('Prospect', 'Fiche introuvable', 'Elle a peut-être été supprimée.')}<a class="bouton" href="#/securite">Retour aux prospects</a></div>`;
    onglet = ['infos', 'qualification', 'suivi', 'scripts'].includes(onglet) ? onglet : 'suivi';
    const sc = C.score(p);
    const v = C.monthlyValue(p, S.params);
    const onglets = [['suivi', 'Suivi et appels'], ['infos', 'Informations'], ['qualification', 'Qualification et score'], ['scripts', 'Scripts']];
    const enSession = sessionSur(id);
    const corps = { infos: fInfos, qualification: fQualif, suivi: fSuivi, scripts: fScripts }[onglet](p, enSession);
    return `<div class="pile">${enSession ? bandeauSession(p) : ''}
      <div class="entete"><div><p class="surtitre ${p.secu ? '' : 'menthe'}"><a class="bouton-lien" href="#/${p.secu ? 'securite' : 'nettoyage'}">${p.secu ? 'Prospects sécurité' : 'Prospects nettoyage'}</a></p><h1>${esc(p.name)}</h1>
        <p class="chapo">${[p.city, segLabel(p.sector), p.phone ? '☎ ' + esc(p.phone) : ''].filter(Boolean).join(' · ')}</p></div>
        <div class="actions"><span class="score ${sc.band.key}" title="${esc(sc.band.label)}">${sc.total}</span><div class="pastilles">${pastillesAct(p)}${pastilleStatut(p)}</div></div></div>
      <div class="compteurs trois">${compteur(eur(v), 'potentiel HT / mois', 'compteur-argent')}${compteur(nf(C.totalHours(p)) + ' h', 'volume estimé / mois', 'compteur-argent')}${compteur(p.nextDate ? fd(p.nextDate) : '—', 'prochaine relance', 'compteur-argent ' + (p.nextDate && p.nextDate < today() ? 'compteur-rouge' : ''))}</div>
      <nav class="onglets" aria-label="Rubriques de la fiche">${onglets.map(([k, l]) => `<a class="onglet" href="#/prospect/${encodeURIComponent(id)}/${k}"${onglet === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
      <div id="corps-fiche" data-id="${esc(id)}">${corps}</div>
      <p class="aide" id="etat-sauvegarde">Les modifications s'enregistrent toutes seules.</p></div>`;
  }
  const champ = (p, chemin, libelle, type, attrs) => `<label>${libelle}<input type="${type || 'text'}" data-champ="${chemin}" value="${esc(getPath(p, chemin) ?? '')}" ${attrs || ''}></label>`;
  const zone = (p, chemin, libelle, ph) => `<label>${libelle}<textarea data-champ="${chemin}" placeholder="${esc(ph || '')}">${esc(getPath(p, chemin) ?? '')}</textarea></label>`;
  const caseC = (p, chemin, libelle) => `<label class="case"><input type="checkbox" data-champ="${chemin}"${getPath(p, chemin) ? ' checked' : ''}> <span>${libelle}</span></label>`;

  function fInfos(p) {
    const q = encodeURIComponent(p.name || '');
    const reg = p.registry;
    return `<div class="pile">
      <div class="carte carte-sable formulaire">
        <div class="entete"><h3>Identité</h3><button class="bouton bouton-petit bouton-secondaire" type="button" data-action="registre">Compléter depuis le registre officiel</button></div>
        <div id="zone-registre"></div>
        <div class="deux-colonnes">${champ(p, 'name', 'Nom de l\'entreprise')}${champ(p, 'siren', 'SIREN')}${champ(p, 'address', 'Adresse du site')}${champ(p, 'siret', 'SIRET de l\'établissement')}
          ${champ(p, 'cp', 'Code postal')}${champ(p, 'city', 'Ville', 'text', 'list="communes"')}
          <label>Secteur d'activité<select data-champ="sector">${opt('', '—', p.sector)}${R.SEGMENTS.map(x => opt(x.id, x.l, p.sector)).join('')}</select></label>
          <label>Taille<select data-champ="size">${opt('', '—', p.size)}${R.SIZES.map(x => opt(x, x, p.size)).join('')}</select></label>
          ${champ(p, 'website', 'Site internet', 'url')}${champ(p, 'linkedin', 'Profil LinkedIn', 'url')}${champ(p, 'phone', 'Téléphone professionnel', 'tel')}${champ(p, 'email', 'Email professionnel', 'email')}</div>
        <datalist id="communes">${R.COMMUNES.map(c => `<option value="${esc(c[0])}">`).join('')}</datalist>
        ${reg ? `<p class="aide">Registre (${esc(reg.source)}, ${fd(reg.at)}) : NAF ${esc(reg.naf || '—')} · effectif ${esc(reg.effectif || 'non renseigné')}${reg.etablissements > 1 ? ' · ' + reg.etablissements + ' établissements ouverts' : ''}${reg.opposition ? ' · <b>opposition à la prospection</b>' : ''}</p>` : ''}
      </div>
      <div class="carte formulaire"><h3>Activité et volume</h3>
        <div class="actions">${caseC(p, 'secu', 'Sécurité')}${caseC(p, 'net', 'Nettoyage')}${p.net ? caseC(p, 'netProduits', `Produits fournis par Abdel (${eur2(S.params.rateNetProduits)} /h au lieu de ${eur2(S.params.rateNetClient)})`) : ''}</div>
        <div class="deux-colonnes">${champ(p, 'hoursSecu', 'Heures de sécurité par mois (estimation)', 'number', 'min="0" step="any"')}${champ(p, 'hoursNet', 'Heures de nettoyage par mois (estimation)', 'number', 'min="0" step="any"')}</div>
        <p class="aide">Pas de chiffre ? Utilise le <a href="#/calculateur">calculateur</a> : il remplit ce champ pour toi.</p>
        ${zone(p, 'need', 'Besoin identifié', 'Ex. : surveillance de nuit du dépôt, 2 agents de 19 h à 7 h, 7 j/7')}</div>
      <div class="carte formulaire"><div class="entete"><h3>Interlocuteurs</h3>${boutonAgentContacts(p)}</div>
        ${etatAgentContacts(p)}
        <div class="deux-colonnes">${champ(p, 'contacts.dirigeant', 'Dirigeant')}${champ(p, 'contacts.securite', 'Responsable sécurité')}${champ(p, 'contacts.achats', 'Responsable achats')}${champ(p, 'contacts.sg', 'Responsable services généraux')}${champ(p, 'contacts.site', 'Responsable de site')}</div>
        ${p.name ? `<div class="actions petit"><a href="https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(p.name + ' ' + (p.secu ? 'sécurité' : 'services généraux'))}" target="_blank" rel="noopener">Chercher le décideur sur LinkedIn ↗</a>
          <a href="https://www.google.com/maps/search/${encodeURIComponent(p.name + ' ' + (p.city || 'Bordeaux'))}" target="_blank" rel="noopener">Google Maps ↗</a>
          <a href="https://www.pappers.fr/recherche?q=${q}" target="_blank" rel="noopener">Pappers ↗</a>
          <a href="https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${q}" target="_blank" rel="noopener">Annuaire des Entreprises ↗</a></div>` : ''}</div>
      <div class="carte formulaire"><h3>Origine et notes</h3>
        <div class="deux-colonnes"><label>Source de découverte<select data-champ="source">${opt('', '—', p.source)}${R.SOURCES.map(x => opt(x, x, p.source)).join('')}</select></label>${champ(p, 'discoveredAt', 'Date de découverte', 'date')}</div>
        ${zone(p, 'notes', 'Notes commerciales')}
        ${caseC(p, 'optOut', 'Ne plus contacter (la personne s\'y est opposée)')}</div>
      <div class="actions"><button class="bouton bouton-danger bouton-petit" type="button" data-action="supprimer-prospect">Supprimer la fiche</button></div></div>`;
  }

  /* Agent Contacts : tâche planifiée Claude (jours ouvrés, 7 h 43) qui lit contactSearch.status = 'demande'
     et les fiches jamais traitées, puis remplit les interlocuteurs avec leurs sources. */
  function boutonAgentContacts(p) {
    const cs = p.contactSearch || {};
    if (p.optOut) return '';
    if (cs.status === 'demande') return `<button class="bouton bouton-petit bouton-secondaire" type="button" data-action="agent-contacts-annuler">Annuler la demande</button>`;
    return `<button class="bouton bouton-petit" type="button" data-action="agent-contacts">${cs.status ? 'Relancer la recherche' : 'Trouver le contact'}</button>`;
  }
  function etatAgentContacts(p) {
    const cs = p.contactSearch;
    if (p.optOut) return '<p class="aide">Opposition à la prospection : l\'agent ne cherche pas de contact pour cette fiche.</p>';
    if (!cs || !cs.status) return '<p class="aide">L\'agent Contacts cherche qui appeler (registre, site, presse, offres d\'emploi, LinkedIn public) chaque jour ouvré vers 7 h 45. Clique sur « Trouver le contact » pour que cette fiche passe en priorité.</p>';
    if (cs.status === 'demande') return `<p class="aide"><b>Recherche demandée le ${fd(cs.date)}.</b> L'agent la traitera à son prochain passage (jours ouvrés, vers 7 h 45).</p>`;
    const sources = (cs.sources || []).filter(u => /^https?:\/\//i.test(u));
    const liens = sources.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">source ${i + 1} ↗</a>`).join(' · ');
    const titre = cs.status === 'rien_trouve' ? 'Aucun contact fiable trouvé par l\'agent' : 'Contacts trouvés par l\'agent';
    return `<p class="aide"><b>${titre}</b> le ${fd(cs.date)}${cs.confiance ? ' · fiabilité : ' + esc(cs.confiance) : ''}${liens ? '<br>' + liens : ''}<br>À vérifier au premier appel. Les détails sont dans « Notes commerciales ».</p>`;
  }
  async function demanderAgentContacts(annuler) {
    const zoneF = document.getElementById('corps-fiche'); if (!zoneF) return;
    const p = S.prospects[zoneF.dataset.id]; if (!p) return;
    const d = clone(p);
    if (annuler) {
      const prec = d.contactSearch && d.contactSearch.previous;
      if (prec) d.contactSearch = prec; else delete d.contactSearch;
    } else {
      const prec = d.contactSearch && d.contactSearch.status !== 'demande' ? d.contactSearch : null;
      d.contactSearch = { status: 'demande', date: today(), at: nowISO(), ...(prec ? { previous: prec } : {}) };
    }
    if (await enregistrerProspect(d)) { notif(annuler ? 'Demande annulée' : 'Demande envoyée : l\'agent cherchera au prochain passage'); rafraichir(); }
  }

  function raisonsHtml(sc) {
    return `<div class="entete"><h3>Score : ${sc.total} / 100</h3><span class="pastille ${sc.band.key === 'tres' ? 'p-rouge' : sc.band.key === 'chaud' ? 'p-safran' : sc.band.key === 'travail' ? 'p-encre' : 'p-neutre'}">${esc(sc.band.label)}</span></div>
      <div>${sc.reasons.length ? sc.reasons.map(r => `<div class="raison"><span>${esc(r.l)}<span class="ligne-detail"><br>${esc(r.why)}</span></span><b>${r.pts ? '+' + r.pts : '0'}</b></div>`).join('') : '<p class="aide">Aucun critère validé pour l\'instant.</p>'}</div>`;
  }
  function fQualif(p) {
    const sc = C.score(p);
    return `<div class="deux-colonnes">
      <div class="carte formulaire"><h3>Critères</h3><p class="aide">Coche un critère seulement s'il est prouvé. Ceux marqués * exigent une preuve écrite (lien, date, qui l'a dit) : sans preuve, ils rapportent 0 point.</p>
        ${C.CRITERIA.map(c => `<div class="critere">${caseC(p, 'criteria.' + c.k + '.on', `<b>${esc(c.l)}</b>${c.proof ? ' *' : ''} <span class="doux">(${c.pts} pts)</span>`)}
          ${getPath(p, 'criteria.' + c.k + '.on') ? `<input type="text" placeholder="Preuve ou source" data-champ="criteria.${c.k}.proof" value="${esc(getPath(p, 'criteria.' + c.k + '.proof') || '')}" aria-label="Preuve">` : ''}</div>`).join('')}
        <p class="aide">Automatiques : volume horaire estimé (jusqu'à 15 pts) et décideur identifié avec téléphone ou email (5 pts).</p></div>
      <div class="carte carte-sable" id="raisons">${raisonsHtml(sc)}</div></div>`;
  }

  function fSuivi(p, enSession) {
    const hist = [...(p.history || [])].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const ev = e => {
      if (e.type === 'call') return `<div><div class="evenement-date">${fdt(e.ts)} · Appel${e.duration ? ' · ' + e.duration + ' min' : ''}${e.recorded ? ' · 🎙 enregistré' : ''}</div><b>${esc(e.result)}</b>${e.contact ? ' avec ' + esc(e.contact) : ''}
        ${e.need ? `<div class="ligne-detail">Besoin : ${esc(e.need)}</div>` : ''}${e.objections ? `<div class="ligne-detail">Objections : ${esc(e.objections)}</div>` : ''}${e.note ? `<div class="ligne-detail">${esc(e.note)}</div>` : ''}
        ${e.nextAction || e.nextDate ? `<div class="ligne-detail">Suite : ${esc(e.nextAction || '')} ${e.nextDate ? 'le ' + fd(e.nextDate) : ''}</div>` : ''}</div>`;
      if (e.type === 'status') return `<div><div class="evenement-date">${fdt(e.ts)} · Étape</div>${esc(C.STATUS_LABEL[e.from] || '—')} → <b>${esc(C.STATUS_LABEL[e.to])}</b></div>`;
      if (e.type === 'create') return `<div><div class="evenement-date">${fdt(e.ts)}</div>Fiche créée</div>`;
      if (e.type === 'note') return `<div><div class="evenement-date">${fdt(e.ts)} · Note</div>${esc(e.text || e.note || '')}</div>`;
      if (e.type === 'calc') return `<div><div class="evenement-date">${fdt(e.ts)} · Chiffrage</div>${esc(e.note || '')}</div>`;
      return '';
    };
    const historique = `<div class="section-titre"><h2>Historique</h2><p>${hist.length} évènement${hist.length > 1 ? 's' : ''}</p></div><div class="historique">${hist.map(ev).join('') || '<p class="aide">Aucun échange.</p>'}</div>`;
    const datesRapides = `<div class="filtres">${[['Demain', 1], ['Dans 3 jours', 3], ['Dans 1 semaine', 7], ['Dans 1 mois', 30]].map(([l, n]) => `<button type="button" class="filtre" data-action="date-rapide" data-valeur="${addDays(today(), n)}">${l}</button>`).join('')}</div>`;
    return `<div class="deux-colonnes${enSession ? ' colonnes-session' : ''}">
      <div class="pile-serree">
        <form class="carte formulaire${enSession ? ' carte-session' : ''}" id="f-appel"><h3>${enSession ? 'Résultat de l\'appel' : 'Noter un appel'}</h3>
          <label>Résultat<select name="result">${R.CALL_RESULTS.map(x => opt(x, x)).join('')}</select></label>
          <label>Interlocuteur joint<input type="text" name="contact" autocomplete="off"></label>
          <label>Besoin identifié<input type="text" name="need" autocomplete="off"></label>
          <label>Objections rencontrées<input type="text" name="objections" autocomplete="off"></label>
          <div class="deux-colonnes"><label>Prochaine action<input type="text" name="nextAction" placeholder="Rappeler, envoyer la plaquette…"></label>
            <label>Date de relance<input type="date" name="nextDate" value="${addDays(today(), 3)}"></label></div>
          ${datesRapides}
          <div class="deux-colonnes"><label>Durée (minutes)<input type="number" name="duration" min="0" max="600" inputmode="numeric" placeholder="Remplie après l'appel"></label>
            <label class="case"><input type="checkbox" name="recorded"> Appel enregistré sur mon téléphone</label></div>
          <p class="aide">Après « Appeler », reviens sur le CRM : la fiche se rouvre ici avec la durée remplie. Pour enregistrer : appli Téléphone › Paramètres › Enregistrement des appels (préviens toujours ton interlocuteur).</p>
          <label>Note<textarea name="note"></textarea></label>
          <p class="aide">Date de relance obligatoire, sauf « Refus » ou « Pas de besoin ». L'étape avance toute seule (décideur joint, intéressé, rendez-vous, devis demandé).</p>
          <div class="actions"><button class="bouton" type="submit">${enSession ? 'Enregistrer et suivant →' : 'Enregistrer l\'appel'}</button>${p.phone ? `<a class="bouton bouton-secondaire" href="tel:${esc(p.phone.replace(/\s/g, ''))}" data-appel="${esc(p.id)}">☎ ${esc(p.phone)}</a>` : ''}</div></form>
        ${carteEmail(p)}
        <div class="carte formulaire"><h3>Étape et rendez-vous</h3>
          <label>Étape du pipeline<select data-champ="status">${C.STATUSES.map(x => opt(x[0], x[1], p.status)).join('')}</select></label>
          <div class="deux-colonnes">${champ(p, 'nextDate', 'Prochaine relance', 'date')}${champ(p, 'rdvDate', 'Rendez-vous', 'datetime-local')}</div>
          ${champ(p, 'nextAction', 'Prochaine action')}
          <p class="aide">Dernier appel : ${fd(p.lastCallDate)} · ${C.num(p.callCount)} appel(s) au total.</p></div>
        ${enSession ? `<details class="carte"><summary>Historique (${hist.length})</summary>${historique}</details>` : ''}
      </div>
      <div id="script-session">${enSession ? `<div class="actions actions-script"><button class="bouton bouton-secondaire bouton-petit" type="button" data-action="aller-a" data-valeur="f-appel">↑ Noter le résultat</button></div>${fScripts(p)}` : historique}</div></div>`;
  }

  function fScripts(p) {
    const blocs = [];
    if (p.secu || !p.net) blocs.push(['Sécurité', R.SCRIPTS.secu]);
    if (p.net) blocs.push(['Nettoyage', R.SCRIPTS.net]);
    const nom = prenom();
    // Le nom légal de la société de sécurité (Paramètres) remplace « (Société) » ; sinon le repère reste visible.
    const societe = (S.params.companySecu || '').trim() || '(Société)';
    // Espaces insécables : « ? », « ! », « : », « » » ne passent jamais seuls à la ligne sur téléphone.
    const entreprise = (S.params.companyNet || '').trim() || 'Abdel';
    const tel = (S.params.userPhone || '').trim();
    const perso = s => s.replace(/Émilie/g, nom).replace(/\(Société\)/g, societe).replace(/\(Entreprise\)/g, entreprise).replace(/\(téléphone\)/g, tel || '(ton téléphone)')
      .replace(/ ([?!:;»])/g, ' $1').replace(/« /g, '« ');
    const rappel = (p.secu || !p.net) && !(S.params.companySecu || '').trim()
      ? `<p class="message message-info">Renseigne le nom légal de la société de sécurité et le n° CNAPS dans <a href="#/parametres">Paramètres</a> : ils remplaceront « (Société) » dans le script.</p>` : '';
    const objections = [].concat(p.secu || !p.net ? R.OBJECTIONS_SECU : [], p.net ? R.OBJECTIONS_NET : [], R.OBJECTIONS);
    return `<div class="pile">${rappel}${blocs.map(([t, sc]) => `<section class="pile-serree"><div class="section-titre"><h2>Script ${t}</h2></div>${sc.map(x => `<div class="script"><b>${esc(x.t)}</b>${esc(perso(x.x))}</div>`).join('')}</section>`).join('')}
      <section class="pile-serree"><div class="section-titre"><h2>Réponses aux objections</h2></div>${objections.map(o => `<div class="script"><b>${esc(o.o)}</b>${esc(perso(o.r))}</div>`).join('')}</section></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* E-mails de suivi préparés en un clic                                */
  /* ------------------------------------------------------------------ */
  const TYPES_EMAIL = [
    ['apres_appel', 'Récapitulatif après un appel'],
    ['presentation', 'Présentation demandée par le prospect'],
    ['relance', 'Relance sans réponse'],
    ['rdv', 'Confirmation de rendez-vous'],
    ['devis', 'Suivi de devis'],
  ];
  /* Nom de la personne à qui écrire, tiré des interlocuteurs (« Prénom Nom — Fonction (source) »). */
  function interlocuteur(p) {
    const c = p.contacts || {};
    for (const k of ['securite', 'sg', 'achats', 'site', 'dirigeant']) {
      const v = String(c[k] || '').trim();
      if (!v || /non public|standard/i.test(v)) continue;
      const nom = v.split(/\s+[—–-]\s+|\s*\(/)[0].trim();
      if (nom && nom.length <= 60 && /[a-zA-ZÀ-ÿ]/.test(nom)) return nom;
    }
    return '';
  }
  function dernierAppel(p) { return [...(p.history || [])].filter(e => e.type === 'call').sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))[0] || null; }
  function signatureEmail(p) {
    const lignes = [prenom(), 'Abdel — ' + (p.secu && p.net ? 'sécurité privée et propreté' : p.net ? 'propreté et entretien des locaux' : 'sécurité privée')];
    if ((S.params.userPhone || '').trim()) lignes.push(S.params.userPhone.trim());
    return lignes.join('\n');
  }
  function brouillonEmail(p, type) {
    const nom = interlocuteur(p);
    const bonjour = nom ? `Bonjour ${nom},` : 'Bonjour,';
    const act = p.secu && p.net ? 'sécurité et de propreté' : p.net ? 'propreté' : 'sécurité';
    const appel = dernierAppel(p);
    const quand = appel ? (appel.date === today() ? "aujourd'hui" : 'le ' + fd(appel.date)) : '';
    // Besoin exprimé par le prospect lui-même (dernier appel), jamais le signal repéré par l'agent.
    const brut = ((appel && appel.need) || (C.num(p.callCount) ? p.need : '') || '').trim();
    const besoin = brut ? brut.charAt(0).toLowerCase() + brut.slice(1).replace(/[.\s]+$/, '') : '';
    const relance = p.nextDate && p.nextDate >= today() ? fd(p.nextDate) : '';
    const optout = 'Si ce sujet ne vous concerne pas, dites-le-moi simplement et je ne vous recontacterai pas.';
    const services = [];
    if (p.secu) services.push('- Sécurité : surveillance de locaux, d\'entrepôts, de chantiers et de parkings, gardiennage, sécurité événementielle.');
    if (p.net) services.push('- Propreté : nettoyage de bureaux, de commerces et de locaux professionnels, entretien régulier, produits fournis ou non selon votre choix.');
    const cnaps = p.secu && (S.params.cnaps || '').trim() ? `\nNotre autorisation d'exercice CNAPS : ${S.params.cnaps.trim()}.` : '';
    let objet = '', corps = '';
    switch (type) {
      case 'apres_appel':
        objet = `Suite à notre échange — ${p.name}`;
        corps = `${bonjour}\n\nMerci pour votre temps au téléphone${quand ? ' ' + quand : ''}.\n\n${besoin ? `Comme convenu, je reviens vers vous au sujet de votre besoin : ${besoin}.` : `Comme convenu, je vous laisse mes coordonnées pour vos besoins en ${act}.`}\n\nPour vous faire une proposition juste, le plus simple est une courte visite du site (20 minutes environ).${relance ? ` Je vous rappelle le ${relance} pour convenir d'un créneau.` : ' Quel moment vous arrangerait cette semaine ou la suivante ?'}`;
        break;
      case 'presentation':
        objet = `Notre présentation — ${p.name}`;
        corps = `${bonjour}\n\nComme promis${quand ? ' lors de notre échange ' + quand : ''}, voici en quelques lignes ce que nous proposons :\n\n${services.join('\n')}${cnaps}\n\n${besoin ? `Pour votre besoin (${besoin}), une visite du site nous permettrait de vous faire une proposition chiffrée précise.` : 'Une visite rapide du site nous permettrait de vous faire une proposition chiffrée précise.'}${relance ? ` Je vous rappelle le ${relance}.` : ''}\n\n${optout}`;
        break;
      case 'relance':
        objet = `Petit point — ${p.name}`;
        corps = `${bonjour}\n\nJe me permets de revenir vers vous${appel ? ` suite à notre échange du ${fd(appel.date)}` : ''} au sujet de vos besoins en ${act}.\n\nAvez-vous pu y réfléchir ? Dix minutes au téléphone suffisent pour voir si nous pouvons vous être utiles.\n\n${optout}`;
        break;
      case 'rdv': {
        const d = p.rdvDate ? new Date(p.rdvDate) : null;
        const qd = d && !isNaN(d) ? `le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '';
        objet = `Confirmation de notre rendez-vous — ${p.name}`;
        corps = `${bonjour}\n\n${qd ? `Je vous confirme notre rendez-vous ${qd}` : 'Je reviens vers vous pour confirmer notre rendez-vous'}${p.address ? `, ${p.address}${p.city ? ' à ' + p.city : ''}` : ''}.\n\nNous ferons ensemble le tour du site pour bien comprendre vos besoins${besoin ? ` (${besoin})` : ''}, puis je vous enverrai une proposition chiffrée.\n\nEn cas d'empêchement, il suffit de me répondre ici.`;
        break;
      }
      case 'devis':
        objet = `Votre proposition — ${p.name}`;
        corps = `${bonjour}\n\nJe reviens vers vous au sujet de la proposition que nous vous avons adressée.\n\nAvez-vous pu la consulter ? Je suis disponible pour répondre à vos questions ou l'adapter à vos horaires et à votre organisation.${relance ? `\n\nJe vous rappelle le ${relance}.` : ''}`;
        break;
    }
    return { objet, corps: `${corps}\n\nBien cordialement,\n${signatureEmail(p)}` };
  }
  function carteEmail(p) {
    const st = S.email && S.email.id === p.id ? S.email : null;
    return `<div class="carte formulaire carte-email"><h3>✉ Préparer un e-mail</h3>
      <div class="deux-colonnes"><label>Type d'e-mail<select id="type-email">${TYPES_EMAIL.map(t => opt(t[0], t[1], st ? st.type : '')).join('')}</select></label>
        <div class="actions actions-bas"><button class="bouton" type="button" data-action="email-preparer">Préparer</button></div></div>
      ${st ? `<label>Objet<input type="text" id="email-objet" value="${esc(st.objet)}"></label>
        <label>Message<textarea id="email-corps" class="zone-email">${esc(st.corps)}</textarea></label>
        ${p.email ? '' : '<p class="aide">Pas d\'adresse e-mail sur la fiche : ta messagerie s\'ouvrira sans destinataire.</p>'}
        <div class="actions"><button class="bouton" type="button" data-action="email-ouvrir">Ouvrir dans ma messagerie</button>
          <button class="bouton bouton-secondaire" type="button" data-action="email-copier">Copier</button>
          <button class="bouton bouton-secondaire" type="button" data-action="email-ia">✨ Améliorer avec l'IA</button></div>
        <div id="zone-ia"></div>` : '<p class="aide">Le texte est rédigé à partir de la fiche (interlocuteur, besoin, dernier appel, rendez-vous). Tu le relis, tu le modifies si besoin, puis tu l\'envoies depuis ta messagerie.</p>'}</div>`;
  }
  function lireEmailEdite() {
    if (!S.email) return;
    const o = document.getElementById('email-objet'), c = document.getElementById('email-corps');
    if (o) S.email.objet = o.value; if (c) S.email.corps = c.value;
  }
  async function actionEmail(act, bouton) {
    const zoneF = document.getElementById('corps-fiche'); if (!zoneF) return;
    const p = S.prospects[zoneF.dataset.id]; if (!p) return;
    if (act === 'email-preparer') {
      const type = document.getElementById('type-email').value;
      S.email = { id: p.id, type, ...brouillonEmail(p, type) };
      return rafraichir();
    }
    lireEmailEdite();
    if (act === 'email-copier') {
      try { await navigator.clipboard.writeText(`Objet : ${S.email.objet}\n\n${S.email.corps}`); notif('Texte copié'); }
      catch (_) { notif('Copie impossible : sélectionne le texte à la main.', true); }
    }
    if (act === 'email-ouvrir') {
      const lien = `mailto:${encodeURIComponent((p.email || '').trim())}?subject=${encodeURIComponent(S.email.objet)}&body=${encodeURIComponent(S.email.corps)}`;
      const d = clone(p);
      d.history = [...(d.history || []), { type: 'note', ts: nowISO(), text: `E-mail préparé : ${(TYPES_EMAIL.find(t => t[0] === S.email.type) || [])[1] || ''} (« ${S.email.objet} »)` }];
      enregistrerProspect(d);
      location.href = lien;
    }
    if (act === 'email-ia') {
      const zoneIa = document.getElementById('zone-ia');
      occupe(bouton, true, 'L\'IA réécrit…');
      try {
        const nom = interlocuteur(p);
        // Le nom de la personne n'est pas envoyé à l'IA : il est remplacé par un repère puis remis.
        const masque = t => nom ? t.split(nom).join('{{CONTACT}}') : t;
        const r = await appelServeur({ action: 'redaction', type: S.email.type, objet: masque(S.email.objet), texte: masque(S.email.corps), secteur: segLabel(p.sector), activite: p.secu && p.net ? 'sécurité et propreté' : p.net ? 'propreté' : 'sécurité' });
        const remettre = t => String(t || '').split('{{CONTACT}}').join(nom || '');
        S.email.objet = remettre(r.objet) || S.email.objet; S.email.corps = remettre(r.texte) || S.email.corps;
        rafraichir(); notif('Texte réécrit par l\'IA : relis-le avant d\'envoyer');
      } catch (e) {
        occupe(bouton, false);
        if (zoneIa) zoneIa.innerHTML = `<p class="message message-info">${esc(e.message)}</p>`;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Session d'appels : un prospect à la fois                            */
  /* ------------------------------------------------------------------ */
  function fileSession(act) {
    const t = today();
    const ouverts = liste().filter(p => !C.CLOSED.includes(p.status) && !p.optOut && (!act || (act === 'secu' ? p.secu : p.net)));
    const vus = new Set(), file = [];
    const ajoute = arr => arr.forEach(p => { if (!vus.has(p.id)) { vus.add(p.id); file.push(p.id); } });
    ajoute(ouverts.filter(p => p.nextDate && p.nextDate <= t).sort((a, b) => a.nextDate.localeCompare(b.nextDate)));
    ajoute(ouverts.filter(p => signalChaud(p)));
    ajoute(ouverts.filter(p => p.rdvDate && p.rdvDate.slice(0, 10) === t));
    ajoute(ouverts.filter(p => !C.num(p.callCount) && C.NOT_YET_CONTACTED.includes(p.status)).sort((a, b) => C.score(b).total - C.score(a).total));
    return file.slice(0, 40);
  }
  function pSession() {
    const ss = S.session;
    if (!ss) {
      const f = S.filtres.sess || (S.filtres.sess = { act: '' });
      const n = fileSession(f.act).length;
      return `<div class="pile">${tete('Appels', 'Session d\'appels', 'Un prospect à la fois, dans le bon ordre : relances du jour, signaux chauds, rendez-vous, puis les meilleurs prospects jamais appelés. Tu notes le résultat en deux touches et le suivant s\'affiche.')}
        <div class="carte pile-serree carte-session">
          <div class="filtres">${[['', 'Tout'], ['secu', '🛡 Sécurité'], ['net', '✦ Nettoyage']].map(([k, l]) => `<button type="button" class="filtre" data-filtre="sess.act" data-valeur="${k}" aria-pressed="${f.act === k}">${l}</button>`).join('')}</div>
          <p class="question">${n ? `${n} prospect${n > 1 ? 's' : ''} à appeler` : 'Personne à appeler pour le moment'}</p>
          <div class="actions">${n ? '<button class="bouton bouton-session" type="button" data-action="session-demarrer">▶ Démarrer</button>' : '<a class="bouton bouton-secondaire" href="#/recherche">Trouver des prospects</a>'}</div>
        </div></div>`;
    }
    if (ss.i >= ss.file.length) return finSession();
    setTimeout(allerSession, 0);
    return '<p class="chargement">Ouverture de la fiche…</p>';
  }
  // La session d'appels se déroule dans la fiche elle-même (bandeau en haut).
  function sessionSur(id) {
    const ss = S.session;
    return !!(ss && ss.i < ss.file.length && ss.file[ss.i] === id);
  }
  function bandeauSession(p) {
    const ss = S.session, sg = signalChaud(p), nom = interlocuteur(p);
    const progression = Math.round(ss.i / ss.file.length * 100);
    return `<div class="carte carte-session bandeau-session pile-serree">
      <div class="entete-session"><p class="surtitre">▶ Session d'appels · ${ss.i + 1} sur ${ss.file.length}</p>
        <div class="actions"><button class="bouton bouton-secondaire bouton-petit" type="button" data-action="aller-a" data-valeur="script-session">📜 Script</button><button class="bouton bouton-secondaire bouton-petit" type="button" data-action="session-passer">Passer →</button><button class="bouton-lien" type="button" data-action="session-fin">Terminer la session</button></div></div>
      <div class="barre-progression" role="progressbar" aria-valuenow="${progression}" aria-valuemin="0" aria-valuemax="100"><span class="barre-${Math.min(10, Math.round(progression / 10))}"></span></div>
      ${sg ? `<p class="message message-feu">🔥 <b>Nouveau signal du ${fd(sg.ts)} :</b> ${esc(sg.texte)}</p>` : ''}
      <div class="actions">${p.phone ? `<a class="bouton bouton-appel" href="tel:${esc(p.phone.replace(/\s/g, ''))}" data-appel="${esc(p.id)}">☎ Appeler ${esc(p.phone)}</a>` : `<a class="bouton bouton-secondaire" href="#/prospect/${encodeURIComponent(p.id)}/infos">Pas de numéro : compléter la fiche</a>`}
        <span class="aide"><b>Qui demander :</b> ${esc(nom || (p.contacts && Object.values(p.contacts).find(Boolean)) || 'le responsable du site (sécurité ou services généraux)')}</span></div>
    </div>`;
  }
  function allerSession() {
    const ss = S.session;
    if (!ss) return;
    while (ss.i < ss.file.length && !S.prospects[ss.file[ss.i]]) ss.i++;
    if (ss.i >= ss.file.length) { location.hash = '#/session'; return; }
    const cible = `#/prospect/${encodeURIComponent(ss.file[ss.i])}/suivi`;
    if (location.hash === cible) route(); else location.hash = cible;
    window.scrollTo(0, 0);
  }
  function finSession() {
    const ss = S.session;
    const parRes = {};
    ss.faits.forEach(f => { parRes[f.r] = (parRes[f.r] || 0) + 1; });
    const rdv = (parRes['Rendez-vous pris'] || 0), interesses = (parRes['Intéressé'] || 0) + (parRes['Devis demandé'] || 0);
    return `<div class="pile">${tete('Session d\'appels', 'Session terminée 🎉', `${ss.faits.length} appel${ss.faits.length > 1 ? 's' : ''} noté${ss.faits.length > 1 ? 's' : ''}, ${ss.passes} passé${ss.passes > 1 ? 's' : ''}.`)}
      <div class="compteurs trois">${compteur(ss.faits.length, 'appels notés', 'compteur-encre')}${compteur(rdv, 'rendez-vous pris', 'compteur-vert')}${compteur(interesses, 'intéressés ou devis demandés', 'compteur-safran')}</div>
      ${ss.faits.length ? `<ul class="liste">${ss.faits.map(f => `<li><a class="ligne sans-score" href="#/prospect/${encodeURIComponent(f.id)}"><span class="ligne-titre">${esc((S.prospects[f.id] || {}).name || '')}</span><span class="pastille p-neutre">${esc(f.r)}</span></a></li>`).join('')}</ul>` : ''}
      <div class="actions"><button class="bouton bouton-session" type="button" data-action="session-nouvelle">▶ Nouvelle session</button><a class="bouton bouton-secondaire" href="#/">Tableau de bord</a></div></div>`;
  }


  /* ------------------------------------------------------------------ */
  /* Sauvegardes automatiques (chaque dimanche, 8 semaines gardées)      */
  /* ------------------------------------------------------------------ */
  async function chargerSauvegardes() {
    const zone = document.getElementById('zone-sauvegardes'); if (!zone) return;
    const { data, error } = await sb.rpc('abdel_liste_sauvegardes');
    if (error) { zone.innerHTML = '<p class="message message-erreur">Liste des sauvegardes indisponible pour le moment.</p>'; return; }
    S.sauvegardes = data || [];
    zone.innerHTML = S.sauvegardes.length ? `<ul class="liste">${S.sauvegardes.map(s => `<li class="ligne sans-score"><div><div class="ligne-titre">${fdt(s.faite_le)}</div><div class="ligne-detail">${s.lignes} éléments sauvegardés</div></div>
        <div class="actions"><button class="bouton bouton-petit bouton-secondaire" type="button" data-action="sauvegarde-telecharger" data-id="${s.id}">Télécharger</button><button class="bouton bouton-petit" type="button" data-action="sauvegarde-restaurer" data-id="${s.id}">Restaurer</button></div></li>`).join('')}</ul>`
      : '<p class="aide">Aucune sauvegarde automatique pour le moment.</p>';
  }
  async function lireSauvegarde(id) {
    const { data, error } = await sb.rpc('abdel_sauvegarde', { p_id: +id });
    if (error || !data) { notif('Sauvegarde illisible.', true); return null; }
    const lignes = t => (data[t] || []);
    const main = lignes('abdel_parametres').find(r => r.id === 'main');
    const s = (S.sauvegardes || []).find(x => String(x.id) === String(id));
    return { app: 'CRM Abdel', version: 1, exportedAt: s ? s.faite_le : nowISO(), settings: main ? main.data : null,
      prospects: lignes('abdel_prospects').map(r => ({ ...r.data, id: r.id })), tenders: lignes('abdel_appels_offres').map(r => ({ ...r.data, id: r.id })) };
  }

  /* Enregistrement automatique des champs de la fiche */
  let minuterie = null;
  async function champModifie(el) {
    const id = el.closest('#corps-fiche').dataset.id;
    const p = S.prospects[id]; if (!p) return;
    const chemin = el.dataset.champ;
    const valeur = el.type === 'checkbox' ? el.checked : el.value;
    let d = clone(p);
    if (chemin === 'status') d = avecStatut(d, valeur);
    else setPath(d, chemin, valeur);
    if (chemin === 'name' && !String(valeur).trim()) { notif('Le nom ne peut pas être vide.', true); el.value = p.name; return; }
    if ((chemin === 'secu' || chemin === 'net') && !d.secu && !d.net) { notif('Garde au moins une activité cochée.', true); el.checked = true; return; }
    S.prospects[id] = d;
    const etat = document.getElementById('etat-sauvegarde'); if (etat) etat.textContent = 'Enregistrement…';
    clearTimeout(minuterie);
    minuterie = setTimeout(async () => {
      const ok = await enregistrerProspect(S.prospects[id]);
      const e2 = document.getElementById('etat-sauvegarde'); if (e2) e2.textContent = ok ? 'Enregistré ✓' : 'Non enregistré : vérifie ta connexion.';
    }, 400);
    if (el.type === 'checkbox' || chemin === 'status') rafraichir();
    else { const box = document.getElementById('raisons'); if (box) box.innerHTML = raisonsHtml(C.score(d)); }
  }

  /* Applique un appel à une fiche (utilisé par la fiche et par la session d'appels). */
  function appliquerAppel(source, e) {
    const sansSuite = ['Refus', 'Pas de besoin'].includes(e.result);
    let d = clone(source);
    const ts = nowISO();
    d.history = [...(d.history || []), { type: 'call', ts, date: today(), result: e.result, contact: e.contact || '', need: e.need || '', objections: e.objections || '', nextAction: e.nextAction || '', nextDate: sansSuite ? '' : e.nextDate, note: e.note || '', duration: e.duration ? Math.max(0, Math.round(+e.duration)) : '', recorded: e.recorded === 'on' }];
    d.lastCallDate = today(); d.callCount = C.num(d.callCount) + 1;
    if (e.need && !d.need) d.need = e.need;
    if (e.nextAction) d.nextAction = e.nextAction;
    d.nextDate = sansSuite ? '' : e.nextDate;
    if (C.NOT_YET_CONTACTED.includes(d.status)) d = avecStatut(d, 'contact');
    const cible = { 'Décideur joint': 'decideur', 'Intéressé': 'interet', 'Rendez-vous pris': 'rdv', 'Devis demandé': 'propo' }[e.result];
    if (cible && !C.CLOSED.includes(d.status) && C.STATUS_ORDER[cible] > C.STATUS_ORDER[d.status]) d = avecStatut(d, cible);
    return d;
  }
  async function noterAppel(form) {
    const id = form.closest('#corps-fiche').dataset.id;
    const enSession = sessionSur(id);
    const e = Object.fromEntries(new FormData(form).entries());
    const sansSuite = ['Refus', 'Pas de besoin'].includes(e.result);
    if (!sansSuite && !e.nextDate) return notif('Indique une date de relance.', true);
    const d = appliquerAppel(S.prospects[id], e);
    const b = form.querySelector('button[type=submit]'); occupe(b, true, 'Enregistrement…');
    const ok = await enregistrerProspect(d);
    occupe(b, false);
    if (!ok) return;
    notif('Appel enregistré' + (d.nextDate ? ' · relance le ' + fd(d.nextDate) : ''));
    rafraichir();
    if (sansSuite) {
      const r = await dialogue('<h3>Classer ce prospect ?</h3><p class="aide">Il a refusé ou n\'a pas de besoin pour le moment.</p>', [{ label: 'Contrat perdu', value: 'perdu', cls: 'bouton-danger' }, { label: 'Relance ultérieure', value: 'relance' }, { label: 'Laisser tel quel', value: '', cls: 'bouton-secondaire' }]);
      if (r) { await changerStatut(id, r); rafraichir(); }
    }
    if (enSession && sessionSur(id)) {
      S.session.faits.push({ id, r: e.result }); S.session.i++;
      allerSession();
    }
  }

  async function completerRegistre(bouton) {
    const id = document.getElementById('corps-fiche').dataset.id;
    const p = S.prospects[id];
    const zoneR = document.getElementById('zone-registre');
    const siren = (p.siren || '').replace(/\D/g, '');
    occupe(bouton, true, 'Recherche…');
    try {
      const corps = siren.length >= 9 ? { action: 'entreprises', q: siren.slice(0, 9), cp: [] } : { action: 'entreprises', q: p.name, cp: p.cp ? [p.cp] : [] };
      const d = await appelServeur(corps);
      S.choixRegistre = d.resultats;
      zoneR.innerHTML = d.resultats.length ? `<ul class="liste">${d.resultats.slice(0, 8).map((e, i) => { const et = (e.etablissements && e.etablissements[0]) || e.siege || {}; return `<li class="ligne sans-score"><div><div class="ligne-titre">${esc(e.nom)}</div><div class="ligne-detail">${esc(et.adresse || '')} · SIREN ${esc(e.siren)}</div></div><button class="bouton bouton-petit" type="button" data-action="registre-choix" data-i="${i}">Utiliser</button></li>`; }).join('')}</ul>`
        : '<p class="message message-info">Aucune entreprise trouvée sous ce nom dans cette commune.</p>';
    } catch (e) { zoneR.innerHTML = `<p class="message message-erreur">${esc(e.message)}</p>`; }
    occupe(bouton, false);
  }
  async function choisirRegistre(i) {
    const id = document.getElementById('corps-fiche').dataset.id;
    const e = S.choixRegistre[i]; const et = (e.etablissements && e.etablissements[0]) || e.siege || {};
    const d = clone(S.prospects[id]);
    d.siren = e.siren; d.siret = d.siret || et.siret || '';
    const m = String(et.adresse || '').match(/^(.*?)\s*(\d{5})\s+(.+)$/);
    if (!d.address) d.address = m ? m[1] : (et.adresse || '');
    if (!d.cp) d.cp = et.cp || (m && m[2]) || '';
    if (!d.city) d.city = communeNom(et.ville || (m && m[3]) || '');
    if (!d.size) d.size = R.sizeFromTranche(et.effectif || e.effectif);
    if (!d.contacts.dirigeant && e.dirigeants[0]) d.contacts.dirigeant = e.dirigeants[0];
    d.registry = { source: 'API Recherche d\'entreprises (INSEE, RNE)', at: today(), naf: et.naf || e.naf, effectif: R.TRANCHES[et.effectif || e.effectif] || '', etablissements: e.nbEtabOuverts, opposition: e.opposition };
    if (await enregistrerProspect(d)) { notif('Fiche complétée depuis le registre'); rafraichir(); }
  }

  /* ------------------------------------------------------------------ */
  /* Appels d'offres                                                     */
  /* ------------------------------------------------------------------ */
  const AO_STATUTS = [['etude', 'À étudier'], ['dce', 'Dossier téléchargé'], ['prep', 'Réponse en préparation'], ['depose', 'Offre déposée'], ['gagne', 'Gagné'], ['perdu', 'Perdu'], ['abandonne', 'Abandonné']];
  const AO_LIB = Object.fromEntries(AO_STATUTS);
  function pastilleEcheance(t) {
    if (!t.deadline) return '<span class="pastille p-neutre">Sans date</span>';
    const j = C.daysBetween(today(), t.deadline);
    if (['depose', 'gagne', 'perdu', 'abandonne'].includes(t.status) || j < 0) return `<span class="pastille p-neutre">${fd(t.deadline)}</span>`;
    return `<span class="pastille ${j <= 2 ? 'p-rouge' : j <= 7 ? 'p-orange' : j <= 15 ? 'p-safran' : 'p-neutre'}">J-${j} · ${fd(t.deadline)}</span>`;
  }
  function pAO(r) {
    if (r.id) return pAOFiche(r.id === 'nouveau' ? null : S.ao[r.id]);
    const arr = aos().sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
    const v = S.veille;
    let veille = '';
    if (v && v.charge) veille = '<p class="chargement">Veille en cours sur le BOAMP (Gironde)… cela peut prendre jusqu\'à une minute.</p>';
    else if (v && v.erreur) veille = `<p class="message message-erreur">${esc(v.erreur)} Tu peux aussi consulter <a href="https://www.boamp.fr" target="_blank" rel="noopener">boamp.fr ↗</a> directement.</p>`;
    else if (v && v.data) veille = v.data.resultats.length ? `<ul class="liste">${v.data.resultats.map((x, i) => {
      const suivi = aos().some(t => t.idweb === x.idweb);
      return `<li class="ligne sans-score"><div><div class="ligne-titre">${esc(x.objet)}</div><div class="ligne-detail">${esc(x.acheteur)} · publié le ${fd(x.parution)}${x.dateLimite ? ' · réponse avant le ' + fd(x.dateLimite) : ''}</div><div class="ligne-detail"><a href="${esc(x.lien)}" target="_blank" rel="noopener">Lire l'avis sur boamp.fr ↗</a></div></div>
        <div class="ligne-droite"><span class="pastille ${x.type === 'net' ? 'p-menthe' : 'p-encre'}">${x.type === 'net' ? 'Nettoyage' : x.type === 'both' ? 'Sécurité + nettoyage' : 'Sécurité'}</span>${suivi ? '<span class="pastille p-vert">Suivi</span>' : `<button class="bouton bouton-petit" type="button" data-action="suivre-ao" data-i="${i}">Suivre</button>`}</div></li>`;
    }).join('')}</ul>` : `<p class="message message-info">Aucun avis gardiennage, surveillance ou nettoyage publié en Gironde depuis le ${fd(v.data.depuis)}.</p>`;
    return `<div class="pile">${tete('Contrats', 'Appels d\'offres', 'Les marchés publics suivis, avec alertes à J-15, J-7 et J-2. Seuls des avis réels, avec leur lien d\'origine.', '<a class="bouton" href="#/ao/nouveau">+ Ajouter un avis</a>')}
      <section class="carte carte-sable pile-serree"><div class="entete"><div><h2>Veille BOAMP</h2><p class="aide">Avis publiés en Gironde ces 30 derniers jours contenant gardiennage, surveillance, sécurité ou nettoyage.</p></div>
        <button class="bouton" type="button" data-action="veille">Lancer la veille BOAMP</button></div>${veille}</section>
      <section><div class="section-titre"><h2>Avis suivis</h2><p>${arr.length}</p></div>
        ${arr.length ? `<ul class="liste">${arr.map(t => `<li><a class="ligne sans-score" href="#/ao/${encodeURIComponent(t.id)}"><div><div class="ligne-titre">${esc(t.object)}</div><div class="ligne-detail">${esc(t.buyer)}${t.place ? ' · ' + esc(t.place) : ''} · ${esc(AO_LIB[t.status] || '')}</div></div>
          <div class="ligne-droite">${pastilleEcheance(t)}<span class="pastille ${t.type === 'net' ? 'p-menthe' : 'p-encre'}">${t.type === 'net' ? 'Nettoyage' : t.type === 'both' ? 'Les deux' : 'Sécurité'}</span></div></a></li>`).join('')}</ul>`
        : '<p class="message message-info">Aucun avis suivi. Lance la veille ou ajoute un avis repéré sur une plateforme.</p>'}</section></div>`;
  }
  function pAOFiche(t) {
    const v = t || { type: 'secu', status: 'etude' };
    const c = (k, l, type, req) => `<label>${l}${req ? ' *' : ''}<input type="${type || 'text'}" name="${k}" value="${esc(v[k] || '')}"${req ? ' required' : ''}></label>`;
    return `<div class="pile">${tete('Appels d\'offres', t ? t.object : 'Nouvel avis', t ? `${esc(t.buyer)} · ${pastilleEcheance(t)}` : 'Recopie les informations de l\'avis officiel. Le lien d\'origine est obligatoire.')}
      <form class="carte formulaire" id="f-ao" data-id="${esc(v.id || '')}">
        <div class="deux-colonnes">${c('object', 'Objet du marché', 'text', true)}${c('buyer', 'Acheteur public', 'text', true)}${c('place', 'Lieu d\'exécution')}
          <label>Type de prestation<select name="type">${opt('secu', 'Sécurité', v.type)}${opt('net', 'Nettoyage', v.type)}${opt('both', 'Les deux', v.type)}</select></label>
          ${c('deadline', 'Date limite de réponse', 'date', true)}${c('duration', 'Durée du marché')}${c('amount', 'Montant estimé (si publié)')}${c('hours', 'Nombre d\'heures (si publié)')}
          ${c('url', 'Lien vers l\'annonce originale', 'url', true)}<label>Statut de candidature<select name="status">${AO_STATUTS.map(s => opt(s[0], s[1], v.status)).join('')}</select></label></div>
        <label>Documents nécessaires<textarea name="docs" placeholder="DC1, DC2 ou DUME, Kbis, attestations URSSAF et fiscale, assurance, autorisation CNAPS, mémoire technique…">${esc(v.docs || '')}</textarea></label>
        <label>Notes<textarea name="notes">${esc(v.notes || '')}</textarea></label>
        <div class="actions"><button class="bouton" type="submit">Enregistrer</button>${t && t.url ? `<a class="bouton bouton-secondaire" href="${esc(t.url)}" target="_blank" rel="noopener">Ouvrir l'annonce ↗</a>` : ''}<a class="bouton-lien" href="#/ao">Retour</a>
          ${t ? '<button class="bouton-lien danger" type="button" data-action="supprimer-ao">Supprimer</button>' : ''}</div></form></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Calculateur                                                         */
  /* ------------------------------------------------------------------ */
  function calcDefaut(act, p) {
    if (p && p.calc && p.calc.inputs) return { ...p.calc.inputs, pid: p.id };
    const s = S.params;
    return { act: act || 'secu', pid: p ? p.id : '', agents: 2, hoursPerDay: 12, daysPerWeek: 7, rate: act === 'net' ? s.rateNetProduits : s.rateSecu,
      nightShare: act === 'net' ? 0 : 50, sundayShare: 14.3, billNightPct: 0, billSundayPct: 0, costHour: act === 'net' ? s.costHourNet : s.costHourSecu,
      costNightPct: s.nightCostPct, costSundayPct: s.sundayCostPct, travel: 0, supplies: 0, supervision: 0, otherFees: 0 };
  }
  function pCalc() {
    const c = S.calc || (S.calc = calcDefaut('secu'));
    const s = S.params;
    const ch = (k, l, aide, pas) => `<label>${l}<input type="number" min="0" step="${pas || 'any'}" data-calc="${k}" value="${esc(c[k])}">${aide ? `<span class="aide">${aide}</span>` : ''}</label>`;
    const classes = liste().filter(p => p.calc && p.calc.results).map(p => ({ p, r: p.calc.results }))
      .sort((a, b) => (b.r.marginMonth ?? -1e12) - (a.r.marginMonth ?? -1e12) || b.r.caMonth - a.r.caMonth);
    return `<div class="pile">${tete('Contrats', 'Calculateur de contrats', 'Volume d\'heures, chiffre d\'affaires et marge réelle d\'un contrat. Le chiffre d\'affaires n\'est pas le bénéfice : renseigne le coût d\'un agent pour voir la marge.')}
      <div class="filtres">${[['secu', '🛡 Sécurité'], ['net', '✦ Nettoyage']].map(([k, l]) => `<button type="button" class="filtre" data-action="calc-act" data-valeur="${k}" aria-pressed="${c.act === k}">${l}</button>`).join('')}
        <button type="button" class="filtre" data-action="calc-exemple">Exemple : 2 agents, 12 h/j, 7 j/7</button></div>
      <div class="deux-colonnes">
        <div class="carte formulaire"><h3>Le besoin</h3>
          <div class="trois-colonnes">${ch('agents', 'Agents en même temps', '', 1)}${ch('hoursPerDay', 'Heures par jour', '', .5)}${ch('daysPerWeek', 'Jours par semaine', '', 1)}</div>
          ${ch('rate', 'Tarif HT par heure (€)', c.act === 'net' ? `Indicatif : ${eur2(s.rateNetClient)} (produits du client) ou ${eur2(s.rateNetProduits)} (produits Abdel)` : `Indicatif : ${eur2(s.rateSecu)}`, .5)}
          <div class="deux-colonnes">${ch('nightShare', 'Part des heures de nuit (%)', '', 1)}${ch('sundayShare', 'Part dimanche et jours fériés (%)', '7 j/7 ≈ 14,3 %', .1)}</div>
          <div class="deux-colonnes">${ch('billNightPct', 'Majoration facturée la nuit (%)', '0 si le tarif est le même', 1)}${ch('billSundayPct', 'Majoration facturée le dimanche (%)', '', 1)}</div>
          <h3>Les coûts</h3>
          ${ch('costHour', 'Coût horaire chargé d\'un agent (€)', 'Salaire + charges patronales : à demander à Abdel', .01)}
          <div class="deux-colonnes">${ch('costNightPct', 'Surcoût de nuit (%)', 'Indicatif, à confirmer', 1)}${ch('costSundayPct', 'Surcoût du dimanche (%)', 'Indicatif, à confirmer', 1)}</div>
          <div class="deux-colonnes">${ch('travel', 'Déplacements (€/mois)')}${ch('supplies', 'Produits, matériel, tenues (€/mois)')}${ch('supervision', 'Encadrement, contrôles (€/mois)')}${ch('otherFees', 'Autres frais (€/mois)')}</div></div>
        <div class="pile-serree"><div id="resultat-calc"></div>
          <div class="carte formulaire"><h3>Rattacher à un prospect</h3>
            <label>Prospect<select data-calc="pid">${opt('', 'Choisir…', c.pid)}${liste().filter(p => c.act === 'secu' ? p.secu : p.net).sort((a, b) => a.name.localeCompare(b.name)).map(p => opt(p.id, p.name, c.pid)).join('')}</select></label>
            <div class="actions"><button class="bouton" type="button" data-action="calc-enregistrer">Enregistrer sur la fiche</button></div>
            <p class="aide">Met à jour le volume horaire du prospect, sa valeur, son score et le classement ci-dessous.</p></div></div></div>
      <section><div class="section-titre"><h2>Contrats chiffrés, du plus rentable au moins rentable</h2><p>${classes.length}</p></div>
        ${classes.length ? `<div class="defile"><table class="tableau"><thead><tr><th>Prospect</th><th class="n">h/mois</th><th class="n">CA/mois</th><th class="n">Marge/mois</th><th class="n">Taux</th><th class="n">Marge/h</th></tr></thead><tbody>
        ${classes.map(({ p, r }) => `<tr><td><a href="#/prospect/${encodeURIComponent(p.id)}">${esc(p.name)}</a></td><td class="n">${nf(r.hoursMonth)}</td><td class="n">${eur(r.caMonth)}</td><td class="n">${r.marginMonth != null ? eur(r.marginMonth) : 'coût ?'}</td><td class="n">${r.marginPct != null ? pct(r.marginPct) : '—'}</td><td class="n">${r.marginPerHour != null ? eur2(r.marginPerHour) : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="message message-info">Aucun contrat chiffré pour l\'instant.</p>'}</section></div>`;
  }
  function majCalc() {
    const zoneR = document.getElementById('resultat-calc'); if (!zoneR) return;
    const r = C.calcContract(S.calc);
    zoneR.innerHTML = `<div class="carte pile-serree"><h3>Résultat</h3>
      <div class="compteurs">${compteur(nf(r.hoursDay, 1) + ' h', 'par jour')}${compteur(nf(r.hoursWeek, 1) + ' h', 'par semaine')}${compteur(nf(r.hoursMonth) + ' h', 'par mois', 'compteur-encre')}${compteur(nf(r.hoursYear) + ' h', 'par an')}</div>
      <div class="compteurs">${compteur(eur(r.caMonth), 'CA HT / mois', 'compteur-argent compteur-encre')}${compteur(eur(r.caYear), 'CA HT / an', 'compteur-argent')}
        ${r.hasCost ? compteur(eur(r.marginMonth), 'marge brute / mois', 'compteur-argent ' + (r.marginMonth > 0 ? 'compteur-vert' : 'compteur-rouge')) + compteur(pct(r.marginPct), 'taux de marge', 'compteur-argent') : compteur('—', 'marge : coût à saisir', 'compteur-argent') + compteur('—', 'taux de marge', 'compteur-argent')}</div>
      ${r.hasCost ? `<p class="aide">Coût total : ${eur(r.costMonth)} / mois · marge par heure vendue : ${eur2(r.marginPerHour)} · marge annuelle : ${eur(r.marginYear)}.</p>${r.marginPct < 10 ? '<p class="message message-erreur">Marge inférieure à 10 % : contrat risqué, à valider avec Abdel avant toute proposition.</p>' : ''}`
        : '<p class="message message-action">Renseigne le <b>coût horaire chargé</b> d\'un agent pour voir la marge.</p>'}
      <p class="aide">Mois = semaine × 52 / 12. Ne compte pas les congés, la formation ni les absences à remplacer.</p></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Statistiques                                                        */
  /* ------------------------------------------------------------------ */
  function pStats() {
    const ev = liste().flatMap(p => (p.history || []).map(e => ({ ...e, pid: p.id })));
    const st = C.stats(liste(), ev, S.params);
    const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const groupe = (titre, g) => {
      const lignes = Object.entries(g).sort((a, b) => b[1].won - a[1].won || b[1].n - a[1].n);
      return `<section><div class="section-titre"><h2>${esc(titre)}</h2></div>${lignes.length ? `<div class="defile"><table class="tableau"><thead><tr><th></th><th class="n">Prospects</th><th class="n">Contactés</th><th class="n">Signés</th><th class="n">Transformation</th><th class="n">CA / mois</th></tr></thead><tbody>
        ${lignes.map(([k, v]) => `<tr><td>${esc(segLabel(k))}</td><td class="n">${v.n}</td><td class="n">${v.contacted}</td><td class="n">${v.won}</td><td class="n">${v.contacted ? pct(v.won / v.contacted * 100) : '—'}</td><td class="n">${eur(v.ca)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="message message-info">Pas encore de données.</p>'}</section>`;
    };
    return `<div class="pile">${tete('Pilotage', 'Statistiques', 'Ce qui marche, ce qui bloque, et où concentrer tes efforts.')}
      <div class="compteurs">${compteur(pct(st.conversion), 'transformation (signés / contactés)', 'compteur-argent compteur-vert')}${compteur(pct(st.response), 'décideur joint')}${compteur(pct(st.rdvRate), 'rendez-vous')}${compteur(pct(st.quoteAccept), 'devis acceptés')}
        ${compteur(pct(st.refusal), 'refus')}${compteur(st.callsBeforeWin == null ? '—' : nf(st.callsBeforeWin, 1), 'appels avant signature')}${compteur(st.followUpsAvg == null ? '—' : nf(st.followUpsAvg, 1), 'relances par prospect')}${compteur(st.daysToWin == null ? '—' : nf(st.daysToWin) + ' j', 'durée moyenne de conversion')}
        ${compteur(st.wonCount, 'contrats signés')}${compteur(nf(st.hoursSold) + ' h', 'volume vendu / mois')}${compteur(eur(st.revenue), 'CA généré / mois', 'compteur-argent')}${compteur(st.contacted, 'prospects contactés')}</div>
      <section><div class="section-titre"><h2>Mois par mois</h2><p>6 derniers mois</p></div><div class="defile"><table class="tableau"><thead><tr><th>Mois</th><th class="n">Nouveaux</th><th class="n">Appels</th><th class="n">RDV</th><th class="n">Devis</th><th class="n">Signés</th><th class="n">CA signé</th></tr></thead><tbody>
        ${st.monthly.map(m => `<tr><td>${mois[+m.month.slice(5) - 1]} ${m.month.slice(0, 4)}</td><td class="n">${m.newProspects}</td><td class="n">${m.calls}</td><td class="n">${m.rdv}</td><td class="n">${m.devis}</td><td class="n">${m.won}</td><td class="n">${eur(m.ca)}</td></tr>`).join('')}</tbody></table></div></section>
      ${groupe('Sécurité ou nettoyage', st.byActivity)}${groupe('Par source de prospection', st.bySource)}${groupe('Par secteur d\'activité', st.bySector)}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Assistant (calculs sur tes données, sans IA payante)                */
  /* ------------------------------------------------------------------ */
  const QUESTIONS = [
    ['top', 'Quels sont mes 10 prospects les plus intéressants ?'],
    ['jour', 'Quels prospects dois-je rappeler aujourd\'hui ?'],
    ['volume', 'Quels contrats représentent le plus gros potentiel horaire ?'],
    ['oublies', 'Quels prospects n\'ai-je pas recontactés depuis 15 jours ?'],
    ['secteurs', 'Sur quels secteurs concentrer mes efforts ?'],
    ['entrepots', 'Quels entrepôts et plateformes logistiques pourraient avoir besoin de surveillance ?'],
    ['trouver', 'Trouve-moi des entreprises susceptibles d\'avoir besoin d\'agents de sécurité dans mon secteur.'],
    ['ao', 'Trouve des appels d\'offres en sécurité privée auxquels répondre.'],
  ];
  function intention(texte) {
    const t = texte.toLowerCase();
    if (/appel.{0,4}d.?offre|march[ée]s? public|boamp/.test(t)) return 'ao';
    if (/entrep[oô]t|logisti|plateforme/.test(t)) return 'entrepots';
    if (/trouve|cherche|nouvelles? entreprises|nouveaux prospects/.test(t)) return 'trouver';
    if (/15 jours|recontact|oubli|pas rappel/.test(t)) return 'oublies';
    if (/aujourd|rappeler|relanc/.test(t)) return 'jour';
    if (/horaire|heures|volume|potentiel/.test(t)) return 'volume';
    if (/secteur|concentrer|efforts?|cibl/.test(t)) return 'secteurs';
    return 'top';
  }
  function repondre(cle) {
    const s = S.params, t = today();
    const ouverts = liste().filter(p => !C.CLOSED.includes(p.status) && !p.optOut);
    const pourquoi = p => { const sc = C.score(p); return sc.reasons.filter(r => r.pts).map(r => r.l + (r.why && r.why !== 'déclaré' ? ' (' + r.why + ')' : '')).join(' ; ') || 'aucun critère prouvé pour l\'instant'; };
    const lst = (arr, f) => arr.length ? `<ul class="liste">${arr.map(p => `<li class="ligne">${scoreRond(p)}<div><a class="ligne-titre" href="#/prospect/${encodeURIComponent(p.id)}">${esc(p.name)}</a><div class="ligne-detail">${f(p)}</div></div><div class="ligne-droite">${pastilleStatut(p)}</div></li>`).join('')}</ul>` : '<p class="message message-info">Aucun prospect ne correspond dans ta base pour le moment.</p>';
    switch (cle) {
      case 'top': {
        const arr = ouverts.sort((a, b) => C.score(b).total - C.score(a).total || C.monthlyValue(b, s) - C.monthlyValue(a, s)).slice(0, 10);
        return `<p>Classement par score (critères prouvés), puis par valeur mensuelle :</p>${lst(arr, p => esc(pourquoi(p)) + (C.monthlyValue(p, s) ? ' · ' + eur(C.monthlyValue(p, s)) + '/mois' : ''))}`;
      }
      case 'jour': {
        const arr = ouverts.filter(p => p.nextDate && p.nextDate <= t).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
        return `<p>${arr.length} relance${arr.length > 1 ? 's' : ''} prévue${arr.length > 1 ? 's' : ''} aujourd'hui ou en retard :</p>${lst(arr, p => 'Relance prévue le ' + fd(p.nextDate) + (p.nextAction ? ' · ' + esc(p.nextAction) : '') + (p.phone ? ' · ☎ ' + esc(p.phone) : ''))}`;
      }
      case 'volume': {
        const arr = ouverts.filter(p => C.totalHours(p) > 0).sort((a, b) => C.totalHours(b) - C.totalHours(a)).slice(0, 10);
        return `<p>Les plus gros volumes horaires estimés (prospects en cours) :</p>${lst(arr, p => nf(C.totalHours(p)) + ' h/mois · ' + eur(C.monthlyValue(p, s)) + ' HT/mois' + (p.calc ? ' · chiffré au calculateur' : ' · estimation saisie'))}`;
      }
      case 'oublies': {
        const arr = ouverts.filter(p => p.lastCallDate ? C.daysBetween(p.lastCallDate, t) >= 15 : (p.createdAt && C.daysBetween(p.createdAt.slice(0, 10), t) >= 15));
        return `<p>Prospects sans appel depuis au moins 15 jours :</p>${lst(arr, p => p.lastCallDate ? 'Dernier appel le ' + fd(p.lastCallDate) + ' (' + C.daysBetween(p.lastCallDate, t) + ' jours)' : 'Jamais appelé, créé le ' + fd(p.createdAt))}`;
      }
      case 'secteurs': {
        const g = {};
        liste().forEach(p => { const k = p.sector || 'Non renseigné'; g[k] = g[k] || { n: 0, score: 0, contact: 0, rdv: 0, won: 0, val: 0 }; const x = g[k]; x.n++; x.score += C.score(p).total; if (C.num(p.callCount) || !C.NOT_YET_CONTACTED.includes(p.status)) x.contact++; if ((p.reached || []).includes('rdv')) x.rdv++; if (p.status === 'gagne') x.won++; if (!C.CLOSED.includes(p.status)) x.val += C.monthlyValue(p, s); });
        const rows = Object.entries(g).map(([k, x]) => ({ k, ...x, moy: x.score / x.n, taux: x.contact ? x.rdv / x.contact * 100 : null })).sort((a, b) => (b.won - a.won) || ((b.taux || 0) - (a.taux || 0)) || (b.val - a.val));
        if (!rows.length) return '<p class="message message-info">Pas encore de données : ajoute et appelle des prospects, la réponse s\'affinera.</p>';
        const meilleur = rows[0];
        return `<p>D'après tes résultats : le secteur le plus prometteur est <b>${esc(segLabel(meilleur.k))}</b> (${meilleur.won} signé(s), ${meilleur.taux == null ? 'pas encore d\'appels' : pct(meilleur.taux) + ' de rendez-vous'}, ${eur(meilleur.val)} de potentiel mensuel en cours). Concentre tes appels sur les 2 ou 3 premiers de ce tableau ; les secteurs sans rendez-vous après 20 appels sont à mettre de côté.</p>
          <div class="defile"><table class="tableau"><thead><tr><th>Secteur</th><th class="n">Prospects</th><th class="n">Score moyen</th><th class="n">Contactés</th><th class="n">Taux de RDV</th><th class="n">Signés</th><th class="n">Potentiel/mois</th></tr></thead><tbody>
          ${rows.map(x => `<tr><td>${esc(segLabel(x.k))}</td><td class="n">${x.n}</td><td class="n">${nf(x.moy)}</td><td class="n">${x.contact}</td><td class="n">${pct(x.taux)}</td><td class="n">${x.won}</td><td class="n">${eur(x.val)}</td></tr>`).join('')}</tbody></table></div>`;
      }
      case 'entrepots': {
        const arr = liste().filter(p => ['logistique', 'entrepots', 'plateformes'].includes(p.sector)).sort((a, b) => C.score(b).total - C.score(a).total);
        return `<p>Dans ta base (${arr.length}) :</p>${lst(arr, p => esc(p.city || '') + ' · ' + esc(pourquoi(p)))}
          <div class="actions"><button class="bouton" type="button" data-action="preset" data-seg="entrepots">Chercher de nouveaux entrepôts dans la métropole</button></div>`;
      }
      case 'trouver':
        return `<p>Je lance une recherche dans le registre officiel : entreprises de logistique de 10 salariés et plus dans un rayon de 10 km autour de Mérignac. Tu pourras changer la cible et la commune.</p><div class="actions"><button class="bouton" type="button" data-action="preset" data-seg="logistique">Voir les entreprises</button></div>`;
      case 'ao':
        return `<p>La veille BOAMP cherche les avis de Gironde des 30 derniers jours qui parlent de gardiennage, surveillance, sécurité ou nettoyage.</p><div class="actions"><a class="bouton" href="#/ao">Ouvrir les appels d'offres et lancer la veille</a></div>`;
    }
    return '';
  }
  function pAssistant() {
    const a = S.assistant;
    return `<div class="pile">${tete('Pilotage', 'Assistant', 'Pose une question : la réponse est calculée sur tes données réelles, avec les raisons. Rien n\'est inventé, et aucune IA payante n\'est utilisée.')}
      <form class="carte formulaire" id="f-assistant"><label>Ta question<input type="text" name="q" placeholder="ex. : qui dois-je rappeler aujourd'hui ?" value="${esc(a ? a.q : '')}"></label><div class="actions"><button class="bouton" type="submit">Répondre</button></div></form>
      <div class="filtres">${QUESTIONS.map(([k, l]) => `<button type="button" class="filtre" data-action="question" data-cle="${k}">${esc(l)}</button>`).join('')}</div>
      ${a ? `<section class="reponse pile-serree"><p class="question">${esc(a.q)}</p>${repondre(a.cle)}</section>` : ''}</div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Paramètres, import, export, sauvegarde                              */
  /* ------------------------------------------------------------------ */
  function pParametres() {
    const s = S.params;
    const c = (k, l, type, aide) => `<label>${l}<input type="${type || 'text'}" step="any" name="${k}" value="${esc(s[k])}">${aide ? `<span class="aide">${aide}</span>` : ''}</label>`;
    return `<div class="pile">${tete('Pilotage', 'Paramètres', 'Tarifs, coûts, informations de l\'entreprise et sauvegardes.')}
      <form class="pile-serree" id="f-parametres">
        <div class="carte formulaire"><h3>Tarifs de vente (HT)</h3><div class="trois-colonnes">${c('rateSecu', 'Sécurité (€/h)', 'number')}${c('rateNetClient', 'Nettoyage, produits du client (€/h)', 'number')}${c('rateNetProduits', 'Nettoyage, produits Abdel (€/h)', 'number')}</div>
          <p class="aide">Ne jamais proposer un tarif inférieur sans l'accord d'Abdel.</p></div>
        <div class="carte formulaire"><h3>Coûts (pour la marge)</h3><div class="deux-colonnes">${c('costHourSecu', 'Coût horaire chargé, agent de sécurité (€)', 'number', 'À demander à Abdel')}${c('costHourNet', 'Coût horaire chargé, agent de propreté (€)', 'number', 'À demander à Abdel')}
          ${c('nightCostPct', 'Surcoût de nuit (%)', 'number', 'Indicatif, à confirmer')}${c('sundayCostPct', 'Surcoût du dimanche (%)', 'number', 'Indicatif, à confirmer')}</div></div>
        <div class="carte formulaire"><h3>Entreprises</h3><div class="deux-colonnes">${c('companySecu', 'Société de sécurité (nom légal)')}${c('cnaps', 'N° d\'autorisation d\'exercice CNAPS', 'text', 'Exigé dans les devis et appels d\'offres sécurité')}${c('companyNet', 'Société de nettoyage')}${c('userName', 'Ton prénom (scripts et e-mails)')}${c('userPhone', 'Ton téléphone professionnel (signature des e-mails)', 'tel')}</div></div>
        <div class="actions"><button class="bouton" type="submit">Enregistrer les paramètres</button></div></form>
      <section class="carte pile-serree"><h3>Sauvegardes automatiques</h3>
        <p class="aide">Une copie complète de tes prospects, appels d'offres et paramètres est faite chaque dimanche vers 3 h. Les 8 dernières semaines sont gardées. « Restaurer » remet les fiches telles qu'elles étaient ce jour-là, sans supprimer celles créées depuis.</p>
        <div id="zone-sauvegardes"><p class="chargement">Chargement…</p></div></section>
      <section class="carte pile-serree"><h3>Export et import</h3>
        <p class="aide">Pour garder une copie en dehors de la plateforme (dans ton Drive par exemple), télécharge une sauvegarde de temps en temps. Dernier téléchargement : ${s.lastBackup ? fdt(s.lastBackup) : 'jamais'}.</p>
        <div class="actions"><button class="bouton" type="button" data-action="sauvegarde">Télécharger une sauvegarde complète</button><button class="bouton bouton-secondaire" type="button" data-action="exporter" data-quoi="all">Exporter en Excel</button>
          <button class="bouton bouton-secondaire" type="button" data-action="exporter-csv">Exporter en CSV</button><button class="bouton bouton-secondaire" type="button" data-action="importer">Importer (CSV, Excel ou sauvegarde)</button></div>
        <p class="aide">Import : les colonnes sont reconnues par leur nom (Entreprise, SIREN, Ville, Code postal, Téléphone, Email…). Les doublons (même SIREN, ou même nom et code postal) sont ignorés.</p></section>
      ${blocCorbeille()}
      <section class="carte carte-sable pile-serree"><h3>RGPD et prospection B2B</h3><p class="petit">Téléphone : appeler les lignes professionnelles. Email : vers une adresse professionnelle, sur un sujet lié à la fonction de la personne, en disant qui écrit et avec un moyen simple de se désinscrire. Une personne qui refuse d'être recontactée : coche « Ne plus contacter » dans sa fiche. Les entreprises marquées « Opposition prospection » dans le registre ont refusé que leurs données servent au démarchage.</p></section></div>`;
  }

  const COLS = [['Entreprise', 'name'], ['SIREN', 'siren'], ['SIRET', 'siret'], ['Adresse', 'address'], ['Code postal', 'cp'], ['Ville', 'city'], ['Site internet', 'website'], ['Secteur', 'sector'], ['Taille', 'size'],
    ['Sécurité', 'secu'], ['Nettoyage', 'net'], ['Produits fournis par Abdel', 'netProduits'], ['Dirigeant', 'contacts.dirigeant'], ['Responsable sécurité', 'contacts.securite'], ['Responsable achats', 'contacts.achats'],
    ['Responsable services généraux', 'contacts.sg'], ['Responsable de site', 'contacts.site'], ['Téléphone', 'phone'], ['Email', 'email'], ['LinkedIn', 'linkedin'], ['Source', 'source'], ['Date de découverte', 'discoveredAt'],
    ['Besoin identifié', 'need'], ['Heures sécurité / mois', 'hoursSecu'], ['Heures nettoyage / mois', 'hoursNet'], ['Statut', 'status'], ['Prochaine action', 'nextAction'], ['Date de relance', 'nextDate'],
    ['Dernier appel', 'lastCallDate'], ['Nombre d\'appels', 'callCount'], ['Notes', 'notes'], ['Ne plus contacter', 'optOut']];
  const BOOL = ['secu', 'net', 'netProduits', 'optOut'];
  const ALIAS = { 'produits fournis par dp abdel': 'netProduits', nom: 'name', societe: 'name', 'raison sociale': 'name', denomination: 'name', tel: 'phone', telephone: 'phone', mail: 'email', 'e mail': 'email', cp: 'cp', commune: 'city', web: 'website', activite: 'sector' };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
  function lignesExport(arr) {
    return arr.map(p => {
      const o = {};
      COLS.forEach(([h, k]) => { let v = getPath(p, k); if (BOOL.includes(k)) v = v ? 'oui' : 'non'; if (k === 'sector') v = segLabel(v); if (k === 'status') v = C.STATUS_LABEL[v] || v; o[h] = v == null ? '' : v; });
      o['Valeur mensuelle (€ HT)'] = Math.round(C.monthlyValue(p, S.params)); o['Score /100'] = C.score(p).total;
      return o;
    });
  }
  function telecharger(nom, contenuFichier, type) {
    const blob = contenuFichier instanceof Blob ? contenuFichier : new Blob([contenuFichier], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exporterExcel(quoi) {
    if (!window.XLSX) return notif('Le module Excel n\'a pas pu se charger : utilise l\'export CSV.', true);
    const arr = liste().filter(p => quoi === 'secu' ? p.secu : quoi === 'net' ? p.net : true);
    if (!arr.length) return notif('Aucun prospect à exporter.', true);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignesExport(arr)), 'Prospects');
    if (aos().length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aos().map(t => ({ Objet: t.object, Acheteur: t.buyer, Lieu: t.place, Type: t.type, 'Date limite': t.deadline, Durée: t.duration, Montant: t.amount, Heures: t.hours, Statut: AO_LIB[t.status], Lien: t.url, Documents: t.docs }))), 'Appels d\'offres');
    telecharger(`Abdel-prospects-${quoi === 'all' ? 'tous' : quoi === 'secu' ? 'securite' : 'nettoyage'}-${today()}.xlsx`, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]));
  }
  function exporterCsv() {
    const rows = lignesExport(liste()); if (!rows.length) return notif('Aucun prospect à exporter.', true);
    const h = Object.keys(rows[0]); const cel = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    telecharger(`Abdel-prospects-${today()}.csv`, '﻿' + [h.join(';'), ...rows.map(r => h.map(k => cel(r[k])).join(';'))].join('\n'), 'text/csv;charset=utf-8');
  }
  async function sauvegarde() {
    telecharger(`Sauvegarde-CRM-Abdel-${today()}.json`, JSON.stringify({ app: 'CRM Abdel', version: 1, exportedAt: nowISO(), settings: S.params, prospects: liste(), tenders: aos() }, null, 1), 'application/json');
    S.params.lastBackup = nowISO(); await ecrire('abdel_parametres', 'main', S.params); notif('Sauvegarde téléchargée'); rafraichir();
  }
  function lireCsv(texte) {
    const l1 = texte.split('\n')[0]; const sep = (l1.match(/;/g) || []).length >= (l1.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < texte.length; i++) {
      const ch = texte[i];
      if (q) { if (ch === '"') { if (texte[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texte[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const tete_ = (rows.shift() || []).map(h => h.replace(/^﻿/, ''));
    return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(tete_.map((h, i) => [h, r[i] ?? ''])));
  }
  function ligneVersProspect(row) {
    const p = prospectVide('secu'); p.secu = false;
    const carte = {}; COLS.forEach(([h, k]) => { carte[norm(h)] = k; }); Object.entries(ALIAS).forEach(([a, k]) => { carte[a] = carte[a] || k; });
    Object.entries(row).forEach(([h, v]) => {
      const k = carte[norm(h)]; if (!k) return;
      let val = v == null ? '' : String(v).trim();
      if (BOOL.includes(k)) val = /^(oui|yes|1|true|x|vrai)$/i.test(val);
      else if (k === 'status') { const f = C.STATUSES.find(s => norm(s[1]) === norm(val) || s[0] === val); val = f ? f[0] : 'identifie'; }
      else if (k === 'sector') { const f = R.SEGMENTS.find(s => norm(s.l) === norm(val) || s.id === val); val = f ? f.id : val; }
      else if (['hoursSecu', 'hoursNet', 'callCount'].includes(k)) val = val === '' ? '' : C.num(val.replace(',', '.'));
      setPath(p, k, val);
    });
    if (!p.secu && !p.net) p.secu = true;
    if (!p.source) p.source = 'Import';
    p.reached = [p.status];
    return p.name ? p : null;
  }
  async function importer(fichier) {
    try {
      if (/\.json$/i.test(fichier.name)) return restaurer(JSON.parse(await fichier.text()));
      let rows;
      if (/\.xlsx?$/i.test(fichier.name)) {
        if (!window.XLSX) return notif('Le module Excel n\'a pas pu se charger : enregistre le fichier en CSV.', true);
        const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      } else rows = lireCsv(await fichier.text());
      const cands = rows.map(ligneVersProspect).filter(Boolean);
      if (!cands.length) return notif('Aucune ligne reconnue : il faut au moins une colonne « Entreprise » ou « Nom ».', true);
      const ajout = []; let doublons = 0;
      cands.forEach(c => { if (C.findDuplicate({ ...c, id: '__x' }, [...liste(), ...ajout])) doublons++; else ajout.push({ ...c, id: '__t' + ajout.length }); });
      const ok = await dialogue(`<h3>Importer « ${esc(fichier.name)} » ?</h3><p class="aide">${cands.length} ligne(s) reconnue(s) : <b>${ajout.length}</b> nouveau(x) prospect(s), ${doublons} doublon(s) ignoré(s).</p>`, [{ label: `Importer ${ajout.length}`, value: true }, { label: 'Annuler', value: false, cls: 'bouton-secondaire' }]);
      if (!ok || !ajout.length) return;
      let n = 0;
      for (const c of ajout) { delete c.id; if (await enregistrerProspect(c)) n++; else break; }
      notif(`${n} prospect(s) importé(s)`); rafraichir();
    } catch (e) { notif('Fichier illisible : ' + (e.message || e), true); }
  }
  async function restaurer(d) {
    if (!d || !Array.isArray(d.prospects)) return notif('Ce fichier n\'est pas une sauvegarde du CRM.', true);
    const ok = await dialogue(`<h3>Restaurer la sauvegarde du ${fd(d.exportedAt)} ?</h3><p class="aide">${d.prospects.length} prospect(s), ${(d.tenders || []).length} appel(s) d'offres. Les fiches de même identifiant sont remplacées ; les autres sont conservées.</p>`, [{ label: 'Restaurer', value: true }, { label: 'Annuler', value: false, cls: 'bouton-secondaire' }]);
    if (!ok) return;
    let n = 0;
    for (const p of d.prospects) if (p && p.id && await ecrire('abdel_prospects', p.id, p)) { S.prospects[p.id] = p; n++; }
    for (const t of d.tenders || []) if (t && t.id && await ecrire('abdel_appels_offres', t.id, t)) S.ao[t.id] = t;
    notif(`${n} fiche(s) restaurée(s)`); rafraichir();
  }

  /* ------------------------------------------------------------------ */
  /* Après rendu et événements                                           */
  /* ------------------------------------------------------------------ */
  function apresRendu(r) {
    if (r.nom === 'calculateur') majCalc();
    if (r.nom === 'parametres') chargerSauvegardes();
    if (r.nom !== 'prospect' && S.email) S.email = null;
    if (r.nom !== 'session' && S.session && S.session.i >= S.session.file.length) S.session = null;
  }

  document.addEventListener('click', async e => {
    const lienAppel = e.target.closest('a[data-appel]');
    if (lienAppel) { S.appelEnCours = { id: lienAppel.dataset.appel, debut: Date.now(), parti: false }; return; }
    const filtre = e.target.closest('button[data-filtre]');
    if (filtre) { const [k, f] = filtre.dataset.filtre.split('.'); S.filtres[k] = S.filtres[k] || {}; S.filtres[k][f] = filtre.dataset.valeur; if (k === 'rech') S.recherche = null; return rafraichir(); }
    const a = e.target.closest('[data-action]'); if (!a) return;
    const act = a.dataset.action;
    if (act === 'exporter') exporterExcel(a.dataset.quoi || 'all');
    if (act === 'exporter-csv') exporterCsv();
    if (act === 'sauvegarde') sauvegarde();
    if (act === 'importer') { const f = document.getElementById('fichier'); f.value = ''; f.click(); }
    if (act === 'ajouter-resultat') ajouterResultat(+a.dataset.i, a);
    if (act === 'rech-suite') lancerRecherche((S.recherche.data.page || 1) + 1);
    if (act === 'registre') completerRegistre(a);
    if (act.startsWith('email-')) actionEmail(act, a);
    if (act === 'session-demarrer' || act === 'session-nouvelle') { S.session = { file: fileSession((S.filtres.sess || {}).act), i: 0, faits: [], passes: 0, resultat: null }; if (!S.session.file.length) { S.session = null; return route(); } allerSession(); }
    if (act === 'aller-a') { const cible = document.getElementById(a.dataset.valeur); if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (act === 'date-rapide') { const champ = document.querySelector('#f-appel [name=nextDate]'); if (champ) champ.value = a.dataset.valeur; }
    if (act === 'session-passer') { S.session.i++; S.session.passes++; allerSession(); }
    if (act === 'session-fin') { S.session.i = S.session.file.length; location.hash = '#/session'; }
    if (act === 'sauvegarde-telecharger') { const d = await lireSauvegarde(a.dataset.id); if (d) telecharger(`Sauvegarde-CRM-Abdel-${String(d.exportedAt).slice(0, 10)}.json`, JSON.stringify(d, null, 1), 'application/json'); }
    if (act === 'sauvegarde-restaurer') { const d = await lireSauvegarde(a.dataset.id); if (d) restaurer(d); }
    if (act === 'restaurer-corbeille') restaurerCorbeille(a.dataset.id);
    if (act === 'agent-contacts') demanderAgentContacts(false);
    if (act === 'agent-contacts-annuler') demanderAgentContacts(true);
    if (act === 'registre-choix') choisirRegistre(+a.dataset.i);
    if (act === 'supprimer-prospect') {
      const id = document.getElementById('corps-fiche').dataset.id; const p = S.prospects[id];
      const ok = await dialogue(`<h3>Supprimer « ${esc(p.name)} » ?</h3><p class="aide">La fiche et son historique seront effacés définitivement.</p>`, [{ label: 'Supprimer', value: true, cls: 'bouton-danger' }, { label: 'Annuler', value: false, cls: 'bouton-secondaire' }]);
      if (ok && await effacer('abdel_prospects', id)) { delete S.prospects[id]; notif('Fiche supprimée'); location.hash = p.secu ? '#/securite' : '#/nettoyage'; }
    }
    if (act === 'veille') {
      S.veille = { charge: true }; rafraichir();
      try { S.veille = { data: await appelServeur({ action: 'boamp', jours: 30 }) }; } catch (err) { S.veille = { erreur: err.message }; }
      rafraichir();
    }
    if (act === 'suivre-ao') {
      const x = S.veille.data.resultats[+a.dataset.i];
      const id = uid();
      const doc = { id, idweb: x.idweb, object: x.objet, buyer: x.acheteur, type: x.type, deadline: x.dateLimite || '', url: x.lien, status: 'etude', place: '', createdAt: nowISO(), source: 'Veille BOAMP' };
      if (await ecrire('abdel_appels_offres', id, doc)) { S.ao[id] = doc; notif('Avis ajouté à ta liste'); rafraichir(); }
    }
    if (act === 'supprimer-ao') {
      const id = document.getElementById('f-ao').dataset.id;
      const ok = await dialogue('<h3>Supprimer cet appel d\'offres ?</h3>', [{ label: 'Supprimer', value: true, cls: 'bouton-danger' }, { label: 'Annuler', value: false, cls: 'bouton-secondaire' }]);
      if (ok && await effacer('abdel_appels_offres', id)) { delete S.ao[id]; notif('Supprimé'); location.hash = '#/ao'; }
    }
    if (act === 'calc-act') { S.calc = calcDefaut(a.dataset.valeur); rafraichir(); }
    if (act === 'calc-exemple') { S.calc = { ...calcDefaut(S.calc.act), agents: 2, hoursPerDay: 12, daysPerWeek: 7, pid: S.calc.pid }; rafraichir(); }
    if (act === 'calc-enregistrer') {
      const c = S.calc; const p = S.prospects[c.pid]; if (!p) return notif('Choisis un prospect.', true);
      const r = C.calcContract(c); const d = clone(p); const hm = Math.round(r.hoursMonth);
      if (c.act === 'secu') { d.hoursSecu = hm; d.secu = true; } else { d.hoursNet = hm; d.net = true; d.netProduits = C.num(c.rate) >= C.num(S.params.rateNetProduits); }
      d.calc = { inputs: clone(c), results: { hoursMonth: r.hoursMonth, caMonth: r.caMonth, marginMonth: r.hasCost ? r.marginMonth : null, marginPct: r.hasCost ? r.marginPct : null, marginPerHour: r.hasCost ? r.marginPerHour : null }, at: nowISO() };
      d.history = [...(d.history || []), { type: 'calc', ts: nowISO(), note: `${c.agents} agent(s) × ${c.hoursPerDay} h × ${c.daysPerWeek} j : ${nf(r.hoursMonth)} h/mois, ${eur(r.caMonth)} HT/mois${r.hasCost ? ', marge ' + eur(r.marginMonth) : ''}` }];
      if (await enregistrerProspect(d)) { notif('Chiffrage enregistré sur ' + p.name); rafraichir(); }
    }
    if (act === 'question') { S.assistant = { cle: a.dataset.cle, q: (QUESTIONS.find(q => q[0] === a.dataset.cle) || [])[1] }; rafraichir(); }
    if (act === 'preset') {
      S.filtres.rech = { act: 'secu', seg: a.dataset.seg, commune: 'Mérignac', rayon: '10', taille: '10', q: '' };
      location.hash = '#/recherche'; setTimeout(() => lancerRecherche(1), 50);
    }
  });

  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.id === 'f-recherche') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f).entries());
      Object.assign(S.filtres.rech, { seg: d.seg, commune: d.commune, rayon: d.rayon, taille: d.taille, q: d.q.trim() });
      lancerRecherche(1);
    }
    if (f.id === 'f-appel') { e.preventDefault(); noterAppel(f); }
    if (f.id === 'f-nouveau') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f).entries());
      if (!d.name.trim()) return notif('Le nom est obligatoire.', true);
      const p = prospectVide(f.dataset.act); p.name = d.name.trim(); p.city = communeNom(d.city.trim()) || ''; if (!d.city.trim()) p.city = ''; p.source = d.source;
      const dup = C.findDuplicate({ ...p, id: '__n' }, liste());
      if (dup) {
        const r = await dialogue(`<h3>Doublon possible</h3><p class="aide">« ${esc(dup.name)} » (${esc(dup.city || '')}) existe déjà.</p>`, [{ label: 'Ouvrir l\'existant', value: 'ouvrir' }, { label: 'Créer quand même', value: 'creer', cls: 'bouton-secondaire' }, { label: 'Annuler', value: '', cls: 'bouton-secondaire' }]);
        if (r === 'ouvrir') return (location.hash = '#/prospect/' + encodeURIComponent(dup.id));
        if (r !== 'creer') return;
      }
      const s = await enregistrerProspect(p);
      if (s) location.hash = '#/prospect/' + encodeURIComponent(s.id) + '/infos';
    }
    if (f.id === 'f-ao') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f).entries());
      if (!d.object.trim() || !d.buyer.trim() || !d.deadline) return notif('Objet, acheteur et date limite sont obligatoires.', true);
      if (!/^https?:\/\//i.test(d.url || '')) return notif('Le lien vers l\'annonce originale est obligatoire.', true);
      const id = f.dataset.id || uid();
      const doc = { ...(S.ao[id] || { createdAt: nowISO() }), ...d, id, updatedAt: nowISO() };
      if (await ecrire('abdel_appels_offres', id, doc)) { S.ao[id] = doc; notif('Appel d\'offres enregistré'); location.hash = '#/ao'; }
    }
    if (f.id === 'f-parametres') {
      e.preventDefault();
      const d = { ...S.params };
      new FormData(f).forEach((v, k) => { d[k] = ['rateSecu', 'rateNetClient', 'rateNetProduits', 'nightCostPct', 'sundayCostPct'].includes(k) ? C.num(v) : ['costHourSecu', 'costHourNet'].includes(k) ? (v === '' ? '' : C.num(v)) : v; });
      if (await ecrire('abdel_parametres', 'main', d)) { S.params = d; S.calc = null; notif('Paramètres enregistrés'); }
    }
    if (f.id === 'f-assistant') { e.preventDefault(); const q = f.q.value.trim(); if (q) { S.assistant = { q, cle: intention(q) }; rafraichir(); } }
  });

  let minuterieFiltre = null;
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.calc && S.calc) { S.calc[t.dataset.calc] = t.value; if (t.dataset.calc !== 'pid') majCalc(); return; }
    if (t.dataset.filtre && t.dataset.direct) {
      const [k, f] = t.dataset.filtre.split('.'); S.filtres[k][f] = t.value;
      clearTimeout(minuterieFiltre);
      minuterieFiltre = setTimeout(() => { const pos = t.selectionStart; rafraichir(); const n = document.querySelector(`[data-filtre="${k}.${f}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { } } }, 300);
    }
    if (t.dataset.champ && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
      const id = t.closest('#corps-fiche') && t.closest('#corps-fiche').dataset.id;
      if (id && S.prospects[id] && t.dataset.champ.startsWith('criteria.')) { const d = clone(S.prospects[id]); setPath(d, t.dataset.champ, t.value); const box = document.getElementById('raisons'); if (box) box.innerHTML = raisonsHtml(C.score(d)); }
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.champ && t.closest('#corps-fiche')) return champModifie(t);
    if (t.dataset.filtre && !t.dataset.direct) { const [k, f] = t.dataset.filtre.split('.'); S.filtres[k] = S.filtres[k] || {}; S.filtres[k][f] = t.value; return rafraichir(); }
    if (t.dataset.calc === 'pid' && S.calc) { const p = S.prospects[t.value]; if (p && p.calc) { S.calc = { ...p.calc.inputs, pid: p.id }; rafraichir(); } return; }
    if (t.dataset.actionChange === 'statut') changerStatut(t.dataset.id, t.value).then(rafraichir);
    if (t.id === 'fichier' && t.files[0]) importer(t.files[0]);
    if (t.form && t.form.id === 'f-recherche' && t.name !== 'q') { const d = Object.fromEntries(new FormData(t.form).entries()); Object.assign(S.filtres.rech, { seg: d.seg, commune: d.commune, rayon: d.rayon, taille: d.taille }); }
  });

  // Glisser-déposer du pipeline (ordinateur)
  document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.carte-pipe'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
  document.addEventListener('dragover', e => { const col = e.target.closest && e.target.closest('.colonne'); if (col) { e.preventDefault(); col.classList.add('survol'); } });
  document.addEventListener('dragleave', e => { const col = e.target.closest && e.target.closest('.colonne'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('survol'); });
  document.addEventListener('drop', async e => {
    const col = e.target.closest && e.target.closest('.colonne'); if (!col) return;
    e.preventDefault(); col.classList.remove('survol');
    const id = e.dataTransfer.getData('text/plain'); const p = S.prospects[id]; if (!p) return;
    const def = C.COLUMNS.find(c => c.id === col.dataset.colonne);
    if (def.statuses.includes(p.status)) return;
    let vers = def.statuses[0];
    if (def.statuses.length > 1) {
      vers = await dialogue(`<h3>${esc(p.name)}</h3><p class="aide">Quelle étape exactement ?</p>`, [...def.statuses.map(s => ({ label: C.STATUS_LABEL[s], value: s, cls: s === 'perdu' ? 'bouton-danger' : '' })), { label: 'Annuler', value: null, cls: 'bouton-secondaire' }]);
      if (!vers) return;
    }
    await changerStatut(id, vers); rafraichir();
  });

  // Menu sur téléphone
  const boutonMenu = document.getElementById('bouton-menu');
  boutonMenu.addEventListener('click', () => { const o = document.body.classList.toggle('menu-ouvert'); document.getElementById('voile').hidden = !o; boutonMenu.setAttribute('aria-expanded', o); });
  document.getElementById('voile').addEventListener('click', () => { document.body.classList.remove('menu-ouvert'); document.getElementById('voile').hidden = true; });
  document.getElementById('bouton-deconnexion').addEventListener('click', deconnexion);
  window.addEventListener('hashchange', route);
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.pret) { S.pret = false; ecranEmail(); } });

  aiguiller();
})();
