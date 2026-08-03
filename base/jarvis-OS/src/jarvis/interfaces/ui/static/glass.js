/* glass.js — Effet verre (Liquid Glass) optionnel, independant de la couleur d'accent.
   Refraction de bord (SDF cuit en carte de deplacement) + reflet specular ancre au
   monde, au lieu d'un flou gaussien uniforme — technique validee (session 2026-07-29).
   Persistance : localStorage seul, meme mecanisme que theme.js. Pas de sync serveur.
   Cible actuelle : .card (settings, conso, dashboard). Extension a d'autres surfaces
   (main, ghost-sec) a faire au besoin — voir TODO en bas de fichier. */
(function () {
  "use strict";
  var KEY = "jarvis_liquid_glass";
  var BAND = 16;         // largeur de bande (px) ou la refraction agit ; 0 = plat, cout nul
  var DISP_SCALE = 30;   // amplitude du deplacement applique par feDisplacementMap
  var ENC_SCALE = 40;    // amplitude d'encodage px -> canal (loin de la saturation 0/255)
  var LIGHT = (function () {
    var lx = -0.32, ly = -1, l = Math.hypot(lx, ly);
    return { x: lx / l, y: ly / l };
  })(); // lumiere ancree au monde, jamais a l'objet — invariante par deplacement

  function enabled() {
    try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function setEnabled(v) {
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch (e) {}
    apply(v);
    try { window.dispatchEvent(new CustomEvent("jarvis:glass", { detail: { on: v } })); } catch (e) {}
  }

  // ── SDF rectangle arrondi (Inigo Quilez) ──
  function sdRoundedBox(px, py, bx, by, r) {
    var qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  }

  // ── bake : un canvas RGBA -> dataURL. R/G = deplacement (feDisplacementMap),
  //    A = intensite specular (extraite via feColorMatrix cote SVG). Cout : une
  //    fois par geometrie (taille/rayon), jamais par image. ──
  function bake(w, h, radius) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var r = Math.min(radius, Math.min(w, h) / 2);
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d");
    var img = ctx.createImageData(w, h);
    var bx = w / 2, by = h / 2, eps = 1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var px = x - bx + 0.5, py = y - by + 0.5;
        var d = sdRoundedBox(px, py, bx, by, r);
        var dx = 0, dy = 0, spec = 0;
        if (d > -BAND && d < 2) {
          var dxp = sdRoundedBox(px + eps, py, bx, by, r) - sdRoundedBox(px - eps, py, bx, by, r);
          var dyp = sdRoundedBox(px, py + eps, bx, by, r) - sdRoundedBox(px, py - eps, bx, by, r);
          var nl = Math.hypot(dxp, dyp) || 1;
          var nx = dxp / nl, ny = dyp / nl;
          var t = 1 - Math.min(Math.max((-d) / BAND, 0), 1); // 1 au bord, 0 a -BAND
          var falloff = t * t;
          dx = nx * falloff; dy = ny * falloff;
          spec = Math.max(nx * -LIGHT.x + ny * -LIGHT.y, 0) * falloff;
        }
        var i = (y * w + x) * 4;
        img.data[i]     = Math.max(0, Math.min(255, 128 + dx * ENC_SCALE)); // R = dx
        img.data[i + 1] = Math.max(0, Math.min(255, 128 + dy * ENC_SCALE)); // G = dy
        img.data[i + 2] = 0;
        img.data[i + 3] = Math.max(0, Math.min(255, spec * 255));           // A = specular
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }

  var svgRoot = null, defs = null, seq = 0;
  var registry = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  function ensureSvg() {
    if (svgRoot) return;
    var ns = "http://www.w3.org/2000/svg";
    svgRoot = document.createElementNS(ns, "svg");
    svgRoot.setAttribute("width", "0"); svgRoot.setAttribute("height", "0");
    svgRoot.style.cssText = "position:absolute;overflow:hidden;pointer-events:none;";
    defs = document.createElementNS(ns, "defs");
    svgRoot.appendChild(defs);
    document.body.appendChild(svgRoot);
  }

  // ── un <filter> SVG par element : refraction de bord + reflet, composites via feBlend screen ──
  function makeFilter() {
    ensureSvg();
    var ns = "http://www.w3.org/2000/svg";
    var id = "jg-filter-" + (seq++);
    var filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("x", "-20%"); filter.setAttribute("y", "-20%");
    filter.setAttribute("width", "140%"); filter.setAttribute("height", "140%");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    var feImage = document.createElementNS(ns, "feImage");
    feImage.setAttribute("result", "map");
    feImage.setAttribute("preserveAspectRatio", "none");

    var feDisp = document.createElementNS(ns, "feDisplacementMap");
    feDisp.setAttribute("in", "SourceGraphic"); feDisp.setAttribute("in2", "map");
    feDisp.setAttribute("scale", String(DISP_SCALE));
    feDisp.setAttribute("xChannelSelector", "R"); feDisp.setAttribute("yChannelSelector", "G");
    feDisp.setAttribute("result", "displaced");

    var feColorMatrix = document.createElementNS(ns, "feColorMatrix");
    feColorMatrix.setAttribute("in", "map"); feColorMatrix.setAttribute("type", "matrix");
    feColorMatrix.setAttribute("values", "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"); // A sortie = A entree
    feColorMatrix.setAttribute("result", "specA");

    var feFlood = document.createElementNS(ns, "feFlood");
    feFlood.setAttribute("flood-color", "#ffffff"); feFlood.setAttribute("result", "white");

    var feComposite = document.createElementNS(ns, "feComposite");
    feComposite.setAttribute("in", "white"); feComposite.setAttribute("in2", "specA");
    feComposite.setAttribute("operator", "in"); feComposite.setAttribute("result", "specWhite");

    var feBlend = document.createElementNS(ns, "feBlend");
    feBlend.setAttribute("in", "displaced"); feBlend.setAttribute("in2", "specWhite");
    feBlend.setAttribute("mode", "screen");

    filter.appendChild(feImage); filter.appendChild(feDisp);
    filter.appendChild(feColorMatrix); filter.appendChild(feFlood);
    filter.appendChild(feComposite); filter.appendChild(feBlend);
    defs.appendChild(filter);
    return { id: id, feImage: feImage, filter: filter };
  }

  function refresh(el, entry) {
    var w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    if (w === entry.w && h === entry.h) return; // meme geometrie : rien a recuire
    var radius = parseFloat(getComputedStyle(el).borderRadius) || 14;
    entry.w = w; entry.h = h;
    var url = bake(w, h, radius);
    entry.feImage.setAttribute("width", w);
    entry.feImage.setAttribute("height", h);
    entry.feImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
    entry.feImage.setAttribute("href", url);
    el.style.setProperty("--jg-filter", 'url("#' + entry.id + '") saturate(150%)');
  }

  // Le bake coûte ~250 ms sur une grande carte : sans anti-rebond, un
  // redimensionnement de fenetre le relance a chaque image et fige l'UI.
  function debounced(fn, ms) {
    var t = null;
    return function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn(); }, ms);
    };
  }

  var watched = []; // {el, entry, ro} — pour pouvoir tout defaire proprement

  function watch(el) {
    if (registry && registry.has(el)) return;
    var f = makeFilter();
    var entry = { id: f.id, feImage: f.feImage, filter: f.filter, w: 0, h: 0 };
    if (registry) registry.set(el, entry);
    refresh(el, entry);
    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(debounced(function () { refresh(el, entry); }, 150));
      ro.observe(el);
    }
    el.classList.add("j-glass");
    watched.push({ el: el, entry: entry, ro: ro });
  }

  // Les pages font `root.innerHTML = ""` a chaque navigation : sans ce menage,
  // chaque passage laisse derriere lui un <filter> orphelin dans <defs>.
  function sweep() {
    for (var i = watched.length - 1; i >= 0; i--) {
      var w = watched[i];
      if (document.contains(w.el)) continue;
      if (w.ro) w.ro.disconnect();
      if (w.entry.filter && w.entry.filter.parentNode) {
        w.entry.filter.parentNode.removeChild(w.entry.filter);
      }
      if (registry) registry.delete(w.el);
      watched.splice(i, 1);
    }
  }

  function teardown() {
    for (var i = 0; i < watched.length; i++) {
      var w = watched[i];
      if (w.ro) w.ro.disconnect();
      if (w.entry.filter && w.entry.filter.parentNode) {
        w.entry.filter.parentNode.removeChild(w.entry.filter);
      }
      w.el.classList.remove("j-glass");
      w.el.style.removeProperty("--jg-filter");
      if (registry) registry.delete(w.el);
    }
    watched.length = 0;
  }

  function scan() {
    sweep();
    var nodes = document.querySelectorAll(".card:not(.j-glass)");
    for (var i = 0; i < nodes.length; i++) watch(nodes[i]);
  }

  var mo = null;
  function apply(on) {
    document.documentElement.classList.toggle("liquid-glass-active", !!on);
    if (!on) {
      // Sans ceci l'observateur continue de cuire des cartes effet eteint.
      if (mo) { mo.disconnect(); mo = null; }
      teardown();
      return;
    }
    scan();
    if (!mo && window.MutationObserver) {
      mo = new MutationObserver(debounced(scan, 80));
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.JarvisGlass = { enabled: enabled, setEnabled: setEnabled };

  function boot() { apply(enabled()); }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);

  // Suit les changements faits depuis un autre onglet/page (parite theme.js).
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(enabled());
  });
})();

/* TODO (non fait, a la prochaine session) :
   - Etendre la cible au-delà de .card (main du chat, .ghost-sec si on lui donne un fond)
   - Contraste adaptatif (luminance echantillonnee sous l'element, hystérésis) — necessite
     un acces aux pixels reellement affiches derriere l'element, pas encore implemente
   - Bake hors thread principal (OffscreenCanvas + Worker) : ~250 ms pour une carte
     1600x900, l'anti-rebond masque le probleme mais ne le supprime pas
   - Verification visuelle reelle dans Jarvis (le prototype a ete valide hors-app,
     via CSS.supports + inspection des cartes de deplacement, pas par capture d'ecran) */
