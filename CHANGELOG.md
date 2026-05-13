# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format suit l'esprit de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), avec une lecture orientée produit plutôt que purement technique.

## [1.5.0] - À publier

### Vue d'ensemble

Budget 1.5.0 est une release de stabilisation et de préparation release candidate. Elle ne cherche pas à empiler de grosses fonctionnalités visibles ; elle renforce surtout la qualité, les tests, la fiabilité desktop Electron, la sécurité des backups/restores et la confiance dans les flux critiques local-first.

Les domaines les plus renforcés sont :

- patrimoine ;
- objectifs et projections ;
- imports CSV ;
- backup/restore ;
- contrats IPC Electron ;
- packaging desktop ;
- récurrences, dates et timezones ;
- CI, coverage, E2E et QA manuelle.

### Added

#### Stratégie qualité et documentation

- Ajout d'une stratégie de tests complète couvrant les tests unitaires, services Electron, IPC, E2E, packaging et release checks.
- Ajout d'une politique de fixtures et datasets de test déterministes.
- Ajout d'une documentation de lecture de couverture de tests sans objectif artificiel de pourcentage global.
- Ajout d'une checklist QA release pour application Electron packagée.
- Ajout de scénarios QA manuels réalistes pour les tests smoke, release candidate et hotfix.
- Ajout d'une convention de suivi des tests flaky avec obligation d'issue de correction.
- Ajout d'une documentation des conventions de dates et timezones.
- Ajout d'une documentation des conventions d'erreur IPC.
- Ajout d'une documentation CI qualité et des commandes locales équivalentes.

#### Fixtures et datasets

- Ajout de factories de test déterministes pour comptes, catégories, transactions, budgets, récurrences, transferts, patrimoine, objectifs, projections et imports CSV.
- Ajout de profils de démonstration : budget personnel simple et profil avancé multi-devise/patrimoine/imports.
- Ajout de fixtures CSV pour transactions simples, multi-devises, broker, holdings, dividendes/intérêts, crypto, erreurs, doublons et colonnes manquantes.
- Ajout de fixtures backup/restore couvrant les backups valides, complets, legacy, corrompus, références cassées et sections inconnues.
- Ajout de fixtures temporelles pour les fins de mois, années bissextiles, récurrences et projections.

#### Tests domaine et régression

- Ajout de tests unitaires patrimoine : actifs, passifs, portefeuilles, valeur brute, valeur nette, snapshots, multi-devise et cas négatifs.
- Ajout d'un module pur et de tests pour les analytics portefeuille : allocations, performances, contributions, passifs, données absentes ou stale.
- Ajout de tests renforcés sur le moteur de projections mensuelles : scénarios pessimiste/base/optimiste, objectifs atteints ou non atteignables, taux, horizons et cas invalides.
- Ajout de tests de régression pour la pipeline d'import : parsing, preview dry-run, erreurs ligne par ligne, doublons, réconciliation et application.
- Ajout de tests backup/restore et migrations : intégrité, dry-run, compatibilité legacy, corruption, références cassées et anti-écrasement de DB utilisateur.
- Ajout de tests IPC contractuels pour les flux critiques : comptes, transactions, budgets, récurrences, patrimoine, market data, objectifs/projections, imports, backup/restore, sécurité et audit.
- Ajout de tests E2E Electron smoke couvrant les parcours principaux : démarrage, DB temporaire, navigation, création/édition/suppression de données, budgets, récurrences et rapports.
- Ajout de tests E2E avancés pour patrimoine, projections, imports et backup/restore avancé.
- Ajout de tests de régression sur les dates, timezones et récurrences : fins de mois, 28/29 février, décembre → janvier, hebdomadaire, annuel, projections mensuelles et comparaisons de périodes.

#### E2E, CI et outillage

- Ajout d'un harness E2E Electron réutilisable avec DB SQLite temporaire isolée.
- Ajout d'une commande `npm run test:e2e:advanced`.
- Extension de `npm run test:e2e` pour inclure les scénarios smoke, wealth et advanced.
- Ajout de screenshots et logs en cas d'échec E2E.
- Ajout d'une configuration coverage Vitest avec rapports HTML, LCOV, JSON summary et text summary.
- Mise à jour de la CI GitHub Actions : jobs rapides et lourds séparés, typecheck/tests sur Ubuntu et Windows, coverage en artefact, release checks, E2E Electron sous Xvfb et diagnostics uploadés.
- Ajout d'un script d'audit local pour éviter les `.only` et `.skip` silencieux.
- Ajout de helpers contre les tests flaky : clock fixe, DB isolée, cleanup fichiers temporaires, attente UI stable et diagnostics E2E.

### Changed

- La chaîne qualité de release est clarifiée autour de `npm run check`, `npm run test:coverage`, `npm run test:e2e`, `npm run release:check`, `npm run package` et `npm run make`.
- Les rapports de coverage excluent explicitement les fichiers de bruit : bootstrap, configs, wrappers triviaux, types purs, tests, fixtures et fichiers UI hors scope.
- Les checks desktop/release insistent sur le comportement local-first : aucun écrasement de DB utilisateur, template SQLite packagé séparé, persistance dans `userData/data/app.db`.
- Les conventions QA privilégient les comportements financiers critiques et les effets de bord réels plutôt que la couverture artificielle.

### Fixed / Hardened

- Garde-fous renforcés contre les régressions de backup/restore, notamment corruption, références pendantes et backups legacy.
- Garde-fous renforcés contre les régressions d'import CSV : doublons, erreurs de mapping, dry-run non mutatif et erreurs IPC normalisées.
- Garde-fous renforcés contre les régressions de dates/récurrences : mois courts, années bissextiles, timezone locale et off-by-one.
- Garde-fous renforcés contre les divergences entre preload, renderer et handlers Electron main.
- Garde-fous renforcés contre les échecs propres au packaging Electron : assets, DB packagée, chemins `userData`, relancement et persistance.

### Developer Notes

Commandes recommandées avant merge/release :

```bash
npm ci
npm run prisma:generate
npm run typecheck
npm run test:run
npm run test:coverage
npm run test:e2e
npm run release:check
npm run package
npm run make
```

Pour Linux headless/CI :

```bash
xvfb-run --auto-servernum npm run test:e2e
```

### Migration / Compatibility

- Aucune dépendance cloud n'est ajoutée.
- Le comportement reste local-first.
- Les données utilisateur doivent rester dans la DB locale utilisateur, sous `userData/data/app.db` en build packagé.
- Le template `assets/database/app.db` reste un template packagé et ne doit jamais remplacer une DB utilisateur existante.

### Known Follow-ups

- Exécuter la checklist release packagée sur chaque OS cible avant publication stable.
- Ajouter des seuils coverage uniquement par domaine critique si les métriques deviennent suffisamment fiables.
- Transformer les scénarios QA manuels les plus répétitifs en E2E supplémentaires si leur stabilité le justifie.
- Maintenir une issue ouverte pour tout test flaky temporairement marqué.
