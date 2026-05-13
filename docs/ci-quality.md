# CI qualité

Le workflow `.github/workflows/ci.yml` exécute les mêmes familles de commandes que celles attendues en local pour éviter les surprises au moment d’une release. Il ne remplace pas une validation fonctionnelle manuelle ciblée, mais il bloque les régressions évidentes : erreur TypeScript, tests unitaires cassés, assets desktop invalides, base packagée non générable ou smoke Electron instable.

## Déclenchement

La CI tourne sur `push`, `pull_request`, `workflow_dispatch` et une exécution planifiée hebdomadaire. Les changements purement documentaires sont ignorés sur `push` et `pull_request` pour éviter de lancer les jobs lourds sans changement applicatif.

Branches surveillées :

- `main`
- `master`
- `epic-8`

`workflow_dispatch` permet aussi de choisir si les E2E Electron doivent tourner. Par défaut, ils tournent.

## Jobs

| Job | Quand | But |
| --- | --- | --- |
| `fast-checks` | PR, push, manuel, schedule | Installation, génération Prisma, typecheck et tests unitaires sur Ubuntu et Windows. |
| `coverage` | Après `fast-checks` | Produit un rapport coverage exploitable en HTML/LCOV/JSON summary sans imposer de seuil global arbitraire. |
| `release-readiness` | Push, manuel, schedule | Exécute `npm run release:check`, donc les checks de release ne restent pas une étape oubliée. |
| `desktop-e2e` | Push, manuel avec `run_e2e=true`, schedule | Lance les smoke tests Electron sous `xvfb` avec diagnostics uploadés en artefacts. |

## Commandes locales équivalentes

Avant une PR ou une release locale, lance au minimum :

```bash
npm ci
npm run prisma:generate
npm run typecheck
npm run test:run
npm run test:coverage
npm run validate:desktop-assets
npm run build:packaged-db
```

Pour reproduire le job release :

```bash
npm run release:check
```

Pour reproduire les E2E desktop :

```bash
npm run test:e2e
```

Sur Linux headless, utilise `xvfb-run` :

```bash
xvfb-run --auto-servernum npm run test:e2e
```

## Artefacts publiés

La CI publie :

- `coverage-html` : dossier `coverage/`, incluant `coverage/index.html` quand le rapport HTML est généré ;
- `electron-e2e-diagnostics` : logs E2E et éventuels screenshots produits par les scripts E2E.

Les artefacts sont conservés 14 jours. En cas d’échec E2E, commence par lire `e2e-artifacts/e2e-ubuntu.log`, puis les screenshots éventuels si le scénario en a généré.

## Politique coverage

Le rapport coverage est un outil de diagnostic, pas un score à maximiser artificiellement. Un pourcentage élevé ne prouve pas que les bons comportements sont protégés.

À chaque revue, privilégie cette checklist qualitative :

- les calculs sensibles ont au moins un test nominal et un cas limite ;
- les erreurs métier importantes sont testées ;
- les parseurs/imports rejettent proprement les entrées invalides ;
- les chemins de backup/restore et migration ont des tests de non-régression ;
- les frontières IPC critiques ont un test de contrat ;
- les fichiers triviaux, bootstrap et wrappers ne polluent pas le signal.

Aucun seuil global n’est imposé dans ce workflow. Si des seuils deviennent utiles, ils doivent être définis par domaine critique, avec une justification claire.

## Notes de coût

Les jobs rapides tournent sur PR. Les jobs lourds (`release-readiness`, `desktop-e2e`) tournent surtout sur push, schedule et exécution manuelle. Cela garde les retours PR raisonnables tout en sécurisant les branches suivies et les releases.
