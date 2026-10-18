// Tests du classement d'assiduité et de l'export anonymisé. Lancement : node tests/assiduite.test.js
"use strict";
const assert = require("node:assert/strict");
const A = require("../app/assiduite.js");

const JOUR = "2026-10-18";
let n = 0;
function test(nom, fn) { fn(); n++; console.log("OK   " + nom); }

// Formation de 200 jours commencée il y a 100 jours : 50 % attendus.
const base = { id: "3f9c2b10-0000-4000-8000-000000000001", date_entree_formation: "2026-07-10", date_sortie_formation: "2027-01-26", tentatives: 2, aboutis: 1 };

test("assidu : connecté hier, au rythme", () => {
  const e = A.evaluer({ ...base, avancement_pct: 52, derniere_connexion: "2026-10-17" }, JOUR);
  assert.equal(e.niveau, "assidu");
  assert.deepEqual(e.raisons, []);
});

test("à surveiller : 15 jours sans connexion", () => {
  const e = A.evaluer({ ...base, avancement_pct: 50, derniere_connexion: "2026-10-03" }, JOUR);
  assert.equal(e.niveau, "moyen");
  assert.match(e.raisons[0], /15 j/);
});

test("à surveiller : 12 points de retard", () => {
  const e = A.evaluer({ ...base, avancement_pct: 38, derniere_connexion: "2026-10-16" }, JOUR);
  assert.equal(e.niveau, "moyen");
});

test("à risque : 30 jours sans connexion et gros retard", () => {
  const e = A.evaluer({ ...base, avancement_pct: 20, derniere_connexion: "2026-09-18" }, JOUR);
  assert.equal(e.niveau, "risque");
  assert.equal(e.score, 4);
  assert.equal(e.raisons.length, 2);
});

test("à risque : fin de formation dépassée sans avoir terminé + retard", () => {
  const e = A.evaluer({ id: "x", avancement_pct: 70, derniere_connexion: "2026-10-15",
    date_entree_formation: "2026-01-01", date_sortie_formation: "2026-10-01" }, JOUR);
  assert.equal(e.niveau, "risque");
  assert.ok(e.raisons.some((r) => /dépassée/.test(r)));
});

test("injoignable : 3 tentatives sans réponse ajoutent un point", () => {
  const e = A.evaluer({ ...base, avancement_pct: 50, derniere_connexion: "2026-10-17", tentatives: 3, aboutis: 0 }, JOUR);
  assert.equal(e.niveau, "moyen");
  assert.match(e.raisons[0], /injoignable/);
});

test("non évalué : ni avancement ni connexion", () => {
  assert.equal(A.evaluer({ ...base }, JOUR).niveau, "inconnu");
});

test("sans dates de formation : seul le critère de connexion compte", () => {
  const e = A.evaluer({ id: "x", avancement_pct: 5, derniere_connexion: "2026-10-18" }, JOUR);
  assert.equal(e.niveau, "assidu");
});

test("compter par niveau", () => {
  const t = A.compter([{ niveau: "risque" }, { niveau: "risque" }, { niveau: "assidu" }]);
  assert.deepEqual(t, { risque: 2, moyen: 0, assidu: 1, inconnu: 0 });
});

test("export anonymisé : ni nom, ni prénom, ni téléphone, ni email, ni identifiant client", () => {
  const ligne = { ...base, prenom: "Julie", nom: "Martin", telephone: "06 12 34 56 78", email: "julie@exemple.fr",
    identifiant_externe: "DOSSIER-889", parcours: "CAP AEPE", avancement_pct: 20, derniere_connexion: "2026-09-18", jours_sans_contact: 12 };
  const [r] = A.anonymiser([ligne], JOUR);
  const texte = r.join(" | ");
  for (const interdit of ["Julie", "Martin", "06 12", "julie@", "DOSSIER-889"]) assert.ok(!texte.includes(interdit), interdit);
  assert.equal(r[0], "A-3F9C2B");
  assert.equal(r.length, A.ENTETES_ANONYMES.length);
  assert.equal(r[10], "à risque");
});

test("code stable pour un même apprenant", () => {
  assert.equal(A.code({ id: "abcdef12-3456-7890-abcd-ef1234567890" }), "A-ABCDEF");
});

console.log(`\n${n} tests réussis.`);
