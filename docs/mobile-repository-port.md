# Mobile repository port

Ce patch ajoute la première vraie couche nécessaire pour iOS/Android : une abstraction `BudgetRepository` qui coupe le cœur budget de `window.db` / Electron IPC.

## Ce qui est inclus

- Capacitor config pour `dist/renderer`.
- Scripts npm mobile Android/iOS.
- Watcher Android qui rebuild Vite puis relance `cap sync android` quand tu modifies du JS/TS/Vue/CSS/assets.
- Couche repository commune :
  - `desktopBudgetRepository.ts` : conserve le comportement Electron actuel via `window.db` et `window.fx`.
  - `mobileBudgetRepository.ts` : charge l'adapter mobile de façon lazy.
  - `mobileSqliteBudgetRepository.ts` : implémentation SQLite native Capacitor pour comptes, catégories et transactions.
- Script d'application automatique sur `src/composables/useBudgetData.ts`.

## Installation

```bash
npm install
npm run mobile:apply-adapter
npm run typecheck
```

Si tout passe, initialise Android :

```bash
npm run mobile:init:android
npm run mobile:android:watch
```

Le watcher exécute automatiquement :

```bash
npm run mobile:sync:android
```

à chaque changement pertinent.

## Ce que ce patch migre vraiment

Migré vers repository commun :

- comptes
- catégories
- transactions
- création/édition/suppression des transferts internes
- lecture des relations `account`, `category`, `transferPeerAccount` côté mobile

Encore desktop-only pour l'instant :

- wealth avancé
- imports avancés
- audit/recovery snapshots
- backup chiffré
- market data
- FX automatique mobile

Sur mobile, le FX automatique lève volontairement une erreur claire. Pour la première bêta mobile, utilise la conversion manuelle.

## Pourquoi `mobile:apply-adapter` existe

Le fichier `src/composables/useBudgetData.ts` bouge souvent. Au lieu de te livrer une version complète risquant d'écraser tes changements, le script applique un patch ciblé :

- ajoute `getBudgetRepository()`
- remplace `window.db.account.*` par `budgetRepository.accounts.*`
- remplace `window.db.category.*` par `budgetRepository.categories.*`
- remplace `window.db.transaction.*` par `budgetRepository.transactions.*`
- remplace `window.fx.*` par `budgetRepository.fx.*`

Le script est idempotent : tu peux le relancer.

## Prochaine étape recommandée

Après ce patch, la suite logique est de migrer les autres composables un par un :

1. `useBudgetTargets`
2. `useRecurringTemplates`
3. `useJsonBackup`
4. `useCsvImportExport`
5. modules wealth/import/audit/recovery

Ne migre pas tout d'un coup. Le risque de régression est trop élevé.
