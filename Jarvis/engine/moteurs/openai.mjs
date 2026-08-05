// Moteur « API compatible OpenAI ».
//
// Couvre tout ce qui expose /v1/chat/completions : OpenAI, Groq, DeepSeek,
// OpenRouter, LiteLLM, LM Studio, vLLM, llama.cpp. Le même code sert aussi de
// base au moteur Ollama, qui expose une API compatible.
//
// Le protocole rendu à Python est INCHANGÉ : `complete` retourne {text, usage},
// `toolLoop` rappelle onToolCall pour chaque outil décidé par le modèle. La
// gouvernance Jarvis reste donc entière — rien n'est exécuté ici.

const jsonEntetes = (cfg) => ({
  'Content-Type': 'application/json',
  ...(cfg.cle ? { Authorization: `Bearer ${cfg.cle}` } : {}),
  ...(cfg.entetes || {}),
});

// Schéma d'outil Jarvis (format Claude) → format OpenAI.
export function outilsVersOpenAI(outils) {
  return (outils || []).map(o => ({
    type: 'function',
    function: {
      name: o.name,
      description: o.description || o.name,
      parameters: o.input_schema || { type: 'object', properties: {} },
    },
  }));
}

// Historique Anthropic → messages OpenAI. Les blocs d'outils sont rendus en
// texte : l'historique Jarvis n'est pas rejoué comme des tool_calls, il sert
// de contexte.
function blocTexte(contenu) {
  if (typeof contenu === 'string') return contenu;
  if (!Array.isArray(contenu)) return String(contenu ?? '');
  return contenu.map(b => {
    if (b.type === 'text') return b.text ?? '';
    if (b.type === 'tool_use') return `[appel d'outil ${b.name} ${JSON.stringify(b.input ?? {})}]`;
    if (b.type === 'tool_result') return `[résultat d'outil] ${blocTexte(b.content)}`;
    return '';
  }).filter(Boolean).join('\n');
}

export function messagesVersOpenAI(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages || []) {
    if (!m || !m.role) continue;
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: blocTexte(m.content) });
  }
  return out;
}

// Champs de génération : on n'envoie QUE ce qui est réglé. Un serveur local
// refuse parfois un champ qu'il ne connaît pas ; l'absence est plus sûre qu'un
// défaut inventé.
function champsGeneration(cfg) {
  const p = {};
  if (cfg.temperature !== null && cfg.temperature !== undefined) p.temperature = cfg.temperature;
  if (cfg.topP !== null && cfg.topP !== undefined) p.top_p = cfg.topP;
  if (cfg.maxTokens > 0) p.max_tokens = cfg.maxTokens;
  if (Array.isArray(cfg.stopSequences) && cfg.stopSequences.length) p.stop = cfg.stopSequences;
  return p;
}

function usageVersJarvis(u) {
  if (!u) return null;
  return {
    input_tokens: u.prompt_tokens ?? 0,
    output_tokens: u.completion_tokens ?? 0,
  };
}

async function appeler(cfg, corps, signal) {
  const url = cfg.url.replace(/\/+$/, '') + '/chat/completions';
  const r = await fetch(url, {
    method: 'POST',
    headers: jsonEntetes(cfg),
    body: JSON.stringify(corps),
    signal,
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} — ${detail.slice(0, 300)}`);
  }
  return r;
}

function minuteur(secondes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1, secondes) * 1000);
  return { signal: ctrl.signal, fini: () => clearTimeout(t) };
}

// ── complete ────────────────────────────────────────────────────────────────

export async function complete(cfg, body, { onDelta } = {}) {
  const modele = body.model || cfg.modele;
  const flux = Boolean(body.stream) && cfg.streaming;
  const { signal, fini } = minuteur(cfg.delaiLecture);

  try {
    const corps = {
      model: modele,
      messages: messagesVersOpenAI(body.system, body.messages),
      stream: flux,
      ...champsGeneration(cfg),
      ...(flux ? { stream_options: { include_usage: true } } : {}),
    };

    const r = await appeler(cfg, corps, signal);

    if (!flux) {
      const data = await r.json();
      const choix = data.choices?.[0]?.message?.content ?? '';
      return { text: choix, usage: usageVersJarvis(data.usage) };
    }

    let texte = '';
    let usage = null;
    for await (const evt of lireSSE(r)) {
      if (evt === '[DONE]') break;
      let d;
      try { d = JSON.parse(evt); } catch { continue; }
      const delta = d.choices?.[0]?.delta?.content;
      if (delta) { texte += delta; onDelta?.(delta); }
      if (d.usage) usage = usageVersJarvis(d.usage);
    }
    return { text: texte, usage };
  } finally {
    fini();
  }
}

async function* lireSSE(reponse) {
  const lecteur = reponse.body.getReader();
  const dec = new TextDecoder();
  let tampon = '';
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    tampon += dec.decode(value, { stream: true });
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const ligne = tampon.slice(0, i).trim();
      tampon = tampon.slice(i + 1);
      if (ligne.startsWith('data:')) yield ligne.slice(5).trim();
    }
  }
}

// ── boucle d'outils ─────────────────────────────────────────────────────────

export async function toolLoop(cfg, body, { onToolCall, onFinal }) {
  const modele = body.model || cfg.modele;
  const outils = outilsVersOpenAI(body.tools);
  const messages = messagesVersOpenAI(body.system, body.messages);
  let usageCumul = { input_tokens: 0, output_tokens: 0 };

  for (let tour = 0; tour < cfg.maxToursOutils; tour++) {
    const { signal, fini } = minuteur(cfg.delaiLecture);
    let data;
    try {
      const corps = {
        model: modele,
        messages,
        stream: false,
        ...champsGeneration(cfg),
        ...(outils.length ? { tools: outils } : {}),
      };
      const r = await appeler(cfg, corps, signal);
      data = await r.json();
    } finally {
      fini();
    }

    const u = usageVersJarvis(data.usage);
    if (u) {
      usageCumul.input_tokens += u.input_tokens;
      usageCumul.output_tokens += u.output_tokens;
    }

    const msg = data.choices?.[0]?.message ?? {};
    const appels = msg.tool_calls || [];

    if (!appels.length) {
      onFinal({ text: msg.content ?? '', usage: usageCumul });
      return;
    }

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: appels });

    // Les appels d'un même tour partent ensemble : le modèle les a voulus
    // parallèles, et chacun repasse par la gouvernance côté Python.
    const resultats = await Promise.all(appels.map(async (a) => {
      let args = a.function?.arguments ?? {};
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      const contenu = await onToolCall(a.function?.name ?? '', args);
      return { id: a.id, contenu };
    }));

    for (const r of resultats) {
      messages.push({ role: 'tool', tool_call_id: r.id, content: String(r.contenu ?? '') });
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
      const r = await fetch(cfg.url.replace(/\/+$/, '') + '/models', { headers: jsonEntetes(cfg), signal });
      return r.ok;
    } finally { fini(); }
  } catch { return false; }
}
