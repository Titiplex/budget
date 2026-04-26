# Release flow desktop

Ce document cadre le packaging desktop avant un tag `1.0.0`.

## Objectifs

Le flux de release doit garantir que :

- le renderer Vite est buildé avant Electron Forge ;
- le client Prisma est généré avant tout accès à la DB ;
- les icônes attendues par Electron et Forge existent et ont le bon format ;
- un template SQLite vide mais structuré est créé avant le packaging ;
- au premier lancement d’un build packagé, la DB est copiée dans `userData/data/app.db` ;
- une DB utilisateur existante n’est jamais remplacée par une mise à jour applicative.

## Commandes

### Vérification complète avant release

```shell
npm run release:check
```

Cette commande exécute :

1. `npm run prisma:generate`
2. `npm run typecheck`
3. `npm run test:run`
4. `npm run validate:desktop-assets`
5. `npm run build:packaged-db`

### Package local lançable

```shell
npm run package
```

À utiliser pour tester l’app générée dans `out/` sans créer tous les installateurs.

### Artefacts installables

```shell
npm run make
```

Cette commande prépare le renderer, les assets, le template DB, puis lance Electron Forge Make.

### Publication GitHub

```shell
npm run publish
```

La configuration Forge publie vers GitHub en brouillon (`draft: true`). Les notes de release doivent être relues avant publication manuelle du draft.

## Base de données en build packagé

En développement, SQLite reste dans :

```text
prisma/dev.db
```

En build packagé, le build génère :

```text
assets/database/app.db
```

Ce fichier est un template. Il ne doit pas être utilisé comme base utilisateur finale.

Au premier lancement d’un build packagé, l’app copie ce template vers :

```text
<userData>/data/app.db
```

Ensuite, si ce fichier existe déjà et n’est pas vide, il est conservé. C’est volontaire : une mise à jour de l’application ne doit pas écraser les données utilisateur.

## Vérification manuelle du chemin DB

Pour valider le comportement sur une machine propre :

1. lancer `npm run package` ;
2. ouvrir l’app packagée depuis `out/` ;
3. créer un compte, une catégorie et une transaction ;
4. fermer l’app ;
5. relancer la même app packagée ;
6. vérifier que les données sont toujours présentes ;
7. localiser la DB dans le dossier `userData/data/app.db`.

Emplacements usuels de `userData` :

- Windows : `%APPDATA%/Budget`
- macOS : `~/Library/Application Support/Budget`
- Linux : `~/.config/Budget`

## Assets requis

Le script `npm run validate:desktop-assets` vérifie :

- `assets/icons/app.png` : icône utilisée par la fenêtre Electron ;
- `assets/icons/app.ico` : icône Windows / Squirrel ;
- `assets/icons/app.icns` : icône macOS.

Ces fichiers doivent exister, ne pas être vides et présenter la signature binaire attendue.

## Signature et notarisation

### Windows

Si `cert.pfx` est présent à la racine, Forge tente de signer le build Windows avec :

```text
WIN_CERT_PASSWORD
```

Sans certificat, le build reste possible mais non signé.

### macOS

La notarisation est activée uniquement si ces variables existent :

```text
APPLE_API_KEY
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

Sans ces variables, le build macOS reste possible mais non notarized.

## Points bloquants connus

- Les builds macOS doivent être produits sur macOS.
- Les builds Windows signés nécessitent un certificat valide.
- Les builds RPM peuvent nécessiter les outils système RPM sur la machine de build.
- Le template DB doit être régénéré à chaque changement de `prisma/schema.prisma`.
- Les artefacts doivent être testés sur un profil utilisateur propre avant une release stable.
