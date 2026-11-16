/* =============================================================================
 * CRM Abdel — Entraînement à la prospection (#/entrainement)
 * =============================================================================
 * Émilie s'entraîne à démarcher des entreprises pour la sécurité privée et le
 * nettoyage d'Abdel : un prospect FICTIF, joué par l'IA, décroche ; elle mène
 * l'appel (à voix haute ou par écrit), raccroche, et reçoit une note sur 20.
 *
 *   #/entrainement            liste des prospects fictifs + mes résultats
 *   #/entrainement/appel/<id> fiche, puis l'appel
 *   #/entrainement/resultat/<session>
 *
 * Données : tables entrainement_* de Fil Rouge (domaine = 'abdel').
 * IA : fonction serveur « simulation-appel » (clé Mistral côté serveur).
 * Voix : ../voix.js (voix naturelles du navigateur) + reconnaissance vocale.
 * Tout texte venant de la base ou de l'IA passe par esc() avant d'être affiché.
 * ========================================================================== */
(function () {
  'use strict';

  const DIFF = { facile: ['Facile', 'p-vert'], moyen: ['Moyen', 'p-safran'], difficile: ['Difficile', 'p-rouge'] };
  const SILENCE = 1800;
  const FEMININS = /^(sophie|hélène|helene|patricia|claire|julie|marie|mme|madame|sandrine|nathalie)/i;

  window.AbdelEntrainement = function (outils) {
    const { sb, esc, contenu, notif } = outils;
    const Reco = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const V = window.FilRougeVoix;
    const voixOk = () => Boolean(Reco && V && V.dispo);
    let appel = null; // appel en cours (pour tout couper si on quitte l'écran)

    const pastDiff = d => `<span class="pastille ${(DIFF[d] || [])[1] || 'p-neutre'}">${esc((DIFF[d] || [d])[0])}</span>`;
    const pastNote = n => n == null ? '<span class="pastille p-neutre">Non noté</span>'
      : `<span class="pastille ${n >= 14 ? 'p-vert' : n >= 10 ? 'p-safran' : 'p-rouge'}">${n}/20</span>`;
    const pastAct = s => /^nettoyage/i.test(s.titre) ? '<span class="pastille p-menthe">Nettoyage</span>' : '<span class="pastille p-encre">Sécurité</span>';
    const dateC = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const duree = s => (s || s === 0) ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : '';
    const titreSans = t => String(t || '').replace(/^(Sécurité|Nettoyage)\s*·\s*/i, '');
    const remplir = html => { contenu.innerHTML = html; window.scrollTo(0, 0); };

    async function serveur(corps) {
      const { data, error } = await sb.functions.invoke('simulation-appel', { body: corps });
      if (error) {
        let t = "L'IA ne répond pas pour le moment. Réessaie dans un instant.";
        try { const d = await error.context.json(); if (d && d.erreur) t = d.erreur; } catch (e) { /* message par défaut */ }
        throw new Error(t);
      }
      return data;
    }

    function arreter() { if (appel) { appel.fermer(); appel = null; } }
    window.addEventListener('hashchange', () => { if (appel && !location.hash.startsWith('#/entrainement/appel/')) arreter(); });

    // Appelé par le routeur du CRM : renvoie le HTML d'attente, puis remplit.
    function page(r) {
      const [sous, id] = [r.id, r.sous];
      setTimeout(() => {
        if (sous === 'appel' && id) return ecranFiche(id);
        if (sous === 'resultat' && id) return ecranResultat(id);
        return ecranListe();
      }, 0);
      return '<p class="chargement">Chargement de l\'entraînement…</p>';
    }

    // -------------------------------------------------------------- liste
    async function ecranListe() {
      arreter();
      const sc = await sb.from('entrainement_scenarios').select('id, titre, difficulte, apprenant_nom, formation, actif, ordre')
        .eq('type', 'prospect').eq('domaine', 'abdel').eq('actif', true).order('ordre');
      if (sc.error) return remplir(`<p class="message message-erreur">${esc(sc.error.message)}</p>`);
      const ids = sc.data.map(x => x.id);
      const se = ids.length ? await sb.from('entrainement_sessions').select('id, scenario_titre, debut, duree_secondes, note_sur_20')
        .eq('statut', 'terminee').in('scenario_id', ids).order('debut', { ascending: false }).limit(30) : { data: [] };
      const sessions = se.data || [];
      const moy = sessions.length ? Math.round(sessions.reduce((a, x) => a + (x.note_sur_20 || 0), 0) / sessions.length * 10) / 10 : null;
      const bloc = (titre, arr) => arr.length ? `<section class="pile pile-serree"><h2>${titre}</h2><ul class="liste">${arr.map(s => `<li class="ligne">
          <div><div class="ligne-titre">${esc(titreSans(s.titre))}</div><div class="ligne-detail">${esc(s.apprenant_nom)} · ${esc(s.formation)}</div></div>
          <div class="ligne-droite pastilles">${pastDiff(s.difficulte)}<a class="bouton bouton-petit" href="#/entrainement/appel/${encodeURIComponent(s.id)}">☎ Appeler</a></div></li>`).join('')}</ul></section>` : '';
      const secu = sc.data.filter(s => !/^nettoyage/i.test(s.titre)), net = sc.data.filter(s => /^nettoyage/i.test(s.titre));
      const hasard = sc.data.length ? `<a class="bouton bouton-session" href="#/entrainement/appel/${encodeURIComponent(sc.data[Math.floor(Math.random() * sc.data.length)].id)}">🎲 Un prospect au hasard</a>` : '';
      remplir(`<div class="pile">
        <div class="entete"><div><p class="surtitre">Prospection</p><h1>Entraînement aux appels</h1>
          <p class="chapo">Un prospect fictif, joué par l'IA, décroche. Tu déroules ton script (standard, accroche, découverte, objections, deux créneaux), puis tu raccroches : note sur 20, conseils, et la phrase à essayer la prochaine fois.</p></div>
          <div class="actions">${hasard}</div></div>
        ${voixOk() ? '' : '<p class="message message-info">Ce navigateur ne reconnaît pas la voix : l\'appel se fera par écrit. Pour parler à voix haute, utilise Chrome ou Edge (Edge a les voix les plus naturelles).</p>'}
        ${bloc('Sécurité privée', secu)}${bloc('Nettoyage professionnel', net)}
        ${sc.data.length ? '' : '<p class="message message-info">Aucun prospect fictif pour le moment.</p>'}
        <section class="pile pile-serree"><div class="section-titre"><h2>Mes appels d'entraînement</h2>${moy != null ? `<span class="aide">Moyenne : ${String(moy).replace('.', ',')}/20 sur ${sessions.length} appel${sessions.length > 1 ? 's' : ''}</span>` : ''}</div>
          ${sessions.length ? `<ul class="liste">${sessions.map(x => `<li><a class="ligne sans-score" href="#/entrainement/resultat/${encodeURIComponent(x.id)}"><div><div class="ligne-titre">${esc(titreSans(x.scenario_titre))}</div><div class="ligne-detail">${dateC(x.debut)} · ${duree(x.duree_secondes)}</div></div><div class="ligne-droite">${pastNote(x.note_sur_20)}</div></a></li>`).join('')}</ul>`
            : '<p class="aide">Tes appels et leurs notes apparaîtront ici.</p>'}</section>
        <p class="aide">Les scripts et les réponses aux objections sont dans l'onglet « Scripts » de chaque fiche prospect : garde-les ouverts à côté pendant l'entraînement.</p></div>`);
    }

    // -------------------------------------------------------------- fiche + appel
    async function ecranFiche(id) {
      arreter();
      const { data: s, error } = await sb.from('entrainement_scenarios')
        .select('id, titre, difficulte, apprenant_nom, formation, financement, derniere_connexion, contexte, objectif_appel').eq('id', id).maybeSingle();
      if (error || !s) return remplir(`<p class="message message-erreur">Ce prospect fictif n'existe pas.</p><a class="bouton" href="#/entrainement">Retour</a>`);
      remplir(`<div class="pile">
        <div class="entete"><div><p class="surtitre"><a class="bouton-lien" href="#/entrainement">← Entraînement aux appels</a></p><h1>${esc(titreSans(s.titre))}</h1>
          <p class="chapo">Lis la fiche comme avant un vrai appel, puis lance l'appel.</p></div></div>
        <div class="carte pile-serree">
          <div class="section-titre"><h2>${esc(s.apprenant_nom)}</h2><span class="pastilles">${pastAct(s)}${pastDiff(s.difficulte)}</span></div>
          <p><b>Entreprise :</b> ${esc(s.formation)}${s.financement ? ` · ${esc(s.financement)}` : ''}</p>
          ${s.derniere_connexion ? `<p><b>Signal / origine :</b> ${esc(s.derniere_connexion)}</p>` : ''}
          <p>${esc(s.contexte)}</p>
          <p class="message message-action"><b>Objectif de l'appel :</b> ${esc(s.objectif_appel)}</p>
        </div>
        <div class="carte pile-serree">
          ${voixOk() ? `<label>Comment mener l'appel ?<select id="ent-mode"><option value="voix">À voix haute (micro + haut-parleur)</option><option value="ecrit">Par écrit</option></select></label>
            <div id="ent-voix"></div>
            <p class="aide">Parle normalement : ta phrase part toute seule après un court silence. Un casque évite l'écho. Le navigateur te demandera l'autorisation d'utiliser le micro.</p>` : ''}
          <div id="ent-zone"></div>
          <div class="actions"><button class="bouton bouton-appel" type="button" id="ent-go">☎ Lancer l'appel</button></div>
        </div></div>`);
      if (voixOk() && V.reglage) document.getElementById('ent-voix').append(V.reglage(hDom));
      document.getElementById('ent-go').addEventListener('click', () => {
        const m = document.getElementById('ent-mode');
        demarrer(s, m ? m.value : 'ecrit');
      });
    }

    // Petit créateur d'éléments DOM pour le réglage de voix (voix.js attend h(tag, attrs, ...enfants)).
    function hDom(tag, attrs, ...enfants) {
      const el = document.createElement(tag);
      Object.entries(attrs || {}).forEach(([k, v]) => { if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v); });
      enfants.flat().forEach(c => { if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c))); });
      return el;
    }

    async function demarrer(s, mode) {
      const go = document.getElementById('ent-go'), zone = document.getElementById('ent-zone');
      go.disabled = true; go.textContent = 'Ça sonne…';
      let d;
      try { d = await serveur({ action: 'demarrer', scenario_id: s.id, mode }); }
      catch (e) { go.disabled = false; go.textContent = '☎ Lancer l\'appel'; zone.innerHTML = `<p class="message message-erreur">${esc(e.message)}</p>`; return; }

      const sessionId = d.session_id, debut = Date.now(), genre = FEMININS.test(s.apprenant_nom) ? 'f' : 'm';
      let fini = false, attente = false, son = true, microVoulu = mode === 'voix', ecoute = false, finalTxt = '', minuterie = null, micro = null;

      remplir(`<div class="pile">
        <div class="entete"><div><p class="surtitre">Appel en cours · <span id="ent-chrono">0:00</span></p><h1>${esc(s.apprenant_nom)}</h1></div></div>
        <details class="carte"><summary>Revoir la fiche et l'objectif</summary><p>${esc(s.formation)} · ${esc(s.derniere_connexion || '')}</p><p>${esc(s.contexte)}</p><p><b>Objectif :</b> ${esc(s.objectif_appel)}</p></details>
        <div id="ent-fil" class="ent-fil" aria-live="polite"></div>
        <p id="ent-etat" class="aide"></p><div id="ent-err"></div>
        <div class="carte pile-serree">
          <label for="ent-saisie">Ta réplique</label>
          <textarea id="ent-saisie" rows="2" maxlength="600" placeholder="${mode === 'voix' ? 'Ce que tu dis s\'affiche ici (tu peux aussi taper)' : 'Tape ce que tu dis au prospect…'}"></textarea>
          <div class="actions"><button class="bouton bouton-petit" type="button" id="ent-envoyer">Envoyer</button>
            ${mode === 'voix' ? '<button class="bouton bouton-petit bouton-secondaire" type="button" id="ent-micro">Couper le micro</button><button class="bouton-lien" type="button" id="ent-son">Couper le son</button>' : ''}</div>
        </div>
        <div class="actions"><button class="bouton bouton-danger" type="button" id="ent-raccrocher">Raccrocher</button><span class="aide">Raccroche quand l'appel est fini : l'évaluation arrive tout de suite.</span></div></div>`);

      const $ = id => document.getElementById(id);
      const fil = $('ent-fil'), etat = $('ent-etat'), saisie = $('ent-saisie');
      const majEtat = t => { etat.textContent = t; };
      const ajouter = (qui, texte) => {
        const b = document.createElement('div');
        b.className = `ent-bulle ent-${qui}`;
        b.innerHTML = `<span class="ent-qui">${qui === 'prospect' ? 'Prospect' : 'Toi'}</span><span>${esc(texte)}</span>`;
        fil.append(b); fil.scrollTop = fil.scrollHeight;
      };
      const parler = t => (mode === 'voix' && son && V && V.dispo) ? V.parler(t, { genre }) : Promise.resolve();
      const couperMicro = () => { ecoute = false; clearTimeout(minuterie); try { if (micro) micro.stop(); } catch (e) { /* déjà arrêté */ } };
      const ecouter = () => {
        if (mode !== 'voix' || !microVoulu || fini || attente || ecoute) return;
        if (!micro) {
          micro = new Reco(); micro.lang = 'fr-FR'; micro.continuous = true; micro.interimResults = true;
          micro.onresult = ev => {
            let provisoire = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              if (ev.results[i].isFinal) finalTxt += ev.results[i][0].transcript + ' ';
              else provisoire += ev.results[i][0].transcript;
            }
            saisie.value = (finalTxt + provisoire).trim();
            clearTimeout(minuterie);
            minuterie = setTimeout(() => { if (saisie.value.trim()) envoyer(); }, SILENCE);
          };
          micro.onend = () => { ecoute = false; if (!fini && !attente && microVoulu) setTimeout(ecouter, 250); };
          micro.onerror = ev => { ecoute = false; if (ev.error === 'not-allowed') { microVoulu = false; majEtat('Micro refusé : tape tes réponses.'); } };
        }
        try { micro.start(); ecoute = true; majEtat('À toi, je t\'écoute…'); } catch (e) { /* déjà en cours */ }
      };

      async function envoyer() {
        const texte = saisie.value.trim();
        if (!texte || attente || fini) return;
        attente = true; couperMicro(); finalTxt = ''; saisie.value = '';
        ajouter('moi', texte); majEtat('Le prospect réfléchit…'); $('ent-err').innerHTML = '';
        try {
          const r = await serveur({ action: 'repondre', session_id: sessionId, texte });
          ajouter('prospect', r.reponse);
          majEtat(mode === 'voix' && son ? 'Le prospect parle…' : 'À toi.');
          await parler(r.reponse);
          attente = false;
          if (r.raccroche) { majEtat('Le prospect a raccroché.'); return raccrocher(); }
          majEtat('À toi.'); ecouter(); if (mode !== 'voix') saisie.focus();
        } catch (e) {
          attente = false; saisie.value = texte;
          $('ent-err').innerHTML = `<p class="message message-erreur">${esc(e.message)}</p>`; majEtat('Renvoie ta phrase quand tu veux.');
        }
      }

      async function raccrocher() {
        if (fini) return;
        fini = true; couperMicro(); if (V) V.arreter(); clearInterval(chrono); appel = null;
        remplir('<p class="chargement">Évaluation de ton appel…</p>');
        try {
          const r = await serveur({ action: 'terminer', session_id: sessionId, duree_secondes: Math.round((Date.now() - debut) / 1000) });
          if (r.annule) return remplir(`<div class="pile"><h1>Appel trop court</h1><p class="message message-info">Il faut au moins deux répliques pour obtenir une évaluation.</p><div class="actions"><a class="bouton" href="#/entrainement/appel/${encodeURIComponent(s.id)}">Recommencer</a><a class="bouton-lien" href="#/entrainement">Choisir un autre prospect</a></div></div>`);
          location.hash = `#/entrainement/resultat/${sessionId}`;
        } catch (e) {
          remplir(`<div class="pile"><h1>Évaluation impossible pour l'instant</h1><p class="message message-erreur">${esc(e.message)}</p><p class="aide">Ton appel est enregistré : réessaie dans quelques secondes.</p><div class="actions"><a class="bouton" href="#/entrainement">Retour</a></div></div>`);
        }
      }

      $('ent-envoyer').addEventListener('click', envoyer);
      saisie.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
      saisie.addEventListener('input', () => clearTimeout(minuterie));
      $('ent-raccrocher').addEventListener('click', raccrocher);
      if ($('ent-micro')) $('ent-micro').addEventListener('click', e => {
        microVoulu = !microVoulu; e.target.textContent = microVoulu ? 'Couper le micro' : 'Activer le micro';
        if (microVoulu) ecouter(); else { couperMicro(); majEtat('Micro coupé : tape ta réponse.'); }
      });
      if ($('ent-son')) $('ent-son').addEventListener('click', e => { son = !son; if (!son && V) V.arreter(); e.target.textContent = son ? 'Couper le son' : 'Remettre le son'; });
      const chrono = setInterval(() => { const t = Math.round((Date.now() - debut) / 1000); const c = $('ent-chrono'); if (c) c.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }, 1000);
      appel = { fermer() { fini = true; clearInterval(chrono); couperMicro(); if (V) V.arreter(); } };

      ajouter('prospect', d.reponse);
      majEtat(mode === 'voix' ? 'Le prospect décroche…' : 'À toi : présente-toi.');
      await parler(d.reponse);
      if (!fini) { majEtat(mode === 'voix' ? 'À toi, je t\'écoute…' : 'À toi : présente-toi.'); ecouter(); if (mode !== 'voix') saisie.focus(); }
    }

    // -------------------------------------------------------------- résultat
    async function ecranResultat(id) {
      arreter();
      const { data: x, error } = await sb.from('entrainement_sessions')
        .select('id, scenario_id, scenario_titre, statut, debut, duree_secondes, mode, transcription, note_sur_20, evaluation').eq('id', id).maybeSingle();
      if (error || !x) return remplir('<p class="message message-erreur">Résultat introuvable.</p><a class="bouton" href="#/entrainement">Retour</a>');
      const ev = x.evaluation || {}, crit = ev.criteres || [];
      const liste = (t, arr) => arr && arr.length ? `<div class="carte pile-serree"><h3>${t}</h3><ul>${arr.map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>` : '';
      remplir(`<div class="pile">
        <div class="entete"><div><p class="surtitre"><a class="bouton-lien" href="#/entrainement">← Entraînement aux appels</a></p><h1>${esc(titreSans(x.scenario_titre))}</h1>
          <p class="chapo">${dateC(x.debut)} · ${duree(x.duree_secondes)} · ${x.mode === 'voix' ? 'à voix haute' : 'par écrit'}</p></div></div>
        ${x.statut !== 'terminee' ? '<p class="message message-info">Appel non terminé : pas d\'évaluation.</p>' : `
        <div class="ent-note"><span class="ent-note-chiffre">${x.note_sur_20 ?? '–'}</span><span>/20</span>
          <span class="pastille ${ev.frein_decouvert ? 'p-vert' : 'p-safran'}">${ev.frein_decouvert ? 'Étape suivante obtenue' : 'Pas encore d\'étape suivante'}</span></div>
        <section class="pile pile-serree"><h2>Critère par critère</h2><ul class="liste">${crit.map(c => `<li class="ligne"><div><div class="ligne-titre">${esc(c.nom)}</div>${c.commentaire ? `<div class="ligne-detail">${esc(c.commentaire)}</div>` : ''}</div><div class="ligne-droite"><span class="pastille ${c.note >= 4 ? 'p-vert' : c.note >= 3 ? 'p-safran' : 'p-rouge'}">${c.note}/5</span></div></li>`).join('')}</ul></section>
        <div class="deux-colonnes">${liste('Points forts', ev.points_forts)}${liste('À améliorer', ev.a_ameliorer)}</div>
        ${ev.phrase_modele ? `<p class="message message-action"><b>Phrase à essayer la prochaine fois :</b> « ${esc(ev.phrase_modele)} »</p>` : ''}`}
        <details class="carte"><summary>Relire la conversation</summary><div class="ent-fil">${(x.transcription || []).map(r => `<div class="ent-bulle ent-${r.qui === 'appelante' ? 'moi' : 'prospect'}"><span class="ent-qui">${r.qui === 'appelante' ? 'Toi' : 'Prospect'}</span><span>${esc(r.texte)}</span></div>`).join('')}</div></details>
        <div class="actions">${x.scenario_id ? `<a class="bouton" href="#/entrainement/appel/${encodeURIComponent(x.scenario_id)}">Refaire cet appel</a>` : ''}<a class="bouton bouton-secondaire" href="#/entrainement">Choisir un autre prospect</a></div></div>`);
    }

    return { page };
  };
})();
