// VÃ©rifie la mise en voix : ce que Jarvis prononcera rÃ©ellement.
const fs = require('fs');
const path = require('path').join(__dirname, '..', 'base', 'jarvis-OS', 'src', 'jarvis', 'interfaces', 'ui', 'static', 'voix-reponse.js');

const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
const ecouteurs = {};
global.window = {
  addEventListener: (t, f) => { (ecouteurs[t] = ecouteurs[t] || []).push(f); },
  dispatchEvent: () => {},
};
global.document = { addEventListener: () => {} };
global.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = (o || {}).detail; } };
global.fetch = async () => { throw new Error('hors ligne'); };

eval(fs.readFileSync(path, 'utf8'));
const L = global.window.JarvisLecture;

let echecs = 0;
function verifie(nom, obtenu, attendu) {
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log((ok ? '  OK  ' : ' ECHEC') + ' ' + nom);
  if (!ok) {
    console.log('        attendu : ' + JSON.stringify(attendu));
    console.log('        obtenu  : ' + JSON.stringify(obtenu));
  }
}

console.log('\n--- Mise en voix ---');

verifie('titres retires',
  L.apercu('## Bilan\nTout va bien.'),
  'Bilan. Tout va bien.');

verifie('gras et italique retires',
  L.apercu('C est **important** et *urgent*.'),
  'C est important et urgent.');

verifie('lien reduit a son texte',
  L.apercu('Voir [la doc](https://exemple.fr/page) pour la suite.'),
  'Voir la doc pour la suite.');

verifie('bloc de code annonce, pas epele',
  L.apercu('Lance ceci :\n```bash\nrm -rf /\n```\nVoila.'),
  'Lance ceci. (bloc de code). Voila.');

verifie('code en ligne conserve son contenu',
  L.apercu('Tape `git status` pour voir.'),
  'Tape git status pour voir.');

verifie('liste transformee en phrases, sans point d attaque',
  L.apercu('- un\n- deux\n- trois'),
  'un. deux. trois');

verifie('tableau retire, pause a sa place',
  L.apercu('Avant\n| a | b |\n| 1 | 2 |\nApres'),
  'Avant. Apres');

verifie('image retiree',
  L.apercu('Regarde ![schema](/img/a.png) ici.'),
  'Regarde ici.');

verifie('mindmap coupee',
  L.apercu('Reponse courte. [MINDMAP]{tout ce bazar}'),
  'Reponse courte.');

verifie('citation deballee',
  L.apercu('> Il a dit oui.'),
  'Il a dit oui.');

verifie('code seul : annonce nette',
  L.apercu('```\ncode seul\n```'),
  '(bloc de code).');

console.log('\n--- Reglages ---');

L.regler({ lireCode: true });
const avecCode = L.apercu('Voici :\n```js\nlet a = 1;\n```');
verifie('lireCode change le rendu', avecCode.includes('let a = 1'), true);
L.regler({ lireCode: false });

L.regler({ longueurMax: 40 });
const coupe = L.apercu('Premiere phrase courte. Deuxieme phrase qui depasse largement la limite fixee par le reglage.');
verifie('coupe sur une phrase entiere', coupe, 'Premiere phrase courte.');
verifie('coupe sous la limite', coupe.length <= 40, true);
L.regler({ longueurMax: 0 });

const long = 'a'.repeat(5000);
verifie('longueurMax 0 ne coupe pas', L.apercu(long).length, 5000);

verifie('reglages persistes', JSON.parse(store['jarvis_lecture_reponses']).longueurMax, 0);

console.log('\n--- Mode ---');
verifie('trois modes exposes', L.modes.join(','), 'jamais,auto,toujours');
verifie('defaut = auto', JSON.parse(store['jarvis_lecture_reponses']).mode, 'auto');

console.log('\n' + (echecs === 0 ? 'Tout passe.' : echecs + ' echec(s).'));
process.exit(echecs === 0 ? 0 : 1);
