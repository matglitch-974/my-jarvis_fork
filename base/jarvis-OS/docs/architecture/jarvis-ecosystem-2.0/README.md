# Jarvis Ecosystem 2.0

Projet de référence pour la **recréation complète de Jarvis**, à partir de la refonte
« brique par brique » présentée par l'auteur de jarvis-OS dans sa vidéo de sortie.

Ce dossier sert de source de vérité fonctionnelle : il décrit *ce que le système fait*
et *comment il est découpé*, indépendamment du code actuellement présent dans
`base/jarvis-OS` et `base/jarvis-skills`.

## Contenu

| Fichier | Rôle |
| --- | --- |
| [01-synthese-video-refonte.md](01-synthese-video-refonte.md) | Synthèse intégrale de la vidéo, couche par couche, avec les choix techniques et les limites observées |
| [02-jarvis-os-anatomie.md](02-jarvis-os-anatomie.md) | Anatomie du dépôt `jarvis-OS` relevée sur le code : quatre couches strictes, volumétrie, mémoire, proactivité, gouvernance, installation, et l'écart avec la vidéo |
| [03-jarvis-skills-standards-catalogue.md](03-jarvis-skills-standards-catalogue.md) | Le dépôt `jarvis-skills` : les trois contrats d'écriture (skill, preset, vue), le vocabulaire des gestes, et le catalogue livré |

## Le modèle en quatre couches

1. **Agent vocal** — pipeline STT → LLM → TTS à latence minimale (LiveKit), briques interchangeables, tools, widgets, canaux externes.
2. **Mémoire, initiative, missions** — journal d'événements SQLite local, auto-dream nocturne, proactivité de fond, orchestrateur d'agents en arrière-plan.
3. **Apprentissage et gouvernance** — création de skills à la volée avec promotion manuelle, portail de contrôle triple (type / risque / coût).
4. **Écosystème** — skills, presets, vues ; store communautaire ; intégrations matérielles.

## Modules installés dans le réservoir de skills

Les sept modules du catalogue `jarvis-skills` ont été transposés en skills utilisables
directement, sous `~/.claude/skills/jarvis-*` : `jarvis-fusion360`,
`jarvis-bambulab-printer`, `jarvis-web-researcher`, `jarvis-youtube-analyzer`,
`jarvis-mode-travail`, `jarvis-mode-streameur`, `jarvis-mode-nuit`. Les presets sont
adaptés à Windows, et leurs étapes destructives (fermeture forcée, suppression de clé de
registre) ont été remplacées par des gestes réversibles.

## Documents liés

- `../CDC_jarvis_evolution.md` — cahier des charges d'évolution
- `../CDC_refonte_architecture.md` — refonte de l'architecture interne
- `../skills-abi.md` — interface binaire des skills
- `../events.md` — modèle d'événements
