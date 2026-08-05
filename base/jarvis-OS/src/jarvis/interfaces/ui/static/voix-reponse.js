/* voix-reponse.js — Jarvis lit ses réponses écrites.
 *
 * Le problème corrigé : jusqu'ici Jarvis ne parlait que si on lui parlait.
 * Une question tapée au clavier obtenait une réponse muette, alors même que
 * la sphère passait en état "SPEAKING". L'interface annonçait une voix qui
 * n'existait pas.
 *
 * Ce module écoute l'événement `jarvis:ws` que le chat diffuse déjà, assemble
 * la réponse au fil des chunks, et la fait dire à la fin. Aucun client n'a
 * besoin d'être modifié.
 *
 * Tout est réglable — voir JarvisLecture.reglages().
 */
(function () {
  "use strict";

  const CLE = "jarvis_lecture_reponses";

  const DEFAUTS = {
    mode: "auto",          // "jamais" | "toujours" | "auto"
    lireCode: false,       // lire les blocs de code à voix haute
    longueurMax: 1200,     // 0 = pas de limite
    couperAuClic: true,    // un clic dans la page arrête la lecture
    vitesseRepli: 1.0,     // vitesse de la voix du navigateur (repli)
    langueRepli: "fr-FR",
  };

  function charger() {
    try {
      return Object.assign({}, DEFAUTS, JSON.parse(localStorage.getItem(CLE) || "{}"));
    } catch (_) {
      return Object.assign({}, DEFAUTS);
    }
  }

  let cfg = charger();

  function enregistrer(patch) {
    cfg = Object.assign({}, cfg, patch || {});
    try { localStorage.setItem(CLE, JSON.stringify(cfg)); } catch (_) {}
    window.dispatchEvent(new CustomEvent("jarvis:lecture-reglages", { detail: cfg }));
    return cfg;
  }

  /* ── Mise en voix du texte ────────────────────────────────────────────────
     Une réponse écrite n'est pas une réponse parlée. Les blocs de code, les
     tableaux et la ponctuation Markdown s'entendent très mal. On nettoie. */
  function pourLaVoix(brut) {
    let t = String(brut || "");

    t = t.replace(/\[MINDMAP\][\s\S]*$/g, "");

    if (cfg.lireCode) {
      t = t.replace(/```(\w+)?\n?/g, ". ");
    } else {
      t = t.replace(/```[\s\S]*?```/g, ". (bloc de code) . ");
      t = t.replace(/```[\s\S]*$/g, ". (bloc de code) . ");
    }

    t = t.replace(/`([^`]+)`/g, "$1");
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

    // Un titre doit s'entendre comme une annonce : sans point final, la voix
    // enchaîne sur le paragraphe suivant comme si c'était la même phrase.
    t = t.replace(/^\s{0,3}#{1,6}\s+(.*?)\s*$/gm, (_m, titre) =>
      /[.!?:;]$/.test(titre) ? titre : titre + ".");

    t = t.replace(/^\s{0,3}>\s?/gm, "");
    t = t.replace(/^\s*\|.*\|\s*$/gm, "");
    t = t.replace(/^\s*[-*_]{3,}\s*$/gm, ". ");
    t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
    t = t.replace(/\*([^*]+)\*/g, "$1");
    t = t.replace(/^\s*[-*+]\s+/gm, ". ");
    t = t.replace(/\s*\n\s*\n\s*/g, ". ");
    t = t.replace(/\s*\n\s*/g, " ");

    // Ponctuation : on parle, on n'écrit pas. Les espaces avant un signe et les
    // signes empilés produisent des hésitations audibles chez Piper.
    t = t.replace(/\s+([.,;:!?])/g, "$1");
    t = t.replace(/([,;:])\s*\./g, ".");
    t = t.replace(/\.{2,}/g, ".");
    t = t.replace(/(\.\s*){2,}/g, ". ");
    t = t.replace(/\s{2,}/g, " ").trim();
    t = t.replace(/^[.\s]+/, "");

    if (cfg.longueurMax > 0 && t.length > cfg.longueurMax) {
      // On coupe à la dernière phrase entière plutôt qu'au milieu d'un mot.
      const tronque = t.slice(0, cfg.longueurMax);
      const fin = Math.max(tronque.lastIndexOf(". "), tronque.lastIndexOf("! "), tronque.lastIndexOf("? "));
      t = fin > cfg.longueurMax * 0.5 ? tronque.slice(0, fin + 1) : tronque;
    }

    return t;
  }

  /* ── Lecture ──────────────────────────────────────────────────────────── */

  let audioCourant = null;
  let enLecture = false;

  let dernierEtat = "idle";

  // Idempotent : une interruption suivie de la fin naturelle de la synthèse
  // émettait deux "idle" d'affilée, et la sphère recevait un ordre pour rien.
  function etat(nom) {
    if (nom === dernierEtat) return;
    dernierEtat = nom;
    window.dispatchEvent(new CustomEvent("jarvis:lecture-etat", { detail: { etat: nom } }));
  }

  function arreter() {
    if (audioCourant) {
      try { audioCourant.pause(); } catch (_) {}
      audioCourant = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    if (enLecture) {
      enLecture = false;
      etat("idle");
    }
  }

  function entetes(base) {
    // Reprend le jeton d'authentification si la page en expose un.
    const h = Object.assign({ "Content-Type": "application/json" }, base || {});
    try {
      if (typeof window.authHeaders === "function") return window.authHeaders(h);
      const jeton = localStorage.getItem("jarvis_token");
      if (jeton) h["Authorization"] = "Bearer " + jeton;
    } catch (_) {}
    return h;
  }

  async function parler(texte) {
    const t = pourLaVoix(texte);
    if (!t) return;

    arreter();
    enLecture = true;
    etat("speaking");

    // Piper d'abord — voix locale, pas d'appel sortant.
    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        credentials: "same-origin",
        headers: entetes(),
        body: JSON.stringify({ text: t }),
      }).then((x) => x.json());

      if (r && r.audio_b64) {
        await new Promise((resolve) => {
          const el = new Audio("data:audio/wav;base64," + r.audio_b64);
          audioCourant = el;
          el.onended = resolve;
          el.onerror = resolve;
          el.play().catch(resolve);
        });
        audioCourant = null;
        enLecture = false;
        etat("idle");
        return;
      }
    } catch (_) {
      /* Piper indisponible : on bascule sur la voix du navigateur. */
    }

    if (window.speechSynthesis) {
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(t);
        u.lang = cfg.langueRepli;
        u.rate = cfg.vitesseRepli;
        u.onend = resolve;
        u.onerror = resolve;
        window.speechSynthesis.speak(u);
      });
    }

    enLecture = false;
    etat("idle");
  }

  /* ── Suivi du flux du chat ────────────────────────────────────────────── */

  let tampon = "";
  let enCours = false;

  // Mode "auto" : on ne parle que si le dernier tour est venu de la voix.
  // Le module vocal pose ce drapeau ; sans lui, un message tapé reste écrit.
  let dernierTourVocal = false;

  function doitParler() {
    if (cfg.mode === "jamais") return false;
    if (cfg.mode === "toujours") return true;
    return dernierTourVocal;
  }

  window.addEventListener("jarvis:ws", (e) => {
    const msg = e.detail || {};

    if (msg.type === "start") {
      tampon = "";
      enCours = true;
      arreter();
      return;
    }

    if (msg.type === "chunk" && enCours) {
      tampon += msg.content || "";
      return;
    }

    if (msg.type === "done" && enCours) {
      enCours = false;
      const texte = tampon;
      tampon = "";
      if (texte && doitParler()) parler(texte);
      dernierTourVocal = false;
    }
  });

  // Le pipeline vocal signale qu'il a pris la main : le mode auto s'aligne.
  window.addEventListener("jarvis:tour-vocal", () => { dernierTourVocal = true; });

  document.addEventListener(
    "click",
    () => { if (cfg.couperAuClic && enLecture) arreter(); },
    true
  );

  /* ── Interface publique ───────────────────────────────────────────────── */

  window.JarvisLecture = {
    parler,
    arreter,
    enLecture: () => enLecture,
    reglages: () => Object.assign({}, cfg),
    regler: enregistrer,
    modes: ["jamais", "auto", "toujours"],
    apercu: (texte) => pourLaVoix(texte),
  };
})();
