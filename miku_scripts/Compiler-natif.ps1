# Miku - compile les executables natifs de My Jarvis.
#
#   My Jarvis.exe            <- Jarvis\native\Program.cs      (fenetre WebView2)
#   Installer My Jarvis.exe  <- Jarvis\native\Installateur.cs (installation)
#
# La recette de "My Jarvis.exe" n'existait nulle part : le binaire etait livre
# sans moyen de le reconstruire. Ce script comble ce trou.
#
# /codepage:65001 est OBLIGATOIRE : les sources sont en UTF-8 SANS BOM, et sans
# ce drapeau csc.exe les lit dans la page de codes ANSI du systeme. Tous les
# textes accentues de l'interface partiraient alors corrompus dans le binaire.
$Host.UI.RawUI.WindowTitle = "Miku - compilation des executables My Jarvis"

$racine = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$natif  = Join-Path $racine "Jarvis\native"

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    Write-Host "  ERREUR : csc.exe introuvable (.NET Framework 4 absent)." -ForegroundColor Red
    Read-Host "  Appuyez sur Entree pour fermer"
    exit 1
}

Write-Host ""
Write-Host "  Compilation des executables My Jarvis" -ForegroundColor Cyan
Write-Host "  Source : $natif"
Write-Host ""

function Compiler {
    param([string]$Source, [string]$Sortie, [string[]]$Refs, [string]$Cible)

    $src = Join-Path $natif $Source
    if (-not (Test-Path $src)) {
        Write-Host "  IGNORE : $Source absent." -ForegroundColor Yellow
        return $true
    }

    $out = Join-Path $natif $Sortie
    $args = @("/nologo", "/codepage:65001", "/optimize+", "/target:$Cible", "/out:$out")
    foreach ($r in $Refs) { $args += "/reference:$r" }
    $ico = Join-Path $racine "MyJarvis.ico"
    if (Test-Path $ico) { $args += "/win32icon:$ico" }
    $args += $src

    Write-Host "  -> $Sortie" -ForegroundColor White
    & $csc @args
    if ($LASTEXITCODE -ne 0) {
        Write-Host "     ECHEC (code $LASTEXITCODE)" -ForegroundColor Red
        return $false
    }
    $taille = [math]::Round((Get-Item $out).Length / 1KB, 1)
    Write-Host "     OK - $taille Ko" -ForegroundColor Green
    return $true
}

$ok = $true

# Installateur : fenetre WinForms (02/08 — plus de console, il vise ceux qui
# n'ouvrent jamais un terminal). /target:winexe, sinon une console noire
# s'ouvrirait derriere la fenetre.
$ok = (Compiler -Source "Installateur.cs" -Sortie "Installer My Jarvis.exe" -Cible "winexe" `
        -Refs @("System.dll", "System.Drawing.dll", "System.Windows.Forms.dll",
                "System.IO.Compression.dll", "System.IO.Compression.FileSystem.dll")) -and $ok

# Fenetre native : WinForms + WebView2 (DLL deja presentes dans Jarvis\native).
$wv  = Join-Path $natif "Microsoft.Web.WebView2.Core.dll"
$wvf = Join-Path $natif "Microsoft.Web.WebView2.WinForms.dll"
if ((Test-Path $wv) -and (Test-Path $wvf)) {
    $ok = (Compiler -Source "Program.cs" -Sortie "My Jarvis.exe" -Cible "winexe" `
            -Refs @("System.dll", "System.Drawing.dll", "System.Windows.Forms.dll", $wv, $wvf)) -and $ok
} else {
    Write-Host "  IGNORE : My Jarvis.exe (DLL WebView2 absentes)." -ForegroundColor Yellow
}

Write-Host ""
if ($ok) { Write-Host "  Termine." -ForegroundColor Green }
else     { Write-Host "  Termine avec des erreurs." -ForegroundColor Red }
Write-Host ""
Read-Host "  Appuyez sur Entree pour fermer"
