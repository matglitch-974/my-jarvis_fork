/* MyJarvis — teinte pilote v2 (source unique de vérité des couleurs d'accent).
   Autonome, sans dépendance : chargé AVANT tout autre script/CSS d'accent.

   Nouveautés (demandes 2·3·4·5 du Maître) :
     - coloris MULTI-COULEURS : primaire / secondaire / tertiaire par palette ;
     - nouveaux coloris (marron, cuivre, or, cyan, indigo, corail…) ;
     - couleur LIBRE et précise : teinte + saturation + luminosité + alpha,
       stockée telle quelle, sans passer par la table de presets ;
     - l'icône MyJarvis (brandMark + favicon) suit la teinte : voir --icon-rgb.

   Pose sur <html> :
     --accent-rgb / --accent-2-rgb / --accent-3-rgb   (pilotes)
     --accent, --accent-soft, --accent-line, --accent-hi, --accent-dim
     --accent-2, --accent-3, --accent-h/s/l, --accent-a
     --icon-rgb  (accent éclairci de 10 % puis saturé de 17 % — cercle du logo)
   Toute couleur d'accent de l'UI doit s'écrire rgba(var(--accent-rgb), α). */
(function () {
  "use strict";

  /* ── Palettes ────────────────────────────────────────────────────────────
     p = primaire (obligatoire), s = secondaire, t = tertiaire.
     Sans s/t, ils sont dérivés par rotation de teinte (±32°) comme avant. */
  var THEMES = {
    /* — Monochromes historiques — */
    bleu:      { label: "Bleu",      rgb: "74, 158, 255" },
    violet:    { label: "Violet",    rgb: "167, 139, 250" },
    vert:      { label: "Vert",      rgb: "52, 211, 153" },
    ambre:     { label: "Ambre",     rgb: "245, 180, 80" },
    rose:      { label: "Rose",      rgb: "244, 114, 182" },
    graphite:  { label: "Graphite",  rgb: "150, 165, 190" },

    /* — Nouveaux monochromes (demande 4) — */
    cyan:      { label: "Cyan",      rgb: "56, 209, 226" },
    emeraude:  { label: "Émeraude",  rgb: "16, 185, 129" },
    or:        { label: "Or",        rgb: "224, 178, 62" },
    cuivre:    { label: "Cuivre",    rgb: "205, 127, 68" },
    marron:    { label: "Marron",    rgb: "150, 105, 72" },
    rouge:     { label: "Rouge",     rgb: "239, 92, 92" },
    corail:    { label: "Corail",    rgb: "255, 138, 112" },
    magenta:   { label: "Magenta",   rgb: "226, 88, 190" },
    indigo:    { label: "Indigo",    rgb: "116, 124, 245" },
    lavande:   { label: "Lavande",   rgb: "186, 170, 240" },
    menthe:    { label: "Menthe",    rgb: "126, 226, 190" },
    ardoise:   { label: "Ardoise",   rgb: "120, 140, 170" },
    ivoire:    { label: "Ivoire",    rgb: "232, 226, 208" },

    /* — Coloris à couleurs multiples (demande 3) — */
    aurore:     { label: "Aurore",     rgb: "244, 114, 182", s: "167, 139, 250", t: "74, 158, 255", multi: true },
    crepuscule: { label: "Crépuscule", rgb: "245, 158, 80",  s: "236, 108, 138", t: "150, 108, 220", multi: true },
    ocean:      { label: "Océan",      rgb: "60, 140, 255",  s: "56, 209, 226",  t: "52, 211, 153", multi: true },
    braise:     { label: "Braise",     rgb: "239, 92, 66",   s: "245, 158, 60",  t: "224, 190, 80", multi: true },
    neon:       { label: "Néon",       rgb: "226, 70, 200",  s: "60, 226, 226",  t: "150, 245, 96", multi: true },
    foret:      { label: "Forêt",      rgb: "48, 168, 110",  s: "138, 176, 74",  t: "212, 178, 76", multi: true },
    terre:      { label: "Terre",      rgb: "150, 105, 72",  s: "196, 148, 96",  t: "120, 140, 118", multi: true },
    nuit:       { label: "Nuit",       rgb: "96, 118, 220",  s: "138, 106, 214", t: "70, 176, 214", multi: true },
  };
  var DEFAULT = "bleu";

  var K_THEME  = "jarvis_theme";        // id de preset, ou "custom"
  var K_CUSTOM = "jarvis_theme_custom"; // JSON { p, s, t, a }

  /* ── Conversions ─────────────────────────────────────────────────────── */
  function toHsl(rgbStr) {
    var p = String(rgbStr).split(",").map(function (n) { return parseInt(n, 10) / 255; });
    var max = Math.max(p[0], p[1], p[2]), min = Math.min(p[0], p[1], p[2]);
    var l = (max + min) / 2, d = max - min, h = 0, s = 0;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === p[0]) h = 60 * (((p[1] - p[2]) / d) % 6);
      else if (max === p[1]) h = 60 * ((p[2] - p[0]) / d + 2);
      else h = 60 * ((p[0] - p[1]) / d + 4);
    }
    return [(h + 360) % 360, s * 100, l * 100];
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.min(100, Math.max(0, s)) / 100; l = Math.min(100, Math.max(0, l)) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function rgbStr(arr) { return arr[0] + ", " + arr[1] + ", " + arr[2]; }

  function hexOf(rgbString) {
    return "#" + String(rgbString).split(",").map(function (n) {
      return ("0" + (parseInt(n, 10) & 255).toString(16)).slice(-2);
    }).join("");
  }

  function parseHex(hex) {
    var m = String(hex).trim().replace(/^#/, "");
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
    return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  }

  /* Éclaircit une couleur en la mélangeant vers le blanc (0 = inchangé, 1 = blanc). */
  function lighten(rgbString, k) {
    var p = String(rgbString).split(",").map(function (n) { return parseInt(n, 10); });
    return rgbStr(p.map(function (v) { return Math.round(v + (255 - v) * k); }));
  }

  /* Sature une couleur d'un facteur RELATIF (0.17 = +17 %) en écartant les
     canaux de leur gris de luminance — exactement la définition du filtre
     CSS `saturate()`. On n'utilise PAS la saturation HSL : les teintes vives
     y sont déjà à 100 %, un facteur n'y produirait aucun effet visible.
     Une couleur grise reste grise. */
  function saturate(rgbString, k) {
    var p = String(rgbString).split(",").map(function (n) { return parseInt(n, 10); });
    var grey = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    return rgbStr(p.map(function (v) {
      return Math.max(0, Math.min(255, Math.round(grey + (v - grey) * (1 + k))));
    }));
  }

  /* Couleur du cercle du logo, dérivée de l'accent : éclaircie de 10 %
     (01/08) puis saturée de 17 % (02/08). Un seul point de vérité. */
  var ICON_LIGHTEN = 0.10, ICON_SATURATE = 0.17;
  function iconFrom(rgbString) {
    return saturate(lighten(rgbString, ICON_LIGHTEN), ICON_SATURATE);
  }

  /* ── État courant ────────────────────────────────────────────────────── */
  function currentId() {
    try {
      var id = localStorage.getItem(K_THEME);
      if (id === "custom") return "custom";
      return id && THEMES[id] ? id : DEFAULT;
    } catch (e) { return DEFAULT; }
  }

  function customValue() {
    try {
      var raw = localStorage.getItem(K_CUSTOM);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.p) return null;
      return { p: o.p, s: o.s || null, t: o.t || null, a: (o.a == null ? 1 : Number(o.a)) };
    } catch (e) { return null; }
  }

  /* Renvoie { p, s, t, a, label, multi } pour l'id courant. */
  function resolve(id) {
    if (id === "custom") {
      var c = customValue();
      if (c) return { p: c.p, s: c.s, t: c.t, a: c.a, label: "Sur mesure", multi: !!(c.s || c.t) };
      id = DEFAULT;
    }
    var t = THEMES[id] || THEMES[DEFAULT];
    return { p: t.rgb, s: t.s || null, t: t.t || null, a: 1, label: t.label, multi: !!t.multi };
  }

  /* ── Application ─────────────────────────────────────────────────────── */
  function apply(id) {
    var r = resolve(id);
    var hsl = toHsl(r.p);
    var h = hsl[0].toFixed(1), sa = hsl[1].toFixed(1) + "%", li = hsl[2].toFixed(1) + "%";
    var sec = r.s || rgbStr(hslToRgb(hsl[0] + 32, hsl[1], hsl[2]));
    var ter = r.t || rgbStr(hslToRgb(hsl[0] + 328, hsl[1], hsl[2]));
    var alpha = (r.a == null ? 1 : r.a);

    var s = document.documentElement.style;
    s.setProperty("--accent-rgb", r.p);
    s.setProperty("--accent-2-rgb", sec);
    s.setProperty("--accent-3-rgb", ter);
    s.setProperty("--accent-a", String(alpha));
    s.setProperty("--accent-h", h);
    s.setProperty("--accent-s", sa);
    s.setProperty("--accent-l", li);
    s.setProperty("--accent", "rgba(" + r.p + ", " + alpha + ")");
    s.setProperty("--accent-soft", "rgba(" + r.p + ", " + (0.14 * alpha).toFixed(3) + ")");
    s.setProperty("--accent-line", "rgba(" + r.p + ", " + (0.32 * alpha).toFixed(3) + ")");
    s.setProperty("--accent-hi", "hsl(" + h + " " + sa + " 80%)");
    s.setProperty("--accent-dim", "hsl(" + h + " " + sa + " 50%)");
    s.setProperty("--accent-2", "rgb(" + sec + ")");
    s.setProperty("--accent-3", "rgb(" + ter + ")");
    /* Cercle du logo : la teinte, éclaircie de 10 % puis saturée de 17 %. */
    s.setProperty("--icon-rgb", iconFrom(r.p));

    try { localStorage.setItem(K_THEME, id === "custom" ? "custom" : (THEMES[id] ? id : DEFAULT)); } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent("jarvis:theme", {
        detail: { id: id, rgb: r.p, secondary: sec, tertiary: ter, alpha: alpha },
      }));
    } catch (e) {}
  }

  /* Enregistre puis applique une couleur libre.
     v = { p:"r,g,b", s?:"r,g,b", t?:"r,g,b", a?:0..1 } */
  function applyCustom(v) {
    var payload = {
      p: v && v.p ? v.p : THEMES[DEFAULT].rgb,
      s: v && v.s ? v.s : null,
      t: v && v.t ? v.t : null,
      a: v && v.a != null ? Number(v.a) : 1,
    };
    try { localStorage.setItem(K_CUSTOM, JSON.stringify(payload)); } catch (e) {}
    apply("custom");
  }

  window.JarvisTheme = {
    THEMES: THEMES,
    DEFAULT: DEFAULT,
    current: currentId,
    resolve: resolve,
    custom: customValue,
    apply: apply,
    applyCustom: applyCustom,
    /* Utilitaires exposés au sélecteur de couleur précis (settings.js). */
    toHsl: toHsl,
    hslToRgb: hslToRgb,
    rgbStr: rgbStr,
    hexOf: hexOf,
    parseHex: parseHex,
    lighten: lighten,
    saturate: saturate,
    rgb: function () {
      return (getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-rgb").trim()) || THEMES[DEFAULT].rgb;
    },
    rgb2: function () {
      return (getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-2-rgb").trim()) || THEMES[DEFAULT].rgb;
    },
    rgb3: function () {
      return (getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-3-rgb").trim()) || THEMES[DEFAULT].rgb;
    },
    hex: function () { return hexOf(window.JarvisTheme.rgb()); },
    /* Couleur du cercle de l'icône : accent éclairci de 10 %, saturé de 17 %. */
    iconRGB: function () {
      return (getComputedStyle(document.documentElement)
        .getPropertyValue("--icon-rgb").trim()) || iconFrom(THEMES[DEFAULT].rgb);
    },
    iconHex: function () { return hexOf(window.JarvisTheme.iconRGB()); },
  };

  // Applique immédiatement (avant le premier paint → aucun flash).
  apply(currentId());

  // Suit les changements faits depuis un autre onglet/page.
  window.addEventListener("storage", function (e) {
    if (e.key === K_THEME || e.key === K_CUSTOM) apply(currentId());
  });
})();
