/* Maquette de la partie CODE de My Jarvis — chapitre IV.

   Six vues, chacune un etat de l'interface :
     0 Etabli au repos        3 Sessions (IV>01)
     1 Agent au travail       4 Agents   (IV>03)
     2 Diff a approuver       5 Securite (IV>07)

   Rendu :  moteur.html?scene=code-etabli&vues=1&depart=0&l=1180&h=740
*/
import { J, boite, txt, chip, bouton, chapitre, pages, ligneCode, jauge,
         puce, texture, rr, tronquer } from "./_ui.js";

const PAGES = ["Sessions", "Établi", "Agents", "Artefacts", "Dépôts",
               "Programmé", "Sécurité"];

const VUES = ["Établi — au repos", "Établi — l'agent travaille",
              "Établi — modification à approuver", "Sessions",
              "Agents", "Sécurité"];

/* ── ossature commune ───────────────────────────────────────────────────── */
function chassis(g, W, H, pageActive, titreDroite) {
  g.fillStyle = J.bg0; g.fillRect(0, 0, W, H);

  // bandeau superieur
  g.fillStyle = J.bg1; g.fillRect(0, 0, W, 46);
  g.fillStyle = J.l1; g.fillRect(0, 46, W, 1);
  chapitre(g, J.padXl, 27, "IV", "CODE");
  pages(g, 150, 12, W, PAGES, pageActive);

  // coin droit : moteur, jetons, sante
  const dx = W - J.padXl;
  txt(g, titreDroite || "opus-5 · local", dx, 27,
      { taille: J.fCaption, mono: true, couleur: J.fg3, align: "right" });

  // filigrane du chapitre, comme les autres ecrans de Jarvis
  g.save();
  g.globalAlpha = .025;
  txt(g, "Code", W - 40, H - 30,
      { taille: 96, poids: 600, couleur: J.fg0, align: "right" });
  g.restore();
}

function barreEtat(g, W, H, o = {}) {
  const y = H - 26;
  g.fillStyle = J.bg1; g.fillRect(0, y, W, 26);
  g.fillStyle = J.l1; g.fillRect(0, y, W, 1);
  let x = J.padXl;
  x += puce(g, x, y + 17, o.sante ?? J.green, o.branche ?? "main", { halo: true }) + J.gapMd;
  if (o.diff) {
    x += txt(g, "+" + o.diff[0], x, y + 17,
             { taille: J.fCaption, mono: true, couleur: J.gitAdd }) + J.gapXs;
    x += txt(g, "−" + o.diff[1], x, y + 17,
             { taille: J.fCaption, mono: true, couleur: J.gitDel }) + J.gapMd;
  }
  txt(g, o.chemin ?? "~/MyJarvis/base/jarvis-OS", x, y + 17,
      { taille: J.fCaption, mono: true, couleur: J.fg3 });

  const dx = W - J.padXl;
  txt(g, o.droite ?? "128 k / 200 k jetons", dx, y + 17,
      { taille: J.fCaption, mono: true, couleur: J.fg3, align: "right" });
}

/* ── colonne de gauche : sessions + arbre ───────────────────────────────── */
function colonneGauche(g, x, y, w, h, o = {}) {
  boite(g, x, y, w, h, { r: 10, fond: J.bg1, trait: J.l1 });
  let cy = y + 26;
  txt(g, "SESSION", x + J.padLg, cy,
      { taille: J.fCaption, poids: 600, couleur: J.fg3 });
  cy += 8;

  const sessions = o.sessions ?? [
    ["Refonte de la barre d'onglets", J.green, "il y a 4 min"],
    ["Correctif du flux vocal", J.fg4, "hier"],
  ];
  sessions.forEach(([nom, etat, quand], i) => {
    const bh = 38;
    if (i === 0) boite(g, x + J.padSm, cy, w - J.padSm * 2, bh,
                       { r: 5, fond: J.acSoft, trait: J.acLine });
    g.beginPath(); g.arc(x + J.padLg + 3, cy + 14, 3, 0, 7);
    g.fillStyle = etat; g.fill();
    txt(g, nom, x + J.padLg + 14, cy + 18,
        { taille: J.fFootnote, poids: i === 0 ? 500 : 400,
          couleur: i === 0 ? J.fg0 : J.fg2, max: w - 46 });
    txt(g, quand, x + J.padLg + 14, cy + 31,
        { taille: J.fCaption, couleur: J.fg4 });
    cy += bh + J.gapXs;
  });

  cy += J.gapSm;
  g.fillStyle = J.l1; g.fillRect(x + J.padLg, cy, w - J.padLg * 2, 1);
  cy += 22;
  txt(g, "FICHIERS", x + J.padLg, cy,
      { taille: J.fCaption, poids: 600, couleur: J.fg3 });
  cy += 26;

  const arbre = o.arbre ?? [
    [0, "src", null, 1], [1, "jarvis", null, 1],
    [2, "interfaces", null, 1], [3, "ui", null, 1],
    [4, "static", null, 1],
    [5, "_shared.css", "M", 0], [5, "code.js", "A", 0],
    [5, "code.css", "A", 0], [5, "capabilities.js", null, 0],
    [3, "core", null, 1], [4, "sessions.py", "M", 0],
  ];
  arbre.forEach(([prof, nom, git, dossier]) => {
    const px = x + J.padLg + prof * 11;
    const sel = nom === "code.js";
    if (sel) boite(g, x + J.padSm, cy - 12, w - J.padSm * 2, 19,
                   { r: 4, fond: "rgba(220,232,255,.05)" });
    if (dossier) {
      txt(g, "▾", px, cy, { taille: 9, couleur: J.fg4 });
      txt(g, nom, px + 11, cy,
          { taille: J.fFootnote, couleur: J.fg2, max: w - prof * 11 - 46 });
    } else {
      const c = git === "A" ? J.gitAdd : git === "M" ? J.gitMod : J.fg2;
      txt(g, nom, px + 11, cy,
          { taille: J.fFootnote, mono: true, couleur: sel ? J.fg0 : c,
            max: w - prof * 11 - 52 });
      if (git) txt(g, git, x + w - J.padLg, cy,
                   { taille: J.fCaption, mono: true, poids: 600, align: "right",
                     couleur: git === "A" ? J.gitAdd : J.gitMod });
    }
    cy += 19;
  });
}

/* ── centre : onglets + editeur ─────────────────────────────────────────── */
function editeur(g, x, y, w, h, o = {}) {
  boite(g, x, y, w, h, { r: 10, fond: J.bg1, trait: J.l1 });

  // onglets de fichiers
  g.fillStyle = J.bg2;
  rr(g, x, y, w, 30, 10); g.fill();
  g.fillStyle = J.bg1; g.fillRect(x, y + 20, w, 10);
  let tx = x + J.padSm;
  (o.onglets ?? [["code.js", 1, "A"], ["code.css", 0, "A"], ["sessions.py", 0, "M"]])
    .forEach(([nom, actif, git]) => {
      g.font = `500 ${J.fCaption}px ${J.sans}`;
      const tw = g.measureText(nom).width + J.padLg * 2 + 14;
      if (actif) {
        boite(g, tx, y + 4, tw, 24, { r: 5, fond: J.bg1 });
        g.fillStyle = J.ac; g.fillRect(tx + 6, y + 4, tw - 12, 2);
      }
      g.beginPath(); g.arc(tx + J.padSm + 4, y + 16, 3, 0, 7);
      g.fillStyle = git === "A" ? J.gitAdd : git === "M" ? J.gitMod : J.fg4;
      g.fill();
      txt(g, nom, tx + J.padLg + 6, y + 20,
          { taille: J.fCaption, poids: 500, couleur: actif ? J.fg0 : J.fg3 });
      tx += tw + 2;
    });

  // corps
  let cy = y + 30 + 22;
  (o.lignes ?? []).forEach(([n, s, marque]) => {
    ligneCode(g, x + J.padLg, cy, n, s, { marque, largeur: w - J.padLg * 2 });
    cy += J.lCode;
  });

  if (o.curseur !== false) {
    g.fillStyle = J.ac;
    g.fillRect(x + J.padLg + 30 + (o.curseurX ?? 210), cy - J.lCode - 10, 1.5, 13);
  }
  return cy;
}

/* ── droite : la conversation ───────────────────────────────────────────── */
function conversation(g, x, y, w, h, o = {}) {
  boite(g, x, y, w, h, { r: 10, fond: J.bg1, trait: J.l1 });
  txt(g, "CONVERSATION", x + J.padLg, y + 24,
      { taille: J.fCaption, poids: 600, couleur: J.fg3 });
  chip(g, x + w - 62, y + 12, o.etatChip ?? "prêt",
       { point: o.etatCouleur ?? J.green, fond: "rgba(220,232,255,.05)" });

  let cy = y + 46;
  (o.messages ?? []).forEach(m => {
    if (m.type === "moi") {
      const bh = 22 + m.lignes.length * J.lBody;
      boite(g, x + J.padLg, cy, w - J.padLg * 2, bh,
            { r: 8, fond: "rgba(220,232,255,.05)", trait: J.l1 });
      let ly = cy + 20;
      m.lignes.forEach(l => {
        txt(g, l, x + J.padLg * 2, ly,
            { taille: J.fBody, couleur: J.fg1, max: w - J.padLg * 4 });
        ly += J.lBody;
      });
      cy += bh + J.gapMd;
    } else if (m.type === "jarvis") {
      // la voix de l'assistant : serif, sans cadre
      let ly = cy + 14;
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      m.lignes.forEach(l => {
        g.font = `400 ${J.fBody}px Georgia, "Times New Roman", serif`;
        g.fillStyle = J.fg1;
        g.fillText(tronquer(g, l, w - J.padLg * 2), x + J.padLg, ly);
        ly += J.lBody;
      });
      cy = ly + J.gapSm;
    } else if (m.type === "outil") {
      const bh = 30;
      boite(g, x + J.padLg, cy, w - J.padLg * 2, bh,
            { r: 6, fond: J.bg2, trait: J.l1 });
      txt(g, m.icone ?? "▸", x + J.padLg + J.padMd, cy + 19,
          { taille: J.fCaption, couleur: m.couleur ?? J.ac });
      txt(g, m.nom, x + J.padLg + 22, cy + 19,
          { taille: J.fFootnote, mono: true, couleur: J.fg1,
            max: w - J.padLg * 2 - 70 });
      txt(g, m.duree ?? "", x + w - J.padLg - J.padMd, cy + 19,
          { taille: J.fCaption, mono: true, couleur: J.fg4, align: "right" });
      cy += bh + J.gapXs;
    } else if (m.type === "flux") {
      let ly = cy + 14;
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      m.lignes.forEach((l, i) => {
        g.font = `400 ${J.fBody}px Georgia, "Times New Roman", serif`;
        g.fillStyle = J.fg1;
        g.fillText(tronquer(g, l, w - J.padLg * 2), x + J.padLg, ly);
        if (i === m.lignes.length - 1) {       // le curseur de frappe
          const lw = g.measureText(tronquer(g, l, w - J.padLg * 2)).width;
          g.fillStyle = J.ac;
          g.fillRect(x + J.padLg + lw + 3, ly - 10, 7, 12);
        }
        ly += J.lBody;
      });
      cy = ly + J.gapSm;
    }
  });

  // zone de saisie
  const zy = y + h - 68;
  boite(g, x + J.padLg, zy, w - J.padLg * 2, 52,
        { r: 8, fond: J.bg2, trait: o.saisieFocus ? J.acLine : J.l2 });
  if (o.saisieFocus) {
    rr(g, x + J.padLg - 2, zy - 2, w - J.padLg * 2 + 4, 56, 10);
    g.strokeStyle = J.acSoft; g.lineWidth = 3; g.stroke();
  }
  txt(g, o.saisie ?? "Demandez, ou décrivez la modification…",
      x + J.padLg + J.padMd, zy + 20,
      { taille: J.fBody, couleur: o.saisie ? J.fg1 : J.fg4,
        max: w - J.padLg * 2 - J.padMd * 2 });
  txt(g, "⌘↵", x + w - J.padLg - J.padMd, zy + 42,
      { taille: J.fCaption, mono: true, couleur: J.fg4, align: "right" });
  chip(g, x + J.padLg + J.padMd, zy + 30, o.contexte ?? "3 fichiers",
       { fond: "rgba(220,232,255,.05)", couleur: J.fg2 });
}

/* ── bas : le terminal ──────────────────────────────────────────────────── */
function terminal(g, x, y, w, h, o = {}) {
  boite(g, x, y, w, h, { r: 10, fond: "#04060A", trait: J.l1 });
  let tx = x + J.padLg;
  ["session", "shell", "bash"].forEach((n, i) => {
    const actif = i === (o.flux ?? 0);
    const tw = chip(g, tx, y + 8, n,
                    { fond: actif ? J.acSoft : "transparent",
                      trait: actif ? J.acLine : J.l1,
                      couleur: actif ? J.ac : J.fg3, mono: true });
    tx += tw + J.gapXs;
  });
  txt(g, o.repli ?? "▾", x + w - J.padLg, y + 21,
      { taille: J.fCaption, couleur: J.fg3, align: "right" });

  let cy = y + 44;
  (o.lignes ?? []).forEach(([s, c]) => {
    txt(g, s, x + J.padLg, cy,
        { taille: J.fCode, mono: true, couleur: c ?? J.fg2,
          max: w - J.padLg * 2 });
    cy += J.lCode;
  });
  if (o.curseur !== false) { g.fillStyle = J.green; g.fillRect(x + J.padLg, cy - 11, 7, 12); }
}

/* ── les six vues ───────────────────────────────────────────────────────── */

function vueEtabli(g, W, H, mode) {
  // mode : 0 repos · 1 au travail · 2 diff a approuver
  chassis(g, W, H, 1);
  const T = 60, B = H - 34;
  const GL = 236, DR = 372;
  const hautTerm = mode === 1 ? 172 : 44;
  const centreW = W - GL - DR - J.gapMd * 4;

  colonneGauche(g, J.padXl, T, GL, B - T);

  const cx = J.padXl + GL + J.gapMd;
  const edH = B - T - hautTerm - J.gapSm;

  if (mode === 2) {
    editeur(g, cx, T, centreW, edH, {
      onglets: [["code.js", 1, "A"], ["code.css", 0, "A"], ["sessions.py", 0, "M"]],
      curseur: false,
      lignes: [
        [41, "const PAGES = ["],
        [42, '  { id: \"sessions\",  label: \"Sessions\" },'],
        [43, '  { id: \"etabli\",    label: \"Établi\" },', "+"],
        [44, '  { id: \"agents\",    label: \"Agents\" },', "+"],
        [45, '  { id: \"artefacts\", label: \"Artefacts\" },', "+"],
        [46, '  { id: \"depots\",    label: \"Dépôts\" },', "+"],
        [47, "];"],
        [48, ""],
        [49, "let _pageActive = \"sessions\";"],
        [50, "const racine = document.getElementById(\"page-root\");"],
      ],
    });
    // bandeau d'approbation, ancre au bas de l'editeur
    const ay = T + edH - 62;
    boite(g, cx + J.gapMd, ay, centreW - J.gapMd * 2, 50,
          { r: 8, fond: J.bg3, trait: J.acLine, ombre: true });
    txt(g, "Modifier  code.js", cx + J.gapMd + J.padLg, ay + 21,
        { taille: J.fBody, poids: 500, couleur: J.fg0 });
    txt(g, "4 ajouts · aucune suppression · hors de la zone protégée",
        cx + J.gapMd + J.padLg, ay + 38,
        { taille: J.fCaption, couleur: J.fg3 });
    let bx = cx + centreW - J.gapMd - J.padLg;
    bx -= bouton(g, bx - 88, ay + 13, "Approuver",
                 { style: "accent", w: 88, focus: true }) + J.gapSm;
    bx -= bouton(g, bx - 70, ay + 13, "Refuser", { style: "second", w: 70 }) + J.gapSm;
    bouton(g, bx - 76, ay + 13, "Toujours", { style: "fantome", w: 76 });
  } else {
    editeur(g, cx, T, centreW, edH, {
      curseurX: mode === 1 ? 260 : 210,
      lignes: mode === 1 ? [
        [41, "const PAGES = ["],
        [42, '  { id: \"sessions\",  label: \"Sessions\" },'],
        [43, '  { id: \"etabli\",    label: \"Établi\" },'],
        [44, "];"],
        [45, ""],
        [46, "export function monter(racine) {"],
        [47, "  const grille = document.createElement(\"div\");"],
        [48, "  grille.className = \"code-grille\";"],
        [49, "  return grille;"],
        [50, "}"],
      ] : [
        [41, "const PAGES = ["],
        [42, '  { id: \"sessions\",  label: \"Sessions\" },'],
        [43, "];"],
        [44, ""],
        [45, "// L'atelier de code de My Jarvis"],
        [46, "export function monter(racine) {"],
        [47, "  return null;"],
        [48, "}"],
      ],
    });
  }

  terminal(g, cx, T + edH + J.gapSm, centreW, hautTerm, {
    flux: mode === 1 ? 2 : 0,
    repli: mode === 1 ? "▴" : "▾",
    curseur: mode === 1,
    lignes: mode === 1 ? [
      ["$ python -m pytest tests-miku/ -q", J.fg1],
      ["....................................", J.fg2],
      ["36 passed in 2.41s", J.gitAdd],
      ["$ node --check src/.../static/code.js", J.fg1],
      ["", J.fg2],
    ] : [],
  });

  const dx = W - J.padXl - DR;
  conversation(g, dx, T, DR, B - T, mode === 1 ? {
    etatChip: "au travail", etatCouleur: J.amber,
    messages: [
      { type: "moi", lignes: ["Ajoute la page Établi au", "chapitre Code."] },
      { type: "outil", nom: "lire  code.js", duree: "12 ms", couleur: J.ac },
      { type: "outil", nom: "editer  code.js", duree: "en cours",
        couleur: J.amber, icone: "◐" },
      { type: "flux", lignes: ["J'ajoute l'entrée dans PAGES et",
                               "je monte la grille à trois"] },
    ],
  } : mode === 2 ? {
    etatChip: "en attente", etatCouleur: J.gold,
    messages: [
      { type: "moi", lignes: ["Ajoute les quatre pages", "manquantes."] },
      { type: "jarvis", lignes: ["Quatre entrées à insérer dans",
                                 "PAGES. Rien d'autre ne bouge."] },
      { type: "outil", nom: "editer  code.js", duree: "à approuver",
        couleur: J.gold, icone: "⏸" },
    ],
  } : {
    messages: [
      { type: "moi", lignes: ["Ouvre la partie Code."] },
      { type: "jarvis", lignes: ["L'établi est prêt. Trois fichiers",
                                 "sont chargés, la branche est",
                                 "propre."] },
    ],
    saisie: null, saisieFocus: true,
  });

  barreEtat(g, W, H, mode === 0
    ? { branche: "main", chemin: "~/MyJarvis/base/jarvis-OS" }
    : mode === 1
    ? { branche: "code/etabli", diff: [128, 12], sante: J.amber,
        droite: "opus-5 · 41 k / 200 k jetons" }
    : { branche: "code/etabli", diff: [4, 0], sante: J.gold,
        droite: "1 approbation en attente" });
}

function vueSessions(g, W, H) {
  chassis(g, W, H, 0);
  const T = 60;
  txt(g, "Sessions", J.padXl, T + 26,
      { taille: J.fTitle, poids: 600, couleur: J.fg0 });
  txt(g, "Chaque session garde son établi, son terminal et son fil.",
      J.padXl, T + 48, { taille: J.fFootnote, couleur: J.fg3 });
  bouton(g, W - J.padXl - 118, T + 12, "Nouvelle session",
         { style: "accent", w: 118 });

  const y0 = T + 74;
  const cols = 3, cw = (W - J.padXl * 2 - J.gapMd * (cols - 1)) / cols;
  const cartes = [
    ["Refonte de la barre d'onglets", "code/etabli", J.amber, "au travail",
     "+128 −12", "il y a 4 min", .62],
    ["Correctif du flux vocal", "main", J.green, "terminée",
     "+34 −8", "hier, 21:40", 1],
    ["Audit des dépendances", "audit/deps", J.gold, "à approuver",
     "+0 −0", "hier, 18:02", .35],
    ["Migration Rust du noyau", "rust/noyau", J.fg4, "en pause",
     "+902 −340", "3 août", .18],
    ["Portage Linux de l'installateur", "linux/install", J.green, "terminée",
     "+210 −44", "2 août", 1],
    ["Revue du dépôt amont", "—", J.red, "échouée",
     "+0 −0", "1 août", .8],
  ];
  cartes.forEach(([nom, branche, c, etat, diff, quand, p], i) => {
    const x = J.padXl + (i % cols) * (cw + J.gapMd);
    const y = y0 + Math.floor(i / cols) * 132;
    boite(g, x, y, cw, 118,
          { r: 10, fond: J.bg1, trait: i === 0 ? J.acLine : J.l1 });
    txt(g, nom, x + J.padLg, y + 26,
        { taille: J.fHeading, poids: 500, couleur: J.fg0, max: cw - J.padLg * 2 });
    let bx = x + J.padLg;
    bx += chip(g, bx, y + 36, etat, { point: c, fond: "rgba(220,232,255,.05)" }) + J.gapXs;
    chip(g, bx, y + 36, branche, { mono: true, fond: "rgba(220,232,255,.05)",
                                   couleur: J.fg2 });
    jauge(g, x + J.padLg, y + 72, cw - J.padLg * 2, p, c);
    txt(g, diff, x + J.padLg, y + 98,
        { taille: J.fCaption, mono: true, couleur: J.fg3 });
    txt(g, quand, x + cw - J.padLg, y + 98,
        { taille: J.fCaption, couleur: J.fg4, align: "right" });
  });
  barreEtat(g, W, H, { droite: "6 sessions · 1 en cours" });
}

function vueAgents(g, W, H) {
  chassis(g, W, H, 2);
  const T = 60;
  txt(g, "Agents", J.padXl, T + 26,
      { taille: J.fTitle, poids: 600, couleur: J.fg0 });
  txt(g, "Un agent survit à la session : il a son déclencheur, son périmètre et son moteur.",
      J.padXl, T + 48, { taille: J.fFootnote, couleur: J.fg3 });
  bouton(g, W - J.padXl - 92, T + 12, "Nouvel agent", { style: "accent", w: 92 });

  const y0 = T + 76;
  const lignes = [
    ["Gardien des tests", "à chaque écriture", "tout le dépôt", "opus-5", J.green, "actif", 214],
    ["Relecteur de PR", "sur ouverture de PR", "dépôt amont", "sonnet-5", J.green, "actif", 88],
    ["Veilleur de sécurité", "chaque nuit, 03:00", "dépendances", "opus-5", J.gold, "en attente", 12],
    ["Traducteur des libellés", "manuel", "static/", "haiku-4.5", J.fg4, "au repos", 0],
    ["Compagnon de refonte", "déclencheur externe", "ui/", "opus-5", J.fg4, "au repos", 3],
  ];
  const cols = [26, 300, 470, 660, 790, 930];
  ["NOM", "DÉCLENCHEUR", "PÉRIMÈTRE", "MOTEUR", "ÉTAT", "EXÉCUTIONS"].forEach((h, i) => {
    txt(g, h, J.padXl + cols[i] - 26, y0,
        { taille: J.fCaption, poids: 600, couleur: J.fg3,
          align: i === 5 ? "right" : "left" });
  });
  g.fillStyle = J.l1; g.fillRect(J.padXl, y0 + 10, W - J.padXl * 2, 1);

  lignes.forEach(([nom, decl, per, moteur, c, etat, n], i) => {
    const y = y0 + 40 + i * 46;
    if (i === 0) boite(g, J.padXl - J.padSm, y - 24, W - J.padXl * 2 + J.padSm * 2, 40,
                       { r: 6, fond: "rgba(220,232,255,.03)" });
    txt(g, nom, J.padXl, y, { taille: J.fBody, poids: 500, couleur: J.fg0 });
    txt(g, decl, J.padXl + cols[1] - 26, y, { taille: J.fFootnote, couleur: J.fg2 });
    txt(g, per, J.padXl + cols[2] - 26, y,
        { taille: J.fFootnote, mono: true, couleur: J.fg2 });
    txt(g, moteur, J.padXl + cols[3] - 26, y,
        { taille: J.fFootnote, mono: true, couleur: J.fg2 });
    chip(g, J.padXl + cols[4] - 26, y - 13, etat,
         { point: c, fond: "rgba(220,232,255,.05)" });
    txt(g, n ? String(n) : "—", J.padXl + cols[5] - 26, y,
        { taille: J.fFootnote, mono: true, couleur: n ? J.fg1 : J.fg4, align: "right" });
    g.fillStyle = J.l1; g.fillRect(J.padXl, y + 22, W - J.padXl * 2, 1);
  });
  barreEtat(g, W, H, { droite: "5 agents · 2 actifs" });
}

function vueSecurite(g, W, H) {
  chassis(g, W, H, 6);
  const T = 60;
  txt(g, "Sécurité", J.padXl, T + 26,
      { taille: J.fTitle, poids: 600, couleur: J.fg0 });
  txt(g, "Ce que l'agent peut faire seul, et ce qu'il doit demander.",
      J.padXl, T + 48, { taille: J.fFootnote, couleur: J.fg3 });

  const y0 = T + 78, cw = (W - J.padXl * 2 - J.gapMd) / 2;

  // gauche : les portes d'approbation
  boite(g, J.padXl, y0, cw, 300, { r: 10, fond: J.bg1, trait: J.l1 });
  txt(g, "APPROBATIONS", J.padXl + J.padLg, y0 + 26,
      { taille: J.fCaption, poids: 600, couleur: J.fg3 });
  const portes = [
    ["Lire un fichier", 0, "sans demander"],
    ["Écrire dans le dépôt", 1, "hors zone protégée"],
    ["Lancer une commande", 1, "toujours"],
    ["Appeler le réseau", 1, "toujours"],
    ["Publier sur le dépôt distant", 1, "toujours"],
    ["Toucher aux secrets", 2, "interdit"],
  ];
  portes.forEach(([nom, niveau, regle], i) => {
    const y = y0 + 54 + i * 40;
    txt(g, nom, J.padXl + J.padLg, y + 16,
        { taille: J.fBody, couleur: J.fg1 });
    txt(g, regle, J.padXl + J.padLg, y + 31,
        { taille: J.fCaption, couleur: J.fg4 });
    // interrupteur a trois crans : libre / demande / interdit
    const sx = J.padXl + cw - J.padLg - 76;
    boite(g, sx, y + 8, 76, 20,
          { r: 6, fond: "rgba(220,232,255,.05)", trait: J.l1 });
    const c = [J.green, J.gold, J.red][niveau];
    boite(g, sx + 2 + niveau * 24, y + 10, 24, 16, { r: 5, fond: c });
    ["○", "?", "✕"].forEach((s, k) => {
      txt(g, s, sx + 2 + k * 24 + 12, y + 22,
          { taille: J.fCaption, poids: 600, align: "center",
            couleur: k === niveau ? "#04101f" : J.fg4 });
    });
    if (i < portes.length - 1) {
      g.fillStyle = J.l1;
      g.fillRect(J.padXl + J.padLg, y + 38, cw - J.padLg * 2, 1);
    }
  });

  // droite : zones protegees + mandataire
  const rx = J.padXl + cw + J.gapMd;
  boite(g, rx, y0, cw, 142, { r: 10, fond: J.bg1, trait: J.l1 });
  txt(g, "ZONES PROTÉGÉES", rx + J.padLg, y0 + 26,
      { taille: J.fCaption, poids: 600, couleur: J.fg3 });
  ["config/", "data/memoire/", ".env", "miku_scripts/"].forEach((z, i) => {
    const y = y0 + 48 + i * 22;
    txt(g, "🔒", rx + J.padLg, y + 12, { taille: J.fCaption, couleur: J.gold });
    txt(g, z, rx + J.padLg + 18, y + 12,
        { taille: J.fFootnote, mono: true, couleur: J.fg1 });
    txt(g, "lecture seule", rx + cw - J.padLg, y + 12,
        { taille: J.fCaption, couleur: J.fg4, align: "right" });
  });

  boite(g, rx, y0 + 158, cw, 142, { r: 10, fond: J.bg1, trait: J.l1 });
  txt(g, "MANDATAIRE", rx + J.padLg, y0 + 184,
      { taille: J.fCaption, poids: 600, couleur: J.fg3 });
  txt(g, "L'agent n'a aucun secret. Le mandataire les porte,",
      rx + J.padLg, y0 + 206, { taille: J.fFootnote, couleur: J.fg2 });
  txt(g, "applique les règles et les fait tourner.",
      rx + J.padLg, y0 + 222, { taille: J.fFootnote, couleur: J.fg2 });
  let bx2 = rx + J.padLg;
  [["GitHub", J.green], ["Anthropic", J.green], ["Modrinth", J.fg4]]
    .forEach(([n, c]) => {
      bx2 += chip(g, bx2, y0 + 238, n,
                  { point: c, fond: "rgba(220,232,255,.05)" }) + J.gapXs;
    });
  txt(g, "rotation des clés : il y a 6 jours", rx + J.padLg, y0 + 282,
      { taille: J.fCaption, couleur: J.fg4 });

  barreEtat(g, W, H, { sante: J.gold, branche: "4 règles demandent confirmation",
                       droite: "audit complet · 5 août" });
}

/* ── point d'entree ─────────────────────────────────────────────────────── */
export default {
  titre: "Partie CODE de My Jarvis — six états",
  type: "2d",
  fond: "#06080D",

  libelle(iVue) { return VUES[iVue % VUES.length] || ("vue " + iVue); },

  dessiner(g, t, iVue, W, H) {
    const v = iVue % VUES.length;
    if (v <= 2) vueEtabli(g, W, H, v);
    else if (v === 3) vueSessions(g, W, H);
    else if (v === 4) vueAgents(g, W, H);
    else vueSecurite(g, W, H);
    texture(g, W, H);
  },
};
