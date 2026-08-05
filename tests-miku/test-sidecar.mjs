// Test d'integration : lance le vrai sidecar, bascule son moteur, et verifie
// qu'une completion passe reellement par le fournisseur alternatif.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SCRATCH = 'C:/Users/thebe/AppData/Local/Temp/claude/C--Users-thebe-Desktop-ARCHIVES/8ec33b23-a3ac-43f5-97a3-02134bbe0842/scratchpad/racine-test';
const SIDECAR = new URL('../Jarvis/engine/index.mjs', import.meta.url).pathname.slice(1);
const PORT = 4993;
const FAUX = 4994;

let echecs = 0;
function verifie(nom, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log((ok ? '  OK   ' : ' ECHEC ') + nom);
  if (!ok) { console.log('        attendu : ' + JSON.stringify(attendu)); console.log('        obtenu  : ' + JSON.stringify(obtenu)); }
}

await rm(SCRATCH, { recursive: true, force: true });
await mkdir(path.join(SCRATCH, 'logs'), { recursive: true });

// Faux fournisseur Ollama
const recu = [];
const faux = http.createServer((req, res) => {
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ models: [{ name: 'modele-de-test' }] }));
  }
  let s = '';
  req.on('data', c => s += c);
  req.on('end', () => {
    recu.push(JSON.parse(s || '{}'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: { content: 'Reponse du faux fournisseur.' },
      prompt_eval_count: 7, eval_count: 5,
    }));
  });
});
await new Promise(r => faux.listen(FAUX, '127.0.0.1', r));

// Lancement du vrai sidecar
const proc = spawn(process.execPath, [SIDECAR], {
  env: { ...process.env, MYJARVIS_SIDECAR_PORT: String(PORT), MYJARVIS_ROOT: SCRATCH },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let sortieProc = '';
proc.stdout.on('data', d => { sortieProc += d; });
proc.stderr.on('data', d => { sortieProc += d; });

const dors = ms => new Promise(r => setTimeout(r, ms));
const appel = async (methode, chemin, corps) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  return { statut: r.status, corps: await r.json() };
};

// Attente du demarrage
let pret = false;
for (let i = 0; i < 40; i++) {
  try { await appel('GET', '/health'); pret = true; break; } catch { await dors(250); }
}
if (!pret) {
  console.log('Le sidecar n a pas demarre. Sortie :\n' + sortieProc);
  proc.kill(); faux.close();
  process.exit(1);
}

try {
  console.log('\n--- Etat initial : rien ne doit changer sans reglage ---');
  let r = await appel('GET', '/health');
  verifie('moteur par defaut', r.corps.engine, 'claude-sdk');

  r = await appel('GET', '/engine');
  verifie('moteur actif', r.corps.actif, 'claude-sdk');
  verifie('seuls les moteurs implementes sont proposes', Object.keys(r.corps.moteurs).sort(), ['claude-sdk', 'ollama', 'openai']);
  verifie('chaque moteur propose a un module', Object.keys(r.corps.moteurs).every(m => m === 'claude-sdk' || ['openai', 'ollama'].includes(m)), true);
  verifie('binaire non detourne', r.corps.detourne, false);

  console.log('\n--- Refus des reglages incoherents ---');
  r = await appel('PUT', '/engine', { moteur: 'ollama', url: '', modele: '' });
  verifie('sans URL : refuse', r.statut, 400);
  verifie('raisons donnees', r.corps.soucis.length > 0, true);

  r = await appel('PUT', '/engine', { moteur: 'ollama', url: 'pas-une-url', modele: 'x' });
  verifie('URL sans schema : refusee', r.statut, 400);

  console.log('\n--- Essai avant enregistrement ---');
  r = await appel('POST', '/engine/test', { moteur: 'ollama', url: `http://127.0.0.1:${FAUX}`, modele: 'modele-de-test' });
  verifie('fournisseur vivant', r.corps.ok, true);

  r = await appel('POST', '/engine/test', { moteur: 'ollama', url: 'http://127.0.0.1:4999', modele: 'x' });
  verifie('adresse morte detectee', r.corps.ok, false);

  console.log('\n--- Bascule effective ---');
  r = await appel('PUT', '/engine', {
    moteur: 'ollama', url: `http://127.0.0.1:${FAUX}`, modele: 'modele-de-test',
    temperature: 0.3, ollama: { tailleContexte: 4096, garderEnMemoire: '2m' },
  });
  verifie('enregistre', r.corps.ok, true);

  r = await appel('GET', '/health');
  verifie('sante reflete le nouveau moteur', r.corps.engine, 'ollama');
  verifie('modele annonce', r.corps.model, 'modele-de-test');

  r = await appel('GET', '/engine/models');
  verifie('modeles listes chez le fournisseur', r.corps.modeles, ['modele-de-test']);

  console.log('\n--- Une completion passe par le fournisseur ---');
  r = await appel('POST', '/complete', { system: 'Tu es Jarvis.', messages: [{ role: 'user', content: 'Bonjour' }] });
  verifie('texte du faux fournisseur', r.corps.text, 'Reponse du faux fournisseur.');
  verifie('usage traduit', r.corps.usage, { input_tokens: 7, output_tokens: 5 });
  verifie('le fournisseur a bien ete appele', recu.length > 0, true);
  verifie('temperature transmise', recu[recu.length - 1].options.temperature, 0.3);
  verifie('num_ctx transmis', recu[recu.length - 1].options.num_ctx, 4096);
  verifie('keep_alive transmis', recu[recu.length - 1].keep_alive, '2m');

  console.log('\n--- La cle ne ressort jamais en clair ---');
  await appel('PUT', '/engine', { moteur: 'openai', url: 'https://api.exemple.fr/v1', cle: 'sk-tres-secret-9999', modele: 'm' });
  r = await appel('GET', '/engine');
  verifie('cle masquee', r.corps.config.cle.includes('secret'), false);
  verifie('fin de cle visible', r.corps.config.cle.endsWith('9999'), true);

  // Renvoyer la valeur masquee ne doit pas ecraser la vraie cle.
  await appel('PUT', '/engine', { moteur: 'openai', url: 'https://api.exemple.fr/v1', cle: r.corps.config.cle, modele: 'm2' });
  const apres = await appel('GET', '/engine');
  verifie('cle preservee malgre le masque renvoye', apres.corps.config.cle.endsWith('9999'), true);
  verifie('le reste du patch est bien applique', apres.corps.config.modele, 'm2');

  console.log('\n--- Retour a l abonnement ---');
  await appel('PUT', '/engine', { moteur: 'claude-sdk' });
  r = await appel('GET', '/health');
  verifie('revenu sur claude-sdk', r.corps.engine, 'claude-sdk');

  console.log('\n--- Detournement du binaire Claude Code ---');
  await appel('PUT', '/engine', { moteur: 'claude-sdk', claude: { baseUrl: 'http://127.0.0.1:4000' } });
  r = await appel('GET', '/engine');
  verifie('detournement signale', r.corps.detourne, true);
  verifie('adresse conservee', r.corps.config.claude.baseUrl, 'http://127.0.0.1:4000');

} finally {
  proc.kill();
  faux.close();
}

console.log('\n' + (echecs === 0 ? 'Tout passe.' : echecs + ' echec(s).'));
process.exit(echecs === 0 ? 0 : 1);
