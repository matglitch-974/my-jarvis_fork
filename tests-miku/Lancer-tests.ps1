# Lancer-tests.ps1 -- rejoue toutes les verifications ecrites le 04/08/2026.
#
#   .\Lancer-tests.ps1          tout
#   .\Lancer-tests.ps1 -Filtre voix     seulement ceux dont le nom contient "voix"
#
# Aucun chemin absolu : tout se calcule depuis l'emplacement de ce fichier.

[CmdletBinding()]
param([string] $Filtre = '')

$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'Miku - Tests MyJarvis'

$ici = $PSScriptRoot
$racine = Split-Path $ici -Parent

# Python : celui du projet d'abord, celui du systeme en repli.
$py = Join-Path $racine 'base\jarvis-OS\.venv\Scripts\python.exe'
if (-not (Test-Path $py)) {
    $c = Get-Command python -ErrorAction SilentlyContinue
    $py = if ($c) { $c.Source } else { $null }
}

$suites = @(
    @{ nom = 'voix-reponse   (mise en voix des reponses ecrites)'; type = 'node'; f = 'test-voix-reponse.js' },
    @{ nom = 'securite       (echappements, jeton WebSocket)';     type = 'py';   f = 'test-securite.py' },
    @{ nom = 'injection      (charges reelles dans PowerShell)';   type = 'py';   f = 'test-injection-powershell.py' },
    @{ nom = 'filtre-think   (balise coupee entre deux paquets)';  type = 'py';   f = 'test-filtre-think.py' },
    @{ nom = 'moteurs        (OpenAI et Ollama simules)';          type = 'node'; f = 'test-moteurs.mjs' },
    @{ nom = 'sidecar        (integration, vrai processus)';       type = 'node'; f = 'test-sidecar.mjs' }
)

if ($Filtre) { $suites = $suites | Where-Object { $_.nom -match $Filtre -or $_.f -match $Filtre } }

Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host '  Verifications MyJarvis' -ForegroundColor Cyan
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ''

$reussites = 0
$echecs = @()

foreach ($s in $suites) {
    $chemin = Join-Path $ici $s.f
    if (-not (Test-Path $chemin)) {
        Write-Host ("  . absent  : {0}" -f $s.nom) -ForegroundColor DarkGray
        continue
    }
    if ($s.type -eq 'py' -and -not $py) {
        Write-Host ("  . sans python : {0}" -f $s.nom) -ForegroundColor DarkGray
        continue
    }

    Write-Host ("--- {0}" -f $s.nom) -ForegroundColor White
    Push-Location $ici
    try {
        if ($s.type -eq 'node') { & node $chemin } else { & $py $chemin }
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    if ($code -eq 0) {
        $reussites++
    } else {
        $echecs += $s.nom
    }
    Write-Host ''
}

Write-Host '================================================================' -ForegroundColor Cyan
if ($echecs.Count -eq 0) {
    Write-Host ("  {0} suite(s) au vert." -f $reussites) -ForegroundColor Green
} else {
    Write-Host ("  {0} au vert, {1} en echec :" -f $reussites, $echecs.Count) -ForegroundColor Red
    $echecs | ForEach-Object { Write-Host ("    - {0}" -f $_) -ForegroundColor Red }
}
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ''

if (-not [Console]::IsInputRedirected) {
    try {
        Write-Host 'Appuyez sur une touche pour fermer.' -ForegroundColor DarkGray
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    } catch { }
}

if ($echecs.Count -gt 0) { exit 1 } else { exit 0 }
