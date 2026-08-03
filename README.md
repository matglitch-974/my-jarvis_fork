# MyJarvis

Fork personnel de [jarvis-OS](https://github.com/Grominet95/jarvis-OS) (Barthélemy
Houot, AGPL-3.0), avec deux ajouts principaux : un moteur par **abonnement Claude**
sans clé API, et une refonte de l'apparence de l'interface.

> Ce dépôt redistribue jarvis-OS sous AGPL-3.0. Le travail original et le mérite
> de l'architecture reviennent à son auteur ; les modifications décrites plus bas
> sont les miennes.

---

## Ce que ce fork ajoute

### 1. Moteur par abonnement — sidecar Claude Agent SDK

Un sidecar Node local (`Jarvis/engine/index.mjs`) héberge
`@anthropic-ai/claude-agent-sdk`, authentifié par le login Claude de la machine
(abonnement Pro/Max). **Aucune clé `ANTHROPIC_API_KEY` n'est requise.**

Le provider Python correspondant vit dans
`base/jarvis-OS/src/jarvis/providers/llm/claude_agent_sdk.py` et se branche sur
le point d'extension `LLMProvider` existant — le cœur de jarvis-OS reste intact.

**L'invariant de gouvernance est préservé** : chaque outil Jarvis est exposé au SDK
en outil MCP in-process dont le gestionnaire n'exécute rien lui-même. Il émet un
événement `tool_call` et attend que Python exécute via son `tool_executor` — donc
le gate composite d'origine s'applique à l'identique. Le sidecar ne court-circuite
jamais la chaîne d'autorisation.

### 2. Apparence — deux options indépendantes

| Option | Fichiers | Effet |
|---|---|---|
| **Effet verre** | `glass.js` | Réfraction de bord façon Liquid Glass, au lieu d'un flou uniforme |
| **Mode Claude** | `claude-mode.{js,css}` | Habillage aux proportions de l'app Claude + panneau Projets |

Les deux se règlent dans **Réglages → Apparence**, se cumulent, et se persistent
en `localStorage` — même mécanisme que la teinte d'accent existante (`theme.js`).

**L'effet verre** ne fait pas de flou gaussien. Un champ de distance signée (SDF)
du rectangle arrondi est cuit **une fois par géométrie** en carte de déplacement,
puis appliqué via `feDisplacementMap`. Seuls les ~16 derniers pixels du bord
échantillonnent le fond avec un décalage ; le centre du panneau ne coûte rien. Le
reflet spéculaire est ancré au monde, pas à l'objet, ce qui le rend invariant par
déplacement.

**Le mode Claude** apporte un panneau Projets en glissière droite. Chaque
conversation appartient obligatoirement à un projet, même seule ; les projets se
trient par date de création, épinglés d'abord. Le stockage
(`interfaces/api/conv_projects.py`) est distinct de celui des projets d'agent
worker existants, pour ne rien casser.

### 3. Agents adjoints

`Jarvis/Adjunct/` contient les personas d'agents spécialisés (Miku orchestratrice,
Cortana pour Windows, Shiki pour la réparation, Clippy pour la langue, Sherlock
pour l'hygiène numérique). **Le routage multi-agent n'est pas encore implémenté** :
ce sont pour l'instant des bundles de configuration prêts à être branchés sur le
sidecar.

---

## Installation

### Linux — une seule commande

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/matglitch-974/my-jarvis_fork/main/install.sh)
```

Une interface s'ouvre aussitôt : dossier d'installation, composants à activer,
jeton Claude. Elle utilise `whiptail` (présent d'office sur Debian, Ubuntu et
Kubuntu) et l'installe au besoin ; sans lui, elle bascule sur un mode texte.

L'installateur récupère le code, prépare l'environnement Python avec
[uv](https://github.com/astral-sh/uv) et écrit un lanceur. Ensuite :

```bash
jarvis
```

L'interface s'ouvre sur `http://127.0.0.1:8000/`.

| Option | Effet |
| --- | --- |
| `--yes` | Réinstalle sans poser de question, en reprenant les choix précédents |
| `--update` | Met à jour une installation existante et rejoue la configuration |
| `--uninstall` | Désinstalle — tout est **déplacé** dans une sauvegarde horodatée, rien n'est effacé |
| `--dir <chemin>` | Impose le dossier d'installation |

Les clés et jetons sont demandés à l'exécution et rangés dans `~/.jarvis/.env`,
hors du dépôt. Le déroulé complet est journalisé dans `~/.jarvis/install.log`.

### Windows

```bash
Jarvis.cmd
```

Lance le sidecar puis le serveur. Première utilisation :

```bash
Connexion-abonnement.cmd
```

Ouvre l'authentification Claude (le jeton se renouvelle environ une fois par an).

### Prérequis

- Linux (Debian, Ubuntu, Kubuntu…) ou Windows 10/11
- Python 3.11+ et [uv](https://github.com/astral-sh/uv) — l'installateur Linux
  s'occupe des deux
- Node.js 20+ pour le moteur par abonnement
- Un abonnement Claude Pro ou Max

> **Sous Linux, la fenêtre native n'existe pas** : elle repose sur WebView2, qui
> est propre à Windows. L'interface s'ouvre donc dans le navigateur. Le reste —
> serveur, sidecar, voix, vision — est identique.

---

## État du projet

Ce qui fonctionne et ce qui reste à faire, sans enjoliver :

| Composant | État |
|---|---|
| Sidecar abonnement + gouvernance | fonctionnel |
| Effet verre | fonctionnel ; contraste adaptatif à venir |
| Mode Claude + panneau Projets | fonctionnel |
| Personas des agents adjoints | rédigées, **moteur non branché** |
| Routage multi-agent | **non implémenté** |

Détail des limites connues en commentaire `TODO` en fin de `glass.js`.

---

## Fichiers absents de ce dépôt

Sept médias de plus de 1 Mo ont été écartés : la connexion de la machine de
publication casse au-delà d'environ 4 Mo par requête. Ils sont tous d'origine
et se récupèrent depuis [jarvis-OS](https://github.com/Grominet95/jarvis-OS) :

- captures et infographies de documentation (`JARVISINTERFACEGITHUB.png`,
  `images/infog1.png`, `references/jarvis_ui_reference.png`, `docs/preview.png`)
- **assets fonctionnels** : `static/earth-blue-marble.jpg` (texture du globe) et
  `static/sfx/{particles,scan}.wav` (séquence de réveil)

Sans ces trois derniers, le globe s'affiche sans texture et la séquence de
réveil reste muette. Le reste fonctionne.

## Licence

**GNU AGPL-3.0-or-later**, héritée de jarvis-OS. Voir
[`base/jarvis-OS/LICENSE`](base/jarvis-OS/LICENSE).

Toute redistribution, y compris sous forme de service réseau, doit fournir le
code source correspondant.

## Crédits

- **jarvis-OS** — [Barthélemy Houot](https://github.com/Grominet95/jarvis-OS),
  architecture d'origine et l'essentiel du code
- Ce fork — modifications listées ci-dessus
