// MyJarvis — sidecar Claude Agent SDK (abonnement, aucune clé API)
//
// Rôle : héberger @anthropic-ai/claude-agent-sdk pour le fork jarvis-OS
// (base\jarvis-OS). Le provider Python `claude_agent_sdk.py` nous parle en
// HTTP local. Invariant de gouvernance : chaque outil Jarvis est exposé en
// outil MCP in-process dont le handler NE FAIT RIEN lui-même — il émet un
// événement `tool_call` et attend que Python exécute via son tool_executor
// (gate composite compris côté mission) puis poste le résultat.
//
// Protocole :
//   GET  /health                        → {ok:true}
//   GET  /quota                         → consommation de l'abonnement
//   POST /complete                      → {text, usage} | SSE data:{delta}
//   POST /tool-loop                     → {loopId}
//   GET  /tool-loop/:id/events          → {type: tool_call|final|error|idle}
//   POST /tool-loop/:id/tool-result     → {ok:true}

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as reglages from './config.mjs';
import * as moteurOpenAI from './moteurs/openai.mjs';
import * as moteurOllama from './moteurs/ollama.mjs';

const engineDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MYJARVIS_ROOT || path.resolve(engineDir, '..', '..');
const PORT = Number(process.env.MYJARVIS_SIDECAR_PORT || 4981);

reglages.definirRacine(ROOT);

// Moteurs interchangeables. Le protocole rendu à Python ne change jamais :
// c'est ce qui permet de basculer d'un fournisseur à l'autre sans toucher au
// reste de Jarvis, et sans que la gouvernance des outils bouge d'un pouce.
const MOTEURS_ALTERNATIFS = {
  'openai': moteurOpenAI,
  'ollama': moteurOllama,
};

async function moteurActif() {
  const cfg = await reglages.lire();
  return { cfg, alt: MOTEURS_ALTERNATIFS[cfg.moteur] || null };
}

// ---- journal horodaté à la seconde ----
const ts = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
async function log(line) {
  try {
    await appendFile(path.join(ROOT, 'logs', `sidecar-${ts().slice(0, 10)}.log`), `[${ts()}] ${line}\n`, 'utf8');
  } catch { /* le journal ne doit jamais faire tomber le sidecar */ }
}

// ══════════════════════════ quota d'abonnement ══════════════════════════
//
// Anthropic n'expose AUCUNE API publique de solde pour un abonnement : la
// seule source honnête est ce que ce sidecar consomme réellement. On tient
// donc un registre local (une ligne JSON par requête aboutie) et on le
// projette sur les deux fenêtres qui gouvernent l'abonnement : la session
// glissante de 5 h et la semaine glissante de 7 jours.
//
// Les plafonds ne sont PAS devinés : ils viennent de l'environnement
// (MYJARVIS_QUOTA_SESSION / MYJARVIS_QUOTA_WEEK). Sans eux, l'API renvoie
// `limit: null` et l'interface affiche la consommation sans jauge.

const LEDGER_DIR = path.join(ROOT, 'data');
const LEDGER = path.join(LEDGER_DIR, 'quota-ledger.jsonl');
const LIMITS_FILE = path.join(LEDGER_DIR, 'quota-limits.json');
const PLAN_LABEL = process.env.MYJARVIS_PLAN || 'Claude — abonnement';

// Plafonds : fichier d'abord (modifiable depuis les Réglages, effet immédiat),
// variables d'environnement en repli. Ils ne sont jamais devinés.
async function readLimits() {
  let fromFile = {};
  try { fromFile = JSON.parse(await readFile(LIMITS_FILE, 'utf8')); } catch { /* absent */ }
  const num = v => (Number(v) > 0 ? Number(v) : null);
  return {
    session: num(fromFile.session) ?? num(process.env.MYJARVIS_QUOTA_SESSION),
    week: num(fromFile.week) ?? num(process.env.MYJARVIS_QUOTA_WEEK),
    plan: fromFile.plan || PLAN_LABEL,
  };
}

async function writeLimits(patch) {
  const cur = await readLimits();
  const next = {
    session: patch.session !== undefined ? (Number(patch.session) || null) : cur.session,
    week: patch.week !== undefined ? (Number(patch.week) || null) : cur.week,
    plan: patch.plan || cur.plan,
  };
  await mkdir(LEDGER_DIR, { recursive: true });
  await writeFile(LIMITS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function recordUsage(model, usage, rate) {
  if (!usage && !rate) return;
  const u = usage || {};
  const entry = {
    t: Date.now(),
    model: model || null,
    in: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    out: u.output_tokens ?? 0,
    // Métadonnées de limite renvoyées par le SDK, si un jour il en expose :
    // recopiées telles quelles, jamais inventées.
    ...(rate ? { rate } : {})
  };
  try {
    await mkdir(LEDGER_DIR, { recursive: true });
    await appendFile(LEDGER, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* le registre ne doit jamais faire tomber le sidecar */ }
}

async function readLedger() {
  try {
    const raw = await readFile(LEDGER, 'utf8');
    const out = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* ligne tronquée : ignorée */ }
    }
    return out;
  } catch { return []; }
}

function windowStats(entries, sinceMs, limit) {
  const rows = entries.filter(e => e.t >= sinceMs);
  const tokens = rows.reduce((n, e) => n + (e.in || 0) + (e.out || 0), 0);
  return {
    requests: rows.length,
    tokens,
    limit,
    pct: limit ? Math.min(100, (rows.length / limit) * 100) : null,
    oldest: rows.length ? rows[0].t : null,
  };
}

async function quotaSnapshot() {
  const entries = await readLedger();
  const limits = await readLimits();
  const now = Date.now();
  const last = entries.length ? entries[entries.length - 1] : null;
  return {
    mode: 'subscription',           // ce sidecar efface toute clé API (cleanEnv)
    plan: limits.plan,
    measured: 'local',              // consommation observée ici, pas un solde Anthropic
    now,
    session: windowStats(entries, now - 5 * 3600 * 1000, limits.session),
    week: windowStats(entries, now - 7 * 86400 * 1000, limits.week),
    total_requests: entries.length,
    last_call: last ? last.t : null,
    rate: last && last.rate ? last.rate : null,
  };
}

// ---- environnement du binaire Claude Code ----
//
// Par défaut : abonnement pur. Toute clé API présente dans l'environnement
// primerait sur le jeton de session et basculerait en facturation, on l'efface.
//
// Mais si une URL de base est réglée, on détourne DÉLIBÉRÉMENT le binaire vers
// elle. C'est ce qui rend le moteur Claude Code utilisable devant n'importe
// quelle passerelle parlant le protocole Anthropic — LiteLLM, un proxy maison,
// un modèle local exposé au bon format. Le binaire ne voit pas la différence.
function cleanEnv(cfg) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  const c = cfg?.claude || {};
  if (c.baseUrl) {
    env.ANTHROPIC_BASE_URL = c.baseUrl;
    // Une passerelle tierce attend souvent un jeton à elle. Sans jeton réglé,
    // on laisse le binaire présenter sa session d'abonnement.
    if (c.jeton) env.ANTHROPIC_AUTH_TOKEN = c.jeton;
  }
  return env;
}

// ---- outils natifs Claude Code interdits : seuls les outils Jarvis existent ----
const CORE_TOOLS = [
  'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
  'Agent', 'Task', 'NotebookEdit', 'TodoWrite', 'BashOutput', 'KillShell'
];

// ---- JSON Schema (input_schema Claude) → raw shape Zod (sous-ensemble usuel) ----
function propToZod(p) {
  if (!p || typeof p !== 'object') return z.any();
  if (Array.isArray(p.enum) && p.enum.length) {
    const literals = p.enum.map(v => z.literal(v));
    return literals.length === 1 ? literals[0] : z.union(literals);
  }
  switch (p.type) {
    case 'string': return z.string();
    case 'number': return z.number();
    case 'integer': return z.number().int();
    case 'boolean': return z.boolean();
    case 'array': return z.array(propToZod(p.items));
    case 'object': return z.object(shapeFromSchema(p)).passthrough();
    default: return z.any();
  }
}
function shapeFromSchema(schema) {
  const shape = {};
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  for (const [key, p] of Object.entries(props)) {
    let zt = propToZod(p);
    if (p?.description) zt = zt.describe(p.description);
    shape[key] = required.has(key) ? zt : zt.optional();
  }
  return shape;
}

// ---- historique Anthropic → prompt texte (le SDK ne prend pas un historique brut) ----
function blockText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content.map(b => {
    if (b.type === 'text') return b.text ?? '';
    if (b.type === 'tool_use') return `[appel d'outil ${b.name} ${JSON.stringify(b.input ?? {})}]`;
    if (b.type === 'tool_result') return `[résultat d'outil] ${blockText(b.content)}`;
    return '';
  }).filter(Boolean).join('\n');
}
function renderPrompt(messages) {
  const msgs = (messages ?? []).filter(m => m && m.role);
  if (msgs.length === 1 && msgs[0].role === 'user') return blockText(msgs[0].content);
  const lines = msgs.map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${blockText(m.content)}`);
  const last = lines.pop() ?? '';
  return `Historique de la conversation en cours :\n\n${lines.join('\n\n')}\n\n` +
         `Dernier message, auquel tu réponds maintenant :\n\n${last}`;
}

// ---- options communes query() ----
function baseOptions(body, model, cfg) {
  // Les outils natifs de Claude Code sont coupés par défaut pour que seuls les
  // outils Jarvis existent. La liste des exceptions est réglable : on retire
  // des interdits ceux que l'utilisateur a explicitement autorisés.
  const autorises = new Set(cfg?.claude?.outilsNatifsAutorises || []);
  const interdits = CORE_TOOLS.filter(t => !autorises.has(t));

  const thinking = body.maxThinkingTokens > 0
    ? body.maxThinkingTokens
    : (cfg?.claude?.maxThinkingTokens || 0);

  return {
    systemPrompt: body.system || undefined,   // chaîne custom : remplace tout
    model,
    settingSources: [],                       // isolation : aucun settings/CLAUDE.md externe
    disallowedTools: interdits,
    env: cleanEnv(cfg),
    cwd: ROOT,
    ...(thinking > 0 ? { maxThinkingTokens: thinking } : {})
  };
}

// ══════════════════════════ /complete ══════════════════════════

async function runComplete(body, res) {
  const stream = Boolean(body.stream);

  // ── moteur alternatif : on sort du chemin Claude SDK ──────────────────────
  const { cfg, alt } = await moteurActif();
  if (alt) {
    if (stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });
    }
    try {
      const out = await alt.complete(cfg, { ...body, model: body.model || cfg.modele }, {
        onDelta: (d) => { if (stream) res.write(`data:${JSON.stringify({ delta: d })}\n\n`); },
      });
      await recordUsage(body.model || cfg.modele, out.usage, null);
      if (stream) { res.write(`data:${JSON.stringify({ done: true, usage: out.usage })}\n\n`); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }
    } catch (e) {
      await log(`complete [${cfg.moteur}] ERREUR: ${e.message}`);
      if (stream) { res.write(`data:${JSON.stringify({ error: e.message })}\n\n`); res.end(); }
      else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    }
    return;
  }

  const attempt = async (model) => {
    let text = '', usage = null, error = null;
    const q = query({
      prompt: renderPrompt(body.messages),
      options: {
        ...baseOptions(body, model, cfg),
        allowedTools: [],
        maxTurns: cfg.maxToursComplete || 2,
        includePartialMessages: stream,
      }
    });
    for await (const msg of q) {
      if (stream && msg.type === 'stream_event') {
        const ev = msg.event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          text += ev.delta.text;
          res.write(`data:${JSON.stringify({ delta: ev.delta.text })}\n\n`);
        }
      } else if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          text = text || (msg.result ?? '');
          usage = msg.usage ?? null;
          await recordUsage(model, usage, msg.rate_limits ?? msg.rate_limit ?? null);
        }
        else error = msg.subtype;
      }
    }
    if (error) throw new Error(error);
    return { text, usage };
  };

  if (stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });
  }
  try {
    let out;
    try { out = await attempt(body.model); }
    catch (e) {
      if (!body.fallbackModel || body.fallbackModel === body.model) throw e;
      await log(`complete: repli ${body.model} -> ${body.fallbackModel} (${e.message})`);
      out = await attempt(body.fallbackModel);
    }
    if (stream) { res.write(`data:${JSON.stringify({ done: true, usage: out.usage })}\n\n`); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }
  } catch (e) {
    await log(`complete ERREUR: ${e.message}`);
    if (stream) { res.write(`data:${JSON.stringify({ error: e.message })}\n\n`); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
  }
}

// ══════════════════════════ /tool-loop ══════════════════════════

const loops = new Map(); // loopId → {queue, waiter, pending, usedTools}

function pushEvent(loop, ev) {
  if (loop.waiter) { const w = loop.waiter; loop.waiter = null; w(ev); }
  else loop.queue.push(ev);
}
function nextEvent(loop, ms = 25000) {
  if (loop.queue.length) return Promise.resolve(loop.queue.shift());
  return new Promise(resolve => {
    const t = setTimeout(() => { if (loop.waiter) loop.waiter = null; resolve({ type: 'idle' }); }, ms);
    loop.waiter = ev => { clearTimeout(t); resolve(ev); };
  });
}

function buildMcp(loop, tools) {
  const wrapped = (tools ?? []).map(t =>
    tool(t.name, t.description || t.name, shapeFromSchema(t.input_schema), async (args) => {
      const callId = randomUUID();
      const result = await new Promise(resolve => {
        loop.pending.set(callId, resolve);
        loop.usedTools = true;
        pushEvent(loop, { type: 'tool_call', callId, name: t.name, input: args ?? {} });
      });
      return { content: [{ type: 'text', text: String(result) }] };
    })
  );
  return {
    server: createSdkMcpServer({ name: 'jarvis', version: '1.0.0', tools: wrapped }),
    allowed: (tools ?? []).map(t => `mcp__jarvis__${t.name}`)
  };
}

async function runLoop(loopId, body) {
  const loop = loops.get(loopId);

  // ── moteur alternatif ─────────────────────────────────────────────────────
  // Le contrat de gouvernance est tenu à l'identique : chaque outil décidé par
  // le modèle repart en `tool_call` vers Python, qui l'exécute derrière son
  // gate. Rien n'est exécuté ici, quel que soit le moteur.
  const { cfg, alt } = await moteurActif();
  if (alt) {
    try {
      await alt.toolLoop(cfg, { ...body, model: body.model || cfg.modele }, {
        onToolCall: (nom, args) => new Promise(resolve => {
          const callId = randomUUID();
          loop.pending.set(callId, resolve);
          loop.usedTools = true;
          pushEvent(loop, { type: 'tool_call', callId, name: nom, input: args ?? {} });
        }),
        onFinal: async ({ text, usage }) => {
          await recordUsage(body.model || cfg.modele, usage, null);
          pushEvent(loop, { type: 'final', text, usage });
        },
        onAvertissement: (m) => { log(`tool-loop ${loopId} [${cfg.moteur}] : ${m}`); },
      });
    } catch (e) {
      await log(`tool-loop ${loopId} [${cfg.moteur}] ERREUR: ${e.message}`);
      pushEvent(loop, { type: 'error', message: e.message });
    }
    return;
  }

  const attempt = async (model) => {
    const { server, allowed } = buildMcp(loop, body.tools);
    const q = query({
      prompt: renderPrompt(body.messages),
      options: {
        ...baseOptions(body, model, cfg),
        mcpServers: { jarvis: server },
        allowedTools: allowed,
        maxTurns: cfg.maxToursOutils || 50,
      }
    });
    for await (const msg of q) {
      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          await recordUsage(model, msg.usage ?? null, msg.rate_limits ?? msg.rate_limit ?? null);
          pushEvent(loop, { type: 'final', text: msg.result ?? '', usage: msg.usage ?? null });
        }
        else throw new Error(msg.subtype);
      }
    }
  };
  try {
    try { await attempt(body.model); }
    catch (e) {
      // Repli uniquement si aucun outil n'a encore été exécuté (pas d'effet de bord).
      if (loop.usedTools || !body.fallbackModel || body.fallbackModel === body.model) throw e;
      await log(`tool-loop ${loopId}: repli ${body.model} -> ${body.fallbackModel} (${e.message})`);
      await attempt(body.fallbackModel);
    }
  } catch (e) {
    await log(`tool-loop ${loopId} ERREUR: ${e.message}`);
    pushEvent(loop, { type: 'error', message: e.message });
  }
}

// ══════════════════════════ serveur HTTP ══════════════════════════

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/health') {
      const cfg = await reglages.lire();
      return json(res, 200, {
        ok: true,
        engine: cfg.moteur,
        model: cfg.modele || null,
        port: PORT,
      });
    }
    if (req.method === 'GET' && url.pathname === '/quota') {
      return json(res, 200, await quotaSnapshot());
    }
    if (req.method === 'POST' && url.pathname === '/quota/limits') {
      const body = await readBody(req);
      const saved = await writeLimits(body);
      await log(`plafonds de quota mis a jour: session=${saved.session} semaine=${saved.week}`);
      return json(res, 200, { ok: true, limits: saved });
    }
    // ══════════════ réglages du moteur — lecture, écriture, essai ══════════════

    if (req.method === 'GET' && url.pathname === '/engine') {
      const cfg = await reglages.lire();
      return json(res, 200, {
        actif: cfg.moteur,
        moteurs: reglages.MOTEURS,
        config: reglages.masquer(cfg),
        // Le binaire Claude Code est détourné dès qu'une URL de base est posée.
        detourne: Boolean(cfg.claude?.baseUrl),
      });
    }

    if (req.method === 'PUT' && url.pathname === '/engine') {
      const patch = await readBody(req);
      // Une clé masquée renvoyée telle quelle ne doit pas écraser la vraie.
      if (typeof patch.cle === 'string' && patch.cle.includes('•')) delete patch.cle;
      if (patch.claude && typeof patch.claude.jeton === 'string' && patch.claude.jeton.includes('•')) {
        delete patch.claude.jeton;
      }
      const futur = { ...(await reglages.lire()), ...patch };
      const soucis = reglages.verifier(futur);
      if (soucis.length) return json(res, 400, { ok: false, soucis });
      const saved = await reglages.ecrire(patch);
      await log(`moteur reglé : ${saved.moteur}${saved.url ? ' → ' + saved.url : ''}${saved.modele ? ' (' + saved.modele + ')' : ''}`);
      return json(res, 200, { ok: true, config: reglages.masquer(saved) });
    }

    if (req.method === 'POST' && url.pathname === '/engine/test') {
      const patch = await readBody(req);
      const base = await reglages.lire();
      if (typeof patch.cle === 'string' && patch.cle.includes('•')) delete patch.cle;
      const cfg = { ...base, ...patch };
      const soucis = reglages.verifier(cfg);
      if (soucis.length) return json(res, 200, { ok: false, soucis });

      const alt = MOTEURS_ALTERNATIFS[cfg.moteur];
      if (!alt) {
        // claude-sdk : la santé se mesure sur ce sidecar lui-même.
        return json(res, 200, { ok: true, detail: 'Moteur par abonnement — le sidecar répond.' });
      }
      try {
        const vivant = await alt.sante(cfg);
        return json(res, 200, {
          ok: vivant,
          detail: vivant ? 'Connexion établie.' : "Aucune réponse à cette adresse.",
        });
      } catch (e) {
        return json(res, 200, { ok: false, detail: e.message });
      }
    }

    if (req.method === 'GET' && url.pathname === '/engine/models') {
      const cfg = await reglages.lire();
      const alt = MOTEURS_ALTERNATIFS[cfg.moteur];
      if (alt?.modeles) return json(res, 200, { modeles: await alt.modeles(cfg) });
      return json(res, 200, { modeles: [] });
    }

    if (req.method === 'POST' && url.pathname === '/complete') {
      return await runComplete(await readBody(req), res);
    }
    if (req.method === 'POST' && url.pathname === '/tool-loop') {
      const body = await readBody(req);
      const loopId = randomUUID();
      loops.set(loopId, { queue: [], waiter: null, pending: new Map(), usedTools: false });
      runLoop(loopId, body); // asynchrone — les événements arrivent par /events
      await log(`tool-loop ${loopId} démarré (${(body.tools ?? []).length} outils, ${body.context || 'sans contexte'})`);
      return json(res, 200, { loopId });
    }
    if (parts[0] === 'tool-loop' && parts[1] && parts[2] === 'events' && req.method === 'GET') {
      const loop = loops.get(parts[1]);
      if (!loop) return json(res, 404, { type: 'error', message: 'loop inconnue' });
      const ev = await nextEvent(loop);
      if (ev.type === 'final' || ev.type === 'error') loops.delete(parts[1]);
      return json(res, 200, ev);
    }
    if (parts[0] === 'tool-loop' && parts[1] && parts[2] === 'tool-result' && req.method === 'POST') {
      const loop = loops.get(parts[1]);
      if (!loop) return json(res, 404, { ok: false });
      const { callId, content } = await readBody(req);
      const resolve = loop.pending.get(callId);
      if (!resolve) return json(res, 404, { ok: false });
      loop.pending.delete(callId);
      resolve(content ?? '');
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'route inconnue' });
  } catch (e) {
    await log(`HTTP ERREUR: ${e.message}`);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`  Sidecar Claude Agent SDK en ligne : http://127.0.0.1:${PORT}/`);
  console.log('  Moteur par abonnement — aucune clé API. Gouvernance Jarvis préservée (tool_call → Python).');
  await log(`démarrage sidecar — port ${PORT}`);
});
