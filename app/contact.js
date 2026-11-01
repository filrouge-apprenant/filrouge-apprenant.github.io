// =============================================================================
// Fil Rouge Apprenants — contact multicanal (WhatsApp, SMS, email)
// =============================================================================
// Fonctions « pures » (sans écran), testées avec node : tests/contact.test.js
//
// Tout est gratuit : les boutons ouvrent l'application du téléphone (WhatsApp,
// Messages, messagerie) avec le texte déjà écrit. Rien n'est envoyé tout seul :
// c'est toujours la personne qui appuie sur « Envoyer ».
// =============================================================================

(function (racine) {
  "use strict";

  // Préfixes des mobiles d'outre-mer (numéros en 06/07 qui ne sont pas en +33).
  const OUTRE_MER = [
    ["0639", "262"], // Mayotte
    ["0690", "590"], ["0691", "590"], // Guadeloupe, Saint-Martin, Saint-Barthélemy
    ["0692", "262"], ["0693", "262"], // La Réunion
    ["0694", "594"], // Guyane
    ["0696", "596"], ["0697", "596"], // Martinique
  ];

  // « 06 12 34 56 78 » → « 33612345678 » (format attendu par WhatsApp).
  // Renvoie null si le numéro est inutilisable.
  function numeroInternational(numero) {
    if (!numero) return null;
    let n = String(numero).trim().replace(/[^\d+]/g, "");
    if (n.startsWith("+")) n = n.slice(1);
    else if (n.startsWith("00")) n = n.slice(2);
    else if (/^0\d{9}$/.test(n)) {
      const dom = OUTRE_MER.find(([prefixe]) => n.startsWith(prefixe));
      n = (dom ? dom[1] : "33") + n.slice(1);
    }
    n = n.replace(/\D/g, "");
    return /^\d{8,15}$/.test(n) ? n : null;
  }

  function lienWhatsApp(numero, texte) {
    const n = numeroInternational(numero);
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(texte || "")}` : null;
  }

  // iPhone : « sms:numéro&body= » ; Android : « sms:numéro?body= ».
  function lienSms(numero, texte, surIphone) {
    const n = numeroInternational(numero);
    return n ? `sms:+${n}${surIphone ? "&" : "?"}body=${encodeURIComponent(texte || "")}` : null;
  }

  function lienEmail(adresse, objet, texte) {
    const a = String(adresse || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a)) return null;
    return `mailto:${a}?subject=${encodeURIComponent(objet || "")}&body=${encodeURIComponent(texte || "")}`;
  }

  // Fenêtre « Nouveau message » de Gmail, sur le compte donné (authuser),
  // déjà remplie : destinataire, objet, texte.
  function lienGmail(adresse, objet, texte, compte) {
    const a = String(adresse || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a)) return null;
    const p = new URLSearchParams({ view: "cm", fs: "1", to: a, su: objet || "", body: texte || "" });
    if (compte) p.set("authuser", compte);
    return `https://mail.google.com/mail/?${p.toString()}`;
  }

  // ---------------------------------------------------------------------------
  // Modèles de messages. {prenom}, {moi}, {organisme}, {date_examen},
  // {avancement} sont remplacés automatiquement ; le texte reste modifiable.
  // ---------------------------------------------------------------------------
  const MODELES = {
    point_mois: {
      titre: "Point du mois",
      objet: "Point sur votre formation",
      texte: "Bonjour {prenom}, c'est {moi}, votre conseillère de suivi{organisme}. J'aimerais faire le point avec vous sur votre formation : où en êtes-vous ? Dites-moi quand vous êtes disponible pour un appel de 10 minutes.",
    },
    sans_reponse: {
      titre: "Appel sans réponse",
      objet: "J'ai essayé de vous joindre",
      texte: "Bonjour {prenom}, c'est {moi}, votre conseillère de suivi{organisme}. J'ai essayé de vous appeler aujourd'hui pour faire le point sur votre formation. Rappelez-moi quand vous pouvez, ou dites-moi le meilleur moment pour vous joindre.",
    },
    objectif: {
      titre: "Objectif du mois",
      objet: "Votre objectif du mois",
      texte: "Bonjour {prenom}, comme convenu, voici votre objectif d'ici notre prochain point : \nJe vous appelle pour voir où vous en êtes. Vous allez y arriver !",
    },
    progression: {
      titre: "Terminer le parcours",
      objet: "Vous y êtes presque",
      texte: "Bonjour {prenom}, {avancement}pour finaliser votre parcours, il vous reste quelques modules à terminer sur la plateforme. On fait un point ensemble pour organiser la fin ?",
    },
    inscription_examen: {
      titre: "Inscription à l'examen",
      objet: "Votre inscription à l'examen",
      texte: "Bonjour {prenom}, une étape importante arrive : l'inscription à votre examen. Je peux vous montrer comment faire, étape par étape. Quand êtes-vous disponible pour qu'on le fasse ensemble ?",
    },
    convention_stage: {
      titre: "Convention de stage",
      objet: "Votre convention de stage",
      texte: "Bonjour {prenom}, où en êtes-vous de votre recherche de stage ? Pour la convention de stage, je peux vous aider à remplir les documents. Dites-moi quand on peut en parler.",
    },
    examen_j7: {
      titre: "Examen dans 7 jours",
      objet: "Votre examen approche",
      texte: "Bonjour {prenom}, votre examen a lieu {date_examen}, dans une semaine. Avez-vous bien reçu votre convocation ? Je reste disponible si vous avez la moindre question.",
    },
    examen_j1: {
      titre: "Examen demain",
      objet: "C'est demain !",
      texte: "Bonjour {prenom}, c'est demain ! Votre examen a lieu {date_examen}. Pensez à votre convocation et à votre pièce d'identité. Je vous souhaite bonne chance, vous êtes prêt·e !",
    },
    soutien: {
      titre: "Soutien, moral en baisse",
      objet: "Je pense à vous",
      texte: "Bonjour {prenom}, je pense à vous. Si c'est compliqué en ce moment, on peut en parler, sans jugement : on trouvera ensemble un rythme qui vous convient.",
    },
  };

  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  function dateEnLettres(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `le ${Number(m[3])} ${MOIS[Number(m[2]) - 1]}` : "bientôt";
  }

  function joursEntre(debutIso, finIso) {
    return Math.round((new Date(`${finIso}T12:00:00Z`) - new Date(`${debutIso}T12:00:00Z`)) / 86400000);
  }

  // contexte : { prenom, moi, organisme, date_examen, avancement_pct }
  function remplir(cleModele, contexte) {
    const modele = MODELES[cleModele];
    if (!modele) return { objet: "", texte: "" };
    const c = contexte || {};
    const pct = c.avancement_pct === null || c.avancement_pct === undefined || c.avancement_pct === "" ? null : Math.round(Number(c.avancement_pct));
    const valeurs = {
      prenom: (c.prenom || "").trim(),
      moi: (c.moi || "").trim() || "votre conseillère",
      organisme: c.organisme ? ` pour ${c.organisme}` : "",
      date_examen: dateEnLettres(c.date_examen),
      avancement: Number.isFinite(pct) ? `vous êtes à ${pct} % de votre formation : ` : "vous y êtes presque : ",
    };
    const texte = modele.texte
      .replace(/\{(\w+)\}/g, (tout, cle) => (cle in valeurs ? valeurs[cle] : tout))
      .replace(/^Bonjour ,/, "Bonjour,")
      .replace(/c'est votre conseillère, votre conseillère de suivi/, "c'est votre conseillère de suivi");
    return { objet: modele.objet, texte };
  }

  // Le modèle le plus utile selon la situation de l'apprenant.
  function modeleConseille(apprenant, aujourdhuiIso) {
    const a = apprenant || {};
    if (a.date_examen && aujourdhuiIso && !a.presence_examen) {
      const j = joursEntre(aujourdhuiIso, a.date_examen);
      if (j >= 0 && j <= 1) return "examen_j1";
      if (j > 1 && j <= 7) return "examen_j7";
    }
    const pct = Number(a.avancement_pct);
    if (Number.isFinite(pct) && a.avancement_pct !== null && pct >= 70 && pct < 100) return "progression";
    return "point_mois";
  }

  // ---------------------------------------------------------------------------
  // Modèles d'emails de la base (table modeles_email, page « Modèles d'emails »).
  // Variables : {prenom} {moi} {organisme} {formation} {avancement}
  // {date_examen} {date_rdv} {signature}. Une variable sans valeur est laissée
  // telle quelle et listée dans « manquants » : l'écran demande de la compléter.
  // ---------------------------------------------------------------------------
  const VARIABLES_EMAIL = [
    ["prenom", "Prénom de l'apprenant"],
    ["moi", "Votre prénom"],
    ["organisme", "Nom de l'organisme de formation"],
    ["formation", "Nom de la formation (« votre formation » si inconnu)"],
    ["avancement", "Phrase sur l'avancement (« Vous êtes à 45 % de votre formation. »)"],
    ["date_examen", "Date de l'examen en lettres (« le 12 mars »)"],
    ["date_rdv", "Date du rendez-vous : à écrire au moment de l'envoi"],
    ["signature", "Votre signature (prénom, conseillère de suivi, organisme)"],
  ];

  // contexte : { prenom, moi, organisme, formation, avancement_pct, date_examen, date_rdv }
  function valeursEmail(contexte) {
    const c = contexte || {};
    const pct = c.avancement_pct === null || c.avancement_pct === undefined || c.avancement_pct === "" ? null : Math.round(Number(c.avancement_pct));
    const moi = (c.moi || "").trim();
    const organisme = (c.organisme || "").trim();
    const v = {
      prenom: (c.prenom || "").trim(),
      moi: moi || "votre conseillère",
      organisme: organisme || "votre organisme de formation",
      formation: (c.formation || "").trim() ? `votre formation « ${c.formation.trim()} »` : "votre formation",
      avancement: Number.isFinite(pct) ? `Vous êtes à ${pct} % de votre formation. ` : "",
      date_examen: c.date_examen ? dateEnLettres(c.date_examen) : null,
      date_rdv: (c.date_rdv || "").trim() || null,
      signature: [moi || "Votre conseillère", `Conseillère de suivi${organisme ? ` pour ${organisme}` : ""}`, "Fil Rouge Apprenants"].join("\n"),
    };
    return v;
  }

  function remplirModeleEmail(modele, contexte) {
    const v = valeursEmail(contexte);
    const manquants = new Set();
    const remplace = (s) => String(s || "")
      .replace(/\{(\w+)\}/g, (tout, cle) => {
        if (!(cle in v)) return tout;
        if (v[cle] === null) { manquants.add(cle); return tout; }
        return v[cle];
      })
      .replace(/^Bonjour ,/m, "Bonjour,")
      .replace(/[ \t]+\n/g, "\n");
    // Une phrase d'avancement vide ne laisse pas de ligne vide en trop.
    const texte = remplace(modele && modele.texte).replace(/\n{4,}/g, "\n\n\n").trim();
    return { objet: remplace(modele && modele.objet).trim(), texte, manquants: [...manquants] };
  }

  // Variables encore entre accolades (non remplacées) : envoi à bloquer.
  function variablesRestantes(texte) {
    return [...new Set((String(texte || "").match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)))];
  }

  // Numéro de la tentative de relance du mois : appels téléphoniques du mois
  // civil (heure de Paris) sans contact abouti. 0 si l'apprenant a déjà été
  // joint ce mois-ci (plus de relance automatique). Plafonné à 8.
  function tentativeDuMois(appels, maintenant) {
    const mois = (d) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date(d));
    const ceMois = mois(maintenant || new Date());
    const duMois = (appels || []).filter((a) => a && a.date_appel && mois(a.date_appel) === ceMois);
    if (duMois.some((a) => a.resultat === "joint" || (a.statuts || []).includes("joint"))) return 0;
    const n = duMois.filter((a) => (a.canal || "telephone") === "telephone").length;
    return Math.min(n, 8);
  }

  const api = {
    MODELES, VARIABLES_EMAIL, numeroInternational, lienWhatsApp, lienSms, lienEmail, lienGmail, remplir, modeleConseille, dateEnLettres,
    remplirModeleEmail, variablesRestantes, tentativeDuMois,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else racine.FilRougeContact = api;
})(typeof window !== "undefined" ? window : globalThis);
