// Fausse base Supabase en mémoire, pour tester l'écran sans toucher aux vraies données.
(function () {
  const ADMIN = "11111111-1111-4111-8111-111111111111";
  const ORG = "a0000000-0000-4000-8000-000000000001";
  const ELEVE = "e0000000-0000-4000-8000-000000000001";
  const m = (id, categorie, ordre, tentative, titre, objet, texte) => ({ id, categorie, ordre, tentative, titre, objet, texte, actif: true });
  const db = window.__db = JSON.parse(sessionStorage.getItem("db") || "null") || {
    profils: [{ id: ADMIN, email: "admin@test.example", nom_affiche: "Émilie Rachas", role: "admin", organisme_id: null, actif: true }],
    organismes: [{ id: ORG, nom: "Académie Horizon", seuil_vert_jours: 7, seuil_orange_jours: 14, organismes_suivi_commercial: { etape: "client" } }],
    apprenants: [{ id: ELEVE, organisme_id: ORG, prenom: "Julie", nom: "Martin", email: "julie@exemple.fr", telephone: "0612345678", parcours: "CAP Pâtissier", avancement_pct: 42, statut: "actif", organismes: { nom: "Académie Horizon", seuil_vert_jours: 7, seuil_orange_jours: 14 } }],
    appels: [],
    modeles_email: [
      m("10000000-0000-4000-8000-000000000001", "Relance après un appel manqué", 1, 1, "Tentative 1 — J'ai essayé de vous joindre", "J'ai essayé de vous joindre", "Bonjour {prenom},\n\nJe viens d'essayer de vous appeler pour faire le point sur {formation}.\n\n{signature}"),
      m("10000000-0000-4000-8000-000000000002", "Relance après un appel manqué", 2, 2, "Tentative 2 — Quel créneau vous arrange ?", "Quel moment vous arrange ?", "Bonjour {prenom},\n\nDites-moi quel moment vous convient.\n\n{signature}"),
      m("10000000-0000-4000-8000-000000000003", "Relance après un appel manqué", 3, 3, "Tentative 3 — Où en êtes-vous ?", "Où en êtes-vous de votre formation ?", "Bonjour {prenom},\n\nOù en êtes-vous ? {avancement}\n\n{signature}"),
      m("10000000-0000-4000-8000-000000000010", "Rendez-vous", 10, null, "Confirmation du prochain rendez-vous", "Notre prochain rendez-vous", "Bonjour {prenom},\n\nJe vous appellerai {date_rdv}.\n\n{signature}"),
      m("10000000-0000-4000-8000-000000000020", "Progression", 20, null, "Point du mois", "Point mensuel sur votre formation", "Bonjour {prenom},\n\nPoint sur {formation}. {avancement}\n\n{signature}"),
    ],
  };
  window.__envois = JSON.parse(sessionStorage.getItem("envois") || "[]");
  window.__brevo = sessionStorage.getItem("brevo") !== "non";
  const sauver = () => { sessionStorage.setItem("db", JSON.stringify(db)); sessionStorage.setItem("envois", JSON.stringify(window.__envois)); };
  let n = Number(sessionStorage.getItem('n') || 0);
  const uuid = () => { n++; sessionStorage.setItem('n', n); return `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`; };

  function requete(table) {
    let lignes = () => db[table] || [];
    const filtres = [];
    let action = null, valeurs = null, unique = null, compte = false;
    const q = {
      select(_c, opts) { if (opts && opts.head) compte = true; return q; },
      eq(c, v) { filtres.push((l) => l[c] === v); return q; },
      gte(c, v) { filtres.push((l) => String(l[c]) >= v); return q; },
      contains(c, v) { filtres.push((l) => v.every((x) => (l[c] || []).includes(x))); return q; },
      order() { return q; }, not() { return q; }, is() { return q; }, or() { return q; }, limit() { return q; }, range() { return q; }, in() { return q; }, lt() { return q; }, neq() { return q; },
      update(v) { action = "update"; valeurs = v; return q; },
      insert(v) { action = "insert"; valeurs = v; return q; },
      upsert(v) { action = "insert"; valeurs = v; db[table] = db[table] || []; return q; },
      delete() { action = "delete"; return q; },
      single() { unique = "single"; return q; }, maybeSingle() { unique = "maybe"; return q; },
      then(ok, ko) {
        let res = lignes().filter((l) => filtres.every((f) => f(l)));
        if (action === "insert") { const l = { id: uuid(), ...valeurs }; db[table].push(l); res = [l]; }
        if (action === "update") res.forEach((l) => Object.assign(l, valeurs));
        if (action === "delete") db[table] = db[table].filter((l) => !res.includes(l));
        const data = unique ? (res[0] || null) : (compte ? null : res);
        sauver();
        return Promise.resolve({ data, error: null, count: res.length }).then(ok, ko);
      },
    };
    return q;
  }

  window.supabase = {
    createClient() {
      return {
        from: requete,
        rpc(nom, p) {
          if (nom === "enregistrer_appel" || nom === "noter_appel_statuts" || nom === "enregistrer_appel_script") {
            const resultat = p.p_statuts.includes("joint") ? "joint" : p.p_statuts.includes("repondeur") ? "messagerie" : "injoignable";
            db.appels.push({ id: uuid(), apprenant_id: p.p_apprenant, date_appel: p.p_date_appel || new Date().toISOString(), statuts: p.p_statuts, resultat, canal: p.p_canal || "telephone" });
          }
          if (nom === "creer_organisme") { const id = uuid(); (db.organismes = db.organismes || []).push({ id, nom: p.p_nom }); window.__crees = (window.__crees || []).concat([p]); sauver(); return Promise.resolve({ data: id, error: null }); }
          if (nom === "noter_appel") db.appels.push({ id: uuid(), apprenant_id: p.p_apprenant, date_appel: p.p_date_appel, statuts: [], resultat: p.p_resultat, canal: p.p_canal, note_client: p.p_note_client });
          sauver();
          return Promise.resolve({ data: nom === "comptes_acces" ? [] : nom === "abdel_suis_membre" ? true : null, error: null });
        },
        functions: {
          invoke(nom, { body }) {
            if (nom === "filrouge-recherche") return Promise.resolve({ data: { total: 2, page: 1, pages: 1, resultats: [
              { siren: "111111111", nom: "ACADEMIE DISTANCE PRO (ADP)", effectif: "12", qualiopi: true, opposition: false, ville: "LYON", creation: "2015-03-01", etablissements: 1, ca: { annee: "2024", montant: 900000 }, dirigeants: ["Claire Dupont (Présidente de SAS)"], nda: "84691234569" },
              { siren: "222222222", nom: "HUPSO FORMATION", effectif: "21", qualiopi: true, opposition: true, ville: "PARIS", creation: "2012-01-01", etablissements: 1, ca: null, dirigeants: [], nda: null }] }, error: null });
            if (nom !== "envoyer-email") return Promise.resolve({ data: null, error: null });
            if (body.action === "etat") return Promise.resolve({ data: { brevo: window.__brevo }, error: null });
            window.__envois.push(body); sauver();
            return Promise.resolve({ data: { ok: true }, error: null });
          },
        },
        auth: {
          getSession: () => Promise.resolve({ data: { session: { user: { id: ADMIN, email: "admin@test.example" } } } }),
          mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal2" } }), listFactors: () => Promise.resolve({ data: { totp: [] } }) },
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: () => Promise.resolve({}),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel() {},
      };
    },
  };
})();
