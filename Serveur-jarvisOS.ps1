# MyJarvis - fenetre du serveur jarvis-OS (FastAPI, port 8000)
$Host.UI.RawUI.WindowTitle = "Miku - My Jarvis serveur"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:UV_CACHE_DIR = Join-Path $root "data\uv-cache"

# UTF-8 de bout en bout. Sans ces quatre lignes, Python emet de l'UTF-8 pendant
# que la console le relit en cp1252 : "charge" s'affiche "chargA(c)" et le moindre
# glyphe hors cp1252 peut tuer le processus sur un UnicodeEncodeError.
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null

Set-Location (Join-Path $root "base\jarvis-OS")

$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    Write-Host "  ERREUR : uv introuvable sur cette machine." -ForegroundColor Red
    Read-Host "  Appuyez sur Entree pour fermer"
    exit 1
}

Write-Host ""
Write-Host "  MyJarvis - serveur jarvis-OS (premier demarrage : ~2 min)" -ForegroundColor Cyan
Write-Host ""

uv run python -m jarvis.app
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Le serveur s'est arrete avec le code $LASTEXITCODE." -ForegroundColor Yellow
    Read-Host "  Appuyez sur Entree pour fermer"
}
