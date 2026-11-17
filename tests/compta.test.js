// Tests du moteur de l'onglet Compta. Lancement : node tests/compta.test.js
"use strict";
const assert = require("node:assert/strict");
const C = require("../app/compta.js");

let n = 0;
function test(nom, fn) { fn(); n++; console.log("OK   " + nom); }

test("exemple d'Émilie : 10 élèves à 2 000 €, 3 sauvés, CPF, abandon à 20 %", () => {
  const r = C.simuler({ apprenants: 10, prixFormation: 2000, sauves: 3, financement: "cpf", assiduiteAbandon: 20, dureeMois: 6, appelsParMois: 1 });
  assert.equal(r.tarif, 20);                 // moins de 20 apprenants
  assert.equal(r.appels, 60);                // 10 × 1 × 6
  assert.equal(r.chiffreAffaires, 1200);
  assert.equal(r.perte, 0.75);               // le centre touche 25 % même en cas d'abandon
  assert.equal(r.valeurUnSauve, 1500);
  assert.equal(r.recupere, 4500);            // et non 6 000 €
  assert.equal(r.prixEntier, 6000);
  assert.equal(r.solde, 3300);
  assert.equal(r.equilibre, 1);              // 1 élève sauvé rembourse le suivi
});

test("CPF : au-delà de 80 % d'assiduité, l'abandon ne coûte rien", () => {
  assert.equal(C.partPerdue("cpf", 85), 0);
  assert.equal(C.partPerdue("cpf", 50), 0.5);
  assert.equal(C.partPerdue("cpf", 10), 0.75);
});

test("hors CPF : part perdue réglable", () => {
  const r = C.simuler({ apprenants: 10, prixFormation: 2000, sauves: 2, financement: "autre", pertePart: 40 });
  assert.equal(r.recupere, 1600);
});

test("grille : 15 € de 20 à 150, 12 € au-delà, tarif fixé prioritaire", () => {
  assert.equal(C.simuler({ apprenants: 20 }).tarif, 15);
  assert.equal(C.simuler({ apprenants: 151 }).tarif, 12);
  assert.equal(C.simuler({ apprenants: 151, tarifFixe: 18 }).tarif, 18);
});

test("cotisations ACRE 16,2 % et net", () => {
  const r = C.simuler({ apprenants: 10, dureeMois: 6, taux: 16.2 });
  assert.equal(Math.round(r.cotisations * 100) / 100, 194.4);
  assert.equal(Math.round(r.net * 100) / 100, 1005.6);
});

test("on ne peut pas sauver plus d'élèves qu'on en suit", () => {
  assert.equal(C.simuler({ apprenants: 5, sauves: 9 }).sauves, 5);
});

test("bilan réel : comptages et argent", () => {
  const b = C.bilan({
    jour: "2026-11-17",
    organismes: [
      { id: "a", nom: "A", etape: "client" }, { id: "b", nom: "B", etape: "contacte" },
      { id: "c", nom: "C", etape: "prospect" }, { id: "d", nom: "D", etape: "perdu" },
    ],
    echanges: [{ organisme_id: "b", canal: "telephone" }, { organisme_id: "b", canal: "telephone" }, { organisme_id: "a", canal: "email" }],
    apprenants: [{ organisme_id: "a", statut: "actif" }, { organisme_id: "a", statut: "actif" }, { organisme_id: "a", statut: "abandon" }, { organisme_id: "a", statut: "termine" }],
    appels: [{ organisme_id: "a", date_appel: "2026-11-03T10:00:00Z" }, { organisme_id: "a", date_appel: "2026-10-03T10:00:00Z" }],
    echeances: [
      { organisme_id: "a", mois: "2026-09-01", montant: "40", statut: "payee" },
      { organisme_id: "a", mois: "2026-10-01", montant: "40", statut: "en_retard" },
      { organisme_id: "a", mois: "2026-08-01", montant: "99", statut: "annulee" },
    ],
  });
  assert.equal(b.clients, 1);
  assert.equal(b.prospects, 2);
  assert.equal(b.contactes, 3);          // A, B (étape) et D (perdu = contacté)
  assert.equal(b.appelesTel, 1);
  assert.equal(b.appelsProspection, 2);
  assert.equal(b.apprenantsSuivis, 2);
  assert.equal(b.tauxAbandon, 0.5);
  assert.equal(b.appelsMois, 1);
  assert.equal(b.facture, 80);
  assert.equal(b.encaisse, 40);
  assert.equal(b.enRetard, 40);
  assert.equal(b.parClient[0].appelsMois, 1);
});

console.log(`\n${n} tests réussis.`);
