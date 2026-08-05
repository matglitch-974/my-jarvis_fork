// MyJarvis — réglages du moteur, tout paramétrable, à chaud.
//
// Trois sources, par ordre de priorité décroissante :
//   1. data/moteur.json      — écrit depuis l'interface, effet immédiat
//   2. variables d'environnement — pour un lancement scripté
//   3. valeurs par défaut ici — jamais devinées ailleurs
//
// Aucune valeur n'est codée en dur dans les moteurs : tout ce qui suit est
// réglable depuis Jarvis, y compris les délais, les en-têtes et le nom du
// champ de température. C'est ce qui permet de brancher un fournisseur exotique
// sans toucher au code.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

let RACINE = process.cwd();
export function definirRacine(r) { RACINE = r; }

const fichier = () => path.join(RACINE, 'data', 'moteur.json');

// ── Catalogue des moteurs ───────────────────────────────────────────────────
// `preréglages` sert uniquement à pré-remplir l'interface. Rien n'y oblige :
// l'utilisateur peut saisir n'importe quelle URL et n'importe quel modèle.
export const MOTEURS = {
  'claude-sdk': {
    libelle: 'Claude par abonnement (SDK)',
    detail: "Le binaire Claude Code local, authentifié par votre abonnement. Aucune clé API.",
    besoinCle: false,
    besoinUrl: false,
  },
  'openai': {
    libelle: 'API compatible OpenAI',
    detail: "OpenAI, mais aussi LM Studio, vLLM, llama.cpp, Groq, DeepSeek, OpenRouter, LiteLLM — tout ce qui expose /v1/chat/completions.",
    besoinCle: true,
    besoinUrl: true,
    prereglages: [
      { nom: 'OpenAI',      url: 'https://api.openai.com/v1',        modele: 'gpt-4o' },
      { nom: 'Groq',        url: 'https://api.groq.com/openai/v1',   modele: 'llama-3.3-70b-versatile' },
      { nom: 'DeepSeek',    url: 'https://api.deepseek.com/v1',      modele: 'deepseek-chat' },
      { nom: 'OpenRouter',  url: 'https://openrouter.ai/api/v1',     modele: '' },
      { nom: 'LM Studio',   url: 'http://127.0.0.1:1234/v1',         modele: '' },
      { nom: 'vLLM',        url: 'http://127.0.0.1:8000/v1',         modele: '' },
      { nom: 'llama.cpp',   url: 'http://127.0.0.1:8080/v1',         modele: '' },
      { nom: 'LiteLLM',     url: 'http://127.0.0.1:4000/v1',         modele: '' },
    ],
  },
  'ollama': {
    libelle: 'Ollama (local)',
    detail: "Modèles locaux via l'API native d'Ollama, avec appels d'outils si le modèle les gère.",
    besoinCle: false,
    besoinUrl: true,
    prereglages: [{ nom: 'Ollama local', url: 'http://127.0.0.1:11434', modele: 'qwen2.5:7b' }],
  },
};

// L'API Anthropic facturée à l'usage n'a PAS de moteur dédié, et c'est
// volontaire : la proposer sans l'implémenter la ferait retomber en silence sur
// l'abonnement, ce qui est pire que de ne rien proposer. Deux voies existent
// déjà pour l'atteindre — une passerelle compatible OpenAI (LiteLLM), ou le
// détournement du binaire Claude Code par `claude.baseUrl`.

const nombre = (v, defaut) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : defaut);
const booleen = (v, defaut) => (v === undefined || v === null || v === '' ? defaut : v === true || v === 'true' || v === 1 || v === '1');

// ── Défauts ─────────────────────────────────────────────────────────────────
export function defauts() {
  const e = process.env;
  return {
    moteur: e.MYJARVIS_MOTEUR || 'claude-sdk',

    // Connexion
    url: e.MYJARVIS_MOTEUR_URL || '',
    cle: e.MYJARVIS_MOTEUR_CLE || '',
    // En-têtes libres : indispensable pour les fournisseurs qui en exigent
    // (OpenRouter demande HTTP-Referer, certains proxys un jeton maison).
    entetes: {},

    // Modèles
    modele: e.MYJARVIS_MOTEUR_MODELE || '',
    modeleRepli: e.MYJARVIS_MOTEUR_MODELE_REPLI || '',

    // Génération — laissés à null = on n'envoie pas le champ, le serveur décide
    temperature: null,
    topP: null,
    maxTokens: nombre(e.MYJARVIS_MAX_TOKENS, 4096),
    stopSequences: [],

    // Comportement
    streaming: booleen(e.MYJARVIS_STREAMING, true),
    maxToursOutils: nombre(e.MYJARVIS_MAX_TOURS, 50),
    maxToursComplete: nombre(e.MYJARVIS_MAX_TOURS_COMPLETE, 2),

    // Délais, en secondes
    delaiConnexion: nombre(e.MYJARVIS_DELAI_CONNEXION, 10),
    delaiLecture: nombre(e.MYJARVIS_DELAI_LECTURE, 300),
    delaiLongPoll: nombre(e.MYJARVIS_DELAI_LONGPOLL, 25),

    // Spécifique claude-sdk
    claude: {
      maxThinkingTokens: nombre(e.MYJARVIS_THINKING, 0),
      // Laisser vide garde l'abonnement. Renseigner détourne le binaire vers
      // une autre passerelle compatible Anthropic (LiteLLM, proxy maison).
      //
      // On n'hérite VOLONTAIREMENT pas d'ANTHROPIC_BASE_URL : cette variable
      // traîne souvent dans l'environnement d'une machine de développement, et
      // la reprendre détournerait le moteur d'abonnement sans que personne
      // l'ait demandé. Le détournement doit être un geste explicite — d'où une
      // variable qui ne sert qu'à ça.
      baseUrl: e.MYJARVIS_CLAUDE_BASE_URL || '',
      jeton: e.MYJARVIS_CLAUDE_JETON || '',
      // Les outils natifs de Claude Code sont coupés par défaut : seuls les
      // outils Jarvis existent, la gouvernance reste entière.
      outilsNatifsAutorises: [],
    },

    // Spécifique ollama
    ollama: {
      // Qwen3 et consorts émettent du raisonnement ; on le coupe par défaut.
      raisonnement: booleen(e.MYJARVIS_OLLAMA_THINK, false),
      garderEnMemoire: e.MYJARVIS_OLLAMA_KEEPALIVE || '5m',
      tailleContexte: nombre(e.MYJARVIS_OLLAMA_CTX, 0), // 0 = défaut du modèle
    },

    // Divers
    journaliserRequetes: booleen(e.MYJARVIS_JOURNAL_REQUETES, false),
    plan: e.MYJARVIS_PLAN || 'Claude — abonnement',
  };
}

let cache = null;

export async function lire() {
  if (cache) return cache;
  let fromFile = {};
  try { fromFile = JSON.parse(await readFile(fichier(), 'utf8')); } catch { /* absent au premier lancement */ }
  cache = fusionner(defauts(), fromFile);
  return cache;
}

// Fusion profonde d'un seul niveau d'objets imbriqués : suffisant ici, et
// prévisible — un objet partiel complète, il ne remplace pas.
function fusionner(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = { ...base[k], ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export async function ecrire(patch) {
  const actuel = await lire();
  const suivant = fusionner(actuel, patch || {});
  await mkdir(path.dirname(fichier()), { recursive: true });
  await writeFile(fichier(), JSON.stringify(suivant, null, 2), 'utf8');
  cache = suivant;
  return suivant;
}

export function invalider() { cache = null; }

// Vue sûre pour l'interface : la clé n'est jamais renvoyée en clair.
export function masquer(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  const etoiler = s => (s ? '•'.repeat(Math.min(12, Math.max(4, String(s).length - 4))) + String(s).slice(-4) : '');
  c.cle = etoiler(c.cle);
  if (c.claude) c.claude.jeton = etoiler(c.claude.jeton);
  return c;
}

// Vérifie qu'une configuration est exploitable AVANT de l'enregistrer.
export function verifier(cfg) {
  const m = MOTEURS[cfg.moteur];
  const soucis = [];
  if (!m) return [`Moteur inconnu : ${cfg.moteur}`];
  if (m.besoinUrl && !cfg.url) soucis.push("Une URL de base est requise pour ce moteur.");
  if (m.besoinCle && !cfg.cle) soucis.push("Une clé API est requise pour ce moteur.");
  if (cfg.moteur !== 'claude-sdk' && !cfg.modele) soucis.push("Aucun modèle choisi.");
  if (cfg.url && !/^https?:\/\//i.test(cfg.url)) soucis.push("L'URL doit commencer par http:// ou https://");
  if (cfg.temperature !== null && (cfg.temperature < 0 || cfg.temperature > 2)) soucis.push("La température doit tenir entre 0 et 2.");
  if (cfg.topP !== null && (cfg.topP < 0 || cfg.topP > 1)) soucis.push("Le top-p doit tenir entre 0 et 1.");
  return soucis;
}
