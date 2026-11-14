/* =============================================================================
 * Espace Abdel — appli téléphone
 * Abdel y voit uniquement les clients qu'Émilie lui apporte (dès le rendez-vous),
 * les devis qu'elle lui a transmis et ceux qu'il crée, les contrats signés et la
 * rémunération d'Émilie (page commune). La base de données applique ces règles
 * (rôle « gérant ») ; l'appli applique les mêmes filtres pour l'aperçu d'Émilie.
 * ============================================================================= */
(function () {
  'use strict';
  const C = window.Core;
  const cfg = window.ABDEL_CONFIG;
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseCle, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const contenu = document.getElementById('contenu');
  const onglets = document.getElementById('onglets');

  const S = { role: null, email: '', prospects: {}, devis: {}, params: {}, filtre: 'avenir', brouillon: null };
  const apercu = () => S.role === 'membre';

  /* ---------- Outils ---------- */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => C.num(v);
  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
  const eur2 = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0);
  const nf = (n, d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n || 0);
  const today = () => C.today();
  const fd = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
  const jourLong = iso => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return fd(iso); const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); const h = String(iso).length > 10 ? ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ') : ''; return s.charAt(0).toUpperCase() + s.slice(1) + h; };
  const fdt = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? fd(iso) : d.toLocaleDateString('fr-FR') + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const r2 = n => Math.round(n * 100) / 100;
  function notif(t, err) { const n = document.createElement('div'); n.className = 'notif' + (err ? ' erreur' : ''); n.textContent = t; document.getElementById('notifs').appendChild(n); setTimeout(() => n.remove(), 3800); }
  function occupe(b, oui, t) { if (!b) return; if (oui) { b.dataset.t = b.textContent; b.textContent = t || '…'; b.disabled = true; } else { b.textContent = b.dataset.t || b.textContent; b.disabled = false; } }
  const telLien = t => 'tel:' + String(t || '').replace(/[^\d+]/g, '');
  const carteLien = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

  /* ---------- Règles de partage (identiques à la base) ---------- */
  const partage = p => ['rdv', 'propo', 'devis', 'nego', 'gagne'].includes(p.status) || (p.reached || []).includes('rdv') || !!p.partageAbdel;
  const devisVisible = d => !!d.transmisAbdel || d.auteur === 'abdel';
  const ETAT = {
    rdv: ['Rendez-vous', 'violet'], propo: ['Devis à faire', 'orange'], devis: ['Devis envoyé', 'bleu'], nego: ['Négociation', 'orange'],
    gagne: ['Signé ✓', 'vert'], perdu: ['Perdu', 'rouge'], relance: ['À relancer plus tard', ''],
  };
  const etat = p => ETAT[p.status] || ['En cours', 'bleu'];
  const STATUT_DEVIS = { brouillon: ['Brouillon', ''], a_valider: ['À valider', 'orange'], pret: ['Prêt à envoyer', 'bleu'], envoye: ['Envoyé', 'violet'], accepte: ['Accepté ✓', 'vert'], refuse: ['Refusé', 'rouge'] };
  const activite = p => p.secu && p.net ? 'mixte' : p.net ? 'net' : 'secu';
  const activiteTexte = p => [p.secu ? '🛡 Sécurité' : '', p.net ? '✦ Nettoyage' : ''].filter(Boolean).join(' + ') || '🛡 Sécurité';
  const interlocuteur = p => { const c = p.contacts || {}; const v = c.securite || c.sg || c.site || c.achats || c.dirigeant || ''; return String(v).split(/[—(,]/)[0].trim(); };
  const fonctionContact = p => { const c = p.contacts || {}; const v = c.securite || c.sg || c.site || c.achats || c.dirigeant || ''; const m = String(v).match(/—\s*([^()]+)/); return m ? m[1].trim() : ''; };
  const adresse = p => [p.address, [p.cp, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || p.city || '';
  const clients = () => Object.values(S.prospects).filter(partage);
  const devisDe = pid => Object.values(S.devis).filter(d => d.prospectId === pid && devisVisible(d)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  /* ---------- Devis : calculs ---------- */
  const plancher = d => d.societe === 'secu' ? num(S.params.rateSecu) : (d.produits ? num(S.params.rateNetProduits) : num(S.params.rateNetClient));
  function totaux(d) {
    const lignes = (d.lignes || []).map(l => ({ ...l, montant: r2(num(l.heures) * num(l.taux)) }));
    const brut = r2(lignes.reduce((a, l) => a + l.montant, 0)), remise = r2(brut * num(d.remisePct) / 100), ht = r2(brut - remise);
    const tva = r2(ht * num(d.tvaPct) / 100), heures = lignes.reduce((a, l) => a + num(l.heures), 0);
    const sous = lignes.some(l => num(l.taux) && num(l.taux) < plancher(d));
    return { lignes, brut, remise, ht, tva, ttc: r2(ht + tva), heures, sous };
  }
  const valeurMois = p => C.monthlyValue(p, S.params);

  /* ---------- Rémunération d'Émilie (page commune) ---------- */
  function moisEntre(debut, fin) { if (!debut) return 0; const a = new Date(debut), b = new Date(fin); return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + (b.getDate() >= a.getDate() ? 1 : 0)); }
  function remuneration(p) {
    const parMois = C.totalHours(p) * num(S.params.commHour);
    const ecoules = moisEntre(p.contractStart || (p.wonAt || '').slice(0, 10), today());
    const duree = num(S.params.commMonths);
    return { parMois, percu: parMois * (duree ? Math.min(ecoules, duree) : ecoules) };
  }

  /* ---------- Connexion ---------- */
  function ecran(html) { onglets.hidden = true; document.getElementById('zone-compte').hidden = true; contenu.innerHTML = html; const i = contenu.querySelector('input'); if (i) i.focus(); }
  function ecranEmail(msg) {
    ecran(`<div class="titre-page"><p class="surtitre">Bienvenue</p><h1>Ton espace Abdel</h1><p class="chapo">Tes rendez-vous, tes devis et tes contrats au même endroit. Saisis ton adresse e-mail : tu reçois un code de connexion.</p></div>
      <form class="bloc formulaire" id="f-email" novalidate><label>Adresse e-mail<input id="email" type="email" inputmode="email" autocomplete="email" required value="${esc(S.email)}"></label>
      ${msg ? `<p class="message erreur">${esc(msg)}</p>` : ''}<div id="zone"></div><button class="bouton large" type="submit">Recevoir mon code</button></form>`);
    document.getElementById('f-email').addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return (document.getElementById('zone').innerHTML = '<p class="message erreur">Adresse e-mail invalide.</p>');
      const b = e.target.querySelector('button'); occupe(b, true, 'Envoi…');
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      occupe(b, false);
      if (error && !/signups not allowed|not found/i.test(error.message)) return (document.getElementById('zone').innerHTML = `<p class="message erreur">${/rate|seconds/i.test(error.message) ? 'Trop de demandes : patiente une minute.' : 'Envoi impossible pour le moment.'}</p>`);
      S.email = email; ecranCode();
    });
  }
  function ecranCode() {
    ecran(`<div class="titre-page"><p class="surtitre">Connexion</p><h1>Regarde tes e-mails</h1><p class="chapo">Si ${esc(S.email)} a un compte, un code vient de partir.</p></div>
      <form class="bloc formulaire" id="f-code" novalidate><label>Code reçu par e-mail<input id="code" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></label>
      <div id="zone"></div><button class="bouton large" type="submit">Valider</button><button class="lien" type="button" id="autre">Changer d'adresse</button></form>`);
    document.getElementById('autre').addEventListener('click', () => ecranEmail());
    document.getElementById('f-code').addEventListener('submit', async e => {
      e.preventDefault();
      const code = document.getElementById('code').value.replace(/\D/g, '');
      const b = e.target.querySelector('button[type=submit]'); occupe(b, true, 'Vérification…');
      const { error } = await sb.auth.verifyOtp({ email: S.email, token: code, type: 'email' });
      occupe(b, false);
      if (error) return (document.getElementById('zone').innerHTML = '<p class="message erreur">Code incorrect ou expiré.</p>');
      aiguiller();
    });
  }
  // Double authentification : première fois → on l'active ici (QR code), ensuite → code à 6 chiffres.
  async function ecranMfa() {
    const { data } = await sb.auth.mfa.listFactors();
    let facteur = (data && data.totp || []).find(f => f.status === 'verified');
    let qr = '', secret = '';
    if (!facteur) {
      for (const f of (data && data.totp || [])) await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data: inscr, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Espace Abdel' });
      if (error) return ecranMessage('Sécurité', 'Activation de la double authentification impossible pour le moment. Réessaie dans un instant.');
      facteur = inscr; qr = inscr.totp.qr_code; secret = inscr.totp.secret;
    }
    ecran(`<div class="titre-page"><p class="surtitre">Sécurité</p><h1>${qr ? 'Protège ton compte' : 'Code de sécurité'}</h1>
      <p class="chapo">${qr ? 'Une seule fois : installe <b>Google Authenticator</b> (ou une appli équivalente), scanne ce code, puis saisis les 6 chiffres affichés.' : 'Ouvre ton appli d\'authentification et saisis les 6 chiffres affichés pour « Espace Abdel ».'}</p></div>
      <form class="bloc formulaire" id="f-mfa" novalidate>
        ${qr ? `<img src="${esc(qr)}" alt="QR code à scanner" width="200" height="200"><p class="aide">Sur le même téléphone ? Dans l'appli, choisis « Saisir une clé » et colle : <b>${esc(secret)}</b></p>` : ''}
        <label>Code à 6 chiffres<input id="mfa" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
        <div id="zone"></div><button class="bouton large" type="submit">Valider</button></form>`);
    document.getElementById('f-mfa').addEventListener('submit', async e => {
      e.preventDefault();
      const b = e.target.querySelector('button'); occupe(b, true, 'Vérification…');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: facteur.id, code: document.getElementById('mfa').value.replace(/\D/g, '') });
      occupe(b, false);
      if (error) return (document.getElementById('zone').innerHTML = '<p class="message erreur">Code incorrect. Attends le code suivant et réessaie.</p>');
      aiguiller();
    });
  }
  function ecranMessage(titre, texte) {
    ecran(`<div class="titre-page"><p class="surtitre">Accès</p><h1>${esc(titre)}</h1><p class="chapo">${esc(texte)}</p></div><button class="bouton second" id="deco" type="button">Se déconnecter</button>`);
    document.getElementById('deco').addEventListener('click', deconnexion);
  }
  async function deconnexion() { await sb.auth.signOut(); S.prospects = {}; S.devis = {}; S.role = null; location.hash = '#/'; ecranEmail(); }

  async function quelRole() {
    const r = await sb.rpc('abdel_mon_role');
    if (!r.error) return r.data;
    const m = await sb.rpc('abdel_suis_membre'); // avant la mise en place du rôle gérant
    return !m.error && m.data ? 'membre' : null;
  }
  async function aiguiller() {
    const { data: s } = await sb.auth.getSession();
    if (!s || !s.session) return ecranEmail();
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== 'aal2') return ecranMfa();
    S.role = await quelRole();
    if (!S.role) return ecranMessage('Accès non autorisé', 'Ce compte n\'a pas encore accès à l\'espace Abdel. Demande à Émilie de l\'activer.');
    S.email = s.session.user.email;
    try { await charger(); } catch (e) { contenu.innerHTML = `<p class="message erreur">Lecture impossible : ${esc(e.message || e)}. Recharge la page.</p>`; return; }
    document.getElementById('zone-compte').hidden = false;
    document.getElementById('retour-crm').hidden = !apercu();
    document.getElementById('bandeau-apercu').hidden = !apercu();
    onglets.hidden = false;
    route();
  }

  /* ---------- Données ---------- */
  async function lire(table) {
    let tout = [], de = 0;
    for (;;) { const { data, error } = await sb.from(table).select('id,data').range(de, de + 999); if (error) throw error; tout = tout.concat(data); if (data.length < 1000) break; de += 1000; }
    return tout;
  }
  async function charger() {
    const [p, d] = await Promise.all([lire('abdel_prospects'), lire('abdel_devis').catch(() => [])]);
    S.prospects = {}; p.forEach(r => { const x = { ...r.data, id: r.id }; if (partage(x)) S.prospects[r.id] = x; });
    S.devis = {}; d.forEach(r => { const x = { ...r.data, id: r.id }; if (devisVisible(x)) S.devis[r.id] = x; });
    let prm = await sb.rpc('abdel_espace_parametres');
    if (prm.error) { const r = await sb.from('abdel_parametres').select('data').eq('id', 'main').maybeSingle(); prm = { data: r.data ? r.data.data : {} }; }
    S.params = { ...C.DEFAULT_SETTINGS, ...(prm.data || {}) };
  }
  async function ecrireDevis(d) {
    if (apercu()) { notif('Aperçu : cette action sera faite par Abdel depuis son téléphone.'); return false; }
    const doc = clone(d); delete doc.id;
    const { error } = await sb.from('abdel_devis').upsert({ id: d.id, prospect_id: d.prospectId, data: doc });
    if (error) { notif('Enregistrement impossible : ' + error.message, true); return false; }
    S.devis[d.id] = d; return true;
  }

  /* ---------- Navigation ---------- */
  const ONGLETS = [['', 'Accueil', '⌂'], ['clients', 'Clients', '👥'], ['devis', 'Devis', '📄'], ['gains', 'Contrats', '★']];
  function dessinerOnglets(nom) {
    const aValider = Object.values(S.devis).filter(d => d.statut === 'a_valider').length;
    onglets.innerHTML = ONGLETS.map(([k, l, i]) => `<a class="onglet" href="#/${k}"${(nom || '') === k || (k === 'clients' && nom === 'client') ? ' aria-current="page"' : ''}><span class="ico" aria-hidden="true">${i}</span>${l}${k === 'devis' && aValider ? `<span class="badge">${aValider}</span>` : ''}</a>`).join('');
  }
  function route() {
    const [nom, a, b] = (location.hash || '#/').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    dessinerOnglets(nom);
    const pages = { '': pAccueil, clients: pClients, client: () => pClient(a), devis: () => a === 'nouveau' ? pEditeur(null, b) : a === 'modifier' ? pEditeur(b) : a ? pDevis(a) : pListeDevis(), gains: pGains };
    contenu.innerHTML = (pages[nom || ''] || pAccueil)();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { if (S.role) route(); });

  /* ---------- Composants ---------- */
  function carteClient(p) {
    const [lib, coul] = etat(p);
    const rdvAVenir = p.rdvDate && p.rdvDate.slice(0, 10) >= today();
    const h = C.totalHours(p), v = valeurMois(p);
    const qui = interlocuteur(p);
    return `<li><a class="carte ${activite(p)}" href="#/client/${encodeURIComponent(p.id)}">
      <div class="carte-haut"><div><div class="carte-nom">${esc(p.name)}</div><div class="carte-lieu">${esc(p.city || '')}${p.city ? ' · ' : ''}${activiteTexte(p)}</div></div><span class="pastille ${coul}">${lib}</span></div>
      ${rdvAVenir ? `<div class="carte-rdv"><span aria-hidden="true">📅</span><span class="jour">${esc(jourLong(p.rdvDate))}</span></div>` : ''}
      <div class="carte-infos">${qui ? `<span class="info">👤 <b>${esc(qui)}</b></span>` : ''}${p.need ? `<span class="info">🎯 ${esc(String(p.need).slice(0, 70))}</span>` : ''}</div>
      ${h ? `<div class="carte-montant"><span>${nf(h)} h / mois</span><b>${eur(v)} <small>HT / mois</small></b></div>` : ''}
    </a></li>`;
  }
  function carteDevis(d) {
    const p = S.prospects[d.prospectId] || {}, t = totaux(d), [lib, coul] = STATUT_DEVIS[d.statut] || STATUT_DEVIS.brouillon;
    return `<li><a class="carte ${d.societe === 'net' ? 'net' : ''}" href="#/devis/${encodeURIComponent(d.id)}">
      <div class="carte-haut"><div><div class="carte-nom">${esc(p.name || d.client && d.client.nom || 'Client')}</div><div class="carte-lieu">${esc(d.numero)} · ${d.societe === 'secu' ? '🛡 Sécurité' : '✦ Nettoyage'} · ${fd(d.date)}</div></div><span class="pastille ${coul}">${lib}</span></div>
      ${t.sous ? '<div class="carte-infos"><span class="pastille orange">Taux sous ton tarif</span></div>' : ''}
      <div class="carte-montant"><span>${nf(t.heures, 1)} h / mois</span><b>${eur2(t.ht)} <small>HT / mois</small></b></div></a></li>`;
  }
  const chiffre = (v, l, cls, href) => `<a class="chiffre ${cls || ''}" href="${href || '#/'}"><b>${v}</b><span>${esc(l)}</span></a>`;

  /* ---------- Pages ---------- */
  function pAccueil() {
    const cl = clients(), t = today();
    const rdv = cl.filter(p => p.rdvDate && p.rdvDate.slice(0, 10) >= t && p.status !== 'perdu').sort((a, b) => a.rdvDate.localeCompare(b.rdvDate));
    const aValider = Object.values(S.devis).filter(d => d.statut === 'a_valider');
    const signes = cl.filter(p => p.status === 'gagne');
    const ca = signes.reduce((a, p) => a + valeurMois(p), 0);
    const enCours = cl.filter(p => ['rdv', 'propo', 'devis', 'nego'].includes(p.status));
    const prenom = apercu() ? 'Abdel' : (S.email.split('@')[0].split(/[._-]/)[0] || '');
    return `<div class="titre-page"><p class="surtitre">${esc(jourLong(t))}</p><h1>Bonjour ${esc(prenom.charAt(0).toUpperCase() + prenom.slice(1))} 👋</h1><p class="chapo">Voici les clients qu'Émilie t'a apportés.</p></div>
      <div class="chiffres">${chiffre(nf(rdv.length), 'rendez-vous à venir', 'violet', '#/clients')}${chiffre(nf(aValider.length), 'devis à valider', aValider.length ? 'rouge' : 'soleil', '#/devis')}${chiffre(nf(signes.length), 'contrats signés', 'vert', '#/gains')}${chiffre(eur(ca), 'CA HT / mois signé', 'vert', '#/gains')}</div>
      ${aValider.length ? `<section class="section"><div class="section-tete"><h2>⚠ Devis à valider</h2><span class="compte">${aValider.length}</span></div><ul class="cartes">${aValider.map(carteDevis).join('')}</ul></section>` : ''}
      <section class="section"><div class="section-tete"><h2>📅 Prochains rendez-vous</h2><span class="compte">${rdv.length}</span></div>
        ${rdv.length ? `<ul class="cartes">${rdv.slice(0, 5).map(carteClient).join('')}</ul>` : '<p class="vide">Aucun rendez-vous à venir pour le moment.</p>'}</section>
      <section class="section"><div class="section-tete"><h2>En cours</h2><span class="compte">${enCours.length} · ${eur(enCours.reduce((a, p) => a + valeurMois(p), 0))} HT / mois possibles</span></div>
        ${enCours.length ? `<ul class="cartes">${enCours.filter(p => !rdv.includes(p)).slice(0, 5).map(carteClient).join('') || '<p class="aide">Tous ont un rendez-vous ci-dessus.</p>'}</ul>` : '<p class="vide">Rien en cours.</p>'}</section>`;
  }

  const FILTRES = [['avenir', 'Rendez-vous'], ['devis', 'Devis en cours'], ['signes', 'Signés'], ['tous', 'Tous']];
  function pClients() {
    const t = today(), f = S.filtre;
    let cl = clients();
    if (f === 'avenir') cl = cl.filter(p => p.status === 'rdv' || (p.rdvDate && p.rdvDate.slice(0, 10) >= t && p.status !== 'perdu'));
    if (f === 'devis') cl = cl.filter(p => ['propo', 'devis', 'nego'].includes(p.status));
    if (f === 'signes') cl = cl.filter(p => p.status === 'gagne');
    cl.sort((a, b) => (a.rdvDate || '9').localeCompare(b.rdvDate || '9') || (a.name || '').localeCompare(b.name || ''));
    return `<div class="titre-page"><p class="surtitre">Clients</p><h1>Mes clients</h1></div>
      <div class="filtres">${FILTRES.map(([k, l]) => `<button type="button" class="filtre" data-filtre="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
      ${cl.length ? `<ul class="cartes">${cl.map(carteClient).join('')}</ul>` : '<p class="vide">Aucun client dans cette liste.</p>'}`;
  }

  function pClient(id) {
    const p = S.prospects[id];
    if (!p) return '<p class="vide">Client introuvable.</p><a class="bouton second" href="#/clients">← Mes clients</a>';
    const [lib, coul] = etat(p), qui = interlocuteur(p), fct = fonctionContact(p), adr = adresse(p);
    // Notes internes des agents automatiques (veille) : inutiles pour Abdel.
    const hist = (p.history || []).filter(e => ['call', 'note', 'status'].includes(e.type) && !(e.type === 'note' && /^(Fiche créée par l'agent|Nouveau signal|Contact trouvé par l'agent|Agent )/i.test(e.text || ''))).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const ligneHist = e => {
      if (e.type === 'call') return `<li class="appel"><div class="quand">${fdt(e.ts)} · Appel d'Émilie</div><div class="quoi">${esc(e.result || '')}${e.contact ? ' avec ' + esc(e.contact) : ''}</div>${e.need ? `<div class="detail">Besoin : ${esc(e.need)}</div>` : ''}${e.objections ? `<div class="detail">Freins : ${esc(e.objections)}</div>` : ''}${e.note ? `<div class="detail">${esc(e.note)}</div>` : ''}</li>`;
      if (e.type === 'note') return `<li class="${e.auteur === 'abdel' ? 'abdel' : /^Devis /.test(e.text || '') ? 'devis' : 'note'}"><div class="quand">${fdt(e.ts)} · ${e.auteur === 'abdel' ? 'Ta note' : 'Note d\'Émilie'}</div><div class="detail">${esc(e.text || e.note || '')}</div></li>`;
      return `<li><div class="quand">${fdt(e.ts)}</div><div class="detail">Étape : <b>${esc(C.STATUS_LABEL[e.to] || e.to)}</b></div></li>`;
    };
    const dv = devisDe(id);
    const h = C.totalHours(p);
    return `<a class="lien" href="#/clients">← Mes clients</a>
      <div class="fiche-tete"><div class="pastilles"><span class="pastille ${coul}">${lib}</span><span class="pastille ${activite(p) === 'net' ? 'menthe' : 'bleu'}">${activiteTexte(p)}</span></div>
        <h1>${esc(p.name)}</h1>${adr ? `<p class="chapo">📍 ${esc(adr)}</p>` : ''}</div>
      <div class="actions-rapides">
        <a class="action vert" href="${p.phone ? telLien(p.phone) : '#'}"${p.phone ? '' : ' aria-disabled="true"'}><span class="ico">☎</span>Appeler</a>
        <a class="action" href="${adr ? carteLien(p.name + ' ' + adr) : '#'}" target="_blank" rel="noopener"${adr ? '' : ' aria-disabled="true"'}><span class="ico">🧭</span>Itinéraire</a>
        <a class="action violet" href="${p.email ? 'mailto:' + esc(p.email) : '#'}"${p.email ? '' : ' aria-disabled="true"'}><span class="ico">✉</span>E-mail</a></div>
      ${p.rdvDate ? `<div class="bloc"><h2>📅 Rendez-vous</h2><p class="carte-rdv"><span class="jour">${esc(jourLong(p.rdvDate))}</span></p>${qui ? `<p>Avec <b>${esc(qui)}</b>${fct ? `, ${esc(fct)}` : ''}</p>` : ''}</div>` : ''}
      <div class="bloc"><h2>L'essentiel</h2><dl class="lignes-info">
        ${qui ? `<div><dt>Interlocuteur</dt><dd>${esc(qui)}${fct ? ` · ${esc(fct)}` : ''}</dd></div>` : ''}
        ${p.phone ? `<div><dt>Téléphone</dt><dd><a href="${telLien(p.phone)}">${esc(p.phone)}</a></dd></div>` : ''}
        ${p.email ? `<div><dt>E-mail</dt><dd>${esc(p.email)}</dd></div>` : ''}
        ${p.need ? `<div><dt>Besoin</dt><dd>${esc(p.need)}</dd></div>` : ''}
        <div><dt>Volume estimé</dt><dd>${h ? `${nf(h)} h / mois · ${eur(valeurMois(p))} HT` : 'À préciser au rendez-vous'}</dd></div>
        ${p.nextAction ? `<div><dt>Prochaine étape</dt><dd>${esc(p.nextAction)}${p.nextDate ? ' · ' + fd(p.nextDate) : ''}</dd></div>` : ''}
      </dl></div>
      <div class="bloc"><div class="section-tete"><h2>📄 Devis</h2><span class="compte">${dv.length}</span></div>
        ${dv.length ? `<ul class="cartes">${dv.map(carteDevis).join('')}</ul>` : '<p class="aide">Pas encore de devis.</p>'}
        <div class="boutons">${p.secu || !p.net ? `<a class="bouton" href="#/devis/nouveau/${encodeURIComponent(id)}?secu">+ Devis sécurité</a>` : ''}${p.net ? `<a class="bouton vert" href="#/devis/nouveau/${encodeURIComponent(id)}?net">+ Devis nettoyage</a>` : ''}</div></div>
      <div class="bloc"><h2>💬 Échanges avec le client</h2>
        <form class="formulaire" id="f-note" data-id="${esc(id)}"><label>Ajouter une note (après le rendez-vous, un appel…)<textarea name="texte" placeholder="Ex. : visite faite, il veut 2 agents la nuit du vendredi au dimanche."></textarea></label><button class="bouton second" type="submit">Enregistrer la note</button></form>
        ${hist.length ? `<ul class="fil">${hist.map(ligneHist).join('')}</ul>` : '<p class="aide">Aucun échange noté.</p>'}</div>`;
  }

  function pListeDevis() {
    const tous = Object.values(S.devis).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const groupes = [['À valider', tous.filter(d => d.statut === 'a_valider')], ['En préparation', tous.filter(d => ['brouillon', 'pret'].includes(d.statut))], ['Envoyés', tous.filter(d => d.statut === 'envoye')], ['Acceptés', tous.filter(d => d.statut === 'accepte')], ['Refusés', tous.filter(d => d.statut === 'refuse')]];
    return `<div class="titre-page"><p class="surtitre">Devis</p><h1>Mes devis</h1><p class="chapo">Ceux qu'Émilie t'a transmis et ceux que tu as créés. Pour en faire un, ouvre la fiche du client.</p></div>
      ${tous.length ? groupes.filter(g => g[1].length).map(([t, l]) => `<section class="section"><div class="section-tete"><h2>${t}</h2><span class="compte">${l.length}</span></div><ul class="cartes">${l.map(carteDevis).join('')}</ul></section>`).join('') : '<p class="vide">Aucun devis pour le moment.</p>'}`;
  }

  function documentDevis(d) {
    const s = S.params, t = totaux(d), secu = d.societe === 'secu';
    const nom = secu ? (s.companySecu || 'Société de sécurité') : (s.companyNet || 'Société de nettoyage');
    return `<div class="doc-devis"><div><b>${esc(nom)}</b><br><span class="aide">${esc((secu ? s.secuAdresse : s.netAdresse) || '')}${(secu ? s.secuSiret : s.netSiret) ? ' · SIRET ' + esc(secu ? s.secuSiret : s.netSiret) : ''}${secu && s.cnaps ? ' · CNAPS ' + esc(s.cnaps) : ''}</span></div>
      <div><b>Devis ${esc(d.numero)}</b> du ${fd(d.date)} · pour <b>${esc(d.client && d.client.nom || '')}</b>${d.client && d.client.contact ? ', à l\'attention de ' + esc(d.client.contact) : ''}</div>
      <table><thead><tr><th>Prestation</th><th class="n">h / mois</th><th class="n">€ HT / h</th><th class="n">Total</th></tr></thead><tbody>${t.lignes.map(l => `<tr><td>${esc(l.libelle)}</td><td class="n">${nf(num(l.heures), 2)}</td><td class="n">${eur2(l.taux)}</td><td class="n">${eur2(l.montant)}</td></tr>`).join('')}</tbody></table>
      <div class="totaux">${t.remise ? `<span>Remise ${nf(d.remisePct, 2)} %</span><span>− ${eur2(t.remise)}</span>` : ''}<span>Total HT / mois</span><span class="fort">${eur2(t.ht)}</span><span>TVA ${nf(d.tvaPct, 2)} %</span><span>${eur2(t.tva)}</span><span><b>Total TTC / mois</b></span><span><b>${eur2(t.ttc)}</b></span></div>
      <p class="aide">${d.debut ? 'Début souhaité : ' + fd(d.debut) + ' · ' : ''}Durée : ${nf(d.dureeMois)} mois · Validité : ${nf(d.validiteJours)} jours</p></div>`;
  }
  function pDevis(id) {
    const d = S.devis[id];
    if (!d) return '<p class="vide">Devis introuvable.</p><a class="bouton second" href="#/devis">← Mes devis</a>';
    const p = S.prospects[d.prospectId] || {}, t = totaux(d), [lib, coul] = STATUT_DEVIS[d.statut] || STATUT_DEVIS.brouillon;
    const sien = d.auteur === 'abdel', modifiable = sien && ['brouillon', 'pret'].includes(d.statut);
    return `<a class="lien" href="${p.id ? '#/client/' + encodeURIComponent(p.id) : '#/devis'}">← ${esc(p.name || 'Mes devis')}</a>
      <div class="fiche-tete"><div class="pastilles"><span class="pastille ${coul}">${lib}</span><span class="pastille">${sien ? 'Créé par toi' : 'Préparé par Émilie'}</span></div><h1>Devis ${esc(d.numero)}</h1></div>
      <div class="chiffres">${chiffre(eur2(t.ht), 'HT / mois', 'violet')}${chiffre(nf(t.heures, 1) + ' h', 'par mois')}${chiffre(eur(t.ht * 12), 'HT sur 12 mois', 'vert')}${chiffre(eur2(t.ttc), 'TTC / mois', 'soleil')}</div>
      ${d.statut === 'a_valider' ? `<div class="bloc"><h2>Ta validation</h2><p class="message alerte">${t.sous ? `Taux sous ton tarif habituel (${eur2(plancher(d))} / h). Émilie a besoin de ton accord avant de l'envoyer.` : 'Émilie te demande de valider ce devis avant de l\'envoyer.'}</p>
        <div class="boutons"><button class="bouton vert" type="button" data-action="valider" data-id="${esc(d.id)}">✓ Je valide</button><button class="bouton danger" type="button" data-action="refuser" data-id="${esc(d.id)}">Je refuse</button></div></div>` : ''}
      ${documentDevis(d)}
      ${modifiable ? `<div class="boutons"><a class="bouton second" href="#/devis/modifier/${encodeURIComponent(d.id)}">✏ Modifier</a><button class="bouton danger" type="button" data-action="supprimer" data-id="${esc(d.id)}">Supprimer</button></div>` : ''}
      <p class="message info">Bientôt : envoi au client par e-mail avec un bouton « J'accepte », directement depuis ici.</p>
      ${(d.historique || []).length ? `<div class="bloc"><h2>Suivi</h2><ul class="fil">${d.historique.slice().reverse().map(h => `<li><div class="quand">${fdt(h.ts)}</div><div class="detail">${esc(h.texte)}</div></li>`).join('')}</ul></div>` : ''}`;
  }

  function nouveauDevis(p, societe) {
    const secu = societe === 'secu', an = today().slice(0, 4);
    const n = Object.values(S.devis).map(x => (x.numero || '').match(new RegExp(`^DA-${an}-(\\d+)$`))).filter(Boolean).map(m => +m[1]);
    const d = { id: 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), prospectId: p.id, auteur: 'abdel', numero: `DA-${an}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`,
      date: today(), validiteJours: 30, societe, produits: secu ? false : !!p.netProduits, client: { nom: p.name || '', adresse: adresse(p), contact: interlocuteur(p), email: p.email || '' },
      lignes: [], remisePct: 0, tvaPct: 20, dureeMois: 12, debut: '', conditions: S.params.devisConditions || '', statut: 'brouillon', historique: [{ ts: new Date().toISOString(), texte: 'Devis créé par Abdel' }] };
    d.lignes.push({ libelle: secu ? 'Surveillance et gardiennage par agent de sécurité titulaire de la carte professionnelle' : 'Entretien des locaux', heures: (secu ? num(p.hoursSecu) : num(p.hoursNet)) || '', taux: plancher(d) });
    return d;
  }
  function pEditeur(id, pid) {
    const [pidPropre, qs] = String(pid || '').split('?');
    if (!S.brouillon || (id && S.brouillon.id !== id) || (!id && S.brouillon.prospectId !== pidPropre)) {
      if (id) S.brouillon = clone(S.devis[id] || {}); else { const p = S.prospects[pidPropre]; if (!p) return '<p class="vide">Client introuvable.</p>'; S.brouillon = nouveauDevis(p, qs === 'net' ? 'net' : 'secu'); }
    }
    const d = S.brouillon, t = totaux(d), p = S.prospects[d.prospectId] || {};
    return `<a class="lien" href="#/client/${encodeURIComponent(d.prospectId)}">← ${esc(p.name || '')}</a>
      <div class="titre-page"><p class="surtitre">${d.societe === 'secu' ? '🛡 Devis sécurité' : '✦ Devis nettoyage'} · ${esc(d.numero)}</p><h1>${id ? 'Modifier le devis' : 'Nouveau devis'}</h1></div>
      <form class="formulaire" id="f-devis">
        <div class="bloc"><h2>Client</h2><label>Entreprise<input name="client.nom" value="${esc(d.client.nom)}"></label><label>À l'attention de<input name="client.contact" value="${esc(d.client.contact)}"></label><label>E-mail<input type="email" name="client.email" value="${esc(d.client.email)}"></label></div>
        <div class="bloc"><h2>Prestations par mois</h2>
          ${d.societe === 'net' ? `<label class="aide"><span><input type="checkbox" name="produits"${d.produits ? ' checked' : ''}> Produits fournis par toi</span></label>` : ''}
          ${d.lignes.map((l, i) => `<div class="ligne-devis${num(l.taux) && num(l.taux) < plancher(d) ? ' sous' : ''}"><label class="large-l">Prestation<input name="l${i}.libelle" value="${esc(l.libelle)}"></label>
            <label>Heures / mois<input type="number" inputmode="decimal" min="0" step="any" name="l${i}.heures" value="${esc(l.heures)}"></label><label>€ HT / heure<input type="number" inputmode="decimal" min="0" step="0.01" name="l${i}.taux" value="${esc(l.taux)}"></label>
            <div class="montant"><span>Total</span><span>${eur2(num(l.heures) * num(l.taux))}</span></div></div>`).join('')}
          <div class="boutons"><button class="bouton second" type="button" data-action="ligne">+ Ligne</button>${d.lignes.length > 1 ? '<button class="bouton danger" type="button" data-action="ligne-moins">− Dernière ligne</button>' : ''}</div></div>
        <div class="bloc"><h2>Conditions</h2><label>Remise (%)<input type="number" inputmode="decimal" min="0" step="any" name="remisePct" value="${esc(d.remisePct)}"></label><label>Début souhaité<input type="date" name="debut" value="${esc(d.debut)}"></label><label>Durée (mois)<input type="number" min="1" name="dureeMois" value="${esc(d.dureeMois)}"></label></div>
        <div class="bloc" id="totaux"><div class="totaux"><span>Heures / mois</span><span>${nf(t.heures, 2)} h</span><span>Total HT / mois</span><span class="fort">${eur2(t.ht)}</span><span>TTC / mois</span><span>${eur2(t.ttc)}</span></div></div>
        <button class="bouton large" type="submit">Enregistrer le devis</button></form>`;
  }
  function lireEditeur(f) {
    const d = clone(S.brouillon);
    d.produits = !!(f.querySelector('[name=produits]') && f.querySelector('[name=produits]').checked);
    for (const [k, v] of new FormData(f).entries()) {
      if (k === 'produits') continue;
      const m = k.match(/^l(\d+)\.(\w+)$/);
      if (m) { d.lignes[+m[1]][m[2]] = m[2] === 'libelle' ? v : (v === '' ? '' : num(v)); continue; }
      if (k.startsWith('client.')) { d.client[k.slice(7)] = v; continue; }
      d[k] = ['remisePct', 'dureeMois'].includes(k) ? num(v) : v;
    }
    return d;
  }

  /* Tarif et durée d'un contrat signé : d'après le devis accepté, sinon d'après la fiche. */
  function infosContrat(p) {
    const d = devisDe(p.id).find(x => x.statut === 'accepte');
    const h = d ? totaux(d).heures : C.totalHours(p);
    const taux = d && h ? totaux(d).ht / h : (C.totalHours(p) ? valeurMois(p) / C.totalHours(p) : 0);
    const debut = p.contractStart || (d && d.debut) || '';
    const duree = d ? num(d.dureeMois) : 0;
    let fin = '';
    if (debut && duree) { const x = new Date(debut + 'T12:00:00'); x.setMonth(x.getMonth() + duree); x.setDate(x.getDate() - 1); fin = x.toISOString().slice(0, 10); }
    return (taux ? `<span class="info">Tarif : <b>${eur2(taux)} HT / h</b></span>` : '')
      + `<span class="info">Durée : <b>${duree ? nf(duree) + ' mois' : 'sans date de fin'}</b>${fin ? ` (jusqu'au ${fd(fin)})` : ''}</span>`;
  }
  function pGains() {
    const cl = clients(), signes = cl.filter(p => p.status === 'gagne').sort((a, b) => (b.wonAt || '').localeCompare(a.wonAt || ''));
    const heures = signes.reduce((a, p) => a + C.totalHours(p), 0), ca = signes.reduce((a, p) => a + valeurMois(p), 0);
    const nbRdv = cl.filter(p => (p.reached || []).includes('rdv') || p.rdvDate).length;
    const em = signes.reduce((a, p) => a + remuneration(p).parMois, 0), deja = signes.reduce((a, p) => a + remuneration(p).percu, 0) + nbRdv * num(S.params.commRdv);
    const regle = `${eur2(S.params.commHour)} par heure et par mois${num(S.params.commMonths) ? ` pendant ${nf(S.params.commMonths)} mois` : ', tant que le client reste'}${num(S.params.commRdv) ? ` + ${eur(S.params.commRdv)} par rendez-vous` : ''}`;
    return `<div class="titre-page"><p class="surtitre">Contrats</p><h1>Contrats signés</h1><p class="chapo">Les mêmes chiffres que ceux d'Émilie. Rémunération convenue : ${esc(regle)}.</p></div>
      <div class="chiffres">${chiffre(nf(signes.length), 'contrats signés', 'vert', '#/gains')}${chiffre(nf(heures) + ' h', 'heures / mois', '', '#/gains')}${chiffre(eur(ca), 'CA HT / mois', 'vert', '#/gains')}${chiffre(eur(ca * 12), 'CA HT / an', 'violet', '#/gains')}</div>
      ${signes.length ? `<ul class="cartes">${signes.map(p => `<li><a class="carte ${activite(p)}" href="#/client/${encodeURIComponent(p.id)}"><div class="carte-haut"><div><div class="carte-nom">${esc(p.name)}</div><div class="carte-lieu">Signé le ${fd(p.wonAt)}${p.contractStart ? ' · début ' + fd(p.contractStart) : ''}</div></div><span class="pastille vert">Signé ✓</span></div>
        <div class="carte-montant"><span>${nf(C.totalHours(p))} h / mois</span><b>${eur(valeurMois(p))} <small>HT / mois</small></b></div>
        <div class="carte-infos">${infosContrat(p)}<span class="info">Part d'Émilie : <b>${eur2(remuneration(p).parMois)}</b> / mois</span></div></a></li>`).join('')}</ul>` : '<p class="vide">Pas encore de contrat signé.</p>'}
      <div class="bloc"><h2>Rémunération d'Émilie</h2><dl class="lignes-info"><div><dt>Par mois</dt><dd>${eur2(em)}</dd></div><div><dt>Rendez-vous obtenus</dt><dd>${nf(nbRdv)}</dd></div><div><dt>Depuis le début</dt><dd>${eur2(deja)}</dd></div></dl></div>`;
  }

  /* ---------- Événements ---------- */
  document.addEventListener('click', async e => {
    const f = e.target.closest('[data-filtre]'); if (f) { S.filtre = f.dataset.filtre; return route(); }
    const a = e.target.closest('[data-action]'); if (!a) return;
    const act = a.dataset.action;
    const form = document.getElementById('f-devis');
    if (act === 'ligne' || act === 'ligne-moins') {
      S.brouillon = lireEditeur(form);
      if (act === 'ligne') S.brouillon.lignes.push({ libelle: '', heures: '', taux: plancher(S.brouillon) }); else S.brouillon.lignes.pop();
      return route();
    }
    if (['valider', 'refuser', 'supprimer'].includes(act)) {
      const d = clone(S.devis[a.dataset.id]); if (!d) return;
      if (apercu()) return notif('Aperçu : cette action sera faite par Abdel depuis son téléphone.');
      if (act === 'supprimer') {
        if (!confirm('Supprimer ce devis ?')) return;
        const { error } = await sb.from('abdel_devis').delete().eq('id', d.id);
        if (error) return notif('Suppression impossible.', true);
        delete S.devis[d.id]; notif('Devis supprimé'); location.hash = '#/devis'; return;
      }
      d.statut = act === 'valider' ? 'pret' : 'brouillon';
      d.historique = (d.historique || []).concat([{ ts: new Date().toISOString(), texte: act === 'valider' ? 'Tarif et devis validés par Abdel' : 'Refusé par Abdel : à revoir' }]);
      occupe(a, true, '…');
      if (await ecrireDevis(d)) { notif(act === 'valider' ? 'Devis validé : Émilie peut l\'envoyer' : 'Devis renvoyé à Émilie'); route(); } else occupe(a, false);
    }
  });
  document.addEventListener('input', e => {
    const f = e.target.form; if (!f || f.id !== 'f-devis') return;
    S.brouillon = lireEditeur(f);
    const t = totaux(S.brouillon), z = document.getElementById('totaux');
    if (z) z.innerHTML = `<div class="totaux"><span>Heures / mois</span><span>${nf(t.heures, 2)} h</span><span>Total HT / mois</span><span class="fort">${eur2(t.ht)}</span><span>TTC / mois</span><span>${eur2(t.ttc)}</span></div>`;
  });
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.id === 'f-note') {
      e.preventDefault();
      const texte = f.texte.value.trim(); if (!texte) return;
      if (apercu()) return notif('Aperçu : les notes d\'Abdel seront ajoutées depuis son téléphone.');
      const b = f.querySelector('button'); occupe(b, true, 'Enregistrement…');
      const { error } = await sb.rpc('abdel_espace_note', { p_id: f.dataset.id, p_texte: texte });
      occupe(b, false);
      if (error) return notif('Note non enregistrée : ' + error.message, true);
      const p = S.prospects[f.dataset.id]; p.history = (p.history || []).concat([{ type: 'note', ts: new Date().toISOString(), text: texte, auteur: 'abdel' }]);
      notif('Note enregistrée'); route();
    }
    if (f.id === 'f-devis') {
      e.preventDefault();
      const d = lireEditeur(f);
      if (!totaux(d).heures) return notif('Indique les heures par mois.', true);
      if (await ecrireDevis(d)) { S.brouillon = null; notif('Devis ' + d.numero + ' enregistré'); location.hash = '#/devis/' + encodeURIComponent(d.id); }
    }
  });
  document.getElementById('bouton-deconnexion').addEventListener('click', deconnexion);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});

  aiguiller();
})();
