// Tests du contact multicanal. Lancement : node tests/contact.test.js
"use strict";
const assert = require("node:assert/strict");
const C = require("../app/contact.js");

let n = 0;
function test(nom, fn) { fn(); n++; console.log("OK   " + nom); }

test("numéro français avec espaces → format international", () => {
  assert.equal(C.numeroInternational("06 12 34 56 78"), "33612345678");
});
test("numéro déjà en +33 ou 0033", () => {
  assert.equal(C.numeroInternational("+33 6 12 34 56 78"), "33612345678");
  assert.equal(C.numeroInternational("0033612345678"), "33612345678");
});
test("mobiles d'outre-mer : La Réunion, Martinique", () => {
  assert.equal(C.numeroInternational("0692 12 34 56"), "262692123456");
  assert.equal(C.numeroInternational("0696123456"), "596696123456");
});
test("numéro inutilisable → pas de lien", () => {
  assert.equal(C.numeroInternational("abc"), null);
  assert.equal(C.lienWhatsApp("", "x"), null);
  assert.equal(C.lienEmail("pas-une-adresse", "o", "t"), null);
});
test("lien WhatsApp avec le texte encodé", () => {
  assert.equal(C.lienWhatsApp("0612345678", "Bonjour Julie & co"), "https://wa.me/33612345678?text=Bonjour%20Julie%20%26%20co");
});
test("lien SMS : iPhone et Android", () => {
  assert.equal(C.lienSms("0612345678", "Salut", true), "sms:+33612345678&body=Salut");
  assert.equal(C.lienSms("0612345678", "Salut", false), "sms:+33612345678?body=Salut");
});
test("lien email avec objet et texte", () => {
  assert.equal(C.lienEmail("julie@exemple.fr", "Point", "a b"), "mailto:julie@exemple.fr?subject=Point&body=a%20b");
});
test("modèle rempli avec prénom, signature et organisme", () => {
  const r = C.remplir("point_mois", { prenom: "Julie", moi: "Émilie", organisme: "Académie Horizon" });
  assert.match(r.texte, /^Bonjour Julie, c'est Émilie, votre conseillère de suivi pour Académie Horizon\./);
  assert.equal(r.objet, "Point sur votre formation");
});
test("modèle sans prénom ni signature reste propre", () => {
  const r = C.remplir("point_mois", {});
  assert.match(r.texte, /^Bonjour, c'est votre conseillère de suivi\. /);
});
test("date d'examen en toutes lettres", () => {
  assert.match(C.remplir("examen_j1", { prenom: "Léo", date_examen: "2026-11-03" }).texte, /a lieu le 3 novembre\./);
});
test("avancement dans le modèle « terminer le parcours »", () => {
  assert.match(C.remplir("progression", { prenom: "Léo", avancement_pct: 82.4 }).texte, /vous êtes à 82 % de votre formation/);
});
test("modèle conseillé selon la situation", () => {
  assert.equal(C.modeleConseille({ date_examen: "2026-10-18" }, "2026-10-17"), "examen_j1");
  assert.equal(C.modeleConseille({ date_examen: "2026-10-22" }, "2026-10-17"), "examen_j7");
  assert.equal(C.modeleConseille({ avancement_pct: 85 }, "2026-10-17"), "progression");
  assert.equal(C.modeleConseille({ avancement_pct: 30 }, "2026-10-17"), "point_mois");
  assert.equal(C.modeleConseille({ date_examen: "2026-10-18", presence_examen: "present" }, "2026-10-17"), "point_mois");
});
test("email via Gmail Fil Rouge : fenêtre de rédaction déjà remplie", () => {
  const l = new URL(C.lienGmail("leo@exemple.fr", "Votre examen", "Bonjour Léo,\nà bientôt", "contact.filrouge.apprenant@gmail.com"));
  assert.equal(l.hostname, "mail.google.com");
  assert.equal(l.searchParams.get("view"), "cm");
  assert.equal(l.searchParams.get("to"), "leo@exemple.fr");
  assert.equal(l.searchParams.get("su"), "Votre examen");
  assert.equal(l.searchParams.get("body"), "Bonjour Léo,\nà bientôt");
  assert.equal(l.searchParams.get("authuser"), "contact.filrouge.apprenant@gmail.com");
  assert.equal(C.lienGmail("pas-une-adresse", "x", "y"), null);
});

// --- Modèles d'emails de la base (1er novembre 2026) ---
const MODELE_T3 = { objet: "Où en êtes-vous ?", texte: "Bonjour {prenom},\n\nPoint sur {formation}. {avancement}\n\n{signature}" };
test("modèle de la base : variables remplacées", () => {
  const r = C.remplirModeleEmail(MODELE_T3, { prenom: "Léo", moi: "Émilie", organisme: "Académie Horizon", formation: "CAP Cuisine", avancement_pct: 44.6 });
  assert.match(r.texte, /^Bonjour Léo,/);
  assert.match(r.texte, /votre formation « CAP Cuisine »\. Vous êtes à 45 % de votre formation\./);
  assert.match(r.texte, /Émilie\nConseillère de suivi pour Académie Horizon\nFil Rouge Apprenants$/);
  assert.deepEqual(r.manquants, []);
});
test("modèle de la base : sans données, texte propre et sans accolades", () => {
  const r = C.remplirModeleEmail(MODELE_T3, {});
  assert.match(r.texte, /^Bonjour,/);
  assert.match(r.texte, /Point sur votre formation\./);
  assert.deepEqual(C.variablesRestantes(r.texte), []);
});
test("date du rendez-vous à compléter : signalée, puis remplie", () => {
  const m = { objet: "Rendez-vous", texte: "Je vous appelle {date_rdv}." };
  assert.deepEqual(C.remplirModeleEmail(m, {}).manquants, ["date_rdv"]);
  assert.deepEqual(C.variablesRestantes(C.remplirModeleEmail(m, {}).texte), ["date_rdv"]);
  assert.equal(C.remplirModeleEmail(m, { date_rdv: "mardi à 18 h" }).texte, "Je vous appelle mardi à 18 h.");
});
test("numéro de tentative du mois", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const appels = [
    { date_appel: "2026-11-03T09:00:00Z", resultat: "messagerie", canal: "telephone" },
    { date_appel: "2026-11-03T09:05:00Z", resultat: "messagerie", canal: "email" },
    { date_appel: "2026-11-10T09:00:00Z", resultat: "injoignable", canal: "telephone" },
    { date_appel: "2026-10-28T09:00:00Z", resultat: "joint", canal: "telephone" },
  ];
  assert.equal(C.tentativeDuMois(appels, now), 2, "2 appels du mois, l'email et le mois dernier ne comptent pas");
  assert.equal(C.tentativeDuMois([...appels, { date_appel: "2026-11-15T09:00:00Z", resultat: "joint", canal: "telephone" }], now), 0, "joint ce mois-ci : plus de relance");
  const beaucoup = Array.from({ length: 11 }, (_, i) => ({ date_appel: `2026-11-${String(i + 1).padStart(2, "0")}T09:00:00Z`, resultat: "injoignable", canal: "telephone" }));
  assert.equal(C.tentativeDuMois(beaucoup, now), 8, "plafonné à 8");
  assert.equal(C.tentativeDuMois([{ date_appel: "2026-10-31T23:30:00Z", resultat: "injoignable", canal: "telephone" }], now), 1, "31 oct. 23 h 30 UTC = 1er nov. à Paris");
});

console.log(`\n${n} tests passés`);
