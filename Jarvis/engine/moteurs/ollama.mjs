// Moteur Ollama — API native /api/chat.
//
// On n'utilise pas la façade OpenAI d'Ollama : l'API native donne accès aux
// réglages qui comptent en local (taille de contexte, maintien du modèle en
// mémoire, mode raisonnement). Ils sont tous exposés dans l'interface.
//
// Réserve honnête, la même que côté jarvis-OS : un modèle qui ne gère pas les
// outils ignore le champ `tools` EN SILENCE. La boucle se termine alors
// normalement, mais sans avoir agi. On le signale plutôt que de le masquer.

import { messagesVersOpenAI, outilsVersOpenAI } from './openai.mjs';

const RAISONNEMENT = /<think>[\s\S]*?<\/think>/g;
const sansRaisonnement = (t) => String(t || '').replace(RAISONNEMENT, '').trimStart();

// Longueur du suffixe de `texte` qui pourrait être le DÉBUT de `balise`.
//
// Sans ça, un fragment réseau qui s'arrête au milieu d'une balise — « <thi » —
// est pris pour du texte ordinaire et part à l'écran, puisque `indexOf` ne
// trouve rien. On garde donc ce bout en attente du fragment suivant.
function suffixePartiel(texte, balise) {
  const max = Math.min(texte.length, balise.length - 1);
  for (let n = max; n > 0; n--) {
    if (texte.endsWith(balise.slice(0, n))) return n;
  }
  return 0;
}

function minuteur(secondes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1, secondes) * 1000);
  return { signal: ctrl.signal, fini: () => clearTimeout(t) };
}

function options(cfg) {
  const o = {};
  if (cfg.temperature !== null && cfg.temperature !== undefined) o.temperature = cfg.temperature;
  if (cfg.topP !== null && cfg.topP !== undefined) o.top_p = cfg.topP;
  if (cfg.maxTokens > 0) o.num_predict = cfg.maxTokens;
  if (cfg.ollama?.tailleContexte > 0) o.num_ctx = cfg.ollama.tailleContexte;
  if (Array.isArray(cfg.stopSequences) && cfg.stopSequences.length) o.stop = cfg.stopSequences;
  return o;
}

function corpsBase(cfg, modele, messages, flux) {
  const c = {
    model: modele,
    messages,
    stream: flux,
    think: Boolean(cfg.ollama?.raisonnement),
  };
  const o = options(cfg);
  if (Object.keys(o).length) c.options = o;
  if (cfg.ollama?.garderEnMemoire) c.keep_alive = cfg.ollama.garderEnMemoire;
  return c;
}

const entetes = (cfg) => ({ 'Content-Type': 'application/json', ...(cfg.entetes || {}) });

async function appeler(cfg, corps, signal) {
  const url = cfg.url.replace(/\/+$/, '') + '/api/chat';
  const r = await fetch(url, { method: 'POST', headers: entetes(cfg), body: JSON.stringify(corps), signal });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} — ${detail.slice(0, 300)}`);
  }
  return r;
}

function usageVersJarvis(d) {
  if (!d) return null;
  return {
    input_tokens: d.prompt_eval_count ?? 0,
    output_tokens: d.eval_count ?? 0,
  };
}

// ── complete ────────────────────────────────────────────────────────────────

export async function complete(cfg, body, { onDelta } = {}) {
  const modele = body.model || cfg.modele;
  const flux = Boolean(body.stream) && cfg.streaming;
  const messages = messagesVersOpenAI(body.system, body.messages);
  const { signal, fini } = minuteur(cfg.delaiLecture);

  try {
    const r = await appeler(cfg, corpsBase(cfg, modele, messages, flux), signal);

    if (!flux) {
      const d = await r.json();
      return { text: sansRaisonnement(d.message?.content ?? ''), usage: usageVersJarvis(d) };
    }

    // Ollama diffuse du JSON ligne par ligne, pas du SSE.
    let texte = '';
    let usage = null;
    let dansRaisonnement = false;
    let tampon = '';

    for await (const ligne of lignesJSON(r)) {
      const delta = ligne.message?.content ?? '';
      if (delta) {
        // Filtrage du raisonnement au fil de l'eau : un <think> peut arriver
        // coupé entre deux fragments, d'où le tampon.
        tampon += delta;
        let sortie = '';
        while (tampon) {
          if (dansRaisonnement) {
            const fin = tampon.indexOf('</think>');
            if (fin === -1) {
              // On jette, mais on garde une fermeture éventuellement coupée,
              // sinon on resterait bloqué dans le raisonnement pour toujours.
              const garde = suffixePartiel(tampon, '</think>');
              tampon = garde ? tampon.slice(tampon.length - garde) : '';
              break;
            }
            tampon = tampon.slice(fin + 8);
            dansRaisonnement = false;
          } else {
            const debut = tampon.indexOf('<think>');
            if (debut === -1) {
              const garde = suffixePartiel(tampon, '<think>');
              sortie += garde ? tampon.slice(0, tampon.length - garde) : tampon;
              tampon = garde ? tampon.slice(tampon.length - garde) : '';
              break;
            }
            sortie += tampon.slice(0, debut);
            tampon = tampon.slice(debut + 7);
            dansRaisonnement = true;
          }
        }
        if (sortie) { texte += sortie; onDelta?.(sortie); }
      }
      if (ligne.done) { usage = usageVersJarvis(ligne); break; }
    }
    return { text: texte, usage };
  } finally {
    fini();
  }
}

async function* lignesJSON(reponse) {
  const lecteur = reponse.body.getReader();
  const dec = new TextDecoder();
  let tampon = '';
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    tampon += dec.decode(value, { stream: true });
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const brut = tampon.slice(0, i).trim();
      tampon = tampon.slice(i + 1);
      if (!brut) continue;
      try { yield JSON.parse(brut); } catch { /* ligne tronquée */ }
    }
  }
}

// ── boucle d'outils ─────────────────────────────────────────────────────────

export async function toolLoop(cfg, body, { onToolCall, onFinal, onAvertissement }) {
  const modele = body.model || cfg.modele;
  const outils = outilsVersOpenAI(body.tools);
  const messages = messagesVersOpenAI(body.system, body.messages);
  const usageCumul = { input_tokens: 0, output_tokens: 0 };
  let aAppeleUnOutil = false;

  for (let tour = 0; tour < cfg.maxToursOutils; tour++) {
    const { signal, fini } = minuteur(cfg.delaiLecture);
    let d;
    try {
      const corps = corpsBase(cfg, modele, messages, false);
      if (outils.length) corps.tools = outils;
      const r = await appeler(cfg, corps, signal);
      d = await r.json();
    } finally {
      fini();
    }

    const u = usageVersJarvis(d);
    if (u) {
      usageCumul.input_tokens += u.input_tokens;
      usageCumul.output_tokens += u.output_tokens;
    }

    const msg = d.message ?? {};
    const appels = msg.tool_calls ?? [];

    if (!appels.length) {
      // Le silence est ambigu : soit le modèle a fini, soit il ne sait pas
      // appeler d'outils. On le dit au premier tour, quand c'est révélateur.
      if (tour === 0 && outils.length && !aAppeleUnOutil) {
        onAvertissement?.(
          `Le modèle ${modele} n'a appelé aucun outil alors que ${outils.length} lui étaient offerts. ` +
          `S'il devait agir, c'est probablement qu'il ne gère pas les appels d'outils.`
        );
      }
      onFinal({ text: sansRaisonnement(msg.content ?? ''), usage: usageCumul });
      return;
    }

    aAppeleUnOutil = true;
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: appels });

    const resultats = await Promise.all(appels.map(async (a) => {
      let args = a.function?.arguments ?? {};
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      return onToolCall(a.function?.name ?? '', args);
    }));

    for (const contenu of resultats) {
      messages.push({ role: 'tool', content: String(contenu ?? '') });
    }
  }

  onFinal({
    text: `Je n'ai pas pu terminer : ${cfg.maxToursOutils} tours d'outils atteints.`,
    usage: usageCumul,
  });
}

export async function sante(cfg) {
  try {
    const { signal, fini } = minuteur(cfg.delaiConnexion);
    try {
      const r = await fetch(cfg.url.replace(/\/+$/, '') + '/api/tags', { signal, headers: entetes(cfg) });
      return r.ok;
    } finally { fini(); }
  } catch { return false; }
}

// Liste les modèles réellement présents : l'interface propose ce qui existe
// plutôt que de faire deviner un nom.
export async function modeles(cfg) {
  try {
    const { signal, fini } = minuteur(cfg.delaiConnexion);
    try {
      const r = await fetch(cfg.url.replace(/\/+$/, '') + '/api/tags', { signal, headers: entetes(cfg) });
      if (!r.ok) return [];
      const d = await r.json();
      return (d.models || []).map(m => m.name).filter(Boolean);
    } finally { fini(); }
  } catch { return []; }
}
