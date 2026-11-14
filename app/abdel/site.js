/* =============================================================================
 * Abdel — site public : simulateurs, formulaire de demande, mentions légales.
 * Les demandes arrivent directement dans le CRM Abdel (fonction « abdel-estimation »).
 * Aucune donnée n'est gardée dans le navigateur.
 * ============================================================================= */
(function () {
  'use strict';
  const URL_FN = 'https://cafcevtehuywovvsllvp.supabase.co/functions/v1/abdel-estimation';
  const CLE = 'sb_publishable_sp8UoIBe7DMUKXei97PQAw_Kydu7pS8'; // clé PUBLIQUE (identifie le projet, ne donne aucun droit)
  const K = window.AbdelCalcul;
  const page = document.body.dataset.page || '';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
  const eur2 = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
  const nf = (v, d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v || 0);
  const pc = v => nf(v * 100) + ' %';

  let INFOS = null;
  let dernier = null;

  async function appel(corps) {
    const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CLE, Authorization: 'Bearer ' + CLE }, body: JSON.stringify(corps) });
    let j = {}; try { j = await r.json(); } catch (_) { }
    if (!r.ok) throw new Error(j.erreur || 'Le service ne répond pas. Merci de réessayer dans un instant.');
    return j;
  }

  /* ---------- Mentions (pied de page) ---------- */
  const MENTION_CNAPS = 'L\'autorisation d\'exercice délivrée par le CNAPS ne confère aucune prérogative de puissance publique à l\'entreprise ou aux personnes qui en bénéficient.';
  function blocSecu(i) {
    const s = i.securite;
    return `<p><b>${esc(s.societe)}</b>${s.siren ? ` · SIREN ${esc(s.siren)}` : ''} · Autorisation d'exercice CNAPS n° ${esc(s.cnaps)} (articles L612-9 et suivants du Code de la sécurité intérieure).</p><p>« ${MENTION_CNAPS} »</p>`;
  }
  function blocNet(i) {
    const n = i.nettoyage;
    return `<p><b>${esc(n.societe)}</b>${n.siren ? ` · SIREN ${esc(n.siren)}` : ''} · Nettoyage professionnel · ${esc(i.contact.ville)}</p>`;
  }
  function pied() {
    const z = $('#pied-legal'); if (!z || !INFOS) return;
    const parts = [];
    if (page === 'securite' || page === 'locale-secu') { if (INFOS.securite.actif) parts.push(blocSecu(INFOS)); }
    else if (page === 'nettoyage' || page === 'locale-net') parts.push(blocNet(INFOS));
    else { parts.push(blocNet(INFOS)); if (INFOS.securite.actif) parts.push(blocSecu(INFOS)); }
    parts.push('<p>Les activités de sécurité privée et de nettoyage sont exercées par deux sociétés distinctes. <a href="' + racine() + 'mentions-legales/">Mentions légales et données personnelles</a></p>');
    z.innerHTML = parts.join('');
  }
  function racine() { return document.body.dataset.racine || './'; }

  /* ---------- Simulateur sécurité ---------- */
  function lireSecu() {
    const f = $('#sim-secu');
    const v = n => (f.querySelector(`[name="${n}"]:checked`) || f.querySelector(`[name="${n}"]`) || {}).value;
    return { agents: v('agents'), plage: v('plage'), jours: v('jours'), dimanche: f.querySelector('[name="dimanche"]')?.checked, tarif: INFOS && INFOS.securite.tarif };
  }
  function rendreSecu() {
    const r = K.securite(lireSecu()); dernier = r;
    const i = r.interne, H = K.HYPOTHESES;
    const unAgent = Math.round(i.couvertureUnAgent * 100);
    $('#res-secu').innerHTML = `
      <p class="surtitre">Votre besoin</p>
      <p class="gros">${nf(r.heuresMois)} h <small style="font-size:1rem;color:var(--doux)">de présence par mois</small></p>
      <p class="aide">${r.agents} agent${r.agents > 1 ? 's' : ''} en même temps · ${esc(r.plageLibelle)} · ${r.jours} jour${r.jours > 1 ? 's' : ''} sur 7 · ${nf(r.heuresAn)} h par an.</p>
      <h3>Si vous recrutez en interne</h3>
      <div class="resultat">
        <div class="chiffre"><span>Agents à temps plein nécessaires (congés, absences)</span><b>${nf(i.etp, 1)}</b></div>
        <div class="chiffre"><span>Salaires bruts${i.majorations ? ' (dont majorations nuit et dimanche)' : ''}</span><b>${eur(i.brut)} / an</b></div>
        <div class="chiffre"><span>Charges patronales (après réductions)</span><b>${eur(i.charges)} / an</b></div>
        <div class="chiffre"><span>Équipement, carte pro, suivi médical, recrutement</span><b>${eur(i.annexes)} / an</b></div>
        <div class="chiffre"><span>Plannings et encadrement</span><b>${eur(i.encadrement)} / an</b></div>
        <div class="chiffre"><span><b>Coût complet estimé</b></span><b>${eur(i.mensuel)} / mois</b></div>
        <div class="chiffre"><span>Soit, par heure de présence réelle</span><b>${eur2(i.parHeure)}</b></div>
      </div>
      ${r.heuresAn > 1700 ? `<p class="encadre"><b>Un seul agent recruté ne couvrirait que ${unAgent} % de ce besoin.</b> Il vous faudrait au moins ${i.agentsMin} personnes, leurs plannings, leurs remplacements pendant les congés et les arrêts.</p>` : `<p class="encadre">Pour ${nf(r.heuresSemaine)} h par semaine, il faudrait recruter à temps partiel et prévoir chaque remplacement (congés, arrêts).</p>`}
      <h3>Avec Abdel</h3>
      ${r.externe ? `<div class="resultat"><div class="chiffre"><span>Prestation tout compris</span><b>${eur(r.externe.mensuel)} HT / mois</b></div><div class="chiffre"><span>Soit</span><b>${eur2(r.externe.parHeure)} HT / heure</b></div></div>` : ''}
      <ul class="points" style="grid-template-columns:1fr">
        <li>Aucun recrutement, aucune fiche de paie, aucun planning à gérer</li>
        <li>Remplacements assurés pendant les congés et les arrêts</li>
        <li>Agents titulaires de leur carte professionnelle CNAPS</li>
        <li>Dispositif ajustable : renfort ponctuel, nuits, week-ends, événements</li>
      </ul>
      ${r.externe ? '' : '<p class="encadre info">Recevez votre <b>comparatif chiffré avec le tarif Abdel</b> : laissez vos coordonnées ci-dessous, réponse sous 24 h ouvrées.</p>'}
      <details><summary>Comment ce calcul est fait</summary>
        <p class="aide">Salaire minimum : ${esc(H.secu.source)} (${eur2(H.secu.taux)} brut de l'heure). Majorations : nuit (21 h – 6 h) +10 %, dimanche +10 %. Un temps plein travaille ${nf(H.heuresTravailleesETP)} h par an (congés et jours fériés déduits) ; absences estimées à ${pc(H.absenteisme)}. Charges patronales nettes estimées à ${pc(H.charges)} du brut (après réduction générale), encadrement ${pc(H.encadrement)}. Ce sont des estimations prudentes, hors primes d'ancienneté et heures de jours fériés : le coût réel d'un salarié est souvent plus élevé.</p>
      </details>`;
  }

  /* ---------- Simulateur nettoyage ---------- */
  function lireNet() {
    const f = $('#sim-net');
    const v = n => (f.querySelector(`[name="${n}"]:checked`) || f.querySelector(`[name="${n}"]`) || {}).value;
    return { locaux: v('locaux'), surface: v('surface'), passages: v('passages'), approfondi: f.querySelector('[name="approfondi"]')?.checked, produits: v('produits'), horaires: v('horaires'),
      tarifClient: INFOS && INFOS.nettoyage.tarifClient, tarifProduits: INFOS && INFOS.nettoyage.tarifProduits };
  }
  function rendreNet() {
    const r = K.nettoyage(lireNet()); dernier = r;
    const z = $('#res-net');
    if (!r.surface) { z.innerHTML = '<p class="aide">Indiquez la surface de vos locaux pour voir l\'estimation.</p>'; return; }
    const i = r.interne, H = K.HYPOTHESES;
    z.innerHTML = `
      <p class="surtitre menthe">Votre estimation</p>
      ${r.externe ? `<p class="gros menthe">${eur(r.externe.mensuel)} <small style="font-size:1rem;color:var(--doux)">HT par mois</small></p>` : ''}
      <div class="resultat">
        <div class="chiffre"><span>Temps par passage (estimation)</span><b>${nf(r.heuresPassage, 1)} h</b></div>
        <div class="chiffre"><span>Heures par mois</span><b>${nf(r.heuresMois, 1)} h</b></div>
        ${r.externe ? `<div class="chiffre"><span>Tarif horaire (produits fournis par ${r.produitsAbdel ? 'Abdel' : 'vous'})</span><b>${eur2(r.externe.parHeure)} HT</b></div>
        <div class="chiffre"><span>Par an</span><b>${eur(r.externe.annuel)} HT</b></div>` : ''}
      </div>
      <p class="aide">Estimation indicative, à confirmer par une visite gratuite des locaux. Base : ${nf(r.ratio)} m² nettoyés par heure pour des ${esc(r.locauxLibelle.toLowerCase())}${r.approfondi ? ' en entretien approfondi' : ''}.</p>
      <h3>Et si vous embauchiez quelqu'un ?</h3>
      <div class="resultat">
        <div class="chiffre"><span>Poste à pourvoir</span><b>${nf(r.heuresSemaine, 1)} h / semaine</b></div>
        <div class="chiffre"><span>Coût complet estimé (salaire, charges, congés, absences, gestion)</span><b>${eur(i.mensuel)} / mois</b></div>
      </div>
      <p class="encadre">Un poste de ${nf(r.heuresSemaine, 1)} h par semaine est difficile à pourvoir et à remplacer pendant les congés.En interne, il faut aussi acheter le matériel et les produits. Avec Abdel : une seule facture, des remplacements assurés, un interlocuteur qui contrôle la qualité.</p>
      <details><summary>Comment ce calcul est fait</summary>
        <p class="aide">Salaire minimum : ${esc(H.net.source)}. Majoration de nuit +20 %. Un temps plein travaille ${nf(H.heuresTravailleesETP)} h par an ; absences estimées à ${pc(H.absenteisme)} ; charges patronales nettes estimées à ${pc(H.charges)} ; gestion ${pc(H.encadrement)}. Estimation prudente, hors matériel et produits.</p>
      </details>`;
  }

  /* ---------- Formulaire de demande ---------- */
  async function envoyer(ev) {
    ev.preventDefault();
    const f = ev.target, b = f.querySelector('button[type=submit]'), m = $('#message-demande');
    const act = f.dataset.act;
    const d = Object.fromEntries(new FormData(f).entries());
    m.className = 'message'; m.hidden = true;
    if (!d.telephone && !d.email) { m.className = 'message erreur'; m.textContent = 'Merci d\'indiquer un téléphone ou une adresse e-mail.'; m.hidden = false; return; }
    b.disabled = true; const t = b.textContent; b.textContent = 'Envoi…';
    const r = dernier || (act === 'secu' ? K.securite(lireSecu()) : K.nettoyage(lireNet()));
    const estimation = act === 'secu'
      ? { agents: r.agents, plage: r.plage, jours: r.jours, heuresMois: Math.round(r.heuresMois), etp: Math.round(r.interne.etp * 10) / 10, coutInterneMois: Math.round(r.interne.mensuel) }
      : { locaux: r.locaux, surface: r.surface, passages: r.passages, approfondi: r.approfondi, heuresMois: Math.round(r.heuresMois * 10) / 10, produits: r.produitsAbdel ? 'abdel' : 'client', estimationMois: r.externe ? Math.round(r.externe.mensuel) : 0 };
    try {
      await appel({ action: 'demande', activite: act, entreprise: d.entreprise, nom: d.nom, fonction: d.fonction, telephone: d.telephone, email: d.email, commune: d.commune, message: d.message,
        consentement: !!d.consentement, site_web: d.site_web, resume: K.resume(r), heuresMois: r.heuresMois, produits: act === 'net' && r.produitsAbdel ? 'abdel' : 'client', estimation });
      f.hidden = true;
      m.className = 'message ok'; m.innerHTML = '<b>Merci, votre demande est bien reçue.</b> Nous vous rappelons sous 24 h ouvrées pour affiner l\'estimation et, si vous le souhaitez, organiser une visite gratuite.'; m.hidden = false;
    } catch (e) {
      m.className = 'message erreur'; m.textContent = e.message; m.hidden = false;
    } finally { b.disabled = false; b.textContent = t; }
  }

  /* Champs publics (mentions légales, bouton d'appel) remplis depuis les Paramètres du CRM. */
  function remplirChamps() {
    const i = INFOS, val = {
      'societe-net': i.nettoyage.societe, 'siren-net': i.nettoyage.siren || 'en cours d\'immatriculation ou non communiqué',
      'societe-secu': i.securite.actif ? i.securite.societe : '', 'cnaps': i.securite.cnaps,
      'responsable': i.responsable || 'le représentant légal de la société', 'adresse': i.adresse || i.contact.ville,
      'email': i.contact.email || '', 'telephone': i.contact.telephone || '', 'ville': i.contact.ville,
    };
    document.querySelectorAll('[data-champ]').forEach(el => { el.textContent = val[el.dataset.champ] || el.textContent; });
    document.querySelectorAll('[data-si-champ]').forEach(el => { el.hidden = !val[el.dataset.siChamp]; });
    document.querySelectorAll('a[data-tel]').forEach(a => { if (i.contact.telephone) { a.href = 'tel:' + i.contact.telephone.replace(/[^\d+]/g, ''); a.hidden = false; } });
  }

  /* ---------- Démarrage ---------- */
  function brancher(idForm, rendre) {
    const f = $(idForm); if (!f) return;
    f.addEventListener('submit', e => e.preventDefault()); f.addEventListener('input', rendre); f.addEventListener('change', rendre); rendre();
  }
  async function demarrer() {
    try { INFOS = await appel({ action: 'infos' }); } catch (_) { INFOS = { securite: { actif: false }, nettoyage: { actif: true, societe: 'Abdel', tarifClient: 24, tarifProduits: 27 }, contact: { ville: 'Bordeaux Métropole' } }; }
    // Sécurité : rien n'est affiché tant que l'autorisation CNAPS n'est pas renseignée (art. L612-14 du CSI).
    document.querySelectorAll('[data-si-secu]').forEach(el => {
      if (INFOS.securite.actif) { const tpl = el.querySelector('template'); if (tpl) el.replaceChildren(tpl.content.cloneNode(true)); el.hidden = false; }
      else el.remove();
    });
    document.querySelectorAll('[data-sinon-secu]').forEach(el => { el.hidden = !!INFOS.securite.actif; });
    pied();
    remplirChamps();
    brancher('#sim-secu', rendreSecu);
    brancher('#sim-net', rendreNet);
    document.querySelectorAll('form.demande').forEach(f => f.addEventListener('submit', envoyer));
    const c = document.body.dataset.commune; const sel = $('form.demande [name="commune"]');
    if (c && sel) sel.value = c;
  }
  demarrer();
})();
