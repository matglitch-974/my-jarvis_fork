# MyJarvis - connexion du moteur a l'abonnement Claude (jeton longue duree)
# A lancer UNE fois. Ouvre le flux OAuth officiel (navigateur), puis enregistre
# le jeton pour le sidecar. Le jeton est valable ~1 an.
$Host.UI.RawUI.WindowTitle = "Miku - My Jarvis connexion abonnement"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$claude = Join-Path $root "Jarvis\engine\node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe"
$tokenFile = Join-Path $root "config\.claude_oauth_token"

Write-Host ""
Write-Host "  MyJarvis - connexion du moteur a votre abonnement Claude" -ForegroundColor Cyan
Write-Host "  Etape 1 : le flux officiel 'setup-token' va s'ouvrir (navigateur)."
Write-Host "  Etape 2 : a la fin, le jeton s'affiche ici -> copiez-le."
Write-Host "  Etape 3 : collez-le a l'invite ci-dessous, il sera enregistre pour le sidecar."
Write-Host ""

if (-not (Test-Path $claude)) {
    Write-Host "  ERREUR : claude.exe introuvable dans le SDK (reinstaller les dependances du moteur)." -ForegroundColor Red
    Read-Host "  Appuyez sur Entree pour fermer"
    exit 1
}

& $claude setup-token

Write-Host ""
$token = Read-Host "  Collez le jeton ici (laisser vide pour annuler)"
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "  Annule : aucun jeton enregistre." -ForegroundColor Yellow
} else {
    Set-Content -Path $tokenFile -Value $token.Trim() -Encoding ascii -NoNewline
    Write-Host "  Jeton enregistre dans config\.claude_oauth_token" -ForegroundColor Green
    Write-Host "  Vous pouvez maintenant lancer Jarvis.cmd (le sidecar l'utilisera)."
}
Read-Host "  Appuyez sur Entree pour fermer"
