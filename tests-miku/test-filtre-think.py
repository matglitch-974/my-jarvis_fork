"""Verifie le filtre <think> du provider Ollama de jarvis-OS, fragment par fragment."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "base" / "jarvis-OS" / "src"))
from jarvis.providers.llm.local import _suffixe_partiel

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


print("\n--- _suffixe_partiel ---")
verifie("balise entiere ignoree", _suffixe_partiel("a<think>", "<think>"), 0)
verifie("debut de balise retenu", _suffixe_partiel("bla<thi", "<think>"), 4)
verifie("un seul chevron retenu", _suffixe_partiel("bla<", "<think>"), 1)
verifie("aucun rapport", _suffixe_partiel("bonjour", "<think>"), 0)
verifie("fermeture partielle", _suffixe_partiel("xx</thi", "</think>"), 5)


# Rejoue la boucle de _stream sur des fragments arbitraires.
def filtrer(fragments):
    in_think = False
    buf = ""
    sortie = ""
    for delta in fragments:
        buf += delta
        out = ""
        while buf:
            if in_think:
                end = buf.find("</think>")
                if end == -1:
                    g = _suffixe_partiel(buf, "</think>")
                    buf = buf[-g:] if g else ""
                    break
                buf = buf[end + len("</think>") :]
                in_think = False
            else:
                start = buf.find("<think>")
                if start == -1:
                    g = _suffixe_partiel(buf, "<think>")
                    out += buf[:-g] if g else buf
                    buf = buf[-g:] if g else ""
                    break
                out += buf[:start]
                buf = buf[start + len("<think>") :]
                in_think = True
        sortie += out
    return sortie


print("\n--- Filtrage en flux ---")
verifie("sans raisonnement", filtrer(["Bon", "jour"]), "Bonjour")
verifie("bloc entier dans un fragment", filtrer(["<think>bla</think>Salut"]), "Salut")
verifie(
    "OUVERTURE coupee en deux",
    filtrer(["<thi", "nk>bla</think>Salut"]),
    "Salut",
)
verifie(
    "FERMETURE coupee en deux",
    filtrer(["<think>bla</thi", "nk>Salut"]),
    "Salut",
)
verifie(
    "coupee caractere par caractere",
    filtrer(list("Avant<think>secret</think>Apres")),
    "AvantApres",
)
verifie(
    "chevron isole conserve",
    filtrer(["3 < 5 et 7 > 2"]),
    "3 < 5 et 7 > 2",
)
verifie(
    "deux blocs successifs",
    filtrer(["a<think>x</think>b<thi", "nk>y</think>c"]),
    "abc",
)

print("\n" + ("Tout passe." if echecs == 0 else f"{echecs} echec(s)."))
sys.exit(0 if echecs == 0 else 1)
