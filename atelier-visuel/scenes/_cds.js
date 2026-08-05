/* Jetons de dessin — CDS (Claude Desktop) pour l'ossature et la densite,
   HIG (Apple) pour le materiau, la concentricite et le mouvement.

   Aucune valeur de jarvis-OS ici : ni bleu nuit, ni chapitre romain, ni grain.
   Les echelles sont celles relevees dans les bundles ; l'accent est le seul
   endroit ou l'on choisit, et il se change en une ligne. */

/* ── Etage 1 : les echelles ─────────────────────────────────────────────── */

export const GRAY = {
  0:"#ffffff", 10:"#fcfcfb", 20:"#f9f9f7", 30:"#f6f6f4", 40:"#f3f3f0",
  50:"#f0efec", 60:"#edece8", 70:"#eae9e4", 80:"#e7e6e1", 90:"#e4e3dd",
  100:"#e1e0d9", 150:"#d2d1c7", 200:"#c3c2b7", 250:"#b4b3a8", 300:"#a5a49a",
  350:"#97958d", 400:"#898781", 450:"#7b7974", 500:"#6d6b67", 550:"#5f5e5a",
  600:"#52514e", 650:"#454442", 700:"#383835", 750:"#2c2c2a", 800:"#20201f",
  810:"#1e1e1d", 820:"#1c1c1b", 830:"#1a1a19", 840:"#181817", 850:"#151515",
  860:"#131313", 870:"#111111", 880:"#0f0f0f", 890:"#0d0d0d", 900:"#0b0b0b",
};

export const BLUE = {
  50:"#e7f1fb", 100:"#cde2fb", 150:"#b7d3f6", 200:"#9ec5f4", 250:"#86b6ef",
  300:"#6da7ec", 350:"#5598e7", 400:"#3987e5", 450:"#2a78d6", 500:"#256abf",
  550:"#1c5cab", 600:"#184f95", 700:"#0d366b", 800:"#032042",
};
export const RED = {
  100:"#fad6d6", 250:"#f09595", 300:"#ec7e7e", 400:"#e34948", 450:"#d03b3b",
  600:"#8e2626", 700:"#641919", 800:"#3c0e0e",
};
export const GREEN = {
  100:"#caeac7", 250:"#73cb6d", 400:"#0ca30c", 450:"#009300", 500:"#008300",
  600:"#006300", 700:"#074506", 800:"#11260f",
};
export const YELLOW = {
  100:"#f9dca4", 200:"#fab219", 250:"#eda100", 300:"#db9300", 350:"#c98500",
  600:"#734500", 700:"#512e00", 800:"#311a00",
};
export const VIOLET = {
  100:"#dfdbfd", 250:"#b0a7f2", 300:"#a096eb", 350:"#9085e9", 450:"#7161e0",
  600:"#4a3aa7", 700:"#322777", 800:"#1d1649",
};
export const AQUA  = { 100:"#bfebdb", 350:"#1baf7a", 400:"#199e70", 600:"#065f49" };
export const ORANGE= { 100:"#f7d8cb", 300:"#ec835a", 350:"#eb6834", 400:"#d95926" };

/* ── Etage 4 : les roles, resolus pour un mode ──────────────────────────── */

const CRANS = [0,10,20,30,40,50,60,70,80,90,100,150,200,250,300,350,400,450,
               500,550,600,650,700,750,800,810,820,830,840,850,860,870,880,890,900];

function alpha(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${pct/100})`;
}

export function palette(mode = "light") {
  const noir = mode === "dark";
  // le remappage des neutres : une seule table a retourner
  const N = {};
  CRANS.forEach((c, i) => { N[c] = GRAY[noir ? CRANS[CRANS.length - 1 - i] : c]; });
  const A = p => alpha(N[900], p);

  return {
    mode, N,
    /* alphas — noirs en clair, blancs en sombre, sans y penser */
    a1:A(5), a2:A(10), a3:A(20), a4:A(35), a5:A(50), a6:A(60), a8:A(85),

    /* quatre plans, jamais cinq */
    s0: noir ? GRAY[890] : GRAY[20],
    s1: noir ? GRAY[830] : GRAY[10],
    s2: noir ? GRAY[750] : GRAY[0],
    s3: noir ? GRAY[700] : GRAY[0],

    /* textes */
    t0: N[900],
    t1: noir ? GRAY[200] : GRAY[600],
    t2: noir ? GRAY[400] : GRAY[400],
    t3: A(35),

    /* bordures */
    bd: A(10), bdFort: A(20),

    /* accent — le seul choix ; tout le reste en decoule */
    ac: BLUE[450], acHover: BLUE[400],
    acTexte: noir ? BLUE[300] : BLUE[600],
    acFond:  noir ? BLUE[800] : BLUE[100],
    acBord:  noir ? BLUE[700] : BLUE[250],
    surAc: "#ffffff",

    /* etats */
    ok: GREEN[450], okTexte: noir ? GREEN[400] : GREEN[600],
    okFond: noir ? GREEN[800] : GREEN[100], surOk: GRAY[900],
    alerte: YELLOW[200], alerteTexte: noir ? YELLOW[300] : YELLOW[600],
    alerteFond: noir ? YELLOW[800] : YELLOW[100], surAlerte: GRAY[900],
    danger: RED[450], dangerTexte: noir ? RED[300] : RED[600],
    dangerFond: noir ? RED[800] : RED[100],
    pro: VIOLET[450], proTexte: noir ? VIOLET[300] : VIOLET[600],
    proFond: noir ? VIOLET[800] : VIOLET[100],

    /* remplissages */
    fPrim: N[900], fPrimHover: noir ? GRAY[100] : GRAY[750],
    surPrim: N[0],
    fSecond: noir ? A(10) : "rgba(255,255,255,.10)",
    fSecondHover: noir ? "rgba(255,255,255,.14)" : A(5),
    fFantomeHover: A(5),
    fControle: A(10), fControleHover: A(20),
    fChamp: noir ? A(10) : "rgba(255,255,255,.50)",
    fDesactive: A(5),

    /* vocabulaire git — convention externe, codee en dur des deux cotes */
    gitAdd:  noir ? "#32d74b" : "#1e9e3c",
    gitDel:  noir ? "#ff2c56" : "#cd2054",
    gitMod:  noir ? "#ffd014" : "#98801f",
    gitMerge:noir ? "#b796ff" : "#8e6bd9",
    gitDraft:noir ? "#a6a6a6" : "#737373",

    /* ombres — toujours doubles : contact court + diffusion longue */
    ombreCouleur: noir ? "rgba(0,0,0,.24)" : alpha(GRAY[900], 8),
    ombreContact: noir ? "rgba(0,0,0,.32)" : alpha(GRAY[900], 7),
    voile: noir ? "rgba(0,0,0,.50)" : "rgba(0,0,0,.38)",
  };
}

/* ── Densite : les nombres de CDS, mode compact ─────────────────────────── */

export const D = {
  r: 6, rXs: 5, rLg: 7,
  hCtrl: 24, hCtrlXs: 20, hCtrlLg: 28, hNest: 18,
  icon: 16, iconXs: 12,
  padXs: 4, padSm: 6, padMd: 8, padLg: 12, padXl: 20,
  gapXs: 6, gapSm: 8, gapMd: 12, gapLg: 20, gapXl: 32,
  fCaption: 11, fFootnote: 12, fCode: 12, fBody: 13, fHeading: 14, fTitle: 20,
  lCaption: 14, lFootnote: 14, lCode: 17, lBody: 18, lHeading: 18, lTitle: 24,
  wRegular: 400, wMedium: 500, wSemi: 600,
  checkbox: 16, checkboxR: 4, switchH: 16,
  avatarSm: 20, avatarMd: 28, avatarLg: 36,
  zModal: 40, zPopover: 50, zToast: 60,
  sans: '"Geist","Inter",system-ui,-apple-system,"Segoe UI",sans-serif',
  voix: 'Georgia,"Times New Roman",serif',      // la voix, jamais un titre
  mono: '"Geist Mono","SF Mono",ui-monospace,Consolas,monospace',
};

/* La compensation de poids du mode sombre : -40 unites par cran.
   Le canvas ne sait pas regler un axe variable ; on approche en abaissant
   le poids nominal d'un demi-cran. */
export function poids(P, w) { return P.mode === "dark" ? Math.max(300, w - 40) : w; }

/* ── Primitives ─────────────────────────────────────────────────────────── */

export function rr(g, x, y, w, h, r) {
  r = Math.min(r ?? D.r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* Concentricite (HIG) : une forme enfoncee de n px prend le rayon du
   contenant moins n. */
export const concentrique = (rParent, enfoncement) =>
  Math.max(2, rParent - enfoncement);

export function panneau(g, P, x, y, w, h, o = {}) {
  const r = o.r ?? D.r;
  if (o.eleve) {                              // ombre double
    g.save();
    g.shadowColor = P.ombreContact; g.shadowBlur = 4; g.shadowOffsetY = 1;
    rr(g, x, y, w, h, r); g.fillStyle = o.fond ?? P.s2; g.fill();
    g.restore();
    g.save();
    g.shadowColor = P.ombreCouleur; g.shadowBlur = 24; g.shadowOffsetY = 8;
    rr(g, x, y, w, h, r); g.fillStyle = o.fond ?? P.s2; g.fill();
    g.restore();
  }
  rr(g, x, y, w, h, r);
  if (o.fond !== null) { g.fillStyle = o.fond ?? P.s2; g.fill(); }
  if (o.trait !== null) {
    g.strokeStyle = o.trait ?? P.bd; g.lineWidth = 1; g.stroke();
  }
}

/* Verre (HIG) — reserve au chassis flottant. Le fond doit deja etre dessine :
   on preleve, on eclaircit, on borde d'un liseré lumineux. */
export function verre(g, P, x, y, w, h, r = 10) {
  g.save();
  rr(g, x, y, w, h, r); g.clip();
  g.fillStyle = P.mode === "dark" ? "rgba(56,56,53,.72)" : "rgba(255,255,255,.72)";
  g.fillRect(x, y, w, h);
  // reflet de bord : une bande claire en haut, pas un degrade sur tout l'objet
  const grd = g.createLinearGradient(0, y, 0, y + 14);
  grd.addColorStop(0, P.mode === "dark" ? "rgba(255,255,255,.10)" : "rgba(255,255,255,.85)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(x, y, w, 14);
  g.restore();
  rr(g, x, y, w, h, r);
  g.strokeStyle = P.mode === "dark" ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.90)";
  g.lineWidth = 1; g.stroke();
  rr(g, x + .5, y + .5, w - 1, h - 1, r);
  g.strokeStyle = P.bd; g.lineWidth = 1; g.stroke();
}

export function txt(g, s, x, y, o = {}) {
  g.font = `${o.poids ?? D.wRegular} ${o.taille ?? D.fBody}px ${
    o.mono ? D.mono : o.voix ? D.voix : D.sans}`;
  g.fillStyle = o.couleur ?? "#000";
  g.textAlign = o.align ?? "left";
  g.textBaseline = "alphabetic";
  if (o.max) s = tronquer(g, s, o.max);
  g.fillText(s, x, y);
  const w = g.measureText(s).width;
  g.textAlign = "left";                        // on ne laisse jamais l'etat sale
  return w;
}

export function tronquer(g, s, max) {
  if (g.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (g.measureText(s.slice(0, m) + "…").width <= max) lo = m; else hi = m - 1;
  }
  return s.slice(0, lo) + "…";
}

/* Bouton — 24 px, rayon 6, quatre etats dont « occupe » */
export function bouton(g, P, x, y, s, o = {}) {
  g.font = `${D.wMedium} ${D.fCaption}px ${D.sans}`;
  const w = o.w ?? Math.ceil(g.measureText(s).width) + D.padLg * 2;
  const h = o.h ?? D.hCtrl;
  const styles = {
    primaire: { fond: P.fPrim,   texte: P.surPrim, trait: null },
    accent:   { fond: P.ac,      texte: P.surAc,   trait: null },
    danger:   { fond: P.danger,  texte: "#fff",    trait: null },
    second:   { fond: P.fSecond, texte: P.t0,      trait: P.bd },
    fantome:  { fond: null,      texte: P.t1,      trait: null },
    occupe:   { fond: alpha(P.N[900], 50), texte: alpha(P.N[0], 60), trait: null },
  };
  const st = styles[o.style || "second"];
  if (o.focus) {                               // triple ombre de focus
    rr(g, x - 3, y - 3, w + 6, h + 6, D.r + 3);
    g.strokeStyle = P.acFond; g.lineWidth = 4; g.stroke();
    rr(g, x - 1.5, y - 1.5, w + 3, h + 3, D.r + 1.5);
    g.strokeStyle = P.ac; g.lineWidth = 1.5; g.stroke();
    rr(g, x - .5, y - .5, w + 1, h + 1, D.r + .5);
    g.strokeStyle = P.s0; g.lineWidth = 1; g.stroke();
  }
  panneau(g, P, x, y, w, h, { r: D.r, fond: st.fond, trait: st.trait });
  txt(g, s, x + w / 2, y + h / 2 + 4,
      { taille: D.fCaption, poids: D.wMedium, couleur: st.texte, align: "center" });
  return w;
}

/* Etiquette — hauteur 18, rayon 5 (concentrique dans un 6) */
export function chip(g, P, x, y, s, o = {}) {
  g.font = `${o.poids ?? D.wMedium} ${D.fCaption}px ${o.mono ? D.mono : D.sans}`;
  const w = Math.ceil(g.measureText(s).width) + D.padSm * 2 + (o.point ? 11 : 0);
  const h = 18;
  panneau(g, P, x, y, w, h,
          { r: D.rXs, fond: o.fond ?? P.fControle, trait: o.trait ?? null });
  let tx = x + D.padSm;
  if (o.point) {
    g.beginPath(); g.arc(x + D.padSm + 3, y + h / 2, 3, 0, 7);
    g.fillStyle = o.point; g.fill();
    tx += 11;
  }
  txt(g, s, tx, y + h / 2 + 4,
      { taille: D.fCaption, poids: o.poids ?? D.wMedium,
        couleur: o.couleur ?? P.t1, mono: o.mono });
  return w;
}

/* Interrupteur — 16 px, bouton toujours blanc dans les deux modes */
export function interrupteur(g, P, x, y, actif) {
  const h = D.switchH, w = h * 1.75;
  panneau(g, P, x, y, w, h, { r: h / 2, fond: actif ? P.ac : P.a3, trait: null });
  g.beginPath();
  g.arc(x + (actif ? w - h / 2 : h / 2), y + h / 2, h / 2 - 2, 0, 7);
  g.fillStyle = "#fff"; g.fill();
  return w;
}

/* Bord de defilement : le degrade qui dit qu'il reste du contenu */
export function bordDefilement(g, P, x, y, w, h, cote = "bas") {
  const vertical = cote === "bas" || cote === "haut";
  const grd = vertical
    ? g.createLinearGradient(0, cote === "bas" ? y + h : y, 0, cote === "bas" ? y + h - 28 : y + 28)
    : g.createLinearGradient(cote === "droite" ? x + w : x, 0, cote === "droite" ? x + w - 28 : x + 28, 0);
  const f = P.s1;
  grd.addColorStop(0, f); grd.addColorStop(1, f.replace(/^#/, "#") + "00");
  g.fillStyle = grd;
  if (vertical) g.fillRect(x, cote === "bas" ? y + h - 28 : y, w, 28);
  else g.fillRect(cote === "droite" ? x + w - 28 : x, y, 28, h);
}

export function jauge(g, P, x, y, w, p, couleur) {
  panneau(g, P, x, y, w, 3, { r: 2, fond: P.a2, trait: null });
  panneau(g, P, x, y, Math.max(2, w * p), 3, { r: 2, fond: couleur ?? P.ac, trait: null });
}

/* Ligne de code, coloration simplifiee mais coherente */
export function ligneCode(g, P, x, y, n, s, o = {}) {
  const largeur = o.largeur ?? 400;
  if (o.marque) {
    g.fillStyle = o.marque === "+"
      ? (P.mode === "dark" ? "rgba(50,215,75,.12)"  : "rgba(30,158,60,.10)")
      : (P.mode === "dark" ? "rgba(255,44,86,.12)"  : "rgba(205,32,84,.09)");
    g.fillRect(x - 8, y - 12, largeur, D.lCode);
  }
  txt(g, String(n), x + 22, y,
      { taille: D.fCode, mono: true, couleur: P.t3, align: "right" });
  if (o.marque)
    txt(g, o.marque, x + 34, y,
        { taille: D.fCode, mono: true, poids: D.wSemi,
          couleur: o.marque === "+" ? P.gitAdd : P.gitDel });

  const cles = /^(const|let|var|function|return|if|else|for|while|import|from|export|async|await|class|new|def|self|True|False|None|fn|pub|use|impl|struct|match|type|interface)$/;
  let cx = x + 46;
  g.font = `${D.wRegular} ${D.fCode}px ${D.mono}`;
  g.textAlign = "left";
  for (const jt of s.split(/(\s+|[(){}[\],.;:=<>+\-*/])/)) {
    let c = P.t0;
    if (cles.test(jt)) c = P.proTexte;
    else if (/^["'`]/.test(jt)) c = P.okTexte;
    else if (/^\d+$/.test(jt)) c = P.mode === "dark" ? ORANGE[300] : ORANGE[400];
    else if (/^[(){}[\],.;:=<>+\-*/]$/.test(jt)) c = P.t2;
    else if (/^(\/\/|#)/.test(jt)) c = P.t2;
    g.fillStyle = c; g.fillText(jt, cx, y);
    cx += g.measureText(jt).width;
  }
}
