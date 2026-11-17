// =============================================================================
// Fil Rouge Apprenants — enregistrement des appels d'entraînement
// =============================================================================
// Pendant un appel d'entraînement à voix haute, chaque réplique d'Émilie est
// enregistrée (micro du navigateur) ; à la fin, les morceaux sont rangés dans
// le stockage privé « entrainement-audio » (dossier = identifiant de la
// personne : elle seule peut les lire). Pour réécouter, on enchaîne :
// la voix du prospect (relue par la voix du navigateur) puis la vraie voix
// enregistrée d'Émilie, réplique après réplique.
// Utilisé par Fil Rouge (entrainement.js) et le CRM d'Abdel (dp-abdel).
// =============================================================================

(function () {
  "use strict";

  const SEAU = "entrainement-audio";
  const dispo = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const typeAudio = () => ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    .find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || "";

  // Ouvre le micro. Renvoie un enregistreur de répliques, ou null (refus, navigateur).
  async function ouvrir() {
    if (!dispo) return null;
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return null; }
    const type = typeAudio();
    let rec = null, morceaux = [];
    return {
      // Commence une réplique (sans effet si elle est déjà commencée).
      debut() {
        if (rec && rec.state !== "inactive") return;
        morceaux = [];
        try { rec = new MediaRecorder(flux, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined); }
        catch (e) { rec = null; return; }
        rec.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
        rec.start();
      },
      pause() { try { if (rec && rec.state === "recording") rec.pause(); } catch (e) { /* rien */ } },
      reprise() { try { if (rec && rec.state === "paused") rec.resume(); } catch (e) { /* rien */ } },
      // Termine la réplique : renvoie l'audio (Blob) ou null.
      fin() {
        return new Promise((resolve) => {
          if (!rec || rec.state === "inactive") return resolve(null);
          const r = rec;
          r.onstop = () => resolve(morceaux.length ? new Blob(morceaux, { type: r.mimeType || type || "audio/webm" }) : null);
          try { r.stop(); } catch (e) { resolve(null); }
        });
      },
      fermer() {
        try { if (rec && rec.state !== "inactive") rec.stop(); } catch (e) { /* rien */ }
        flux.getTracks().forEach((t) => t.stop());
      },
    };
  }

  const extension = (b) => (/mp4/.test(b.type) ? "m4a" : /ogg/.test(b.type) ? "ogg" : "webm");

  // Range les répliques enregistrées : Map(index de la réplique -> Blob).
  async function envoyer(sb, idPersonne, sessionId, clips) {
    let ok = 0;
    for (const [i, blob] of clips) {
      if (!blob || blob.size < 800) continue;
      const chemin = `${idPersonne}/${sessionId}/${String(i).padStart(3, "0")}.${extension(blob)}`;
      const { error } = await sb.storage.from(SEAU).upload(chemin, blob, { contentType: (blob.type || "audio/webm").split(";")[0], upsert: true });
      if (!error) ok++;
    }
    return ok;
  }

  // Liens d'écoute (1 heure) : Map(index -> url).
  async function liens(sb, idPersonne, sessionId) {
    const dossier = `${idPersonne}/${sessionId}`;
    const { data, error } = await sb.storage.from(SEAU).list(dossier, { limit: 200 });
    if (error || !data || !data.length) return new Map();
    const noms = data.map((f) => f.name).filter((n) => /^\d+\./.test(n));
    if (!noms.length) return new Map();
    const { data: signes } = await sb.storage.from(SEAU).createSignedUrls(noms.map((n) => `${dossier}/${n}`), 3600);
    const m = new Map();
    (signes || []).forEach((s, k) => { if (s && s.signedUrl) m.set(parseInt(noms[k], 10), s.signedUrl); });
    return m;
  }

  // Rejoue l'appel : voix du prospect (synthèse) puis vraie voix enregistrée.
  // transcription : [{ qui: "appelante" | "apprenant", texte }]. options.depart : réplique de départ.
  // Renvoie { arreter }.
  function rejouer(transcription, urls, options = {}) {
    const V = window.FilRougeVoix;
    let stop = false, audio = null;
    (async () => {
      for (let i = options.depart || 0; i < transcription.length && !stop; i++) {
        const r = transcription[i];
        if (options.surLigne) options.surLigne(i);
        if (r.qui === "appelante" && urls.has(i)) {
          await new Promise((resolve) => {
            audio = new Audio(urls.get(i));
            audio.onended = resolve; audio.onerror = resolve;
            audio.play().catch(resolve);
          });
        } else if (r.qui !== "appelante" && V && V.dispo) {
          await V.parler(r.texte, { genre: options.genre || "" });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 900)); // réplique écrite, sans son
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!stop && options.surFin) options.surFin();
    })();
    return {
      // arreter(true) : arrêt sans prévenir (pour sauter à un autre endroit de l'appel).
      arreter(silencieux) {
        stop = true;
        if (audio) { try { audio.pause(); } catch (e) { /* rien */ } }
        if (V) V.arreter();
        if (!silencieux && options.surFin) options.surFin();
      },
    };
  }

  window.FilRougeEnregistreur = { dispo, ouvrir, envoyer, liens, rejouer };
})();
