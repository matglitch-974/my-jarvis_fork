// Teste les moteurs contre de faux fournisseurs locaux.
import http from 'node:http';
import * as openai from '../Jarvis/engine/moteurs/openai.mjs';
import * as ollama from '../Jarvis/engine/moteurs/ollama.mjs';
import * as reglages from '../Jarvis/engine/config.mjs';

let echecs = 0;
const recu = [];
function verifie(nom, obtenu, attendu) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log((ok ? '  OK   ' : ' ECHEC ') + nom);
  if (!ok) {
    console.log('        attendu : ' + JSON.stringify(attendu));
    console.log('        obtenu  : ' + JSON.stringify(obtenu));
  }
}

function lireCorps(req) {
  return new Promise(r => { let s = ''; req.on('data', c => s += c); req.on('end', () => r(s ? JSON.parse(s) : {})); });
}

// â”€â”€ faux fournisseur OpenAI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let tourOpenAI = 0;
const srvOpenAI = http.createServer(async (req, res) => {
  const corps = await lireCorps(req);
  recu.push({ url: req.url, corps });

  if (req.url.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'faux-modele' }] }));
  }

  if (corps.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const m of ['Bon', 'jour', ' Maitre']) {
      res.write(`data:${JSON.stringify({ choices: [{ delta: { content: m } }] })}\n\n`);
    }
    res.write(`data:${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 11, completion_tokens: 3 } })}\n\n`);
    res.write('data:[DONE]\n\n');
    return res.end();
  }

  // Boucle d'outils : premier tour demande un outil, second conclut.
  if (corps.tools && tourOpenAI === 0) {
    tourOpenAI++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      choices: [{ message: { content: '', tool_calls: [
        { id: 'a1', function: { name: 'meteo', arguments: '{"ville":"Beziers"}' } },
        { id: 'a2', function: { name: 'heure', arguments: {} } },
      ] } }],
      usage: { prompt_tokens: 20, completion_tokens: 5 },
    }));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    choices: [{ message: { content: 'Il fait beau et il est midi.' } }],
    usage: { prompt_tokens: 30, completion_tokens: 7 },
  }));
});

// â”€â”€ faux Ollama â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let tourOllama = 0;
const srvOllama = http.createServer(async (req, res) => {
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.1:8b' }] }));
  }
  const corps = await lireCorps(req);
  recu.push({ url: req.url, corps });

  if (corps.stream) {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    // Un <think> coupe en deux fragments : le filtre doit tenir.
    for (const m of ['<thi', 'nk>bla bla</think>Rep', 'onse nette']) {
      res.write(JSON.stringify({ message: { content: m } }) + '\n');
    }
    res.write(JSON.stringify({ done: true, prompt_eval_count: 9, eval_count: 4 }) + '\n');
    return res.end();
  }

  if (corps.tools && tourOllama === 0) {
    tourOllama++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      message: { content: '', tool_calls: [{ function: { name: 'meteo', arguments: { ville: 'Beziers' } } }] },
      prompt_eval_count: 12, eval_count: 3,
    }));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: { content: '<think>je reflechis</think>Termine.' },
    prompt_eval_count: 15, eval_count: 2,
  }));
});

await new Promise(r => srvOpenAI.listen(4991, '127.0.0.1', r));
await new Promise(r => srvOllama.listen(4992, '127.0.0.1', r));

const cfgOpenAI = {
  ...reglages.defauts(),
  moteur: 'openai', url: 'http://127.0.0.1:4991/v1', cle: 'secret-abcd',
  modele: 'faux-modele', temperature: 0.4, maxTokens: 1000,
};
const cfgOllama = {
  ...reglages.defauts(),
  moteur: 'ollama', url: 'http://127.0.0.1:4992', modele: 'qwen2.5:7b',
  ollama: { raisonnement: false, garderEnMemoire: '10m', tailleContexte: 8192 },
};

console.log('\n--- OpenAI : complete sans flux ---');
let out = await openai.complete(cfgOpenAI, { system: 'Tu es Jarvis.', messages: [{ role: 'user', content: 'Salut' }] });
verifie('texte', out.text, 'Il fait beau et il est midi.');
verifie('usage traduit', out.usage, { input_tokens: 30, output_tokens: 7 });
const dernier = recu[recu.length - 1].corps;
verifie('temperature transmise', dernier.temperature, 0.4);
verifie('max_tokens transmis', dernier.max_tokens, 1000);
verifie('system en premier message', dernier.messages[0], { role: 'system', content: 'Tu es Jarvis.' });

console.log('\n--- OpenAI : complete en flux ---');
const morceaux = [];
out = await openai.complete(cfgOpenAI, { messages: [{ role: 'user', content: 'Salut' }], stream: true }, { onDelta: d => morceaux.push(d) });
verifie('fragments recus', morceaux, ['Bon', 'jour', ' Maitre']);
verifie('texte reconstitue', out.text, 'Bonjour Maitre');
verifie('usage du flux', out.usage, { input_tokens: 11, output_tokens: 3 });

console.log('\n--- OpenAI : boucle d outils ---');
const appels = [];
let final = null;
await openai.toolLoop(cfgOpenAI, {
  system: 'Tu es Jarvis.',
  messages: [{ role: 'user', content: 'Meteo et heure ?' }],
  tools: [
    { name: 'meteo', description: 'La meteo', input_schema: { type: 'object', properties: { ville: { type: 'string' } }, required: ['ville'] } },
    { name: 'heure', description: 'L heure', input_schema: { type: 'object', properties: {} } },
  ],
}, {
  onToolCall: async (nom, args) => { appels.push([nom, args]); return `resultat ${nom}`; },
  onFinal: (f) => { final = f; },
});
verifie('deux outils appeles', appels.length, 2);
verifie('arguments en chaine JSON parses', appels[0], ['meteo', { ville: 'Beziers' }]);
verifie('arguments deja objet acceptes', appels[1], ['heure', {}]);
verifie('texte final', final.text, 'Il fait beau et il est midi.');
verifie('usage cumule sur les tours', final.usage, { input_tokens: 50, output_tokens: 12 });

console.log('\n--- OpenAI : schema d outil converti ---');
const conv = openai.outilsVersOpenAI([{ name: 'x', description: 'd', input_schema: { type: 'object', properties: { a: { type: 'string' } } } }]);
verifie('format function', conv[0].type, 'function');
verifie('nom conserve', conv[0].function.name, 'x');
verifie('schema place dans parameters', conv[0].function.parameters.properties.a.type, 'string');

console.log('\n--- Ollama : raisonnement filtre en flux ---');
const m2 = [];
out = await ollama.complete(cfgOllama, { messages: [{ role: 'user', content: 'Salut' }], stream: true }, { onDelta: d => m2.push(d) });
verifie('le <think> coupe en deux ne fuit pas', out.text, 'Reponse nette');
verifie('usage Ollama traduit', out.usage, { input_tokens: 9, output_tokens: 4 });

console.log('\n--- Ollama : options natives transmises ---');
out = await ollama.complete(cfgOllama, { messages: [{ role: 'user', content: 'Salut' }] });
verifie('raisonnement retire hors flux', out.text, 'Termine.');
const dOllama = recu[recu.length - 1].corps;
verifie('num_ctx transmis', dOllama.options.num_ctx, 8192);
verifie('keep_alive transmis', dOllama.keep_alive, '10m');
verifie('think a false', dOllama.think, false);

console.log('\n--- Ollama : boucle d outils ---');
const appels2 = [];
let final2 = null;
await ollama.toolLoop(cfgOllama, {
  messages: [{ role: 'user', content: 'Meteo ?' }],
  tools: [{ name: 'meteo', description: 'm', input_schema: { type: 'object', properties: {} } }],
}, {
  onToolCall: async (nom, args) => { appels2.push([nom, args]); return 'beau'; },
  onFinal: f => { final2 = f; },
});
verifie('outil appele', appels2[0], ['meteo', { ville: 'Beziers' }]);
verifie('texte final sans raisonnement', final2.text, 'Termine.');

console.log('\n--- Ollama : liste des modeles ---');
verifie('modeles listes', await ollama.modeles(cfgOllama), ['qwen2.5:7b', 'llama3.1:8b']);

console.log('\n--- Sante ---');
verifie('openai vivant', await openai.sante(cfgOpenAI), true);
verifie('ollama vivant', await ollama.sante(cfgOllama), true);
verifie('adresse morte detectee', await ollama.sante({ ...cfgOllama, url: 'http://127.0.0.1:4999' }), false);

console.log('\n--- Validation des reglages ---');
verifie('url manquante refusee', reglages.verifier({ ...cfgOpenAI, url: '' }).length > 0, true);
verifie('cle manquante refusee', reglages.verifier({ ...cfgOpenAI, cle: '' }).length > 0, true);
verifie('temperature hors bornes refusee', reglages.verifier({ ...cfgOpenAI, temperature: 5 }).length > 0, true);
verifie('url sans schema refusee', reglages.verifier({ ...cfgOpenAI, url: 'localhost:1234' }).length > 0, true);
verifie('config valide acceptee', reglages.verifier(cfgOpenAI), []);
verifie('claude-sdk sans url accepte', reglages.verifier({ ...reglages.defauts(), moteur: 'claude-sdk' }), []);

console.log('\n--- Masquage de la cle ---');
const masque = reglages.masquer(cfgOpenAI);
verifie('cle jamais en clair', masque.cle.includes('secret'), false);
verifie('4 derniers caracteres visibles', masque.cle.endsWith('abcd'), true);

srvOpenAI.close(); srvOllama.close();
console.log('\n' + (echecs === 0 ? 'Tout passe.' : echecs + ' echec(s).'));
process.exit(echecs === 0 ? 0 : 1);
