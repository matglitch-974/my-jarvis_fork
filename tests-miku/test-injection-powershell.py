"""Preuve par l'execution : la charge malveillante ressort comme du TEXTE.

On remplace MessageBox par Write-Output â€” meme construction, meme encodage,
mais on peut lire ce que PowerShell a reellement compris.
"""
import base64
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "base" / "jarvis-OS" / "src"))
from jarvis.capabilities.skills.executor import _powershell_litteral

CHARGES = [
    "Bonjour",
    "l'heure du the",
    "x'); Start-Process calc; ('",
    "$(Get-Date)",
    "a; Write-Output PWNED; b",
    "`n Write-Output PWNED",
    '"; Write-Output PWNED; "',
]

echecs = 0
for charge in CHARGES:
    script = "Write-Output " + _powershell_litteral(charge)
    encode = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    r = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encode],
        capture_output=True,
        text=True,
        timeout=20,
    )
    sortie = r.stdout.strip()
    lignes = [x for x in r.stdout.splitlines() if x.strip()]

    intact = sortie == charge.strip()
    une_seule = len(lignes) <= 1
    pas_pwned = "PWNED" not in sortie or "PWNED" in charge and sortie == charge.strip()

    ok = intact and une_seule
    if not ok:
        echecs += 1
    print(("  OK   " if ok else " ECHEC ") + repr(charge))
    if not ok:
        print("        ressorti : " + repr(sortie))
        print("        lignes   : " + str(len(lignes)))

print()
print("Tout est ressorti comme du texte." if echecs == 0 else f"{echecs} charge(s) non neutralisee(s).")
sys.exit(0 if echecs == 0 else 1)
