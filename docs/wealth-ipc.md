# Contrats IPC patrimoine

Les handlers patrimoine suivent le même principe que le reste de l'application : le renderer ne parle jamais directement
à Prisma. Les mutations passent par Electron main via IPC.

## API exposée au renderer

Le preload expose `window.wealth` avec les méthodes suivantes :

| Méthode renderer             | Canal IPC             | Payload                            |
|------------------------------|-----------------------|------------------------------------|
| `listAssets(filters?)`       | `db:asset:list`       | `WealthListFilters` optionnel      |
| `createAsset(input)`         | `db:asset:create`     | `CreateWealthAssetInput`           |
| `updateAsset(id, input)`     | `db:asset:update`     | `id`, `UpdateWealthAssetInput`     |
| `deleteAsset(id)`            | `db:asset:delete`     | `id`                               |
| `listPortfolios(filters?)`   | `db:portfolio:list`   | `WealthListFilters` optionnel      |
| `createPortfolio(input)`     | `db:portfolio:create` | `CreateWealthPortfolioInput`       |
| `updatePortfolio(id, input)` | `db:portfolio:update` | `id`, `UpdateWealthPortfolioInput` |
| `deletePortfolio(id)`        | `db:portfolio:delete` | `id`                               |
| `listLiabilities(filters?)`  | `db:liability:list`   | `WealthListFilters` optionnel      |
| `createLiability(input)`     | `db:liability:create` | `CreateWealthLiabilityInput`       |
| `updateLiability(id, input)` | `db:liability:update` | `id`, `UpdateWealthLiabilityInput` |
| `deleteLiability(id)`        | `db:liability:delete` | `id`                               |

Les types partagés sont dans `src/types/wealth.ts`.

## Validations côté main

Les handlers appliquent une validation minimale avant Prisma :

- les noms sont obligatoires et trimés ;
- les devises sont normalisées en majuscules, avec `CAD` par défaut ;
- les enums inconnues sont refusées ;
- les montants patrimoniaux doivent être positifs ou nuls ;
- les dates optionnelles peuvent être `null`, `''`, `Date` ou une chaîne parsable ;
- les liens optionnels `accountId` et `securedAssetId` doivent pointer vers une ligne existante quand ils sont fournis.

## Résultat de suppression

Les suppressions renvoient un objet stable :

```ts
{
    ok: true, 
        id: number,
        entityType
:
    'asset' | 'portfolio' | 'liability'
}
```

Les erreurs de validation ou Prisma remontent via la promesse IPC rejetée. Le renderer doit afficher `error.message`
plutôt qu'écraser l'erreur.
