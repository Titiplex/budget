#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"

step() {
  echo
  echo "==> $1"
}

fail() {
  echo
  echo "ERROR: $1" >&2
  exit 1
}

ensure_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Commande introuvable: $1"
}

ensure_command git
ensure_command npm

step "Vérification du dépôt Git"
if [[ -n "$(git status --porcelain)" ]]; then
  fail "Le dépôt n'est pas propre. Commit ou stash d'abord tes changements."
fi

step "Vérification des icônes"
required_icons=(
  "assets/icons/app.png"
  "assets/icons/app.ico"
)

for icon in "${required_icons[@]}"; do
  [[ -f "$icon" ]] || fail "Icône manquante: $icon"
done

step "Configuration DATABASE_URL"
if [[ -z "${DATABASE_URL:-}" ]]; then
  export DATABASE_URL="file:./prisma/preflight.db"
  echo "DATABASE_URL non défini, utilisation de $DATABASE_URL"
fi

step "Installation / intégrité lockfile"
npm ci

step "Prisma generate"
npm run prisma:generate

step "Tests"
npm run test:run

step "Typecheck"
npm run typecheck

step "Package"
npm run package

step "Make"
npm run make

echo
echo "Préflight terminé avec succès."

if [[ -n "$VERSION" ]]; then
  step "Création du tag Git $VERSION"
  git tag "$VERSION"
  echo "Tag créé: $VERSION"
  echo "Pour publier: git push origin $VERSION"
else
  echo "Aucun tag créé. Lance ./scripts/release-preflight.sh v0.9.0 si tu veux tagger."
fi