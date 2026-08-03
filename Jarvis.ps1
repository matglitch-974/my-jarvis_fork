# MyJarvis - lanceur du sidecar Claude Agent SDK (fenetre visible, regle Maitre)
$Host.UI.RawUI.WindowTitle = "Miku - My Jarvis sidecar"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$env:MYJARVIS_ROOT = $root
$env:TEMP = Join-Path $root "data\tmp"
$env:TMP  = $env:TEMP
$env:npm_config_cache = Join-Path $root "data\npm-cache"

# Jeton d'abonnement (cree par Connexion-abonnement.cmd, valable ~1 an)
$tokenFile = Join-Path $root "config\.claude_oauth_token"
if (Test-Path $tokenFile) {
    $env:CLAUDE_CODE_OAUTH_TOKEN = (Get-Content $tokenFile -Raw).Trim()
    Write-Host "  Jeton d'abonnement charge." -ForegroundColor DarkGray
} else {
    Write-Host "  ATTENTION : aucun jeton (config\.claude_oauth_token absent)." -ForegroundColor Yellow
    Write-Host "  Veuillez d'abord lancer Connexion-abonnement.cmd, sans quoi le moteur repondra 'Not logged in'."
}

Write-Host ""
Write-Host "  MyJarvis - sidecar Claude Agent SDK (moteur par abonnement)" -ForegroundColor Cyan
Write-Host "  Dossier : $root"
Write-Host "  Le serveur jarvis-OS (base\jarvis-OS) s'y connecte via API_BACKEND=claude_agent_sdk."
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "  ERREUR : Node.js introuvable. (version portable prevue plus tard)" -ForegroundColor Red
    Read-Host "  Appuyez sur Entree pour fermer"
    exit 1
}

node (Join-Path $root "Jarvis\engine\index.mjs")
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Le sidecar s'est arrete avec le code $LASTEXITCODE." -ForegroundColor Yellow
    Read-Host "  Appuyez sur Entree pour fermer"
}
