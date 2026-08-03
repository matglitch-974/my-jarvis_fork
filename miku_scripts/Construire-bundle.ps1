# Miku - construction du bundle hors-ligne de jarvis-OS (parcours B du README).
# Telecharge une fois : Python 3.11 autonome, les dependances, les modeles ML
# (YOLO, Piper) et livekit-server. C'est ce bundle qui manque pour que le micro
# fonctionne. Tout est ecrit dans base\jarvis-OS\bundle\, rien ne sort du dossier.
$Host.UI.RawUI.WindowTitle = "Miku - construction du bundle My Jarvis"

$racine  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$projet  = Join-Path $racine "base\jarvis-OS"
$journal = Join-Path $racine "logs\bundle-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

$env:PYTHONUTF8       = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:UV_CACHE_DIR     = Join-Path $racine "data\uv-cache"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

New-Item -ItemType Directory -Force -Path (Split-Path $journal -Parent) | Out-Null

Write-Host ""
Write-Host "  Construction du bundle My Jarvis" -ForegroundColor Cyan
Write-Host "  Projet  : $projet"
Write-Host "  Journal : $journal"
Write-Host "  Duree   : plusieurs minutes (telechargements)." -ForegroundColor DarkGray
Write-Host ""

# Surtout PAS de "2>&1 | Tee-Object" ici. Sous PowerShell 5.1, rediriger la
# sortie d'erreur d'un executable natif emballe chaque ligne dans un
# NativeCommandError ; build_bundle.ps1 posant ErrorActionPreference = "Stop",
# la premiere ligne de progression d'uv (qui sort sur stderr) tuait le script
# avant tout telechargement. Start-Transcript capture tout sans rien rediriger.
Set-Location $projet
Start-Transcript -Path $journal -Force | Out-Null
$code = 0
try {
    & "$projet\scripts\release\build_bundle.ps1"
    if ($LASTEXITCODE) { $code = $LASTEXITCODE }
} catch {
    $code = 1
    Write-Host ""
    Write-Host "  ERREUR : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  $($_.ScriptStackTrace)" -ForegroundColor DarkGray
}
Stop-Transcript | Out-Null

Write-Host ""
if ($code -eq 0 -or $null -eq $code) {
    Write-Host "  TERMINE. Bundle dans : $projet\bundle" -ForegroundColor Green
} else {
    Write-Host "  ECHEC (code $code). Detail dans : $journal" -ForegroundColor Red
}
Write-Host ""
Read-Host "  Appuyez sur Entree pour fermer"
