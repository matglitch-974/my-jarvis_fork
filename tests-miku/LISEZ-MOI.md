# Vérifications MyJarvis

Six suites, environ quatre-vingt-dix assertions. Aucun chemin absolu : tout se
calcule depuis l'emplacement de ce dossier, vous pouvez le déplacer.

```powershell
.\Lancer-tests.ps1
```

Pour n'en rejouer qu'une : `.\Lancer-tests.ps1 -Filtre moteurs`

| suite | ce qu'elle prouve |
|---|---|
| `test-voix-reponse.js` | la mise en voix : titres, blocs de code, tableaux, listes, troncature à la phrase entière |
| `test-securite.py` | échappements PowerShell et AppleScript, encodage, extraction du jeton WebSocket par ses trois voies |
| `test-injection-powershell.py` | **exécution réelle** : sept charges d'attaque ressortent comme du texte, dont celle qui lançait la calculatrice |
| `test-filtre-think.py` | le filtre `<think>` tient même quand la balise est coupée caractère par caractère |
| `test-moteurs.mjs` | conversion des messages et des schémas d'outils, flux SSE et NDJSON, boucle d'outils multi-tours, masquage de clé |
| `test-sidecar.mjs` | **intégration** : lance le vrai sidecar, bascule son moteur, et fait passer une complétion par un fournisseur alternatif |

Les suites Python cherchent d'abord l'interpréteur du projet
(`base/jarvis-OS/.venv`), puis celui du système. Les suites Node n'ont besoin de
rien d'autre que Node.

Chaque suite rend 0 si tout passe, 1 sinon — le lanceur aussi.
