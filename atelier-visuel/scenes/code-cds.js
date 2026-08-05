/* La partie CODE — dessinee sur CDS (ossature, densite, couleur) et HIG
   (concentricite, materiau, debordement). Rien de jarvis-OS.

   Six vues, en alternant les deux modes pour montrer le remappage des neutres :
     0 Etabli (clair)      1 Etabli (sombre)     2 Approbation (clair)
     3 Sessions (sombre)   4 Agents (clair)      5 Securite (sombre)

   Rendu :  moteur.html?scene=code-cds&vues=1&depart=0&l=1240&h=760
*/
import { palette, D, rr, panneau, verre, txt, tronquer, bouton, chip,
         interrupteur, jauge, ligneCode, bordDefilement, concentrique,
         poids } from "./_cds.js";

const VUES = [
  ["Établi — clair",        "light", "etabli"],
  ["Établi — sombre",       "dark",  "etabli"],
  ["Approbation — clair",   "light", "approbation"],
  ["Sessions — sombre",     "dark",  "sessions"],
  ["Agents — clair",        "light", "agents"],
  ["Sécurité — sombre",     "dark",  "securite"],
];

/* ── pictogrammes, traces au trait — pas de fonte d'icones en maquette ──── */
function icone(g, x, y, type, couleur, taille = 16) {
  const s = taille, u = s / 16;
  g.save();
  g.translate(x, y);
  g.strokeStyle = couleur; g.fillStyle = couleur;
  g.lineWidth = 1.4 * u; g.lineCap = "round"; g.lineJoin = "round";
  const L = (a, b, c, d) => { g.beginPath(); g.moveTo(a*u,b*u); g.lineTo(c*u,d*u); g.stroke(); };
  const R = (a, b, w, h, r=2) => { rr(g, a*u, b*u, w*u, h*u, r*u); g.stroke(); };
  switch (type) {
    case "sessions": R(2,3,12,10,2); L(2,6.5,14,6.5); L(4.5,4.7,4.5,4.8); break;
    case "etabli":   L(6,4,2.5,8); L(2.5,8,6,12); L(10,4,13.5,8); L(13.5,8,10,12); break;
    case "agents":   R(3,5,10,8,2); L(8,2,8,5); g.beginPath(); g.arc(6*u,9*u,.9*u,0,7); g.fill();
                     g.beginPath(); g.arc(10*u,9*u,.9*u,0,7); g.fill(); break;
    case "artefacts":L(8,2,14,5.5); L(14,5.5,14,11); L(14,11,8,14.5); L(8,14.5,2,11);
                     L(2,11,2,5.5); L(2,5.5,8,2); break;
    case "depots":   g.beginPath(); g.arc(5*u,4.5*u,1.8*u,0,7); g.stroke();
                     g.beginPath(); g.arc(5*u,12*u,1.8*u,0,7); g.stroke();
                     g.beginPath(); g.arc(11.5*u,4.5*u,1.8*u,0,7); g.stroke();
                     L(5,6.3,5,10.2); L(11.5,6.3,11.5,8); L(11.5,8,5,8); break;
    case "programme":g.beginPath(); g.arc(8*u,8.5*u,5.5*u,0,7); g.stroke();
                     L(8,5.5,8,8.5); L(8,8.5,10.2,9.8); L(6,1.8,10,1.8); break;
    case "securite": R(3.5,7,9,7,2); g.beginPath();
                     g.arc(8*u,7*u,2.7*u,Math.PI,0); g.stroke(); break;
    case "replier":  L(9.5,4,5.5,8); L(5.5,8,9.5,12); break;
    case "fichier":  L(4,2.5,4,13.5); L(4,2.5,10,2.5); L(10,2.5,12,5); L(12,5,12,13.5);
                     L(12,13.5,4,13.5); break;
    case "dossier":  L(2,4.5,6.5,4.5); L(6.5,4.5,8,6.5); L(8,6.5,14,6.5);
                     L(14,6.5,14,12.5); L(14,12.5,2,12.5); L(2,12.5,2,4.5); break;
    case "chevron":  L(6,4,10,8); L(10,8,6,12); break;
    case "chevronBas":L(4,6.5,8,10.5); L(8,10.5,12,6.5); break;
    case "plus":     L(8,3.5,8,12.5); L(3.5,8,12.5,8); break;
    case "recherche":g.beginPath(); g.arc(7*u,7*u,4*u,0,7); g.stroke(); L(10,10,13.5,13.5); break;
  }
  g.restore();
}

/* ── barre laterale : icone + libelle, aucune numerotation ──────────────── */
const NAV = [
  ["sessions",  "Sessions"],
  ["etabli",    "Établi"],
  ["agents",    "Agents"],
  ["artefacts", "Artefacts"],
  ["depots",    "Dépôts"],
  ["programme", "Programmé"],
  ["securite",  "Sécurité"],
];

function barreLaterale(g, P, x, y, w, h, actif) {
  panneau(g, P, x, y, w, h, { r: 0, fond: P.s0, trait: null });
  g.fillStyle = P.bd; g.fillRect(x + w - 1, y, 1, h);

  // en-tete : le nom du produit, en corps de titre, sans ornement
  txt(g, "Code", x + D.padLg + 2, y + 30,
      { taille: D.fHeading, poids: poids(P, D.wSemi), couleur: P.t0 });
  icone(g, x + w - 30, y + 14, "replier", P.t2, 16);

  // action primaire
  const by = y + 48;
  bouton(g, P, x + D.padLg, by, "Nouvelle session",
         { style: "accent", w: w - D.padLg * 2 });

  let cy = by + D.hCtrl + D.gapLg;
  NAV.forEach(([id, libelle]) => {
    const sel = id === actif;
    const hh = 26;
    if (sel) panneau(g, P, x + D.padSm, cy, w - D.padSm * 2, hh,
                     { r: D.rXs, fond: P.fControle, trait: null });
    icone(g, x + D.padLg, cy + 5, id, sel ? P.t0 : P.t2, 16);
    txt(g, libelle, x + D.padLg + 24, cy + 17,
        { taille: D.fBody, poids: sel ? D.wMedium : D.wRegular,
          couleur: sel ? P.t0 : P.t1 });
    cy += hh + 2;
  });

  // pied : le moteur, discret
  const py = y + h - 42;
  g.fillStyle = P.bd; g.fillRect(x + D.padLg, py, w - D.padLg * 2, 1);
  txt(g, "opus-5", x + D.padLg, py + 22,
      { taille: D.fCaption, mono: true, couleur: P.t2 });
  txt(g, "41 k / 200 k", x + w - D.padLg, py + 22,
      { taille: D.fCaption, mono: true, couleur: P.t3, align: "right" });
}

/* ── barre de titre ─────────────────────────────────────────────────────── */
function barreTitre(g, P, W, titre, sousTitre) {
  panneau(g, P, 0, 0, W, 38, { r: 0, fond: P.s0, trait: null });
  g.fillStyle = P.bd; g.fillRect(0, 38, W, 1);
  let x = D.padXl;
  x += txt(g, titre, x, 24,
           { taille: D.fBody, poids: poids(P, D.wMedium), couleur: P.t0 }) + D.gapSm;
  if (sousTitre) txt(g, sousTitre, x, 24,
                     { taille: D.fFootnote, couleur: P.t2 });
  icone(g, W - 58, 11, "recherche", P.t2, 16);
  icone(g, W - 30, 11, "plus", P.t2, 16);
}

/* ── barre d'etat ───────────────────────────────────────────────────────── */
function barreEtat(g, P, W, H, o = {}) {
  const y = H - 24;
  panneau(g, P, 0, y, W, 24, { r: 0, fond: P.s0, trait: null });
  g.fillStyle = P.bd; g.fillRect(0, y, W, 1);
  let x = D.padXl;
  g.beginPath(); g.arc(x + 3, y + 12, 3, 0, 7);
  g.fillStyle = o.sante ?? P.ok; g.fill();
  x += 12;
  x += txt(g, o.branche ?? "main", x, y + 16,
           { taille: D.fCaption, mono: true, couleur: P.t1 }) + D.gapMd;
  if (o.diff) {
    x += txt(g, "+" + o.diff[0], x, y + 16,
             { taille: D.fCaption, mono: true, couleur: P.gitAdd }) + D.gapXs;
    x += txt(g, "−" + o.diff[1], x, y + 16,
             { taille: D.fCaption, mono: true, couleur: P.gitDel }) + D.gapMd;
  }
  txt(g, o.chemin ?? "", x, y + 16, { taille: D.fCaption, mono: true, couleur: P.t3 });
  txt(g, o.droite ?? "", W - D.padXl, y + 16,
      { taille: D.fCaption, mono: true, couleur: P.t3, align: "right" });
}

/* ── arbre de fichiers ──────────────────────────────────────────────────── */
function arbre(g, P, x, y, w, h) {
  panneau(g, P, x, y, w, h, { r: D.r, fond: P.s1 });
  txt(g, "Fichiers", x + D.padLg, y + 24,
      { taille: D.fCaption, poids: poids(P, D.wSemi), couleur: P.t2 });

  const items = [
    [0, "src", "dossier", null], [1, "jarvis", "dossier", null],
    [2, "interfaces", "dossier", null], [3, "ui", "dossier", null],
    [4, "static", "dossier", null],
    [5, "code.js", "fichier", "A"], [5, "code.css", "fichier", "A"],
    [5, "atelier.js", "fichier", "A"], [5, "_shared.css", "fichier", "M"],
    [3, "core", "dossier", null], [4, "sessions.py", "fichier", "M"],
  ];
  let cy = y + 44;
  items.forEach(([prof, nom, kind, git]) => {
    const px = x + D.padLg + prof * 12;
    const sel = nom === "code.js";
    if (sel) panneau(g, P, x + D.padSm, cy, w - D.padSm * 2, 22,
                     { r: concentrique(D.r, 2), fond: P.fControle, trait: null });
    if (kind === "dossier") icone(g, px - 2, cy + 3, "chevronBas", P.t3, 14);
    const c = git === "A" ? P.gitAdd : git === "M" ? P.gitMod : (sel ? P.t0 : P.t1);
    txt(g, nom, px + 14, cy + 15,
        { taille: D.fFootnote, mono: kind === "fichier",
          poids: sel ? D.wMedium : D.wRegular, couleur: kind === "dossier" ? P.t1 : c,
          max: w - (px - x) - 40 });
    if (git) txt(g, git, x + w - D.padLg, cy + 15,
                 { taille: D.fCaption, mono: true, poids: D.wSemi, align: "right",
                   couleur: git === "A" ? P.gitAdd : P.gitMod });
    cy += 22;
  });
  bordDefilement(g, P, x + 1, y + 1, w - 2, h - 2, "bas");
}

/* ── editeur ────────────────────────────────────────────────────────────── */
function editeur(g, P, x, y, w, h, o = {}) {
  panneau(g, P, x, y, w, h, { r: D.r, fond: P.s2 });

  // barre d'onglets, encastree : rayon concentrique
  g.save(); rr(g, x, y, w, h, D.r); g.clip();
  g.fillStyle = P.s1; g.fillRect(x, y, w, 32);
  g.restore();
  g.fillStyle = P.bd; g.fillRect(x, y + 32, w, 1);

  let tx = x + D.padXs;
  (o.onglets ?? [["code.js", 1, "A"], ["code.css", 0, "A"], ["sessions.py", 0, "M"]])
    .forEach(([nom, actif, git]) => {
      g.font = `${D.wMedium} ${D.fCaption}px ${D.sans}`;
      const tw = Math.ceil(g.measureText(nom).width) + D.padLg * 2 + 12;
      if (actif) panneau(g, P, tx, y + 4, tw, 26,
                         { r: concentrique(D.r, 2), fond: P.s2, trait: null });
      g.beginPath(); g.arc(tx + D.padSm + 4, y + 17, 3, 0, 7);
      g.fillStyle = git === "A" ? P.gitAdd : git === "M" ? P.gitMod : P.t3; g.fill();
      txt(g, nom, tx + D.padLg + 6, y + 21,
          { taille: D.fCaption, poids: D.wMedium, couleur: actif ? P.t0 : P.t1 });
      tx += tw + 2;
    });

  let cy = y + 32 + 24;
  (o.lignes ?? []).forEach(([n, s, marque]) => {
    ligneCode(g, P, x + D.padLg, cy, n, s,
              { marque, largeur: w - D.padLg * 2 + 16 });
    cy += D.lCode;
  });
  if (o.curseur !== false) {
    g.fillStyle = P.ac;
    g.fillRect(x + D.padLg + 46 + (o.curseurX ?? 190), cy - D.lCode - 10, 1.6, 13);
  }
  return cy;
}

/* ── fil de conversation ────────────────────────────────────────────────── */
function fil(g, P, x, y, w, h, o = {}) {
  panneau(g, P, x, y, w, h, { r: D.r, fond: P.s1 });
  txt(g, "Fil", x + D.padLg, y + 24,
      { taille: D.fCaption, poids: poids(P, D.wSemi), couleur: P.t2 });
  chip(g, P, x + w - 78, y + 11, o.etat ?? "prêt",
       { point: o.etatCouleur ?? P.ok });

  let cy = y + 44;
  (o.messages ?? []).forEach(m => {
    if (m.type === "moi") {
      const bh = 20 + m.lignes.length * D.lBody;
      panneau(g, P, x + D.padLg, cy, w - D.padLg * 2, bh,
              { r: D.r, fond: P.fControle, trait: null });
      let ly = cy + 19;
      m.lignes.forEach(l => {
        txt(g, l, x + D.padLg + D.padMd, ly,
            { taille: D.fBody, couleur: P.t0, max: w - D.padLg * 2 - D.padMd * 2 });
        ly += D.lBody;
      });
      cy += bh + D.gapMd;
    } else if (m.type === "voix") {
      // la voix : serif, sans cadre — jamais employee pour un titre
      let ly = cy + 14;
      m.lignes.forEach((l, i) => {
        const lw = txt(g, l, x + D.padLg, ly,
                       { taille: D.fBody, voix: true, couleur: P.t0,
                         max: w - D.padLg * 2 });
        if (m.frappe && i === m.lignes.length - 1) {
          g.fillStyle = P.ac;
          g.fillRect(x + D.padLg + Math.min(lw, w - D.padLg * 2) + 3, ly - 10, 7, 12);
        }
        ly += D.lBody;
      });
      cy = ly + D.gapSm;
    } else if (m.type === "outil") {
      const bh = 28;
      panneau(g, P, x + D.padLg, cy, w - D.padLg * 2, bh, { r: D.rXs, fond: P.s2 });
      icone(g, x + D.padLg + D.padSm, cy + 6, m.picto ?? "chevron",
            m.couleur ?? P.t2, 14);
      txt(g, m.nom, x + D.padLg + 26, cy + 18,
          { taille: D.fFootnote, mono: true, couleur: P.t0,
            max: w - D.padLg * 2 - 90 });
      txt(g, m.duree ?? "", x + w - D.padLg - D.padSm, cy + 18,
          { taille: D.fCaption, mono: true, couleur: P.t3, align: "right" });
      cy += bh + D.gapXs;
    }
  });

  // zone de saisie
  const zy = y + h - 76, zw = w - D.padLg * 2;
  if (o.saisieFocus) {
    rr(g, x + D.padLg - 3, zy - 3, zw + 6, 62, D.r + 3);
    g.strokeStyle = P.acFond; g.lineWidth = 4; g.stroke();
    rr(g, x + D.padLg - 1.5, zy - 1.5, zw + 3, 59, D.r + 1.5);
    g.strokeStyle = P.ac; g.lineWidth = 1.5; g.stroke();
  }
  panneau(g, P, x + D.padLg, zy, zw, 56,
          { r: D.r, fond: P.fChamp, trait: o.saisieFocus ? null : P.bd });
  txt(g, o.saisie ?? "Décrivez la modification…", x + D.padLg + D.padMd, zy + 20,
      { taille: D.fBody, couleur: o.saisie ? P.t0 : P.t3, max: zw - D.padMd * 2 });
  chip(g, P, x + D.padLg + D.padMd, zy + 30, o.contexte ?? "3 fichiers",
       { fond: P.a1 });
  txt(g, "⌘↵", x + D.padLg + zw - D.padMd, zy + 43,
      { taille: D.fCaption, mono: true, couleur: P.t3, align: "right" });
}

/* ── terminal ───────────────────────────────────────────────────────────── */
function terminal(g, P, x, y, w, h, o = {}) {
  const fond = P.mode === "dark" ? "#0b0b0b" : P.N[850];
  panneau(g, P, x, y, w, h, { r: D.r, fond, trait: null });
  g.save(); rr(g, x, y, w, h, D.r); g.clip();
  g.fillStyle = P.mode === "dark" ? "#151515" : "#20201f";
  g.fillRect(x, y, w, 30);
  g.restore();

  let tx = x + D.padSm;
  ["session", "shell", "bash"].forEach((n, i) => {
    const actif = i === (o.flux ?? 0);
    tx += chip(g, P, tx, y + 6, n,
               { mono: true, fond: actif ? "rgba(255,255,255,.12)" : "transparent",
                 couleur: actif ? "#fff" : "rgba(255,255,255,.45)" }) + D.gapXs;
  });
  icone(g, x + w - 26, y + 7, o.deploye ? "chevronBas" : "chevron",
        "rgba(255,255,255,.45)", 16);

  let cy = y + 48;
  (o.lignes ?? []).forEach(([s, c]) => {
    txt(g, s, x + D.padLg, cy,
        { taille: D.fCode, mono: true, couleur: c ?? "rgba(255,255,255,.72)",
          max: w - D.padLg * 2 });
    cy += D.lCode;
  });
  if (o.curseur) { g.fillStyle = P.gitAdd; g.fillRect(x + D.padLg, cy - 11, 7, 12); }
}

/* ═══ VUE : l'etabli ════════════════════════════════════════════════════ */
function vueEtabli(g, P, W, H, approbation) {
  const NAV_W = 190, T = 38, B = H - 24;
  barreTitre(g, P, W, "Refonte de la barre d'onglets",
             approbation ? "· une modification attend" : "· branche code/etabli");
  barreLaterale(g, P, 0, T, NAV_W, B - T, "etabli");

  const x0 = NAV_W + D.gapMd, y0 = T + D.gapMd;
  const ARB_W = 208, FIL_W = 340;
  const centreW = W - x0 - ARB_W - FIL_W - D.gapMd * 3;
  const hTerm = approbation ? 42 : 156;
  const hEdit = B - y0 - hTerm - D.gapSm - D.gapMd;

  arbre(g, P, x0, y0, ARB_W, B - y0 - D.gapMd);

  const cx = x0 + ARB_W + D.gapMd;
  editeur(g, P, cx, y0, centreW, hEdit, approbation ? {
    curseur: false,
    lignes: [
      [38, "export function monter(racine) {"],
      [39, "  const grille = document.createElement(\"div\");"],
      [40, "  grille.className = \"code-grille\";"],
      [41, ""],
      [42, "  const arbre  = monterArbre(grille);", "+"],
      [43, "  const editeur = monterEditeur(grille);", "+"],
      [44, "  const fil    = monterFil(grille);", "+"],
      [45, "  const term   = monterTerminal(grille);", "+"],
      [46, ""],
      [47, "  racine.appendChild(grille);"],
      [48, "  return { arbre, editeur, fil, term };", "+"],
      [49, "}"],
    ],
  } : {
    curseurX: 230,
    lignes: [
      [38, "export function monter(racine) {"],
      [39, "  const grille = document.createElement(\"div\");"],
      [40, "  grille.className = \"code-grille\";"],
      [41, ""],
      [42, "  // quatre zones : arbre, editeur, fil, terminal"],
      [43, "  racine.appendChild(grille);"],
      [44, "  return grille;"],
      [45, "}"],
    ],
  });

  terminal(g, P, cx, y0 + hEdit + D.gapSm, centreW, hTerm, {
    flux: approbation ? 0 : 2, deploye: !approbation, curseur: !approbation,
    lignes: approbation ? [] : [
      ["$ npm run verifier", "rgba(255,255,255,.92)"],
      ["  36 fichiers analysés", "rgba(255,255,255,.60)"],
      ["  aucune erreur", P.gitAdd],
      ["$ ", "rgba(255,255,255,.92)"],
    ],
  });

  const fx = W - FIL_W - D.gapMd;
  fil(g, P, fx, y0, FIL_W, B - y0 - D.gapMd, approbation ? {
    etat: "en attente", etatCouleur: P.alerte,
    messages: [
      { type: "moi", lignes: ["Monte les quatre zones de", "l'établi."] },
      { type: "voix", lignes: ["Quatre appels à ajouter dans",
                               "monter(). Rien d'autre ne bouge."] },
      { type: "outil", nom: "lire  code.js", duree: "12 ms", couleur: P.t2 },
      { type: "outil", nom: "modifier  code.js", duree: "à approuver",
        couleur: P.alerteTexte, picto: "securite" },
    ],
    saisie: null,
  } : {
    etat: "au travail", etatCouleur: P.alerte,
    messages: [
      { type: "moi", lignes: ["Monte les quatre zones de", "l'établi."] },
      { type: "outil", nom: "lire  code.js", duree: "12 ms", couleur: P.t2 },
      { type: "outil", nom: "modifier  code.js", duree: "en cours",
        couleur: P.acTexte, picto: "etabli" },
      { type: "voix", frappe: true,
        lignes: ["Je monte l'arbre, l'éditeur, le fil", "et le terminal, puis je rends"] },
    ],
    saisieFocus: true, saisie: null,
  });

  // Le bandeau d'approbation : chassis flottant, donc en verre (HIG).
  if (approbation) {
    const bw = centreW - D.gapLg * 2, bh = 56;
    const bx = cx + D.gapLg, by = y0 + hEdit - bh - D.gapLg;
    g.save();
    g.shadowColor = P.voile; g.shadowBlur = 32; g.shadowOffsetY = 10;
    rr(g, bx, by, bw, bh, 10); g.fillStyle = P.s3; g.fill();
    g.restore();
    verre(g, P, bx, by, bw, bh, 10);

    txt(g, "Modifier  code.js", bx + D.padLg, by + 24,
        { taille: D.fBody, poids: poids(P, D.wMedium), couleur: P.t0 });
    txt(g, "5 ajouts · aucune suppression · hors zone protégée",
        bx + D.padLg, by + 41, { taille: D.fCaption, couleur: P.t1 });

    let rx = bx + bw - D.padLg;
    const wA = 84;
    bouton(g, P, rx - wA, by + (bh - D.hCtrl) / 2, "Approuver",
           { style: "accent", w: wA, focus: true });
    rx -= wA + D.gapSm;
    const wR = 66;
    bouton(g, P, rx - wR, by + (bh - D.hCtrl) / 2, "Refuser", { style: "second", w: wR });
    rx -= wR + D.gapSm;
    const wT = 74;
    bouton(g, P, rx - wT, by + (bh - D.hCtrl) / 2, "Toujours", { style: "fantome", w: wT });
  }

  barreEtat(g, P, W, H, approbation
    ? { branche: "code/etabli", diff: [5, 0], sante: P.alerte,
        chemin: "~/base/interfaces/ui/static", droite: "1 approbation en attente" }
    : { branche: "code/etabli", diff: [128, 12],
        chemin: "~/base/interfaces/ui/static", droite: "opus-5 · 41 k / 200 k" });
}

/* ═══ VUE : sessions ════════════════════════════════════════════════════ */
function vueSessions(g, P, W, H) {
  const NAV_W = 190, T = 38, B = H - 24;
  barreTitre(g, P, W, "Sessions", "· 6 au total, 1 en cours");
  barreLaterale(g, P, 0, T, NAV_W, B - T, "sessions");

  const x0 = NAV_W + D.gapLg, y0 = T + D.gapLg;
  txt(g, "Sessions", x0, y0 + 20,
      { taille: D.fTitle, poids: poids(P, D.wSemi), couleur: P.t0 });
  txt(g, "Chaque session garde son établi, son terminal et son fil.",
      x0, y0 + 40, { taille: D.fFootnote, couleur: P.t1 });

  const cols = 3, dispo = W - x0 - D.padXl;
  const cw = (dispo - D.gapMd * (cols - 1)) / cols;
  const cartes = [
    ["Refonte de la barre d'onglets", "code/etabli", "au travail", "alerte", "+128 −12", "il y a 4 min", .62],
    ["Correctif du flux vocal",       "main",        "terminée",   "ok",     "+34 −8",   "hier, 21:40", 1],
    ["Audit des dépendances",         "audit/deps",  "à approuver","alerte", "+0 −0",    "hier, 18:02", .35],
    ["Migration Rust du noyau",       "rust/noyau",  "en pause",   "neutre", "+902 −340","3 août",      .18],
    ["Portage de l'installateur",     "linux/inst",  "terminée",   "ok",     "+210 −44", "2 août",      1],
    ["Revue du dépôt amont",          "—",           "échouée",    "danger", "+0 −0",    "1 août",      .8],
  ];
  const teintes = { ok: P.ok, alerte: P.alerte, danger: P.danger, neutre: P.t3 };

  cartes.forEach(([nom, branche, etat, cle, diff, quand, p], i) => {
    const x = x0 + (i % cols) * (cw + D.gapMd);
    const y = y0 + 64 + Math.floor(i / cols) * 122;
    panneau(g, P, x, y, cw, 108, { r: D.r, fond: P.s2, eleve: true });
    txt(g, nom, x + D.padLg, y + 26,
        { taille: D.fHeading, poids: poids(P, D.wMedium), couleur: P.t0,
          max: cw - D.padLg * 2 });
    let bx = x + D.padLg;
    bx += chip(g, P, bx, y + 36, etat, { point: teintes[cle] }) + D.gapXs;
    chip(g, P, bx, y + 36, branche, { mono: true, couleur: P.t1 });
    jauge(g, P, x + D.padLg, y + 68, cw - D.padLg * 2, p, teintes[cle]);
    txt(g, diff, x + D.padLg, y + 92, { taille: D.fCaption, mono: true, couleur: P.t1 });
    txt(g, quand, x + cw - D.padLg, y + 92,
        { taille: D.fCaption, couleur: P.t3, align: "right" });
  });
  barreEtat(g, P, W, H, { droite: "6 sessions · 1 en cours" });
}

/* ═══ VUE : agents ══════════════════════════════════════════════════════ */
function vueAgents(g, P, W, H) {
  const NAV_W = 190, T = 38, B = H - 24;
  barreTitre(g, P, W, "Agents", "· 5, dont 2 actifs");
  barreLaterale(g, P, 0, T, NAV_W, B - T, "agents");

  const x0 = NAV_W + D.gapLg, y0 = T + D.gapLg;
  txt(g, "Agents", x0, y0 + 20,
      { taille: D.fTitle, poids: poids(P, D.wSemi), couleur: P.t0 });
  txt(g, "Un agent survit à la session : il a son déclencheur, son périmètre et son moteur.",
      x0, y0 + 40, { taille: D.fFootnote, couleur: P.t1 });
  bouton(g, P, W - D.padXl - 92, y0 + 4, "Nouvel agent", { style: "second", w: 92 });

  const tw = W - x0 - D.padXl;
  panneau(g, P, x0, y0 + 60, tw, 244, { r: D.r, fond: P.s2 });

  const colsX = [0, 236, 402, 566, 690, tw - D.padLg * 2];
  const enTetes = ["Nom", "Déclencheur", "Périmètre", "Moteur", "État", "Exéc."];
  enTetes.forEach((h, i) => {
    txt(g, h, x0 + D.padLg + colsX[i], y0 + 82,
        { taille: D.fCaption, poids: poids(P, D.wSemi), couleur: P.t2,
          align: i === 5 ? "right" : "left" });
  });
  g.fillStyle = P.bd; g.fillRect(x0 + D.padLg, y0 + 92, tw - D.padLg * 2, 1);

  const lignes = [
    ["Gardien des tests",     "à chaque écriture",   "tout le dépôt", "opus-5",   "actif",      "ok",     "214"],
    ["Relecteur de PR",       "sur ouverture de PR", "dépôt amont",   "sonnet-5", "actif",      "ok",     "88"],
    ["Veilleur de sécurité",  "chaque nuit, 03:00",  "dépendances",   "opus-5",   "en attente", "alerte", "12"],
    ["Traducteur des libellés","manuel",             "static/",       "haiku-4.5","au repos",   "neutre", "—"],
    ["Compagnon de refonte",  "déclencheur externe", "ui/",           "opus-5",   "au repos",   "neutre", "3"],
  ];
  const teintes = { ok: P.ok, alerte: P.alerte, neutre: P.t3 };
  lignes.forEach(([nom, decl, per, mot, etat, cle, n], i) => {
    const y = y0 + 118 + i * 36;
    if (i === 0) panneau(g, P, x0 + D.padSm, y - 18, tw - D.padSm * 2, 32,
                         { r: concentrique(D.r, 2), fond: P.a1, trait: null });
    txt(g, nom, x0 + D.padLg, y,
        { taille: D.fBody, poids: poids(P, D.wMedium), couleur: P.t0, max: 220 });
    txt(g, decl, x0 + D.padLg + colsX[1], y, { taille: D.fFootnote, couleur: P.t1 });
    txt(g, per,  x0 + D.padLg + colsX[2], y,
        { taille: D.fFootnote, mono: true, couleur: P.t1 });
    txt(g, mot,  x0 + D.padLg + colsX[3], y,
        { taille: D.fFootnote, mono: true, couleur: P.t1 });
    chip(g, P, x0 + D.padLg + colsX[4], y - 13, etat, { point: teintes[cle] });
    txt(g, n, x0 + D.padLg + colsX[5], y,
        { taille: D.fFootnote, mono: true, align: "right",
          couleur: n === "—" ? P.t3 : P.t0 });
    if (i < lignes.length - 1) {
      g.fillStyle = P.bd; g.fillRect(x0 + D.padLg, y + 18, tw - D.padLg * 2, 1);
    }
  });
  barreEtat(g, P, W, H, { droite: "5 agents · 2 actifs" });
}

/* ═══ VUE : securite ════════════════════════════════════════════════════ */
function vueSecurite(g, P, W, H) {
  const NAV_W = 190, T = 38, B = H - 24;
  barreTitre(g, P, W, "Sécurité", "· 4 règles demandent confirmation");
  barreLaterale(g, P, 0, T, NAV_W, B - T, "securite");

  const x0 = NAV_W + D.gapLg, y0 = T + D.gapLg;
  txt(g, "Sécurité", x0, y0 + 20,
      { taille: D.fTitle, poids: poids(P, D.wSemi), couleur: P.t0 });
  txt(g, "Ce que l'agent fait seul, et ce qu'il doit demander.",
      x0, y0 + 40, { taille: D.fFootnote, couleur: P.t1 });

  const dispo = W - x0 - D.padXl;
  const cw = (dispo - D.gapMd) / 2;
  const gy = y0 + 60;

  // gauche : les portes
  panneau(g, P, x0, gy, cw, 272, { r: D.r, fond: P.s2 });
  txt(g, "Approbations", x0 + D.padLg, gy + 24,
      { taille: D.fCaption, poids: poids(P, D.wSemi), couleur: P.t2 });
  const portes = [
    ["Lire un fichier",              0, "sans demander"],
    ["Écrire dans le dépôt",         1, "hors zone protégée"],
    ["Lancer une commande",          1, "toujours"],
    ["Joindre le réseau",            1, "toujours"],
    ["Publier sur le dépôt distant", 1, "toujours"],
    ["Toucher aux secrets",          2, "interdit"],
  ];
  const teintes = [P.ok, P.alerte, P.danger];
  const glyphes = ["libre", "?", "✕"];
  portes.forEach(([nom, niveau, regle], i) => {
    const y = gy + 42 + i * 38;
    txt(g, nom, x0 + D.padLg, y + 16, { taille: D.fBody, couleur: P.t0 });
    txt(g, regle, x0 + D.padLg, y + 30, { taille: D.fCaption, couleur: P.t2 });
    // controle segmente a trois crans
    const sw = 108, sx = x0 + cw - D.padLg - sw;
    panneau(g, P, sx, y + 8, sw, 22, { r: D.rXs, fond: P.a1, trait: null });
    const seg = (sw - 4) / 3;
    panneau(g, P, sx + 2 + niveau * seg, y + 10, seg, 18,
            { r: concentrique(D.rXs, 2), fond: teintes[niveau], trait: null });
    glyphes.forEach((s, k) => {
      txt(g, s, sx + 2 + k * seg + seg / 2, y + 23,
          { taille: D.fCaption, poids: D.wMedium, align: "center",
            couleur: k === niveau
              ? (k === 1 ? P.surAlerte : "#fff")
              : P.t3 });
    });
    if (i < portes.length - 1) {
      g.fillStyle = P.bd; g.fillRect(x0 + D.padLg, y + 36, cw - D.padLg * 2, 1);
    }
  });

  // droite : zones protegees, puis mandataire
  const rx = x0 + cw + D.gapMd;
  panneau(g, P, rx, gy, cw, 128, { r: D.r, fond: P.s2 });
  txt(g, "Zones protégées", rx + D.padLg, gy + 24,
      { taille: D.fCaption, poids: poids(P, D.wSemi), couleur: P.t2 });
  ["config/", "data/memoire/", ".env", "scripts/"].forEach((z, i) => {
    const y = gy + 40 + i * 21;
    icone(g, rx + D.padLg, y, "securite", P.alerteTexte, 14);
    txt(g, z, rx + D.padLg + 20, y + 11,
        { taille: D.fFootnote, mono: true, couleur: P.t0 });
    txt(g, "lecture seule", rx + cw - D.padLg, y + 11,
        { taille: D.fCaption, couleur: P.t2, align: "right" });
  });

  panneau(g, P, rx, gy + 144, cw, 128, { r: D.r, fond: P.s2 });
  txt(g, "Mandataire", rx + D.padLg, gy + 168,
      { taille: D.fCaption, poids: poids(P, D.wSemi), couleur: P.t2 });
  txt(g, "L'agent ne détient aucun secret. Le mandataire les",
      rx + D.padLg, gy + 190, { taille: D.fFootnote, couleur: P.t1 });
  txt(g, "porte, applique les règles et les fait tourner.",
      rx + D.padLg, gy + 206, { taille: D.fFootnote, couleur: P.t1 });
  let bx = rx + D.padLg;
  [["GitHub", P.ok], ["Anthropic", P.ok], ["Modrinth", P.t3]].forEach(([n, c]) => {
    bx += chip(g, P, bx, gy + 218, n, { point: c }) + D.gapXs;
  });
  txt(g, "rotation des clés : il y a 6 jours", rx + D.padLg, gy + 258,
      { taille: D.fCaption, couleur: P.t3 });

  barreEtat(g, P, W, H, { sante: P.alerte, branche: "politique locale",
                          droite: "audit complet · 5 août" });
}

/* ── point d'entree ─────────────────────────────────────────────────────── */
export default {
  titre: "Partie CODE — sur CDS et les HIG",
  type: "2d",
  fond: "#f9f9f7",

  libelle(iVue) { return (VUES[iVue % VUES.length] || [])[0] ?? ("vue " + iVue); },

  dessiner(g, t, iVue, W, H) {
    const [, mode, ecran] = VUES[iVue % VUES.length];
    const P = palette(mode);
    g.fillStyle = P.s0; g.fillRect(0, 0, W, H);
    if (ecran === "etabli")           vueEtabli(g, P, W, H, false);
    else if (ecran === "approbation") vueEtabli(g, P, W, H, true);
    else if (ecran === "sessions")    vueSessions(g, P, W, H);
    else if (ecran === "agents")      vueAgents(g, P, W, H);
    else                              vueSecurite(g, P, W, H);
  },
};
