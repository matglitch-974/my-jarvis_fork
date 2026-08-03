# Correctifs My Jarvis

Historique des bugs corrigés sur la base `jarvis-OS`, avec pour chacun le symptôme
observé, la cause racine, le correctif et la façon de le vérifier.

| | |
|---|---|
| Base | `jarvis-OS` v0.3.2 (amont : `Grominet95/jarvis-OS`, tag `v0.3.2`) |
| Plateforme | Windows 11, Python 3.11 (`.venv`) |
| Dernière mise à jour | 1er août 2026 |

Ces correctifs concernent du code amont. Sauf mention contraire, ils sont
remontables tels quels : aucun ne dépend d'une particularité de cette
installation.

---

## Résumé

| № | Bug | Portée | Gravité | État |
|---|---|---|---|---|
| 1 | Skills du store écrits en cp1252 → inchargeables | Tout Windows non anglophone | Bloquant | Corrigé |
| 2 | Écritures de fichiers sans encodage explicite (22 sites) | Tout Windows non anglophone | Élevée | Corrigé |
| 3 | Messages d'erreur de chargement de skill inexploitables | Toutes plateformes | Moyenne | Corrigé |
| 4 | Skill Lab hors service : chemin site-packages POSIX en dur | Tout Windows | Bloquant | Corrigé |
| 5 | Bac à sable lancé avec le `python` du PATH | Toutes plateformes | Élevée | Corrigé |
| 6 | Console illisible : `chargé` affiché `chargÃ©` | Windows | Cosmétique | Corrigé |
| 7 | Test de vision resté sur l'ancien client OpenAI | Développement | Faible | Corrigé |
| 8 | Skills du store privés de leurs outils (`No module named 'tools'`) | Toutes plateformes | Élevée | Corrigé |
| 9 | `STT_PROVIDER=whisper` accepté mais jamais implémenté | Toutes plateformes | Bloquant | Corrigé |

Suite de tests : **13 échecs → 5 échecs**, 711 → 719 succès.

---

## 1. Les skills du store étaient écrits en cp1252

**Symptôme.** Au démarrage, quatre skills sur neuf refusaient de se charger :

```
Erreur chargement skill mode-nuit: (unicode error) 'utf-8' codec can't decode byte 0x97
Erreur chargement skill mode-streameur: (unicode error) 'utf-8' codec can't decode byte…
Erreur chargement skill web-researcher: (unicode error) 'utf-8' codec can't decode byte…
Erreur chargement skill youtube-analyzer: (unicode error) 'utf-8' codec can't decode by…
SkillRegistry: 5 skill(s) chargé(s)
```

**Cause racine.** `capabilities/skills/installer.py` écrivait les fichiers
téléchargés avec `Path.write_text(r.text)`, **sans argument `encoding`**. Sans
cet argument, Python retombe sur l'encodage local du système —
`locale.getpreferredencoding(False)`, soit **cp1252** sur une machine Windows
française. Le fichier partait donc en cp1252, alors que l'importateur Python lit
tout `.py` en **UTF-8 strict** et n'accepte aucun repli.

L'octet `0x97` est le tiret cadratin `—` en cp1252. Autrement dit : tout skill
dont la description contenait un accent ou un tiret cadratin devenait
inchargeable. Sur un dépôt de skills rédigé en français, c'est la quasi-totalité.

Le générateur local souffrait du même défaut : le gabarit de `skill.py` fabriqué
par Jarvis contient les mots « RÈGLE » et « réservé », et était écrit sans
encodage lui non plus.

**Correctif.**

- `installer.py` — six écritures et une lecture passées en `encoding="utf-8"` :
  `skill.py` et `skill.yaml` distants (deux chemins d'installation), `skill.py`
  généré localement, `skill.yaml` généré localement, lecture du catalogue local.
- Treize fichiers déjà abîmés transcodés cp1252 → UTF-8 sans BOM.
  Sauvegarde : `skills_data/installed-backup-20260801-023204/`.
- Bytecode périmé purgé (`__pycache__` des skills).

Fichiers transcodés : `clock/skill.yaml`, `globe/skill.yaml`,
`mode-nuit/skill.{py,yaml}`, `mode-streameur/skill.{py,yaml}`,
`mode-travail/skill.yaml`, `system-monitor/skill.yaml`, `weather/skill.yaml`,
`web-researcher/skill.{py,yaml}`, `youtube-analyzer/skill.{py,yaml}`.

À noter : **tous** les `skill.yaml` étaient en cp1252, y compris ceux des skills
qui se chargeaient. Ils passaient par accident, parce que le chargeur YAML
ouvrait lui aussi le fichier sans encodage et adoptait donc le même cp1252. Deux
bugs qui s'annulaient — et qui auraient tous deux explosé sur un déploiement
Linux ou Docker.

**Vérification.**

```powershell
.venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'src'); from jarvis.capabilities.skills.registry import SkillRegistry; r=SkillRegistry(); r.load_all(); print(sorted(r.get_all()))"
```

Attendu : les neuf skills, `clock` à `youtube-analyzer`.

---

## 2. Écritures et lectures de fichiers sans encodage explicite

**Cause racine.** Le bug 1 n'était pas isolé. Un relevé sur tout `src/` a trouvé
**22 appels** `Path.write_text()` / `Path.read_text()` sans `encoding=`, répartis
dans 14 fichiers — face à 118 appels qui le précisaient correctement. La
convention existait dans le projet, elle n'était appliquée qu'aux deux tiers.

Chacun de ces sites produit ou lit un fichier dans l'encodage local de la
machine. Conséquences : un fichier écrit sous Windows devient illisible sous
Linux, un jeton OAuth ou un JSON de configuration contenant un caractère accentué
casse au rechargement, et le même code se comporte différemment selon la langue
du système.

**Correctif.** `encoding="utf-8"` ajouté aux 22 sites. La réécriture est passée
par l'arbre syntaxique Python (`ast`) plutôt que par une substitution textuelle :
la position exacte de la parenthèse fermante est ainsi connue, ce qui traite les
appels multi-lignes aussi sûrement que les appels d'une ligne, et évite de
toucher un appel qui portait déjà `encoding=` sur une ligne suivante.

Fichiers touchés, par nombre d'appels :

| Appels | Fichier |
|---|---|
| 3 | `analytics/widgets/jarvis_stats.py` |
| 2 | `analytics/registry.py` |
| 2 | `capabilities/tools/spotify_auth.py` |
| 2 | `engine/background/routines.py` |
| 2 | `interfaces/api/deezer.py` |
| 2 | `interfaces/api/google_oauth.py` |
| 2 | `interfaces/api/system.py` |
| 1 | `analytics/widgets/conso.py` |
| 1 | `capabilities/tools/calendar.py` |
| 1 | `capabilities/tools/gmail.py` |
| 1 | `engine/mission/backends/rpc.py` |
| 1 | `engine/proactive/collectors/email.py` |
| 1 | `interfaces/api/config/devices.py` |
| 1 | `interfaces/api/skills.py` |

Plusieurs concernent des jetons OAuth (`gmail.py`, `calendar.py`,
`google_oauth.py`, `email.py`, `deezer.py`, `spotify_auth.py`) : ce sont
précisément les fichiers qu'on ne veut pas voir se corrompre en silence.

Sauvegarde des originaux : `data/backup-encodage-20260801-023617/`.

**Vérification.**

```powershell
.venv\Scripts\python.exe -c "import ast,pathlib; n=0
for p in pathlib.Path('src').rglob('*.py'):
    for x in ast.walk(ast.parse(p.read_text(encoding='utf-8'))):
        if isinstance(x,ast.Call) and isinstance(x.func,ast.Attribute) and x.func.attr in ('write_text','read_text') and not any(k.arg=='encoding' for k in x.keywords): n+=1
print('appels sans encoding:',n)"
```

Attendu : `0`.

---

## 3. Les messages d'erreur de chargement ne disaient rien

**Symptôme.** Un skill qui échoue produisait une seule ligne :

```
Erreur chargement skill mode-nuit: (unicode error) 'utf-8' codec can't decode byte 0x97
```

Ni le chemin du fichier, ni la ligne, ni la moindre piste de correction. C'est ce
qui a rendu le bug 1 si long à cerner : le message ne permettait pas de
distinguer un problème d'encodage d'une faute de frappe ou d'une dépendance
manquante.

**Correctif.** Deux ajouts dans `capabilities/skills/registry.py`.

`_read_utf8_tolerant()` — lit un fichier de skill en UTF-8 ; en cas d'échec,
tente cp1252, **réécrit le fichier en UTF-8** et le signale clairement. Un skill
installé avant le correctif se répare donc tout seul au premier démarrage, au
lieu d'être abandonné. Appelé aussi sur `skill.py` avant l'import, puisque
`exec_module()` lit en UTF-8 strict et ne laisse aucune place à un repli.

`_explain_load_failure()` — construit un message exploitable, adapté au type
d'erreur :

```
Erreur chargement skill 'demo' — ModuleNotFoundError: No module named 'requests'
  fichier : …/skills_data/installed/demo/skill.py
  cause   : dépendance Python absente — 'requests'
  remède  : uv pip install requests, puis redémarre Jarvis
  le reste des skills continue de se charger normalement
```

Trois cas sont traités spécifiquement — `UnicodeDecodeError` (octet fautif et sa
position), `SyntaxError` (ligne et colonne), `ModuleNotFoundError` (nom du module
et commande d'installation) — et pour tout le reste, la ligne de traceback qui
concerne réellement le fichier du skill. La dernière ligne rassure sur un point
non évident : l'échec d'un skill n'empêche pas les autres de se charger.

---

## 4. Le Skill Lab était hors service sous Windows

**Symptôme.** Toute skill créée par Jarvis était rejetée par le bac à sable :

```
Skill candidate 'test-pattern-skill' REJETÉE par le test sandbox.
Cause : [import] SkillBase indisponible dans la sandbox :
ModuleNotFoundError("No module named 'yaml'"). Aucune installation.
```

Le garde-fou « test vert sinon rejet » étant inconditionnel, **aucune skill
générée ne pouvait jamais être installée**. La fonction d'auto-extension de
Jarvis était morte, silencieusement, sur toute la plateforme Windows.

**Cause racine.** `capabilities/skills/lab.py` construisait le chemin des
dépendances à monter dans le bac à sable en codant en dur la disposition POSIX :

```python
venv_site_packages = (
    PROJECT_ROOT / ".venv" / "lib"
    / f"python{sys.version_info.major}.{sys.version_info.minor}"
    / "site-packages"
)
```

Sous Windows, un environnement virtuel range ses paquets dans
`.venv\Lib\site-packages` — pas de niveau `pythonX.Y`, et `Lib` avec une
majuscule. Le chemin calculé n'existait donc pas. Le bac à sable démarrait sans
la moindre dépendance, et échouait sur le premier `import yaml`.

L'expression était dupliquée à deux endroits : le mode Docker (où elle sert de
source à un montage `-v`, qui crée alors un dossier vide) et le mode direct.

**Correctif.** Deux fonctions au niveau module :

- `_venv_site_packages()` essaie la disposition Windows, puis la disposition
  POSIX, puis retombe sur le `purelib` de l'interpréteur courant via `sysconfig`.
  Les deux sites d'appel l'utilisent.
- `_venv_python()` retourne `sys.executable`.

**Effet mesuré.** Sept tests repassent au vert d'un seul coup :
`test_capability_engine` (×3), `test_skill_create_tool_no_backdoor`,
`test_skill_lab` (×2), `test_skills`.

**Vérification.**

```powershell
.venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'src'); from jarvis.capabilities.skills.lab import _venv_site_packages as f; p=f(); print(p, p.is_dir(), (p/'yaml').is_dir())"
```

Attendu : un chemin existant contenant `yaml`.

---

## 5. Le bac à sable utilisait le `python` du PATH

**Cause racine.** Toujours dans `lab.py`, le mode direct lançait le test par
`asyncio.create_subprocess_exec("python", …)`. C'est le premier interpréteur
trouvé dans le PATH — sur cette machine, le Python système 3.13, étranger au
projet et dépourvu de ses dépendances. Même avec le chemin site-packages corrigé,
le test aurait tourné sous le mauvais interpréteur.

Plus insidieux : sur une machine sans Python système, `"python"` n'existe pas du
tout et l'erreur remontée est un `FileNotFoundError` opaque, sans rapport visible
avec la skill testée.

**Correctif.** `_venv_python()` retourne `sys.executable`, c'est-à-dire
l'interpréteur qui fait effectivement tourner Jarvis, donc celui qui voit ses
paquets. Repli sur `"python"` seulement si `sys.executable` est vide (cas des
interpréteurs embarqués).

---

## 6. Console illisible : `chargé` s'affichait `chargÃ©`

**Symptôme.** Toute la sortie de démarrage était mojibakée :
`Skill conversationnel chargÃ©`, `Memory Kernel DEEP INGEST dÃ©sactivÃ©`,
`Jarvis dÃ©marrÃ©`.

**Cause racine.** Python émettait de l'UTF-8 pendant que la console Windows
relisait ces octets en cp1252. `é` en UTF-8 s'écrit sur deux octets, `C3 A9`, que
cp1252 rend `Ã©`.

Le `jarvis.ps1` amont posait bien `PYTHONUTF8` et `PYTHONIOENCODING`. Mais le
lanceur maison `Serveur-jarvisOS.ps1` — celui réellement utilisé — ne le faisait
pas, et personne ne réglait l'encodage de sortie de la console elle-même.

**Correctif.** Dans `Serveur-jarvisOS.ps1`, avant le lancement :

```powershell
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null
```

Les deux premières lignes règlent ce que Python émet, les deux suivantes ce que
la console comprend. Il faut les quatre : régler l'un sans l'autre déplace le
problème sans le résoudre.

Au-delà du confort de lecture, l'enjeu est réel : quand la sortie est redirigée
vers un fichier de log, Python en encodage ANSI strict lève un
`UnicodeEncodeError` sur le premier caractère hors cp1252 — ce qui tue le
processus et laisse un log vide.

---

## 7. Le test de vision espionnait un client disparu

**Symptôme.** `test_settings_consumers.py::test_vision_tool_passes_str` échouait
sur `module 'jarvis.capabilities.tools.vision' does not have the attribute
'AsyncOpenAI'`.

**Cause racine.** L'outil de vision est passé d'OpenAI à Anthropic — les images
ne partent plus chez OpenAI. Le test, lui, patchait toujours `vision.AsyncOpenAI`.

**Correctif.** Le test garde une invariante qui reste valable et qu'il ne fallait
donc pas supprimer : la clé d'API doit être transmise en `str` brut, jamais en
objet `SecretStr` — sinon le SDK reçoit `SecretStr('**********')` et
l'authentification échoue avec un message trompeur. Il a été réécrit pour
espionner `AsyncAnthropic` et vérifier `anthropic_api_key`.

Détail d'implémentation : `AsyncAnthropic` est importé dans le corps de la
méthode, pas au niveau du module. Le patch porte donc sur le module `anthropic`
lui-même, `patch.object(anthropic, "AsyncAnthropic", Spy)` — un
`patch.object(vision, …)` ne trouverait rien à remplacer.

---

## 8. Les skills du store étaient privés de leurs outils

**Symptôme.** Une ligne d'erreur au démarrage, et rien d'autre :

```
Erreur get_tools() pour globe-view: No module named 'tools'
Skill tools sync: 0 outil(s)
```

Le skill était installé, listé, actif — et ne fournissait aucun outil. La vue
globe n'était donc pas pilotable par Jarvis, sans que rien dans l'interface ne
l'indique.

**Cause racine.** `capabilities/skills/_abi_compat.py` expose `skills` comme
alias stable de `jarvis.capabilities.skills`, pour que le code utilisateur des
skills installés survive à la réorganisation des modules. Mais l'alias s'arrêtait
là. Or les skills du dépôt importent aussi les outils et le bus d'événements sous
leurs anciens noms plats :

```python
def get_tools(self) -> list:
    from tools.show_view import ShowViewTool
    from background.notifications import get_broadcast_fn
```

L'import de module passait (il ne touche que `skills.base`, aliasé), donc le
skill se chargeait sans erreur. C'est `get_tools()`, appelé plus tard, qui
échouait — d'où une panne partielle et silencieuse plutôt qu'un refus franc.

**Correctif.** L'ABI couvre désormais `tools` → `jarvis.capabilities.tools` et
`background` → `jarvis.engine.background`, via un helper `_aliaser()` qui expose
le paquet et ses sous-modules. `setdefault` partout : un vrai paquet `tools` ou
`background` présent dans l'environnement garde la priorité. Un sous-module
absent n'empêche jamais les autres d'être exposés.

Corriger l'ABI plutôt que le fichier du skill est délibéré : le skill vient du
store et serait écrasé à la première réinstallation.

**Vérification.** `globe-view` retourne 1 outil au lieu de lever.

---

## 9. `STT_PROVIDER=whisper` était accepté mais ne faisait rien

**Symptôme.** Le micro capte, et Jarvis ne comprend rien. Aucun message
n'explique pourquoi.

**Cause racine.** `kernel/settings.py` déclare `stt_provider` avec quatre valeurs
valides — `deepgram`, `openai`, `google`, `whisper` — et la documentation annonce
un STT local hors-ligne. Mais `interfaces/voice/agent.py` n'implémentait que les
trois premières : `whisper` tombait dans le repli final, c'est-à-dire Deepgram,
qui exige une clé payante. Un réglage documenté et proposé à l'utilisateur ne
faisait donc silencieusement rien.

**Correctif.** Nouveau module `interfaces/voice/whisper_stt.py` : une STT LiveKit
adossée à `providers/audio/stt.py` (faster-whisper, déjà présent et déjà utilisé
par le mode appui-pour-parler). Whisper ne transcrit que des énoncés complets ;
`stt.StreamAdapter` la rend temps réel en s'appuyant sur le VAD Silero pour
découper la parole. Le VAD du prewarm est transmis, donc Silero n'est pas
rechargé.

Le rééchantillonnage est fait maison — moyenne des canaux pour le démixage,
interpolation linéaire vers 16 kHz — pour ne pas ajouter SciPy à l'environnement.
Vérifié : 0,5 s de 48 kHz stéréo produit bien 8000 échantillons en 16 kHz mono.

Second changement, dans le repli : quand `DEEPGRAM_API_KEY` est absente ou
invalide, l'agent bascule maintenant **automatiquement sur Whisper local** au
lieu de retourner une STT dont on sait déjà qu'elle sera muette. Le micro
fonctionne sans clé et sans compte, et le message de log explique comment
repasser sur Deepgram.

---

## État de la suite de tests

```powershell
.venv\Scripts\python.exe -m pytest -m "not integration" -q
```

| | Avant | Après |
|---|---|---|
| Échecs | 13 | 5 |
| Succès | 711 | 719 |

Les 13 échecs de départ **préexistaient** à ces travaux. C'est vérifié, et pas
supposé : la suite a été rejouée après restauration des fichiers amont `v0.3.2`,
avec un résultat identique.

Les 5 échecs restants sont des hypothèses POSIX dans les tests eux-mêmes, sans
impact sur le fonctionnement :

| Test | Raison |
|---|---|
| `test_tools.py::test_cli_runner_success` | Utilise `echo`, commande interne de `cmd` sous Windows et non un exécutable |
| `test_tools.py::test_cli_runner_with_args` | Idem |
| `test_dev_extensions_inert.py::test_a_…` | Dépend de l'état réel de `skills_data/installed` (`globe-view` y est installé) |
| `test_dev_extensions_inert.py::test_b_…` | Idem |
| `test_local_music.py::test_resolve_art_embeds_local_file_as_data_uri` | Résolution de pochette locale |

---

## Identifié, non corrigé

**Cooldown proactif codé en dur.** `engine/proactive/engine.py` fixe
`_COOLDOWN_S = 120` dans le corps de la boucle : deux minutes d'inactivité
utilisateur sont exigées avant tout appel LLM de fond. La valeur n'est ni
configurable ni exposée dans les réglages, et rien ne l'explique à l'utilisateur
qui constate simplement que Jarvis « ne fait rien ». À transformer en réglage
documenté.

**Le diagnostic de quota est bon, sa visibilité non.** `kernel/preflight.py`
distingue correctement la clé erronée (401/403) du quota atteint (429) et produit
des messages avec remède. Mais ce diagnostic ne tourne qu'au démarrage : un quota
atteint en cours de session ne déclenche aucun message équivalent.

**Serveur figé, cause inconnue.** Le 1er août, le serveur lancé depuis minuit
acceptait les connexions TCP sur le port 8000 mais ne répondait à aucune route,
`/health` comprise. Un redémarrage a tout rétabli. La cause n'est pas
identifiée et le cas n'a pas été reproduit — mentionné ici pour qu'il soit
reconnu s'il revient, pas comme un bug diagnostiqué.

**Registre des skills instancié à l'import.** `capabilities/skills/registry.py`
se termine par `skill_registry = SkillRegistry.get_instance()` au niveau du
module : tout sous-processus qui importe `jarvis` recharge les neuf skills. Le
démon de vision, démarré par `multiprocessing`, provoque ainsi un second
chargement complet — d'où la séquence de démarrage affichée en double dans la
console. Sans conséquence fonctionnelle, mais c'est du travail fait deux fois et
un effet de bord à l'import.

**Aucune recette de compilation pour les exécutables natifs.** `My Jarvis.exe`
était livré sans moyen documenté de le reconstruire. Comblé par
`miku_scripts/Compiler-natif.ps1`, qui compile aussi le nouvel
`Installer My Jarvis.exe`. Le drapeau `/codepage:65001` y est obligatoire : les
sources sont en UTF-8 sans BOM, et `csc.exe` les lirait sinon dans la page de
codes ANSI, corrompant tous les textes accentués de l'interface.

---

## Méthode

Le dépôt local n'étant pas un clone Git, la comparaison avec l'amont s'est faite
sur une archive `v0.3.2` téléchargée puis diffée par empreinte MD5, fichier par
fichier, en excluant les répertoires volatils (`.venv`, `.models`, `__pycache__`,
`memory_data`, `skills_data`, `workspace`).

Chaque correctif a été isolé avant d'être crédité : la suite de tests a été
rejouée avec les fichiers d'origine restaurés, pour distinguer ce qui était déjà
cassé de ce qui aurait pu l'être par l'intervention. Aucune régression n'a été
introduite.
