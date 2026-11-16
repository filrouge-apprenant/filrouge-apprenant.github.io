// =============================================================================
// Fil Rouge Apprenants — page publique du simulateur (simulateur.html)
// Lit les champs, appelle FilRougeCalculAbandons.calculer et affiche le résultat.
// Pré-remplissage par l'adresse (?o=&n=&p=&d=&t=). Tout passe par textContent.
// =============================================================================
(function () {
  "use strict";
  const C = window.FilRougeCalculAbandons;
  const $ = (id) => document.getElementById(id);
  const champs = { n: $("sim-n"), p: $("sim-p"), d: $("sim-d"), t: $("sim-t"), perte: $("sim-perte") };

  // Pré-remplissage depuis le lien envoyé au prospect.
  const q = new URLSearchParams(window.location.search);
  for (const cle of Object.keys(champs)) {
    const v = q.get(cle);
    if (v !== null && v !== "" && Number.isFinite(Number(v.replace(",", ".")))) champs[cle].value = v.replace(",", ".");
  }
  const nomOrg = (q.get("o") || "").replace(/[<>]/g, "").trim().slice(0, 80);
  if (nomOrg) $("sim-pour").textContent = `Simulation préparée pour ${nomOrg}. Les chiffres sont des valeurs de départ : remplacez-les par les vôtres, le résultat se met à jour tout seul.`;
  $("sim-maj").textContent = `Hypothèses à jour le ${C.HYPOTHESES.maj}.`;

  function fractionTexte(pct) {
    if (pct <= 0) return "aucun abandon";
    const parmi = Math.round(100 / pct);
    return Number.isInteger(100 / pct) ? `1 abandon sur ${parmi}` : `${pct} % des abandons`;
  }

  function maj() {
    const pct = Number($("sim-e").value);
    const r = C.calculer({
      apprenantsAn: champs.n.value, prixFormation: champs.p.value, dureeMois: champs.d.value,
      tauxAbandon: champs.t.value, pertePart: champs.perte.value, evitesPct: pct,
    });
    $("r-cout").textContent = C.euros(r.coutAbandonsAn);
    $("r-abandons").textContent = `(${C.nombre(r.abandonsAn)} abandons × ${C.euros(r.coutUnAbandon)})`;
    $("r-fr").textContent = C.euros(r.coutFilRougeAn);
    $("r-fr-detail").textContent = `(${C.euros(r.tarif)} HT l'appel, soit ${C.euros(r.coutFilRougeMois)} par mois)`;
    if (Number.isFinite(r.equilibreAbandons) && r.abandonsAn > 0) {
      const eq = Math.ceil(r.equilibreAbandons);
      $("r-eq").textContent = C.nombre(eq);
      $("r-eq-detail").textContent = r.equilibrePct <= 1
        ? `abandon${eq > 1 ? "s" : ""} évité${eq > 1 ? "s" : ""} sur ${C.nombre(r.abandonsAn)} par an suffi${eq > 1 ? "sent" : "t"} à rembourser le suivi`
        : `abandons évités seraient nécessaires : avec ces chiffres, le suivi coûte plus que les abandons. Vérifiez le prix et le taux d'abandon.`;
    } else {
      $("r-eq").textContent = "—";
      $("r-eq-detail").textContent = "Indiquez un prix et un taux d'abandon pour voir le point d'équilibre.";
    }
    $("r-temps").textContent = `Temps libéré pour vos équipes : environ ${C.nombre(r.heuresLibereesMois)} heures par mois.`;
    $("r-e-val").textContent = fractionTexte(pct);
    const signe = r.solde >= 0 ? "économie nette estimée" : "coût net estimé";
    $("r-solde").textContent = pct > 0
      ? `${C.nombre(r.abandonsEvites, 1)} abandons évités × ${C.euros(r.coutUnAbandon)} = ${C.euros(r.gainBrut)}. Après le coût du suivi : ${signe} de ${C.euros(Math.abs(r.solde))} par an.`
      : "Déplacez le curseur pour tester une hypothèse.";
    $("r-solde").classList.toggle("sim-positif", r.solde >= 0 && pct > 0);
  }

  $("sim-form").addEventListener("input", maj);
  $("sim-form").addEventListener("submit", (ev) => ev.preventDefault());
  $("sim-e").addEventListener("input", maj);
  maj();
})();
