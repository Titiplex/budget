# Market data MVP: tests, fixtures et limites

Cette note décrit le périmètre testé du moteur de market data local-first.

## Ce que le MVP garantit

Le MVP manipule des instruments de marché et des snapshots de prix locaux. Il ne prétend pas fournir un flux temps réel, une exécution d’ordres, du trading, du conseil financier ou une garantie d’exactitude commerciale. Le renderer doit toujours présenter ces données comme des prix connus localement, éventuellement retardés ou obsolètes.

Les tests ajoutés couvrent les comportements critiques avant de construire des analytics de portefeuille par-dessus :

- normalisation d’une quote provider vers le format interne ;
- rejet des prix provider invalides ;
- stockage de snapshots et mise à jour du cache courant de l’instrument ;
- récupération du dernier snapshot exploitable ;
- calcul des statuts de fraîcheur ;
- valorisation via snapshot local ;
- fallback manuel quand aucune donnée de marché n’est exploitable ;
- fallback offline quand le provider échoue ;
- conversion FX quand la devise de cotation diffère de la devise d’affichage ;
- enregistrement des principaux handlers IPC ;
- refresh watchlist sans dépendance réseau réelle.

## Absence de temps réel

Les providers du MVP sont explicitement `local`, `mock` ou équivalents. Un refresh manuel peut créer un nouveau snapshot local, mais l’application ne maintient pas de websocket, ne stream pas de ticks, ne garantit pas de prix intraday, et ne déclenche aucune opération de trading.

L’UI doit afficher une formulation du type “dernier prix local connu” plutôt que “prix actuel”.

## Stratégie offline/cache

La table `PriceSnapshot` est l’historique append-only exploitable offline. La table `MarketInstrument` garde seulement un cache du dernier prix connu pour accélérer l’affichage watchlist.

Ordre de décision recommandé :

1. utiliser le dernier snapshot local exploitable ;
2. si le snapshot existe mais est ancien, l’utiliser en marquant le statut `STALE` ;
3. si le provider échoue, conserver le dernier snapshot local et exposer une erreur recoverable ;
4. si aucune donnée locale n’existe, utiliser le fallback manuel si disponible ;
5. sinon afficher `UNAVAILABLE` sans casser la valeur nette globale.

## Statuts de fraîcheur

- `FRESH` : le prix local est encore dans la fenêtre `staleAfterHours`.
- `STALE` : le prix est ancien mais reste utilisable offline si l’écran accepte les données obsolètes.
- `UNAVAILABLE` : aucun snapshot exploitable n’est disponible.
- `ERROR` : une erreur provider ou une donnée invalide a été observée.
- `UNKNOWN` : le système ne peut pas conclure, généralement sur des données historiques ou importées.

Les contrats TypeScript peuvent aussi exposer `MISSING` ou `EXPIRED`. Ces valeurs sont mappées vers `UNAVAILABLE` ou `STALE` côté stockage Prisma quand nécessaire.

## Comportement en cas d’échec provider

Un provider indisponible, rate-limité ou invalide ne doit pas faire échouer toute la vue Wealth. Le résultat attendu est :

- erreur structurée (`PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, `TIMEOUT`, etc.) ;
- `recoverable: true` quand un retry manuel a du sens ;
- dernier snapshot local retourné comme fallback si disponible ;
- sinon état `FAILED_NO_DATA` ou `UNAVAILABLE`.

Les tests utilisent uniquement des providers mock/local. Aucune API externe ne doit être appelée par la suite de tests.

## Fixtures de démo

Deux fixtures sont fournies :

- `src/test/fixtures/marketDataDemo.js` : données JS prêtes à être utilisées par les tests Vitest et les mocks Prisma ;
- `src/test/fixtures/market-data-demo.json` : petit dataset lisible pour tester ou précharger une watchlist de démonstration côté UI.

Le dataset contient volontairement :

- un instrument frais (`AAPL`) ;
- un instrument stale (`XEQT`) ;
- un instrument dont le provider est offline (`MSFT`) ;
- un instrument désactivé pour vérifier que la watchlist ne liste que `isActive = true`.

## Backup / restore JSON

Le market data fait partie du périmètre de sauvegarde dès lors que l’utilisateur s’attend à une restauration complète du patrimoine. Les snapshots et la watchlist ne doivent pas disparaître silencieusement.

Le helper `src/utils/marketDataBackup.ts` normalise une section JSON `marketData` contenant :

```json
{
  "marketData": {
    "marketInstruments": [],
    "priceSnapshots": []
  }
}
```

Les tests vérifient que :

- les instruments actifs et inactifs sont préservés ;
- `isActive` conserve l’état de watchlist ;
- les snapshots conservent prix, devise, provider, source et fraîcheur ;
- un snapshot qui référence un instrument absent est refusé ;
- un prix nul ou invalide est refusé avant restauration.

L’intégration finale dans le flux d’export/import global doit brancher cette section au format de backup courant. Tant que ce branchement n’est pas fait, la documentation utilisateur doit indiquer que le JSON historique budget v4 ne contient pas encore le cache market data.
