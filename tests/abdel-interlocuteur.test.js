// Tests du nom à demander au téléphone (CRM Abdel). Lancement : node tests/abdel-interlocuteur.test.js
// Cas tirés de vraies fiches : seul un nom de personne doit sortir, jamais une consigne ni un nom de groupe.
"use strict";
const assert = require("node:assert/strict");
const C = require("../app/dp-abdel/core.js");

let n = 0;
function test(nom, fn) { fn(); n++; console.log("OK   " + nom); }

test("consigne « achats centralisés » : pas un nom", () => {
  assert.equal(C.personName("Achats possiblement centralisés au siège du Groupe Barrière (Paris) : demander au DG qui décide pour Bordeaux."), "");
});
test("consignes de standard et noms non publics : pas un nom", () => {
  assert.equal(C.personName("Responsable sécurité du casino : nom non public. Le demander au standard (05 56 69 49 00)."), "");
  assert.equal(C.personName("Standard / accueil : 05 56 69 49 00"), "");
  assert.equal(C.personName("Nom non public — demander au standard le directeur"), "");
  assert.equal(C.personName("Responsable Prévention, Événementiel & Protection des sites (nom à trouver sur LinkedIn)"), "");
});
test("vrais noms : prénom nom, civilité, nom composé, majuscules, deux gérants", () => {
  assert.equal(C.personName("Stéphane Garcia — Directeur général et Président de la SAS (registre RNE)"), "Stéphane Garcia");
  assert.equal(C.personName("M. Bekkali — Directeur d'établissement (annonce Indeed)"), "M. Bekkali");
  assert.equal(C.personName("Stéphanie Fazi-Leblanc — Directrice (organigramme)"), "Stéphanie Fazi-Leblanc");
  assert.equal(C.personName("NASSERDINE BENAÏSSA (Directeur Général)"), "Nasserdine Benaïssa");
  assert.equal(C.personName("Laurent Medeville et Emilie Richet — Gérants"), "Laurent Medeville");
  assert.equal(C.personName("Pr Nicolas Penel — Directeur général"), "Pr Nicolas Penel");
});
test("fiche Casino : la consigne achats est ignorée, le DG est proposé avec sa fonction", () => {
  const r = C.contactToCall({
    sg: "", site: "Standard / accueil : 05 56 69 49 00",
    achats: "Achats possiblement centralisés au siège du Groupe Barrière (Paris) : demander au DG qui décide pour Bordeaux.",
    securite: "Responsable sécurité du casino : nom non public. Le demander au standard (05 56 69 49 00).",
    dirigeant: "Stéphane Garcia — Directeur général et Président de la SAS (registre RNE, 11/11/2026)",
  }, "secu");
  assert.equal(r.nom, "Stéphane Garcia");
  assert.equal(r.fonction, "Directeur général et Président de la SAS");
});
test("sans aucun nom : on renvoie la consigne pour le standard", () => {
  const r = C.contactToCall({ securite: "Nom non public — demander au standard le responsable sécurité-sûreté" }, "secu");
  assert.equal(r.nom, "");
  assert.equal(r.consigne, "demander au standard le responsable sécurité-sûreté");
});
test("ordre selon le métier : sécurité d'abord pour la sécu, services généraux pour le ménage", () => {
  const c = { securite: "Lucie Loba — Ingénieure sécurité", sg: "Henri Phu — Moyens généraux" };
  assert.equal(C.contactToCall(c, "secu").nom, "Lucie Loba");
  assert.equal(C.contactToCall(c, "net").nom, "Henri Phu");
});

test("contact « fonction non précisée » écarté ; la consigne prioritaire est gardée", () => {
  const r = C.contactToCall({
    sg: "David Rivière-Girard — Directeur des finances (organigramme)",
    site: "Émérance Duperthuy — citée pour la MAS, fonction non précisée (organigramme)",
    securite: "Nom non public — demander au standard le responsable sécurité-sûreté",
  }, "secu");
  assert.equal(r.nom, "David Rivière-Girard");
  assert.equal(r.consigne, "demander au standard le responsable sécurité-sûreté");
});

console.log(`\n${n} tests passés`);
