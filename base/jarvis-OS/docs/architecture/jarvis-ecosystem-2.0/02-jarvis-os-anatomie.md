# Anatomie du dépôt jarvis-OS

> Source : `github.com/Grominet95/jarvis-OS`, branche `main`, dernier push le 15/07/2026
> (18,6 Mo, 115 étoiles). Le clone présent dans `base/jarvis-OS` est à jour — le distant
> est resté figé depuis. Relevé le 31/07/2026 sur le code réel, pas sur la documentation.
>
> Ce document dit **ce qui existe dans le code**. La vidéo (voir
> [01-synthese-video-refonte.md](01-synthese-video-refonte.md)) dit ce que l'auteur en
> montre. L'écart entre les deux est signalé en fin de document.

---

## Identité

| Élément | Valeur |
| --- | --- |
| Auteur | Barthélemy Houot |
| Licence | **AGPL-3.0** — clause §13 : toute mise en réseau oblige à publier les sources |
| Langage | Python 3.11, async |
| Serveur | FastAPI + uvicorn |
| Voix | LiveKit Agents |
| Dépendances | gérées par `uv` |
| Volumétrie | ~29 600 lignes de Python sous `src/jarvis/` |

---

## L'architecture en quatre couches

Le code est découpé en quatre couches **strictes**, et la règle est *exécutable* : trois
contrats `forbidden` d'[import-linter](https://pypi.org/project/import-linter/) tournent
en intégration continue à chaque poussée. Une couche basse qui importerait une couche
haute casse la chaîne. C'est le point le plus structurant du dépôt — la discipline est
outillée, pas seulement écrite.

### L0 — `kernel/` (2 239 lignes, 18 fichiers)

Le socle sans dépendance. Contient les `Protocol` (`contracts.py`), les dataclasses
partagées (`schemas.py`), le bus d'événements publication/abonnement (`events.py`), la
configuration typée (`settings.py`), et surtout les briques de gouvernance :
`permissions.py`, `approval.py`, `approvals.py`, `preflight.py`, `notifications.py`.
S'y ajoutent `paths.py`, `errors.py`, `vocab.py`, `bundle.py`, `connectivity.py`,
`file_lock.py`, `backends.py`, `setup_layout.py`.

### L1 — les fournisseurs et les capacités

| Package | Lignes | Contenu |
| --- | --- | --- |
| `providers/llm/` | 1 413 | `api.py`, `local.py`, `claude_agent_sdk.py`, `factory.py`, `base.py` — le point d'extension multi-backend |
| `providers/memory/` | 2 320 | `kernel.py`, `ingest.py`, `mirror.py`, `search.py`, `retrieval.py`, `auto_dream.py`, `consolidation.py`, `topics.py`, `user_model.py`, `visual_memory.py`, `sessions.py`, `index.py` |
| `providers/audio/` | 366 | STT et TTS |
| `providers/vision/` | 424 | YOLOv8, reconnaissance faciale |
| `capabilities/tools/` | 3 528 | 22 outils : navigateur, Gmail, Calendar, Notion, Spotify, vision, filesystem, CLI, mémoire… |
| `capabilities/skills/` | 2 445 | `registry.py`, `lifecycle.py`, `lab.py`, `synthesizer.py`, `executor.py`, `installer.py`, `standard.py`, `app_checker.py`, `_clawhub.py`, `_abi_compat.py` |
| `analytics/widgets/` | 313 | Widgets YouTube, projets, statistiques |
| `hardware/` | 1 360 | **Macropad 2 touches** (1 207 lignes, avec firmware) et parsers **Bluetooth** |

### L2 — `engine/` (le cœur orchestral)

| Sous-ensemble | Lignes | Fichiers marquants |
| --- | --- | --- |
| Racine | 1 292 | `gateway.py`, `agent.py`, `router.py`, `session.py`, `budget.py`, `tracking.py`, `audit.py`, `approval_checker.py`, `auth.py` |
| `mission/` | 3 591 | `orchestrator.py`, `worker_agent.py`, `verifier.py`, `governance.py`, `reflexion.py`, `capability_engine.py`, `quality_checker.py`, `docker_executor.py`, `project_store.py`, + 7 backends |
| `proactive/` | 2 569 | `engine.py`, `command_center.py`, `curator.py`, `initiative_generator.py`, `context_builder.py`, `executor.py`, `store.py`, `voice_agent.py`, + 9 collecteurs, + trackers |
| `background/` | 833 | `worker.py`, `scheduler.py`, `routines.py`, `notifications.py` |

Les **collecteurs proactifs** livrés : `weather`, `news`, `email`, `calendar`, `tasks`,
`home_assistant`, `jarvis` (auto-observation), plus une `base` extensible — il suffit
d'ajouter un fichier dans le dossier.

### L3 — `interfaces/` (4 724 + 646 + 470 lignes)

`bootstrap.build()` est la **racine de composition unique** : elle instancie une
trentaine d'objets, câble le bus, et vérifie par `isinstance` que chaque implémentation
respecte bien son `Protocol`. Puis :

- `interfaces/api/` — 31 routeurs FastAPI : `chat`, `memory`, `proactive`, `skills`,
  `budget`, `sessions`, `vision`, `system`, `websocket`, `widgets`, `globe`, `music`,
  `spotify`, `deezer`, `local_music`, `macropad_2k`, `setup_wizard`, `google_oauth`,
  `connectors`, `routines`, `projects`, `conv_projects`, `curator`, `briefing`,
  `analytics`, `admin`, `logs`, `channels`, `http`, `ui`, plus `api/config/` (6 fichiers).
- `interfaces/channels/` — **cinq** canaux de messagerie : Telegram, Discord, Slack,
  Signal, WhatsApp, derrière une `gateway.py` commune.
- `interfaces/voice/agent.py` — le pipeline LiveKit, dans un **processus séparé**.

### Garde-fous d'intégration continue

| Porte | Vérifie |
| --- | --- |
| `ruff check` | Style et erreurs (`E W F I B UP ANN ASYNC TID`) |
| `lint-imports` | Les trois contrats de couches |
| `mypy` scopé | Conformité aux `Protocol` du kernel |
| `pytest -m "not integration"` | ~587 tests unitaires, moins de 30 s |
| `snapshot_routes.py` | Les URL HTTP n'ont pas dévié de la référence |

La chaîne lourde tourne sur `main` et une fois par semaine, avec les ~28 tests
d'intégration et les dépendances système (`cmake`, `openblas`, `portaudio`, `libgl1`).

---

## Le noyau de mémoire

Le principe revendiqué : Jarvis mémorise des **faits atomiques**, jamais des blocs bruts.
Chaque fait est daté, sourcé (quel échange l'a produit), renforcé à chaque
ré-observation, archivé quand il est contredit — **et jamais supprimé**.

| Table SQLite | Contenu |
| --- | --- |
| `events` | Journal immuable de tout ce qui arrive |
| `facts` | Affirmations atomiques, prédicat issu d'un vocabulaire fermé, statut (`active`, `superseded`, `needs_review`), confiance, décroissance par catégorie |
| `fact_observations` | Renforcement sans doublon : chaque ré-observation laisse une trace |
| `fact_relations` | Liens `supersedes`, `contradicts`, `supports`, `related_to` |

Un **miroir Markdown unidirectionnel** génère `user/preferences.md`, `user/projects.md`,
`user/goals.md`, `jarvis/persona.md` — lisibles dans Obsidian. Éditer un `.md` laisse la
mémoire intacte : pour corriger un souvenir, Jarvis émet un événement `human_correction`
qui met la base à jour. Tout vit dans `memory_data/`, ignoré par git.

**AutoDream** et **ConsolidationAgent** repassent chaque nuit sur les sessions récentes
pour rattraper les faits manqués en temps réel.

---

## Le moteur proactif

Chaque initiative porte un déclencheur, un objectif, un coût maximal (jetons, temps,
argent), un **niveau d'autonomie de 0 à 5** et un état suivi en continu.

| Niveau | Portée |
| --- | --- |
| 0 | Répondre seulement |
| 3 | Exécution en bac à sable → passe le gate |
| 4 | Modification de fichiers projet → passe le gate |
| 5 | Publier, payer, contacter → **validation humaine obligatoire** |

Le **Command Center** donne la vue unifiée des initiatives et missions : objectifs,
budgets, permissions, battement de cœur, coûts. Le **Curator nocturne** produit chaque
nuit un rapport et propose des correctifs — faits contradictoires, compétences inutilisées
à archiver, prompts qui ont dérivé, coûts du jour, erreurs récurrentes. Il **propose** ;
l'humain valide tout ce qui dépasse le seuil.

---

## La gouvernance

Le gate est **composite** : `risque × catégorie × budget`, avec **audit immuable**. Tout
ce qui touche au système de fichiers ou au réseau y passe, qu'il s'agisse d'une étape de
mission ou d'une initiative proactive. `engine/audit.py`, `engine/budget.py`,
`engine/approval_checker.py` et `kernel/approval.py` en portent l'implémentation.

Le **Skill Lab** complète le dispositif : les compétences nées de l'usage sont testées
dans un bac à sable **Docker** et validées par l'humain avant installation. Le
**Capability Engine** (`mission/capability_engine.py`) détecte les manques de capacité et
tente de les combler.

---

## Installation — trois parcours

| Parcours | Public | Geste |
| --- | --- | --- |
| **A** | Utilisateur Windows | Archive contenant `bundle/` → `setup.bat` puis `run.bat`. Aucun Python, uv, cmake ou LiveKit à installer |
| **B** | Développeur | `build_bundle.ps1` ou `.sh` une fois avec réseau, puis même flux que A |
| **C** | Développement pur | `uv sync` (+ `--extra vision`), puis `./jarvis eclosion` ou `.\jarvis.ps1 setup` |

Le `bundle/` embarque un Python 3.11 **relocalisable**, un environnement virtuel, les
modèles ML (YOLO, Piper), `livekit-server` et `uv.exe`. Au premier `setup`, il se ré-ancre
seul sur la machine cible.

| Commande | Rôle |
| --- | --- |
| `.\jarvis.ps1 setup` | Assistant web de configuration, sur le port 8765 |
| `.\jarvis.ps1 run` | LiveKit + API + pipeline vocal |
| `.\jarvis.ps1 api` | Serveur FastAPI seul |
| `.\jarvis.ps1 doctor` | Diagnostic |

Les lanceurs `.bat` existent parce que Windows bloque les `.ps1` téléchargés — ils
appellent `jarvis.ps1` en `-ExecutionPolicy Bypass`.

### Choix du modèle

Une seule clé est requise, celle du backend retenu. Anthropic reste facultatif.

| `API_BACKEND` | Clé | Note |
| --- | --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` | Vocal via `VOICE_ANTHROPIC_MODEL` |
| `openai` | `OPENAI_API_KEY` | Appel de fonctions géré |
| `mistral` | `MISTRAL_API_KEY` | Appel de fonctions géré |
| `local` | aucune | Ollama, avec `LLM_PROVIDER=local` |

Le pipeline vocal suit `API_BACKEND` ; si LiveKit ne gère pas le backend choisi, il
bascule sur Gemini (`GOOGLE_API_KEY`). Surcharge possible par `VOICE_LLM_MODEL`.

### Points de configuration à connaître

- Photo de référence pour le scan biométrique : `vision_data/faces/reference.jpg`,
  avec `uv sync --extra vision` et `FACE_RECOGNITION_ENABLED=true`.
- Google : déposer `credentials.json` dans `config/google_credentials.json`.
- Commandes shell autorisées : liste blanche dans `config/tools.yaml`.
- Sur serveur sans micro, mettre `CLAP_DETECTION_ENABLED=false` — la détection du double
  claquement écoute le micro de la **machine hôte**.
- Telegram : `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `TELEGRAM_ENABLED=true`. Seul
  l'identifiant propriétaire est accepté ; tout autre compte est rejeté sans traitement.

---

## Écart entre la vidéo et le code

Ce que le code contient **au-delà** de ce que la vidéo montre :

1. **Cinq canaux de messagerie**, quand la vidéo n'en montre qu'un (Telegram).
2. **Le macropad matériel à deux touches**, avec son firmware — 1 207 lignes, la plus
   grosse brique matérielle du dépôt.
3. **Les niveaux d'autonomie 0 à 5**, bien plus fins que les trois verdicts présentés.
4. **Le Skill Lab en bac à sable Docker** et le **Capability Engine** — la vidéo montre la
   validation d'une compétence, sans dire qu'elle a été éprouvée en conteneur.
5. **La vérification à trois étages des missions** — structurelle, déterministe,
   sémantique — et la **reprise après plantage**.
6. **Le tableau de bord géopolitique World Monitor**, dépôt séparé affiché en cadre.
7. **Le miroir Markdown compatible Obsidian** de la mémoire.
8. **Les collecteurs Home Assistant et tâches**, absents de la démonstration.

Ce que la vidéo présente **différemment** :

- `jarvis eclosion` est la commande Linux/macOS ; sous Windows, c'est `.\jarvis.ps1 setup`
  ou le double-clic sur `setup.bat`.
- Le portail « trois questions » du discours correspond au gate composite
  `risque × catégorie × budget` du code.
- Le duo 3h00/3h10 recouvre en réalité trois agents : AutoDream, ConsolidationAgent et
  Curator.
