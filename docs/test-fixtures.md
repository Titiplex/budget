# Test fixtures and demo datasets

Ce dossier décrit les fixtures communes ajoutées pour stabiliser les tests et les démos locales.

Budget est local-first : les fixtures doivent rester déterministes, sans service externe, sans date dynamique et sans donnée utilisateur réelle.

## Emplacement

```text
src/test/fixtures/demoData.ts       # factories et profils demo typés
src/test/fixtures/testDatabase.ts   # reset DB et seed Prisma de test
prisma/demo/simple-budget.json      # dataset demo simple sérialisé
prisma/demo/advanced-wealth-imports.json
```

## Profils disponibles

### `createSimpleBudgetProfile()`

Profil personnel classique avec :

- comptes courant et épargne ;
- catégories revenus/dépenses ;
- salaire, dépenses et transfert interne ;
- budgets mensuels ;
- récurrence de loyer ;
- objectif d'épargne et scénario de projection.

Il sert aux tests unitaires de domaine, aux composants Vue de base et aux validations rapides du budget personnel.

### `createAdvancedWealthProfile()`

Profil avancé avec :

- multi-devise CAD/USD ;
- compte investissement, portefeuille, actif et passif ;
- snapshot patrimoine ;
- objectifs liés au patrimoine ;
- scénarios pessimiste/base/optimiste ;
- import CSV avec une ligne valide et une ligne invalide.

Il sert aux tests patrimoine, projections, imports, backup/restore et validations manuelles de l'UI.

## Dates déterministes

La clock fixture est fixée à :

```text
2026-05-01T12:00:00.000Z
```

Utiliser :

```ts
import {fixtureClock, stableFixtureDate} from './fixtures/demoData'

const now = fixtureClock.now()
const monthStart = stableFixtureDate('2026-04-01T00:00:00.000Z')
```

Ne pas utiliser `new Date()` directement dans une fixture. Une date réelle rend les tests fragiles, surtout pour les projections, les imports, les récurrences et les snapshots.

## Factories disponibles

`demoData.ts` expose des factories pour les domaines principaux :

- `makeAccount`
- `makeCategory`
- `makeTransaction`
- `makeInternalTransfer`
- `makeBudgetTarget`
- `makeRecurringTransaction`
- `makeAsset`
- `makePortfolio`
- `makeLiability`
- `makeNetWorthSnapshot`
- `makeFinancialGoal`
- `makeProjectionScenario`
- `makeProjectionSetting`
- `makeImportCsvFixture`

Chaque factory accepte des overrides :

```ts
const transaction = makeTransaction({
    key: 'transaction-custom-test-case',
    label: 'Custom deterministic expense',
    amount: 42,
    date: stableFixtureDate('2026-04-10T00:00:00.000Z'),
})
```

Les relations utilisent des clés stables (`accountKey`, `categoryKey`, etc.) plutôt que des IDs Prisma. Les IDs ne sont créés qu'au moment du seed DB.

## Créer une DB de test propre

```ts
import {createAdvancedWealthProfile} from './fixtures/demoData'
import {createCleanTestDatabase} from './fixtures/testDatabase'

const {prisma, seeded} = await createCleanTestDatabase(createAdvancedWealthProfile(), {
    databaseUrl: 'file:./tmp/advanced-fixture.db',
})

const mainAccount = seeded.accounts.get('account-main-chequing')
```

`createCleanTestDatabase` :

1. crée un client Prisma pointant vers la DB demandée ;
2. vide les tables dans un ordre compatible avec les relations ;
3. seed le profil demandé ;
4. retourne les entités créées dans des `Map` indexées par clé fixture.

Si un test fournit déjà un client Prisma, utiliser :

```ts
await resetTestDatabase(prisma)
const seeded = await seedDemoProfile(prisma, createSimpleBudgetProfile())
```

## Utiliser les datasets JSON pour une démo manuelle

Les fichiers dans `prisma/demo` sont des exports sérialisés des deux profils. Ils sont faits pour inspecter ou alimenter un script de seed manuel.

Ces JSON gardent les dates sous forme ISO. Pour les tests automatisés, préférer les factories TypeScript, car elles fournissent directement des `Date` et les helpers relationnels.

## Ajouter une nouvelle fixture

1. Partir d'une factory existante.
2. Donner une `key` explicite et stable.
3. Utiliser une date ISO fixe via `fixtureClock.date(...)`.
4. Ne pas dépendre d'un compte externe, d'un taux de change live, d'une API ou de la date du jour.
5. Ajouter la fixture au profil le plus petit possible.
6. Mettre à jour le JSON demo seulement si le dataset manuel doit aussi exposer ce cas.

## Ce qu'il ne faut pas faire

- Copier des données personnelles ou bancaires réelles.
- Faire dépendre un test de `Date.now()` ou de `new Date()`.
- Créer un dataset massif pour simuler de la performance.
- Coder des fixtures ad hoc dans chaque test quand une factory commune suffit.
- Couvrir artificiellement des champs sans risque produit. Les fixtures doivent protéger les flux critiques : calculs, imports, backup/restore, migrations, patrimoine et projections.
