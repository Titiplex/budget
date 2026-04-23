param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

function Step($Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail($Message) {
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Ensure-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail "Commande introuvable: $Name"
    }
}

Ensure-Command git
Ensure-Command npm

Step "Vérification du dépôt Git"
$gitStatus = git status --porcelain
if ($gitStatus) {
    Fail "Le dépôt n'est pas propre. Commit ou stash d'abord tes changements."
}

Step "Vérification des icônes"
$requiredIcons = @(
    "assets/icons/app.png",
    "assets/icons/app.ico"
)

foreach ($icon in $requiredIcons) {
    if (-not (Test-Path $icon)) {
        Fail "Icône manquante: $icon"
    }
}

Step "Configuration DATABASE_URL"
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "file:./prisma/preflight.db"
    Write-Host "DATABASE_URL non défini, utilisation de $env:DATABASE_URL" -ForegroundColor Yellow
}

Step "Installation / intégrité lockfile"
npm ci

Step "Prisma generate"
npm run prisma:generate

Step "Tests"
npm run test:run

Step "Typecheck"
npm run typecheck

Step "Package"
npm run package

Step "Make"
npm run make

Write-Host ""
Write-Host "Préflight terminé avec succès." -ForegroundColor Green

if ($Version -ne "") {
    Step "Création du tag Git $Version"
    git tag $Version
    Write-Host "Tag créé: $Version" -ForegroundColor Green
    Write-Host "Pour publier: git push origin $Version" -ForegroundColor Yellow
} else {
    Write-Host "Aucun tag créé. Relance avec -Version v0.9.0 si tu veux tagger." -ForegroundColor Yellow
}