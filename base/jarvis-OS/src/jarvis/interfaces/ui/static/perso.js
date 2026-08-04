/* perso.js — Personnalisation (Réglages › Apparence, alias « Perso »).
   Chargé juste après theme.js, sur toutes les pages, AVANT le premier paint.

   Couvre les demandes du Maître :
     1/2  cercle du logo — épaisseur +20 %, teinte suivie (via --icon-rgb)
     7    mot « JARVIS » de l'accueil, affichable ou non
    11    type d'affichage de l'horloge (chaîne millièmes→année) + taille
    12    taille de la boule Jarvis (−17 % par défaut)
    17    fond : noir, couleur libre, ou photo (nette en accueil, floue ailleurs)
    18    effet de luisance débrayable

   Persistance : localStorage seul (même mécanique que theme.js / glass.js).
   La photo, elle, vit côté serveur (/api/perso/wallpaper) : trop lourde
   pour localStorage, et on la veut partagée entre les onglets. */
(function () {
  "use strict";

  var KEY = "jarvis_perso";

  var DEFAULTS = {
    glow: true,
    bg: {
      mode: "noir",        // noir | couleur | image
      color: "#06080D",
      image: "",           // URL servie par le backend
      dim: 0.42,           // voile sombre par-dessus la photo (0 → 1)
      blur: 26,            // flou (px) appliqué hors accueil
    },
    orbScale: 0.83,        // 17 % plus petite qu'avant (demande 12)
    brand: false,          // « JARVIS » masqué par défaut (demande 7)
    brandSize: 150,        // px — hauteur du mot « JARVIS » (02/08)
    clock: {
      mode: "classique",   // classique | chaine
      segments: 7,         // 1 = année … 8 = microsecondes (02/08)
      weekday: true,       // lettre du jour, tout à gauche
      size: 136,           // px
    },
    date: {                // ligne sous l'horloge (02/08)
      show: true,
      format: "complet",   // complet | court | numerique
    },
    // Chaque élément de l'accueil porte les MEMES trois reglages (02/08).
    // Rempli a partir de ELEMENTS juste apres, pour n'ecrire la liste qu'une
    // fois : ajouter un element ne demande qu'une ligne dans ELEMENTS.
    elements: {},
  };

  /* Les neuf ancrages possibles. */
  var ANCRAGES = [
    "haut-gauche",   "haut-centre", "haut-droite",
    "milieu-gauche", "centre",      "milieu-droite",
    "bas-gauche",    "bas-centre",  "bas-droite",
  ];

  /* Registre des elements de l'accueil.
       id       cle de reglage et attribut data-jel
       nom      libelle affiche dans les reglages
       sel      selecteur CSS de l'element
       pos      ancrage par defaut
       propre   l'element gere DEJA son propre glisser-deposer (widgets) :
                on lui pose l'ancrage de depart, sans lui voler son drag. */
  var ELEMENTS = [
    { id: "barre",     nom: "Barre d'outils",   sel: "#home-controls",   pos: "bas-centre" },
    { id: "modes",     nom: "Bascule de mode",  sel: "#mode-switch",     pos: "haut-centre" },
    { id: "signature", nom: "Horloge et date",  sel: ".home-signature",  pos: "haut-droite" },
    { id: "sphere",    nom: "Sphère",           sel: ".home-orb-wrap",   pos: "centre" },
    { id: "canal",     nom: "Dernier message",  sel: ".home-channel",    pos: "bas-droite" },
    { id: "pensee",    nom: "Fil de pensée",    sel: "#thought-feed",    pos: "milieu-gauche" },
    { id: "vision",    nom: "Caméra",           sel: "#cam-overlay",     pos: "bas-gauche",    propre: true },
    { id: "musique",   nom: "Musique",          sel: "#hc-widget-music", pos: "haut-gauche",   propre: true },
    { id: "chat",      nom: "Conversation",     sel: "#hc-widget-chat",  pos: "milieu-droite", propre: true },
  ];

  ELEMENTS.forEach(function (e) {
    DEFAULTS.elements[e.id] = {
      pos: e.pos,
      deplacable: !!e.propre,  // les widgets se deplacaient deja : on le garde
      visible: true,
      x: null, y: null,        // position libre, en % du viewport
    };
  });

  function _merge(base, over) {
    var out = {}, k;
    for (k in base) {
      if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
        out[k] = _merge(base[k], (over && over[k]) || {});
      } else {
        out[k] = (over && over[k] !== undefined && over[k] !== null) ? over[k] : base[k];
      }
    }
    return out;
  }

  var _state = null;

  function get() {
    if (_state) return _state;
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { raw = null; }
    _state = _merge(DEFAULTS, raw || {});
    return _state;
  }

  function set(patch) {
    _state = _merge(get(), patch || {});
    try { localStorage.setItem(KEY, JSON.stringify(_state)); } catch (e) {}
    apply();
    try {
      window.dispatchEvent(new CustomEvent("jarvis:perso", { detail: _state }));
    } catch (e) {}
    return _state;
  }

  function reset() {
    _state = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    apply();
  }

  /* ── Couche fond (photo / couleur) ────────────────────────────────────── */
  function bgLayer() {
    var el = document.getElementById("perso-bg");
    if (el) return el;
    if (!document.body) return null;
    el = document.createElement("div");
    el.id = "perso-bg";
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  /* Le flou ne s'applique QUE hors accueil : la photo est nette sur la home,
     floutée dans Mission Control et dans les chapitres I / II / III. */
  function isHome() {
    var m = document.body && document.body.dataset ? document.body.dataset.mode : "";
    return m === "home" && !document.body.classList.contains("mc-open");
  }

  function applyBackground() {
    var p = get(), b = p.bg;
    var root = document.documentElement.style;
    root.setProperty("--perso-bg-color", b.mode === "couleur" ? b.color : "#06080D");
    root.setProperty("--perso-bg-dim", String(b.dim));
    root.setProperty("--perso-bg-blur", b.blur + "px");

    var layer = bgLayer();
    if (!layer) return;
    if (b.mode === "image" && b.image) {
      layer.style.backgroundImage = 'url("' + b.image + '")';
      layer.dataset.mode = "image";
    } else {
      layer.style.backgroundImage = "";
      layer.dataset.mode = b.mode;
    }
    document.documentElement.classList.toggle("perso-has-bg", b.mode !== "noir");
    layer.classList.toggle("is-blurred", !isHome());
  }

  /* ── Application globale ──────────────────────────────────────────────── */
  function apply() {
    var p = get();
    var root = document.documentElement;

    // 18 — luisance
    root.classList.toggle("no-glow", !p.glow);

    // 12 — taille de la boule
    root.style.setProperty("--orb-scale", String(p.orbScale));

    // 11 — taille de l'horloge
    root.style.setProperty("--clock-size", p.clock.size + "px");

    // 7 — mot JARVIS : affichage et taille
    root.classList.toggle("no-brand", !p.brand);
    root.style.setProperty("--brand-size", p.brandSize + "px");

    // 02/08 — date sous l'horloge
    root.classList.toggle("no-date", !p.date.show);

    // 02/08 — placement, deplacement et visibilite de CHAQUE element
    applyElements();

    // 17 — fond
    applyBackground();

    // 1/2 — favicon dynamique (cercle épaissi, teinte suivie)
    refreshFavicon();
  }

  /* ── Favicon : cercle affiné, couleur = teinte éclaircie puis saturée ─── */
  function refreshFavicon() {
    var color = "#405f88";
    try {
      if (window.JarvisTheme && window.JarvisTheme.iconHex) color = window.JarvisTheme.iconHex();
    } catch (e) {}
    // r=12, stroke 4 → 4.8 (+20 % le 01/08) → 4.56 (−5 % le 02/08). Le rayon
    // reste identique : c'est bien le TRAIT qui change, pas le cercle.
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<circle cx="16" cy="16" r="12" fill="none" stroke="' + color + '" stroke-width="4.56"/></svg>';
    var href = "data:image/svg+xml," + encodeURIComponent(svg);
    var link = document.querySelector('link[rel="icon"][data-perso]');
    if (!link) {
      document.querySelectorAll('link[rel="icon"]').forEach(function (n) { n.remove(); });
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.setAttribute("data-perso", "1");
      document.head.appendChild(link);
    }
    link.href = href;
  }

  /* ── Elements de l'accueil (02/08) ────────────────────────────────────
     Un seul mecanisme pour tous : le placement est en CSS, pilote par
     data-jpos (neuf ancrages). Si le Maitre a deplace l'element a la main,
     x/y prennent le dessus — stockes en % du viewport, pour que rien ne
     bouge quand la fenetre change de taille.

     Les elements marques « propre » (camera, musique, conversation) gardent
     leur glisser-deposer d'origine : on leur pose seulement l'ancrage de
     depart et la visibilite, sans leur voler leur comportement. */
  function elementsConnus() { return ELEMENTS; }

  function applyElements() {
    var etat = get().elements || {};
    ELEMENTS.forEach(function (e) {
      var r = etat[e.id] || {};
      var node = document.querySelector(e.sel);
      if (!node) return;

      node.dataset.jel = e.id;
      node.dataset.jpos = ANCRAGES.indexOf(r.pos) >= 0 ? r.pos : e.pos;
      node.classList.toggle("j-deplacable", !!r.deplacable);
      node.classList.toggle("j-cache", r.visible === false);

      var libre = !!(r.deplacable && r.x != null && r.y != null);
      node.classList.toggle("j-libre", libre);
      node.style.left = libre ? r.x + "%" : "";
      node.style.top  = libre ? r.y + "%" : "";
    });
  }

  /* Enregistre la position atteinte au glisser-deposer, en % du viewport. */
  function poserPosition(id, xPourcent, yPourcent) {
    var patch = { elements: {} };
    patch.elements[id] = { x: xPourcent, y: yPourcent };
    return set(patch);
  }

  /* ── Date sous l'horloge (02/08) ──────────────────────────────────────── */
  var JOURS = ["DIMANCHE","LUNDI","MARDI","MERCREDI","JEUDI","VENDREDI","SAMEDI"];
  var MOIS  = ["JANVIER","FÉVRIER","MARS","AVRIL","MAI","JUIN","JUILLET",
               "AOÛT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DÉCEMBRE"];

  function formatDate(d, fmt) {
    var f = fmt || get().date.format;
    var p2 = function (n) { return String(n).padStart(2, "0"); };
    if (f === "numerique") {
      return p2(d.getDate()) + "/" + p2(d.getMonth() + 1) + "/" + d.getFullYear();
    }
    if (f === "court") {
      return JOURS[d.getDay()].slice(0, 3) + ". " + d.getDate() + " " + MOIS[d.getMonth()].slice(0, 4) + ".";
    }
    return JOURS[d.getDay()] + ", " + d.getDate() + " " + MOIS[d.getMonth()] + " " + d.getFullYear();
  }

  /* ── Horloge (demande 11) ─────────────────────────────────────────────── */
  // Lettre du jour : Mercredi = « Me » pour ne pas se confondre avec Mardi.
  var WEEKDAY = ["D", "L", "M", "Me", "J", "V", "S"];

  /* Chaîne de segments, du plus fin (gauche) au plus grossier (droite).
     index 0 = millièmes … index 6 = année. `segments` compte depuis l'ANNÉE :
     segments=1 → année seule ; segments=7 → tout, millièmes compris. */
  function chainSegments(d) {
    var pad = function (n, w) { return String(n).padStart(w || 2, "0"); };
    // Date ne descend pas sous la milliseconde : les microsecondes viennent de
    // la partie fractionnaire de performance.now(), seule horloge du navigateur
    // a offrir cette finesse.
    var us = 0;
    try { us = Math.floor((performance.now() % 1) * 1000); } catch (e) {}
    return [
      pad(us, 3),                   // 8e — microsecondes (02/08)
      pad(d.getMilliseconds(), 3),  // 7e
      pad(d.getSeconds()),          // 6e
      pad(d.getMinutes()),          // 5e
      pad(d.getHours()),            // 4e
      pad(d.getDate()),             // 3e
      pad(d.getMonth() + 1),        // 2e
      String(d.getFullYear()),      // 1re (la plus à droite)
    ];
  }

  function formatClock(d) {
    var p = get();
    if (p.clock.mode !== "chaine") {
      return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }
    var all = chainSegments(d);
    var n = Math.min(8, Math.max(1, p.clock.segments | 0));
    var kept = all.slice(all.length - n); // on garde les n derniers → année incluse
    var out = kept.join(":");
    if (p.clock.weekday) out = WEEKDAY[d.getDay()] + " " + out;
    return out;
  }

  /* Cadence de rafraîchissement : au millième si la chaîne l'affiche. */
  function clockTickMs() {
    var p = get();
    if (p.clock.mode !== "chaine") return 1000;
    // Les microsecondes defilent trop vite pour l'oeil : on rafraichit au
    // rythme de l'ecran, pas plus, sinon on brule du CPU pour rien.
    if (p.clock.segments >= 8) return 16;
    if (p.clock.segments >= 7) return 60;
    if (p.clock.segments >= 6) return 250;
    return 1000;
  }

  window.JarvisPerso = {
    DEFAULTS: DEFAULTS,
    ANCRAGES: ANCRAGES,
    ELEMENTS: ELEMENTS,
    get: get,
    set: set,
    reset: reset,
    apply: apply,
    formatClock: formatClock,
    formatDate: formatDate,
    clockTickMs: clockTickMs,
    refreshFavicon: refreshFavicon,
    applyBackground: applyBackground,
    applyElements: applyElements,
    elementsConnus: elementsConnus,
    poserPosition: poserPosition,
  };

  function boot() { apply(); }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);

  // Le fond se refloute/défloute quand on change de chapitre ou qu'on ouvre
  // Mission Control : on observe l'attribut data-mode + la classe du body.
  document.addEventListener("DOMContentLoaded", function () {
    if (!window.MutationObserver) return;
    new MutationObserver(applyBackground).observe(document.body, {
      attributes: true, attributeFilter: ["data-mode", "class"],
    });
  });

  // Suit les changements faits depuis un autre onglet, et la teinte.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) { _state = null; apply(); }
  });
  window.addEventListener("jarvis:theme", refreshFavicon);
})();
