"""Verifie les correctifs de securite : echappement des notifications et
extraction du jeton WebSocket."""
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "base" / "jarvis-OS" / "src"))

from jarvis.capabilities.skills.executor import _applescript_litteral, _powershell_litteral

echecs = 0


def verifie(nom, obtenu, attendu):
    global echecs
    ok = obtenu == attendu
    if not ok:
        echecs += 1
    print(("  OK   " if ok else " ECHEC ") + nom)
    if not ok:
        print("        attendu : " + repr(attendu))
        print("        obtenu  : " + repr(obtenu))


print("\n--- Echappement PowerShell ---")
verifie("texte simple", _powershell_litteral("Bonjour"), "'Bonjour'")
verifie("apostrophe doublee", _powershell_litteral("l'heure"), "'l''heure'")
verifie("dollar inerte", _powershell_litteral("$(calc)"), "'$(calc)'")
verifie("point-virgule inerte", _powershell_litteral("a; calc"), "'a; calc'")
verifie("None -> vide", _powershell_litteral(None), "''")

# La charge qui fonctionnait avant : sortir de la chaine et enchainer.
charge = "x'); Start-Process calc; ('"
sortie = _powershell_litteral(charge)
verifie(
    "evasion neutralisee",
    sortie,
    "'x''); Start-Process calc; ('''",
)
# Le nombre d'apostrophes simples non doublees doit etre 0 a l'interieur.
interieur = sortie[1:-1]
verifie("aucune apostrophe isolee", interieur.replace("''", ""), "x); Start-Process calc; (")

print("\n--- Echappement AppleScript ---")
verifie("texte simple", _applescript_litteral("Bonjour"), '"Bonjour"')
verifie("guillemet echappe", _applescript_litteral('dit "oui"'), '"dit \\"oui\\""')
verifie(
    "antislash echappe avant le guillemet",
    _applescript_litteral('a\\"b'),
    '"a\\\\\\"b"',
)

print("\n--- Encodage PowerShell -EncodedCommand ---")
script = "Add-Type; Show(" + _powershell_litteral("l'ete") + ")"
encode = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
retour = base64.b64decode(encode).decode("utf-16-le")
verifie("aller-retour fidele", retour, script)

print("\n--- Jeton WebSocket ---")
from jarvis.engine.auth import WS_SUBPROTOCOL, _jeton_de_websocket, ws_subprotocol


class FausseSocket:
    def __init__(self, headers=None, query=None):
        self.headers = headers or {}
        self.query_params = query or {}


verifie(
    "sous-protocole",
    _jeton_de_websocket(FausseSocket({"sec-websocket-protocol": f"{WS_SUBPROTOCOL}, abc123"})),
    "abc123",
)
verifie(
    "en-tete Authorization",
    _jeton_de_websocket(FausseSocket({"authorization": "Bearer xyz789"})),
    "xyz789",
)
verifie(
    "parametre de requete",
    _jeton_de_websocket(FausseSocket({}, {"token": "qs42"})),
    "qs42",
)
verifie("rien du tout", _jeton_de_websocket(FausseSocket()), "")
verifie(
    "sous-protocole inconnu ignore",
    _jeton_de_websocket(FausseSocket({"sec-websocket-protocol": "autre, abc"})),
    "",
)
verifie(
    "confirmation du sous-protocole",
    ws_subprotocol(FausseSocket({"sec-websocket-protocol": f"{WS_SUBPROTOCOL}, abc"})),
    WS_SUBPROTOCOL,
)
verifie("aucun sous-protocole a confirmer", ws_subprotocol(FausseSocket()), None)

print("\n" + ("Tout passe." if echecs == 0 else f"{echecs} echec(s)."))
sys.exit(0 if echecs == 0 else 1)
