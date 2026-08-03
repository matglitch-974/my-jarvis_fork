# Le dépôt jarvis-skills — standards et catalogue

> Source : `github.com/Grominet95/jarvis-skills`, branche `main`, dernier push le
> 24/06/2026 (3,3 Mo, 22 étoiles). Le clone local est à jour. Relevé le 31/07/2026.
>
> C'est le dépôt d'extensions — le « store » évoqué dans la vidéo. Il ne contient aucun
> moteur : uniquement des modules, leurs schémas de validation et les scripts de contrôle.

---

## Organisation du dépôt

| Élément | Rôle |
| --- | --- |
| `skills/` | Les modules conversationnels **et** les presets (même dossier, distingués par `type`) |
| `views/` | Les vues visuelles, plus un `TEMPLATE/` à copier |
| `templates/skill-preset/` | Squelette à copier pour démarrer un module |
| `schemas/` | 5 schémas JSON : `skill`, `preset`, `view`, `index`, `common` |
| `scripts/` | `validate_skills.py`, `validate_catalog.py`, `build_index.py`, **`scan_security.py`** (27,8 Ko) |
| `index.json` | Le catalogue consolidé, version 2.0 — c'est lui que Jarvis lit |
| `SKILLS_STANDARD.md`, `PRESETS_STANDARD.md`, `VIEWS_STANDARD.md` | Les trois contrats d'écriture |

La validation est **machine-vérifiable** : chaque format a son schéma JSON, et un
scanner de sécurité dédié inspecte les contributions avant intégration.

---

## Format 1 — le skill conversationnel

Un skill conversationnel **injecte un prompt système spécialisé** dans le contexte de
Jarvis. Il ne fait rien d'autre : c'est de l'instruction, éventuellement accompagnée
d'outils Python.

```
skills/mon-skill/
├── skill.yaml     ← manifeste (requis)
├── skill.py       ← classe héritant de SkillBase (requis)
└── README.md      ← optionnel
```

Le manifeste déclare `name` (kebab-case, identique au dossier), `version` en semver,
`author`, `description`, `tags`, `type: conversational`, `platforms`, et quatre listes de
prérequis — `requires_env`, `requires_tools`, `requires_oauth`, `requires_apps` — plus
`capabilities` : de 1 à 6 points, chacun commençant par un verbe à la troisième personne.

Les variables d'environnement acceptent une forme enrichie (`name`, `description`,
`example`, `sensitive`) et les applications tierces une forme détaillée (`url`,
`mac_bundle`, `windows_exe`, `required`) qui permet à Jarvis de vérifier leur présence.

Côté Python, le contrat tient en deux membres : `SYSTEM_PROMPT` obligatoire — en-tête
`## Skill : [Nom]`, conditions de déclenchement, marche à suivre, format de sortie — et
`get_tools()` facultatif qui retourne les outils apportés. Les clés d'API y sont
proscrites : elles passent par `requires_env`.

## Format 2 — le preset

Même dossier, même fichier `skill.yaml`, mais `type: preset` et deux champs qui changent
tout : `triggers` (les phrases déclencheuses en langage naturel) et `steps` (la séquence
exécutée dans l'ordre). Le `skill.py` se réduit à une classe héritant de `PresetSkill` —
la logique vit entièrement dans le YAML.

Six types d'étapes :

| Type | Rôle | Champs |
| --- | --- | --- |
| `cli` | Commande shell | `platforms: {mac, windows, linux}` ou `command` universelle ; `requires_confirmation` pour les actions destructives |
| `spotify` | Contrôle musical | `action` (`search_playlist`, `search_track`, `play`, `pause`, `next`), `query` |
| `tts` | Parole | `text` |
| `ai` | Appel au modèle | `prompt`, `output_var` pour capturer la réponse |
| `wait` | Pause | `seconds` |
| `notify` | Notification système | `title`, `body`, `platforms` |

Le chaînage passe par un **gabarit de variables** : une étape `ai` avec
`output_var: game_recommendation` rend disponibles `{{ game_recommendation.text }}` et
`{{ game_recommendation.first_line }}` dans toutes les étapes suivantes. C'est ce qui
permet au mode streameur de faire recommander un jeu par le modèle, puis d'ouvrir la page
Steam correspondante dans l'étape d'après.

Une plateforme non gérée se déclare `null` : l'étape est simplement sautée.

## Format 3 — la vue

```
views/ma-vue/
├── VIEW.md        ← manifeste en frontmatter YAML (requis)
├── view.js        ← frontend (requis)
├── tool.py        ← backend (optionnel)
├── preview.png    ← capture 800×500 (optionnel)
└── README.md
```

Une vue est un **composant plein écran piloté par le backend via WebSocket**. Le
manifeste déclare `id`, `name`, `version`, `author`, `description`, un `glyph` de 2 à 4
lettres pour le badge, et surtout `commands` — la liste des actions que la vue accepte.

Le `view.js` est du **JavaScript pur** (ES2017+, aucun framework, aucun empaqueteur),
enveloppé dans une fonction immédiatement invoquée, protégé par
`if (!window.Jarvis?.views) return;`, et enregistré par `Jarvis.views.register(id, {...})`
avec trois méthodes : `show(params)` **idempotente**, `hide()` qui nettoie tout — DOM,
minuteries, écouteurs, animations — et `command(cmd, params)` qui ignore silencieusement
ce qu'elle ne connaît pas. Le conteneur racine porte l'identifiant `{id}-container` en
`position: fixed; inset: 0; z-index: 2`, et les couleurs viennent des variables
`--bg-0`, `--fg-1`, `--accent`, `--line-1`.

Le `tool.py` hérite de `Tool` et diffuse trois types d'événements : `show_view`,
`hide_view`, `view_command`.

```
Backend (tool.py)                 WebSocket                  Frontend (view.js)
execute(action="show")     ──►    show_view      ──►    show(params)
execute(action="hide")     ──►    hide_view      ──►    hide()
execute(action="fly_to")   ──►    view_command   ──►    command("fly_to", params)
```

### Les gestes — la vraie trouvaille

Le champ facultatif `gestures` fait le pont avec MediaPipe, et il repose sur une règle
d'or : **une vue déclare une intention, jamais du code de détection**. Elle ne touche pas
la caméra ; elle se contente de dire « quand Jarvis reçoit tel geste standard, appelle
telle commande chez moi ». Le routeur de jarvis-OS lit ce champ ; si aucune vue active ne
réclame un geste, il retombe sur le comportement global (le volume, par exemple).

Le vocabulaire est fermé et partagé : `Open_Palm`, `Victory`, `Thumb_Up`, `Thumb_Down`,
`Pointing_Up` en discret, `two_hand_zoom`, `fist_pan`, `pinch_y`, `hand_drag_x` en
continu. Un geste inédit s'ajoute d'abord côté moteur, jamais côté vue.

Deux pièges consignés dans le standard :

- **`on` doit être quoté en YAML.** C'est un mot réservé booléen en YAML 1.1 : non quoté,
  `on: pinch_y` est lu comme la clé `true` et le lien est rejeté.
- **Les gestes continus se limitent à 50–100 ms.** Plus lent, le zoom saccade ; plus
  rapide, la vue est noyée d'événements.

---

## Le catalogue livré

### Skills conversationnels

| Nom | Version | Ce qu'il apporte | Prérequis |
| --- | --- | --- | --- |
| `bambulab-printer` | 1.1.0 | Pilotage d'une imprimante 3D BambuLab en MQTT : état, lancement, progression, annulation, découpe STL via OrcaSlicer | `PRINTER_IP`, `PRINTER_SERIAL`, `PRINTER_ACCESS_CODE` |
| `fusion360` | 1.1.0 | Pilotage d'Autodesk Fusion 360 par MCP : scripts Python de géométrie, congés et chanfreins, lecture de cotes, export STL, annuler/refaire, capture de vue | Fusion 360 ouvert + add-in FusionMCP sur le port 27182 |
| `web-researcher` | 1.1.0 | Recherche web structurée avec synthèse en 2-3 paragraphes et sources citées | outil `browser` |
| `youtube-analyzer` | 1.1.0 | Analyse de chaîne : abonnés, vues, cinq dernières vidéos, comparaison de formats, suggestions | `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` |

### Presets

| Nom | Version | Séquence |
| --- | --- | --- |
| `mode-travail` | 1.1.0 | Ouvre Notion et VS Code → playlist « deep focus » → Ne pas déranger → brief vocal des tâches Notion du jour |
| `mode-streameur` | 2.0.0 | Ouvre OBS → attend 3 s → Ne pas déranger → tableau de bord Twitch → **le modèle recommande un jeu** → ouvre la recherche Steam correspondante → message vocal |
| `mode-nuit` | 1.1.0 | Ferme VS Code et Notion → playlist douce → **dés**active Ne pas déranger → message d'au revoir → bilan motivant de la journée |

### Vues

| Nom | Version | Contenu |
| --- | --- | --- |
| `globe` | 1.2.1 | Globe terrestre temps réel, navigation vocale et vols animés — la vue de référence pour les gestes (`MAPBOX_TOKEN`) |
| `system-monitor` | 2.0.0 | Cockpit système : jauges processeur, mémoire, disque, cerveau LLM, services, missions |
| `weather` | 1.0.0 | Météo immersive, ciel animé et prévisions horaires (Open-Meteo, sans clé) |
| `clock` | 1.0.0 | Horloge solaire : cadran 24 h, course du soleil, fuseaux Tokyo / New York / Londres |

---

## Enseignements pour notre propre catalogue

1. **Le manifeste porte les prérequis, le code porte l'intention.** Cette séparation
   permet à Jarvis de diagnostiquer seul ce qui manque avant même d'essayer.
2. **Un preset est de la donnée, pas du code.** Les étapes vivent dans le YAML ; la classe
   Python est vide. On ajoute un mode sans écrire une ligne de logique.
3. **Le gabarit `{{ variable }}` entre étapes** transforme une simple liste de commandes
   en petit programme — c'est lui qui rend le mode streameur intéressant.
4. **La règle d'or des gestes** vaut pour toute entrée : le module déclare ce qu'il veut
   recevoir, le moteur décide qui le reçoit. Aucune vue ne parle au capteur.
5. **Les trois standards sont doublés de schémas JSON et d'un scanner de sécurité.** La
   contribution externe est cadrée par des contrôles automatiques, pas par la confiance.
