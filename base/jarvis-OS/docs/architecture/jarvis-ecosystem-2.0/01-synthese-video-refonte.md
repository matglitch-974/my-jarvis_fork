# Synthèse de la refonte Jarvis — vidéo de sortie

> Source : transcription de la vidéo de présentation de jarvis-OS par son auteur.
> Consigné le 31/07/2026. Toutes les informations utiles à une recréation sont ici ;
> le reste (promotion de la chaîne, appels à contribution) est écarté.

---

## Couche 1 — L'agent vocal

### L'enjeu déclaré : la latence

C'est le critère numéro un revendiqué par l'auteur. Un échange vocal enchaîne trois
étapes — transcription de la parole, génération de la réponse par le LLM, synthèse
vocale — et un enchaînement naïf produit plusieurs secondes d'attente, ce qui ruine
l'expérience. Toute l'architecture de cette couche découle de cette contrainte.

### LiveKit comme colonne vertébrale

Le pipeline repose sur **LiveKit**, présenté comme le framework utilisé par le mode
vocal de l'application ChatGPT. Deux propriétés retenues :

- il gère et optimise l'enchaînement des trois étapes ;
- **chaque brique est interchangeable** : le modèle de transcription, le LLM et la
  synthèse vocale se remplacent indépendamment les uns des autres.

Le changement de modèle se fait à chaud depuis l'interface : *réglages → configuration
→ modèles*. Démontré avec Mistral. Un LLM local reste possible, sous réserve de
ressources machine suffisantes.

### Outils intégrés

Rien d'exotique, mais le socle attendu : recherche web, Gmail, Google Calendar,
Spotify, et recherche dans les fichiers locaux de la machine.

### Interface et widgets

- **Sphère centrale** animée, vue par défaut.
- **Widget Spotify** — pilotage direct de la lecture.
- **Widget caméra** avec **MediaPipe** — détection de la main et de sa position,
  branchée sur des déclencheurs. Démontré sur le contrôle de la musique par geste.
  L'auteur admet le côté gadget mais garde la brique pour de futures intégrations.
- **Widget textuel** — échange écrit sans passer par la voix.

### Canaux externes

Intégration **Telegram** : on écrit à Jarvis depuis une conversation Telegram, il
répond en texte. Le même agent, un canal différent.

### Identification

**Reconnaissance faciale** au démarrage. Elle exige une photo de l'utilisateur déposée
dans un dossier dédié, et se désactive depuis le fichier de configuration. Le lancement
de la session se fait par un **double claquement de mains** détecté au micro.

---

## Couche 2 — Mémoire, initiative, missions

### Le journal d'événements

Tout devient un **événement daté** : chaque conversation, mais aussi **chaque action
exécutée par Jarvis**. Le tout dans une base **SQLite locale**. Aucune donnée ne quitte
la machine.

### La mémoire relationnelle

Une zone dédiée de la base stocke les **préférences, habitudes et style de parole** de
l'utilisateur. Objectif affiché : une relation qui s'ajuste dans les deux sens, comme
entre deux personnes. C'est ce qui explique le registre très familier de l'assistant
dans la démonstration — il a appris à parler comme son interlocuteur.

### L'auto-dream — la brique la plus intéressante

Analogie assumée avec le sommeil : le cerveau trie la journée pendant la nuit.

| Heure | Module | Action |
| --- | --- | --- |
| 03h00 | **auto-dream** | Relecture de toutes les conversations du jour, tri, promotion en mémoire long terme de ce qui compte, rejet du bruit |
| 03h10 | **maintenance** | Génération d'un rapport listant souvenirs périmés, contradictions et erreurs, à corriger manuellement le lendemain — correction facultative |

Le second module existe précisément parce que le premier se trompe. Il donne un point
de contrôle humain sur la propreté de la base.

### La proactivité

Un processus de fond surveille en permanence plusieurs sources : messagerie, météo,
liste de tâches, calendrier. À chaque cycle il se pose une question unique :
**« y a-t-il quelque chose d'utile à faire pour l'utilisateur, maintenant ? »**

Deux comportements démontrés :

- rappel spontané d'un événement imminent, sans sollicitation ;
- détection d'un courriel jugé important → récupération du contexte → **brouillon de
  réponse pré-rédigé**, soumis à validation.

Toutes ces propositions se pilotent depuis un tableau de bord **« Initiatives »**, dans
le workspace.

### Les missions

Un **orchestrateur** juge chaque demande. Si elle dépasse ce qu'on traite en temps réel,
elle part vers un **agent d'arrière-plan** qui :

1. se génère seul un plan d'action décomposé en étapes ;
2. exécute chaque étape ;
3. se relit et se corrige ;
4. produit un **rapport final en `.md`**.

Un onglet **« Missions »** suit l'avancement. Filiation revendiquée avec OpenClaw, mais
encadrée (voir couche 3).

---

## Couche 3 — Apprentissage et gouvernance

### Création de compétences à la volée

Commande vocale du type « crée un skill pour compter les voyelles d'un mot ». L'agent
écrit la compétence, puis la place **en attente de validation**. Elle apparaît dans un
onglet « skill à valider » des Initiatives, où l'utilisateur la **promeut** ou la
refuse. Une fois promue, elle est immédiatement utilisable.

L'exemple de démonstration est trivial et l'auteur le reconnaît ; l'intérêt réside dans
le mécanisme, notamment pour créer des intégrations à la demande.

### Le portail de contrôle

Réponse directe et assumée à la critique d'OpenClaw : un agent qui peut tout faire,
avec la carte bancaire et les clés de tous les comptes, empêche de dormir.

**Chaque action, sans exception**, franchit un portail qui pose trois questions :

1. Quel **type** d'action ?
2. Est-elle **risquée** ?
3. Combien **coûte**-t-elle ?

Trois verdicts possibles :

| Verdict | Cas |
| --- | --- |
| **Autorisée d'office** | Le cas majoritaire — lire l'agenda, consulter une donnée locale |
| **Soumise à validation** | Risquée mais légitime : l'utilisateur tranche |
| **Interdite** | Trop dangereuse, refus automatique |

Deux règles dures :

- **toucher à son propre noyau de code est interdit par conception** — il pourrait se
  casser lui-même ;
- **toute action vers le monde extérieur passe automatiquement en validation.**

Le résultat visé : une autonomie complète, mais bornée.

---

## Couche 4 — L'écosystème

Celle que l'auteur juge la plus différenciante. Trois formats d'extension.

### Les skills

Les intégrations classiques. Exemples cités : un skill **Fusion 360** pour piloter le
logiciel de CAO, un skill **Bambu Lab** pour envoyer des ordres à l'imprimante 3D.

### Les presets

Des **automatisations en chaîne**, déclenchées par une phrase. Démonstration du « mode
streamer » : Twitch, OBS et le magasin Steam s'ouvrent d'un coup, répartis sur les
écrans. Autre exemple évoqué : un « workspace de travail » qui ouvre la liste de tâches
et les statistiques de la chaîne.

### Les vues

Reprise directe des projections de Tony Stark. Jarvis affiche un rendu visuel pour
illustrer son propos, sur demande vocale :

- la sphère originelle, par défaut ;
- un modèle 3D — la Tour Eiffel, dans la démonstration ;
- la météo, avec choix de la ville ;
- une horloge.

C'est le format le plus extensible des trois, et celui dont le potentiel est le plus
souligné.

### Le store communautaire

Un dépôt séparé (`jarvis-skills`) documente la fabrication de chaque type de module.
Quelques standards à respecter, test en local sur sa propre instance, puis publication
et validation par l'équipe avant mise à disposition de tous, avec crédit de l'auteur.
Objectif déclaré : le plus gros catalogue possible de modules.

### Les intégrations matérielles

Le but de fond, au-delà de l'assistant : **l'environnement connecté augmenté**.
Domotique et objets physiques quelconques. Tout futur projet matériel de l'auteur
embarquera nativement une intégration Jarvis — une lampe connectée devient pilotable
sans travail supplémentaire.

---

## Installation

```bash
git clone <url-du-depot-jarvis-os>
```

```bash
cd jarvis-OS
```

```bash
jarvis eclosion
```

`eclosion` est la commande de mise en place : elle télécharge les dépendances (de
quelques dizaines de secondes à quelques minutes) puis guide les dernières étapes,
notamment le choix du backend de modèle et la saisie des clés d'API — modifiables plus
tard.

```bash
jarvis run
```

Ensuite, ouvrir `localhost:8000`, puis lancer la session par un double claquement de
mains.

**Points de vigilance :**

- le terminal doit disposer de l'accès au micro et à la caméra, sans quoi rien ne
  démarre ;
- la reconnaissance faciale exige une photo dans le dossier prévu, ou sa désactivation
  dans le fichier de configuration ;
- les clés d'API se saisissent dans *Mission Control → configuration → modèles* ;
- les connexions aux services externes se font dans *capacités → intégrations*.

---

## Limites observées dans la démonstration

À garder en tête pour la recréation — ce sont les points faibles visibles à l'écran :

1. **La mémoire fabule.** Interrogé sur le film de la veille, l'assistant répond
   « Iron Man 3 » avec aplomb ; c'était faux. Un souvenir mal promu se rejoue comme une
   certitude. Le module de maintenance de 3h10 sert de garde-fou, mais il agit après
   coup.
2. **Le changement de modèle coûte une latence visible.** Le premier échange après un
   basculement est sensiblement plus lent.
3. **Les vues sont scriptées.** Chacune est un module écrit d'avance ; la génération
   d'une vue arbitraire à la volée reste hors du périmètre montré.
4. **Le geste MediaPipe est un gadget**, reconnu comme tel par l'auteur — la brique est
   conservée pour plus tard.
5. **Les presets ouvrent les fenêtres où ils veulent** en configuration multi-écran ;
   le placement reste à maîtriser.

---

## Ce qu'il faut retenir pour la recréation

Par ordre d'importance structurante :

1. **Le journal d'événements local** conditionne tout le reste — mémoire, auto-dream,
   proactivité, audit des actions. C'est la première brique à poser.
2. **Le portail de contrôle** doit être traversé par *toutes* les actions dès le départ.
   Rajouté après coup, il devient contournable.
3. **L'interchangeabilité des briques du pipeline vocal** protège des choix de
   fournisseur et rend le local envisageable.
4. **Les trois formats d'extension** (skills, presets, vues) forment le contrat
   d'ouverture. Les figer tôt évite une refonte du catalogue.
5. **La boucle proactive** est ce qui distingue l'assistant du simple exécutant : une
   question posée en continu sur un ensemble de sources surveillées.
