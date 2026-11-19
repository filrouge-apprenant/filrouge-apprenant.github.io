// =============================================================================
// Fil Rouge Apprenants — emails aux organismes avec accusé de réception (19/11/2026)
// =============================================================================
// window.FilRougeEmailsOrganisme({ sb, h }) renvoie :
//   envoyer({ organismeId, destinataire, objet, texte, modele }) -> { ok, texte }
//       envoi par Brevo (fonction serveur « email-organisme »), enregistré et
//       noté dans les Échanges du centre.
//   suivi(organismeId) -> élément « Emails envoyés » : statut de chaque email
//       (envoyé, reçu, ouvert, rejeté, spam), accord du centre pour le suivi
//       d'ouverture, lien de préférences à copier, bouton Actualiser.
// Ouvertures : affichées seulement si le centre a accepté (recommandation CNIL
// du 12 mars 2026). Sans accord, on voit seulement si l'email est bien arrivé.
// Tout le texte passe par h() (textContent).
// =============================================================================
(function () {
  "use strict";

  const STATUTS = {
    envoye: ["📤 Envoyé", "En attente de l'accusé de réception."],
    delivre: ["✅ Reçu", "Arrivé dans la boîte du destinataire."],
    ouvert: ["👁️ Ouvert", "Le destinataire a ouvert l'email."],
    rejete: ["⚠️ Rejeté", "Pas arrivé : adresse fausse, boîte pleine ou refus du serveur."],
    spam: ["🚫 Signalé comme indésirable", "Le destinataire l'a signalé : ne plus lui écrire."],
    erreur: ["⚠️ Erreur", "Brevo n'a pas pu l'envoyer."],
  };
  const quand = (d) => d ? new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

  window.FilRougeEmailsOrganisme = function ({ sb, h }) {
    async function appeler(corps) {
      const { data, error } = await sb.functions.invoke("email-organisme", { body: corps });
      if (error) {
        let texte = "Service d'envoi indisponible pour le moment.";
        try { const d = await error.context.json(); if (d && d.erreur) texte = d.erreur; } catch (e) { /* message par défaut */ }
        throw new Error(texte);
      }
      return data || {};
    }

    async function envoyer({ organismeId, destinataire, objet, texte, modele }) {
      try {
        const d = await appeler({ action: "envoyer", organisme_id: organismeId, destinataire, objet, texte, modele: modele || null });
        if (d.ok) return { ok: true, texte: "Email envoyé par Brevo. L'accusé de réception s'affichera dans « Emails envoyés » (Actualiser dans une minute)." };
        if (d.raison === "sans_cle") return { ok: false, texte: "L'envoi par Brevo n'est pas branché (clé absente) : utilise Gmail pour cet email." };
        return { ok: false, texte: `Brevo a refusé l'envoi${d.detail ? ` : ${d.detail}` : ""}. Tu peux passer par Gmail.` };
      } catch (e) {
        return { ok: false, texte: e.message };
      }
    }

    function suivi(organismeId) {
      const liste = h("div", { class: "pile-serree" }, h("p", { class: "aide" }, "Chargement des accusés de réception…"));
      const accord = h("p", { class: "aide" });
      const retour = h("div");
      const actualiser = h("button", { type: "button", class: "bouton bouton-petit bouton-secondaire" }, "🔄 Actualiser");
      const copier = h("button", { type: "button", class: "bouton bouton-petit bouton-secondaire" }, "📋 Copier le lien « accepter le suivi »");

      function texteAccord(v) {
        if (v === true) return "👁️ Le centre a accepté le suivi d'ouverture : tu vois quand il ouvre tes emails.";
        if (v === false) return "🔒 Le centre a refusé le suivi d'ouverture : tu vois seulement si tes emails sont bien arrivés.";
        return "🔒 Pas encore d'accord du centre pour le suivi d'ouverture (règle CNIL) : tu vois seulement si tes emails sont bien arrivés. Le lien pour accepter est en bas de chaque email ; tu peux aussi le copier ici.";
      }

      async function charger() {
        actualiser.disabled = true;
        try {
          const d = await appeler({ action: "actualiser", organisme_id: organismeId });
          accord.textContent = texteAccord(d.suivi_ouverture);
          const emails = d.emails || [];
          if (!emails.length) {
            liste.replaceChildren(h("p", { class: "aide" }, "Aucun email envoyé par Brevo à ce centre pour l'instant."));
          } else {
            liste.replaceChildren(...emails.map((e) => {
              const [libelle, aide] = STATUTS[e.statut] || [e.statut, ""];
              const details = [`Envoyé ${quand(e.envoye_le)}`];
              if (e.delivre_le) details.push(`reçu ${quand(e.delivre_le)}`);
              if (e.ouvert_le) details.push(`ouvert ${quand(e.ouvert_le)}${e.ouvertures > 1 ? ` (${e.ouvertures} fois)` : ""}`);
              return h("div", { class: `email-suivi email-${e.statut}` },
                h("p", { class: "email-suivi-haut" }, h("strong", {}, libelle), ` · ${e.objet}`),
                h("p", { class: "aide" }, `${details.join(" · ")} · à ${e.destinataire}`),
                e.detail ? h("p", { class: "aide" }, `Raison : ${e.detail}`) : (e.statut === "envoye" ? h("p", { class: "aide" }, aide) : null));
            }));
          }
          if (d.brevo === false) retour.replaceChildren(h("p", { class: "aide" }, "Brevo n'est pas branché : les statuts ne peuvent pas être mis à jour."));
          else retour.replaceChildren();
        } catch (e) {
          liste.replaceChildren(h("p", { class: "aide" }, `Accusés de réception indisponibles : ${e.message}`));
        }
        actualiser.disabled = false;
      }

      actualiser.addEventListener("click", charger);
      copier.addEventListener("click", async () => {
        try {
          const d = await appeler({ action: "lien_preferences", organisme_id: organismeId });
          await navigator.clipboard.writeText(d.lien);
          retour.replaceChildren(h("p", { class: "aide" }, "Lien copié : envoie-le au centre (par exemple dans un email), il choisit lui-même."));
        } catch (e) { retour.replaceChildren(h("p", { class: "aide" }, `Copie impossible : ${e.message}`)); }
      });
      charger();
      return {
        bloc: h("div", { class: "carte carte-large pile-serree emails-envoyes" },
          h("h3", {}, "📬 Emails envoyés et accusés de réception"),
          accord, liste, retour, h("div", { class: "actions-ligne" }, actualiser, copier)),
        actualiser: charger,
      };
    }

    return { envoyer, suivi };
  };
})();
