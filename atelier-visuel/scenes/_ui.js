/* Boite a outils de dessin pour les maquettes d'interface de My Jarvis.

   Les jetons suivent l'arbitrage du Maitre : ossature et densite de Claude
   Desktop, materiau et mouvement Apple, sur l'identite Jarvis (bleu nuit,
   accent derive d'une teinte, Geist). */

export const J = {
  /* fonds — quatre plans, jamais cinq */
  bg0: "#06080D", bg1: "#0A0E16", bg2: "#0F141F", bg3: "#161C2A",
  /* lignes */
  l1: "rgba(220,232,255,.06)", l2: "rgba(220,232,255,.10)", l3: "rgba(220,232,255,.16)",
  /* textes */
  fg0: "#DCE8FF",
  fg1: "rgba(220,232,255,.78)", fg2: "rgba(220,232,255,.55)",
  fg3: "rgba(220,232,255,.36)", fg4: "rgba(220,232,255,.20)",
  /* accents */
  ac: "#4A9EFF", acSoft: "rgba(74,158,255,.14)", acLine: "rgba(74,158,255,.32)",
  gold: "#B8963E", green: "#36D399", red: "#E5484D",
  purple: "#A78BFA", amber: "#E5A23E",
  /* vocabulaire git, repris tel quel de CDS (convention externe) */
  gitAdd: "#32d74b", gitDel: "#ff2c56", gitMod: "#ffd014",
  gitMerge: "#b796ff", gitDraft: "#a6a6a6",

  /* densite compacte : les nombres de CDS */
  hCtrl: 24, hCtrlNest: 18, r: 6, icon: 16,
  padXs: 4, padSm: 6, padMd: 8, padLg: 12, padXl: 20,
  gapXs: 6, gapSm: 8, gapMd: 12, gapLg: 20, gapXl: 32,
  /* six corps, pas un de plus */
  fCaption: 11, fFootnote: 12, fCode: 12, fBody: 13, fHeading: 14, fTitle: 20,
  lCaption: 14, lFootnote: 14, lCode: 17, lBody: 18, lHeading: 18, lTitle: 24,

  sans: '"Geist","Inter",system-ui,sans-serif',
  mono: '"Geist Mono","JetBrains Mono",ui-monospace,monospace',
};

/* ── primitives ─────────────────────────────────────────────────────────── */

export function rr(g, x, y, w, h, r = J.r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function boite(g, x, y, w, h, o = {}) {
  rr(g, x, y, w, h, o.r ?? J.r);
  if (o.fond) { g.fillStyle = o.fond; g.fill(); }
  if (o.ombre) {                       // double ombre : contact + diffusion
    g.save(); g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 16;
    g.shadowOffsetY = 6; g.fillStyle = o.fond || J.bg2; g.fill(); g.restore();
    rr(g, x, y, w, h, o.r ?? J.r);
    if (o.fond) { g.fillStyle = o.fond; g.fill(); }
  }
  if (o.trait) { g.strokeStyle = o.trait; g.lineWidth = o.epais ?? 1; g.stroke(); }
}

export function txt(g, s, x, y, o = {}) {
  g.font = `${o.poids ?? 400} ${o.taille ?? J.fBody}px ${o.mono ? J.mono : J.sans}`;
  g.fillStyle = o.couleur ?? J.fg1;
  g.textAlign = o.align ?? "left";
  g.textBaseline = o.base ?? "alphabetic";
  if (o.max) s = tronquer(g, s, o.max);
  g.fillText(s, x, y);
  return g.measureText(s).width;
}

export function tronquer(g, s, max) {
  if (g.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (g.measureText(s.slice(0, m) + "…").width <= max) lo = m; else hi = m - 1;
  }
  return s.slice(0, lo) + "…";        // le surplus se replie, il ne disparait pas
}

/* Puce d'etat : le point + son libelle */
export function puce(g, x, y, couleur, libelle, o = {}) {
  g.beginPath(); g.arc(x + 3, y - 4, 3, 0, 7); g.fillStyle = couleur; g.fill();
  if (o.halo) {
    g.beginPath(); g.arc(x + 3, y - 4, 6, 0, 7);
    g.fillStyle = couleur.replace(/^#/, "#") + "33"; g.fill();
  }
  return txt(g, libelle, x + 12, y,
             { taille: J.fCaption, couleur: o.couleur ?? J.fg2 }) + 12;
}

/* Etiquette / chip */
export function chip(g, x, y, s, o = {}) {
  g.font = `${o.poids ?? 500} ${J.fCaption}px ${o.mono ? J.mono : J.sans}`;
  const w = g.measureText(s).width + J.padSm * 2 + (o.point ? 10 : 0);
  const h = 18;
  boite(g, x, y, w, h, { r: 5, fond: o.fond ?? J.bg3, trait: o.trait });
  let tx = x + J.padSm;
  if (o.point) {
    g.beginPath(); g.arc(x + J.padSm + 3, y + h / 2, 3, 0, 7);
    g.fillStyle = o.point; g.fill();
    tx += 10;
  }
  txt(g, s, tx, y + h / 2 + 4,
      { taille: J.fCaption, poids: o.poids ?? 500, couleur: o.couleur ?? J.fg1, mono: o.mono });
  return w;
}

/* Bouton — hauteur 24, rayon 6, quatre etats dont « occupe » */
export function bouton(g, x, y, s, o = {}) {
  g.font = `500 ${J.fCaption}px ${J.sans}`;
  const w = o.w ?? g.measureText(s).width + J.padLg * 2;
  const h = o.h ?? J.hCtrl;
  const styles = {
    primaire:  { fond: J.fg0,   texte: J.bg0 },
    accent:    { fond: J.ac,    texte: "#04101f" },
    danger:    { fond: J.red,   texte: "#fff" },
    second:    { fond: "rgba(220,232,255,.06)", texte: J.fg0, trait: J.l2 },
    fantome:   { fond: null,    texte: J.fg2 },
    occupe:    { fond: "rgba(220,232,255,.5)", texte: "rgba(6,8,13,.6)" },
  };
  const st = styles[o.style || "second"];
  boite(g, x, y, w, h, { r: J.r, fond: st.fond, trait: st.trait });
  if (o.focus) {                        // triple ombre de focus
    rr(g, x - 1, y - 1, w + 2, h + 2, J.r + 1);
    g.strokeStyle = J.ac; g.lineWidth = 1; g.stroke();
    rr(g, x - 3, y - 3, w + 6, h + 6, J.r + 3);
    g.strokeStyle = J.acSoft; g.lineWidth = 3; g.stroke();
  }
  txt(g, s, x + w / 2, y + h / 2 + 4,
      { taille: J.fCaption, poids: 500, couleur: st.texte, align: "center" });
  return w;
}

/* En-tete de chapitre, a la maniere de Jarvis : « IV | CODE » */
export function chapitre(g, x, y, romain, libelle) {
  txt(g, romain, x, y, { taille: J.fCaption, poids: 600, couleur: J.ac, mono: true });
  g.fillStyle = J.l3; g.fillRect(x + 20, y - 8, 1, 10);
  txt(g, libelle, x + 30, y,
      { taille: J.fCaption, poids: 600, couleur: J.fg2 });
}

/* Onglets de pages numerotees, comme pageWrapper() de Jarvis */
export function pages(g, x, y, w, liste, actif) {
  let cx = x;
  liste.forEach((p, i) => {
    const num = String(i + 1).padStart(2, "0");
    g.font = `500 ${J.fCaption}px ${J.sans}`;
    const lw = g.measureText(p).width + 26 + J.padMd * 2;
    if (i === actif) {
      boite(g, cx, y, lw, 22, { r: 5, fond: J.acSoft, trait: J.acLine });
    }
    txt(g, num, cx + J.padMd, y + 15,
        { taille: J.fCaption, mono: true, couleur: i === actif ? J.ac : J.fg4 });
    txt(g, p, cx + J.padMd + 24, y + 15,
        { taille: J.fCaption, poids: 500, couleur: i === actif ? J.fg0 : J.fg3 });
    cx += lw + J.gapXs;
  });
  return cx;
}

/* Ligne de code coloree — coloration simplifiee, suffisante en maquette */
export function ligneCode(g, x, y, n, s, o = {}) {
  txt(g, String(n).padStart(3, " "), x, y,
      { taille: J.fCode, mono: true, couleur: J.fg4 });
  const bx = x + 30;
  if (o.marque) {                    // + / - du diff
    g.fillStyle = o.marque === "+" ? "rgba(50,215,75,.10)" : "rgba(255,44,86,.10)";
    g.fillRect(bx - 6, y - 11, (o.largeur ?? 400), J.lCode);
    txt(g, o.marque, bx - 4, y,
        { taille: J.fCode, mono: true,
          couleur: o.marque === "+" ? J.gitAdd : J.gitDel });
  }
  // coloration par mots-cles
  const jetons = s.split(/(\s+|[(){}[\],.;:=<>+\-*/])/);
  const cles = /^(const|let|var|function|return|if|else|for|while|import|from|export|async|await|class|new|def|self|True|False|None|fn|pub|use|impl|struct|match)$/;
  let cx = bx + (o.marque ? 10 : 0);
  g.font = `400 ${J.fCode}px ${J.mono}`;
  for (const jt of jetons) {
    let c = J.fg1;
    if (cles.test(jt)) c = J.purple;
    else if (/^["'`]/.test(jt) || /^".*"$/.test(jt)) c = J.green;
    else if (/^\d+$/.test(jt)) c = J.amber;
    else if (/^[(){}[\],.;:=<>+\-*/]$/.test(jt)) c = J.fg3;
    else if (/^#|^\/\//.test(jt)) c = J.fg3;
    g.fillStyle = c;
    g.fillText(jt, cx, y);
    cx += g.measureText(jt).width;
  }
}

/* Barre de progression fine */
export function jauge(g, x, y, w, p, couleur = J.ac) {
  boite(g, x, y, w, 3, { r: 2, fond: "rgba(220,232,255,.08)" });
  boite(g, x, y, Math.max(2, w * p), 3, { r: 2, fond: couleur });
}

/* Grain + vignettage — la texture de Jarvis, en fin de dessin */
export function texture(g, w, h) {
  const grd = g.createRadialGradient(w / 2, h / 2, h * .3, w / 2, h / 2, h * .95);
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(1, "rgba(0,0,0,.55)");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}
