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
    dock: {                // barre d'outils de l'accueil (02/08)
      pos: "bas-centre",   // 9 ancrages, cf. DOCK_POS
      draggable: false,    // libère le glisser-déposer
      x: null, y: null,    // position libre, en % du viewport
    },
    hide: {                // éléments de l'accueil retirables (02/08)
      clock: false, orb: false, channel: false, dock: false,
    },
  };

  /* Les neuf ancrages possibles de la barre d'outils. */
  var DOCK_POS = [
    "haut-gauche",  "haut-centre",  "haut-droite",
    "milieu-gauche", "centre",      "milieu-droite",
    "bas-gauche",   "bas-centre",   "bas-droite",
  ];

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

    // 02/08 — date sous l'horloge, et éléments retirés de l'accueil
    root.classList.toggle("no-date", !p.date.show);
    root.classList.toggle("hide-clock", !!p.hide.clock);
    root.classList.toggle("hide-orb", !!p.hide.orb);
    root.classList.toggle("hide-channel", !!p.hide.channel);
    root.classList.toggle("hide-dock", !!p.hide.dock);
    applyDock();

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

  /* ── Barre d'outils de l'accueil (02/08) ──────────────────────────────
     Tout le placement est en CSS, pilote par data-pos : neuf ancrages. Si le
     Maitre l'a deplacee a la main, x/y prennent le dessus — stockes en % du
     viewport, pour que la barre reste a sa place quand la fenetre change de
     taille. */
  function applyDock() {
    var d = get().dock;
    var node = document.getElementById("home-controls");
    if (!node) return;
    node.dataset.pos = DOCK_POS.indexOf(d.pos) >= 0 ? d.pos : "bas-centre";
    node.classList.toggle("is-draggable", !!d.draggable);
    var free = !!(d.draggable && d.x != null && d.y != null);
    node.classList.toggle("is-free", free);
    node.style.left = free ? d.x + "%" : "";
    node.style.top  = free ? d.y + "%" : "";
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
    DOCK_POS: DOCK_POS,
    get: get,
    set: set,
    reset: reset,
    apply: apply,
    formatClock: formatClock,
    formatDate: formatDate,
    clockTickMs: clockTickMs,
    refreshFavicon: refreshFavicon,
    applyBackground: applyBackground,
    applyDock: applyDock,
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
