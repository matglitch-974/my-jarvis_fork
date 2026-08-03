# My Jarvis - LANCEUR UNIQUE
# Demarre le sidecar + le serveur jarvis-OS, ouvre la fenetre native (My Jarvis.exe),
# et reinscrit les raccourcis Windows depuis l'emplacement COURANT du dossier
# (auto-reparation apres un demenagement de dossier ou un changement de lettre).
$Host.UI.RawUI.WindowTitle = "Miku - My Jarvis lanceur"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Port($url) {
    try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

# Garde anti-doublon. Test-Port ne suffit pas : il abandonne au bout de 2 s, or un
# serveur occupe peut mettre plus longtemps a repondre. On concluait alors "pas
# actif" et on en demarrait un SECOND. Sous Windows deux uvicorn peuvent tenir le
# meme port ; les connexions arrivent sur une socket dont le processus est coince,
# et plus rien ne repond. Ici on regarde si le port est simplement LIE, ce qui est
# instantane et sans faux negatif.
function Test-PortBound($port) {
    try {
        $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
        return ($null -ne $c)
    } catch { return $false }
}

Write-Host ""
Write-Host "  My Jarvis - lanceur unique" -ForegroundColor Cyan
Write-Host "  Dossier : $root"
Write-Host ""

# ── 1. Inscription Windows auto-reparante (raccourcis Menu Demarrer + Bureau) ──
try {
    $ws = New-Object -ComObject WScript.Shell

    # Nettoyage des anciens raccourcis mal nommes ("MyJarvis.lnk" sans espace)
    foreach ($old in @(
        (Join-Path ([Environment]::GetFolderPath('Programs')) "MyJarvis.lnk"),
        (Join-Path ([Environment]::GetFolderPath('Desktop'))  "MyJarvis.lnk")
    )) {
        if (Test-Path $old) { Remove-Item $old -Force }
    }

    $targets = @(
        (Join-Path ([Environment]::GetFolderPath('Programs')) "My Jarvis.lnk"),
        (Join-Path ([Environment]::GetFolderPath('Desktop'))  "My Jarvis.lnk")
    )
    foreach ($lnkPath in $targets) {
        $lnk = $ws.CreateShortcut($lnkPath)
        $lnk.TargetPath = Join-Path $root "MyJarvis.cmd"
        $lnk.WorkingDirectory = $root
        $lnk.IconLocation = (Join-Path $root "MyJarvis.ico") + ",0"
        $lnk.Description = "My Jarvis - assistant personnel (dossier portable)"
        $lnk.Save()
    }
    Write-Host "  [1/4] Raccourcis Windows reinscrits (Menu Demarrer + Bureau)." -ForegroundColor Green
} catch {
    Write-Host "  [1/4] Raccourcis non reinscrits : $($_.Exception.Message)" -ForegroundColor Yellow
}

# ── 2. Sidecar Claude Agent SDK (port 4981) ──
if ((Test-PortBound 4981) -or (Test-Port "http://127.0.0.1:4981/health")) {
    Write-Host "  [2/4] Sidecar deja actif." -ForegroundColor Green
} else {
    Start-Process -FilePath (Join-Path $root "Jarvis.cmd") -WorkingDirectory $root
    $up = $false
    foreach ($i in 1..20) {
        Start-Sleep -Milliseconds 800
        if (Test-Port "http://127.0.0.1:4981/health") { $up = $true; break }
    }
    if ($up) { Write-Host "  [2/4] Sidecar demarre." -ForegroundColor Green }
    else {
        Write-Host "  [2/4] ECHEC : le sidecar ne repond pas (voir sa fenetre)." -ForegroundColor Red
        Read-Host "  Appuyez sur Entree pour fermer"
        exit 1
    }
}

# ── 3. Serveur jarvis-OS (port 8000) ──
if (Test-PortBound 8000) {
    Write-Host "  [3/4] Serveur deja actif (port 8000 lie)." -ForegroundColor Green
} else {
    Start-Process -FilePath (Join-Path $root "Serveur-jarvisOS.cmd") -WorkingDirectory $root
    Write-Host "  [3/4] Serveur en cours de demarrage (jusqu'a ~2 min au premier lancement)..."
    $up = $false
    foreach ($i in 1..90) {
        Start-Sleep -Seconds 2
        if (Test-Port "http://127.0.0.1:8000/admin") { $up = $true; break }
    }
    if ($up) { Write-Host "  [3/4] Serveur pret." -ForegroundColor Green }
    else {
        Write-Host "  [3/4] ECHEC : le serveur ne repond pas (voir sa fenetre)." -ForegroundColor Red
        Read-Host "  Appuyez sur Entree pour fermer"
        exit 1
    }
}

# ── 4. Fenetre native My Jarvis (WebView2, sans navigateur externe) ──
$exe = Join-Path $root "Jarvis\native\My Jarvis.exe"
if (Test-Path $exe) {
    Start-Process -FilePath $exe -ArgumentList "http://127.0.0.1:8000/" -WorkingDirectory (Split-Path $exe)
    Write-Host "  [4/4] Fenetre My Jarvis ouverte." -ForegroundColor Green
} else {
    Start-Process "http://127.0.0.1:8000/"
    Write-Host "  [4/4] My Jarvis.exe introuvable - ouverture dans le navigateur par defaut." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  My Jarvis est en ligne. Cette fenetre va se fermer." -ForegroundColor Cyan
Start-Sleep -Seconds 4
