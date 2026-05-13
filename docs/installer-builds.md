# Installateurs desktop

## Windows

Le build Windows actuel utilise `@electron-forge/maker-squirrel`, donc l'artifact `.exe` est un installateur Squirrel.Windows.

Conséquences normales de Squirrel.Windows :

- l'installateur ne demande pas de dossier d'installation ;
- l'installation se fait sans droits administrateur dans le profil utilisateur Windows ;
- l'artifact `.exe` n'est pas l'application finale à relancer tous les jours ;
- après installation, l'utilisateur doit lancer Budget depuis le raccourci créé par Squirrel.

Le point critique est que l'application doit traiter les événements Squirrel au tout début de `electron/main.js`. Sinon, les événements `--squirrel-install`, `--squirrel-updated` et `--squirrel-uninstall` ne créent/suppriment pas correctement les raccourcis, ce qui donne l'impression que rien n'est installé.

Ce projet charge maintenant `electron-squirrel-startup` au démarrage du process principal. Ce module crée les raccourcis desktop/menu démarrer lors de l'installation et les retire à la désinstallation.

Commande de vérification Windows recommandée :

```powershell
npm ci
npm run make:artifacts
```

Artifacts attendus :

- `out/make/squirrel.windows/**/BudgetSetup.exe`
- `out/make/squirrel.windows/**/*.nupkg`
- `out/make/squirrel.windows/**/RELEASES`

Pour un installateur Windows qui propose explicitement le dossier d'installation et une case à cocher pour l'icône desktop, il faudra remplacer/compléter Squirrel par une cible d'installation différente, par exemple un packaging NSIS via electron-builder ou un MSI WiX. Ce n'est pas le comportement prévu par Squirrel.Windows.

## macOS

Le build macOS produit actuellement un `.zip` avec l'application `.app`. Ce n'est pas un assistant d'installation : l'utilisateur extrait le zip puis place `Budget.app` dans `Applications`.

Commande de vérification macOS recommandée :

```bash
npm ci
npm run make:artifacts
```

Artifact attendu :

- `out/make/zip/darwin/**/Budget-darwin-*.zip`

## Linux

Les builds Linux produisent des paquets `.deb` et `.rpm`. Ils s'installent avec les outils système (`apt`, `dpkg`, `dnf`, `rpm`) et doivent exposer Budget dans le menu applicatif de l'environnement desktop.

Commande de vérification Linux recommandée :

```bash
sudo apt-get update
sudo apt-get install -y fakeroot rpm dpkg
npm ci
npm run make:artifacts
```

Artifacts attendus :

- `out/make/deb/**/budget_*.deb`
- `out/make/rpm/**/budget-*.rpm`
