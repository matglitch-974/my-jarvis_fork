# Miku - Publier le depot via l'API GitHub
#
# Le helper remote-https de git est absent sur cette machine : "git push" est
# impossible. On reconstruit donc le commit cote GitHub avec l'API Git.
#
# Source de verite : l'arbre du HEAD local (git ls-tree), JAMAIS le dossier de
# travail. Ce qui est ignore par .gitignore n'entre donc pas dans le HEAD, et ne
# peut pas fuiter ici.
#
# Reprenable : la correspondance chemin -> sha de blob est ecrite au fur et a
# mesure dans un fichier d'etat. Si la connexion casse, on relance le script et
# il repart ou il s'est arrete.

param(
    [string]$Repo   = "matglitch-974/my-jarvis_fork",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine

$etatFichier = Join-Path $env:TEMP "miku-publication-blobs.json"
$journal     = Join-Path $racine "logs\publication.log"
New-Item -ItemType Directory -Force -Path (Split-Path $journal) | Out-Null

function Note([string]$m) {
    $ligne = "{0}  {1}" -f (Get-Date -Format "HH:mm:ss"), $m
    Write-Host $ligne
    Add-Content -Path $journal -Value $ligne -Encoding utf8
}

# PowerShell 5.1 : "Set-Content -Encoding utf8" ecrit un BOM, et l'API GitHub
# repond alors 400 "Problems parsing JSON". Piege verifie le 02/08/2026 : les
# blobs passaient (ecrits en ascii), l'arbre et le commit non.
function EcrireJson([string]$chemin, $objet, [int]$profondeur = 5) {
    $json = $objet | ConvertTo-Json -Depth $profondeur
    [IO.File]::WriteAllText($chemin, $json, (New-Object Text.UTF8Encoding($false)))
}

# Tout appel a l'API doit etre verifie : "gh" n'echoue pas en levant une
# exception, il rend un code de sortie. Sans ce controle le script annoncait
# une publication reussie alors que rien n'avait bouge.
function AppelApi([string]$route, [string]$methode, [string]$corps) {
    $sortie = & gh api $route -X $methode --input $corps 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Note "  reponse de GitHub : $($sortie.Trim())"
        throw "Appel API en echec ($methode $route)"
    }
    return ($sortie | ConvertFrom-Json)
}

Note "=== Publication de $Repo (branche $Branch) ==="

# ── 1. Inventaire du HEAD ────────────────────────────────────────────────
$entrees = @()
git ls-tree -r HEAD | ForEach-Object {
    # format : <mode> <type> <sha>\t<chemin>
    $meta, $chemin = $_ -split "`t", 2
    $mode, $type, $sha = $meta -split "\s+"
    $entrees += [pscustomobject]@{ mode = $mode; sha = $sha; chemin = $chemin }
}
Note ("{0} fichiers dans le HEAD local" -f $entrees.Count)

# ── 2. Etat repris ───────────────────────────────────────────────────────
#
# La cle est le SHA du blob GIT, pas le chemin : git et GitHub calculent le
# meme SHA pour un contenu donne. Un fichier inchange d'une publication a
# l'autre est donc reconnu sans etre renvoye, et un fichier deplace non plus.
# Ce fichier d'etat n'est jamais supprime : c'est lui qui rend les envois
# suivants quasi instantanes.
$carte = @{}
if (Test-Path $etatFichier) {
    (Get-Content $etatFichier -Raw -Encoding utf8 | ConvertFrom-Json).PSObject.Properties |
        ForEach-Object { $carte[$_.Name] = $_.Value }
    Note ("reprise : {0} blobs deja connus de GitHub" -f $carte.Count)
}

function SauverEtat {
    ($carte | ConvertTo-Json -Depth 3 -Compress) |
        Set-Content -Path $etatFichier -Encoding utf8
}

# ── 3. Televersement des blobs ───────────────────────────────────────────
$i = 0
$aFaire = $entrees | Where-Object { -not $carte.ContainsKey($_.sha) } |
          Sort-Object sha -Unique
Note ("{0} blobs a televerser" -f @($aFaire).Count)

foreach ($e in $aFaire) {
    $i++
    # On lit le contenu DEPUIS GIT, pas depuis le disque : garantie que seul
    # ce qui est reellement commite part vers GitHub.
    $tmp = Join-Path $env:TEMP "miku-blob.bin"
    cmd /c "git cat-file blob $($e.sha) > `"$tmp`"" | Out-Null
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($tmp))

    $corps = Join-Path $env:TEMP "miku-blob.json"
    '{"content":"' + $b64 + '","encoding":"base64"}' |
        Set-Content -Path $corps -Encoding ascii

    $reponse = $null
    for ($essai = 1; $essai -le 4; $essai++) {
        try {
            $reponse = gh api "repos/$Repo/git/blobs" -X POST --input $corps 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) { break }
        } catch { }
        Note ("  ! echec blob {0} (essai {1}) - nouvelle tentative" -f $e.chemin, $essai)
        Start-Sleep -Seconds ([Math]::Min(20, 3 * $essai))
        $reponse = $null
    }
    if (-not $reponse) { throw "Blob irrecuperable : $($e.chemin)" }

    $carte[$e.sha] = ($reponse | ConvertFrom-Json).sha
    if ($i % 20 -eq 0) {
        SauverEtat
        Note ("  {0}/{1} blobs" -f $i, @($aFaire).Count)
    }
}
SauverEtat
Note "tous les blobs sont en place"

# ── 4. Arbre, par tranches ───────────────────────────────────────────────
# L'API accepte un arbre complet, mais la connexion de cette machine casse au
# dela d'environ 4 Mo par requete : on empile donc des tranches en chainant
# base_tree.
$base = $null
$tranche = 120
for ($d = 0; $d -lt $entrees.Count; $d += $tranche) {
    $lot = $entrees[$d..([Math]::Min($d + $tranche - 1, $entrees.Count - 1))]
    $objet = @{ tree = @($lot | ForEach-Object {
        @{ path = $_.chemin; mode = $_.mode; type = "blob"; sha = $carte[$_.sha] }
    }) }
    if ($base) { $objet["base_tree"] = $base }

    $corps = Join-Path $env:TEMP "miku-tree.json"
    EcrireJson $corps $objet 5
    $base = (AppelApi "repos/$Repo/git/trees" "POST" $corps).sha
    if (-not $base) { throw "L'arbre n'a pas renvoye de SHA." }
    Note ("  arbre : {0}/{1} entrees" -f ([Math]::Min($d + $tranche, $entrees.Count)), $entrees.Count)
}
Note "arbre complet : $base"

# ── 5. Commit et deplacement de la reference ─────────────────────────────
$parent = ((& gh api "repos/$Repo/git/ref/heads/$Branch" | Out-String | ConvertFrom-Json).object.sha)
if (-not $parent) { throw "Impossible de lire la reference distante $Branch." }
$message = (git log -1 --pretty=%B) -join "`n"

$corps = Join-Path $env:TEMP "miku-commit.json"
EcrireJson $corps @{ message = $message; tree = $base; parents = @($parent) } 3
$commit = (AppelApi "repos/$Repo/git/commits" "POST" $corps).sha
if (-not $commit) { throw "Le commit n'a pas renvoye de SHA." }
Note "commit cree : $commit"

$corps = Join-Path $env:TEMP "miku-ref.json"
EcrireJson $corps @{ sha = $commit } 2
$null = AppelApi "repos/$Repo/git/refs/heads/$Branch" "PATCH" $corps
Note "reference $Branch deplacee sur $commit"

# Verification de l'etat REEL : le journal ne fait pas foi, seul le depot compte.
$verif = & gh api "repos/$Repo/git/ref/heads/$Branch" | Out-String | ConvertFrom-Json
if ($verif.object.sha -ne $commit) {
    throw "Verification echouee : la reference distante vaut $($verif.object.sha), pas $commit."
}
$nb = (& gh api "repos/$Repo/git/trees/$Branch`?recursive=1" | Out-String | ConvertFrom-Json).tree |
      Where-Object { $_.type -eq "blob" } | Measure-Object | Select-Object -ExpandProperty Count
Note "verifie : $nb fichiers presents sur $Branch"

# Le fichier d'etat est CONSERVE a dessein : il fait des publications suivantes
# une affaire de secondes, seuls les fichiers reellement modifies partant.
Note ("etat conserve ({0} blobs connus) : {1}" -f $carte.Count, $etatFichier)
Note "=== PUBLICATION TERMINEE ==="
