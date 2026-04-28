# Domaine patrimoine

Ce document clarifie la première couche patrimoine introduite pour l’Epic 2.

## Frontière avec le domaine budget

Le domaine budget existant reste responsable des flux de trésorerie :

- `Account` décrit où les transactions budget ont lieu.
- `Transaction` enregistre revenus, dépenses et transferts.
- `Category`, `BudgetTarget` et `RecurringTransactionTemplate` restent des concepts de budget/reporting.

Le domaine patrimoine est séparé et représente une valorisation à date donnée :

- `Asset` stocke les actifs autonomes valorisés manuellement : immobilier, véhicules, parts privées, objets de collection, etc.
- `Portfolio` stocke les enveloppes d’investissement : courtage, retraite, crypto, épargne investie, etc.
- `HoldingLot` stocke les positions manuelles dans un portefeuille.
- `PriceSnapshot` stocke les prix unitaires manuels ou importés pour les positions.
- `Liability` stocke les dettes et peut optionnellement être garantie par un actif autonome.
- `NetWorthSnapshot` stocke les points historiques agrégés de valeur nette.

Les liens optionnels de `Portfolio` et `Liability` vers `Account` ne sont que des ponts de réconciliation. Ils ne doivent pas faire des transactions budget la source de vérité de la valorisation patrimoniale.

## Règles de valorisation MVP

Pour le premier MVP, toutes les valeurs sont manuelles sauf indication contraire via `valuationMode` :

- les actifs autonomes utilisent `Asset.currentValue` ;
- les portefeuilles peuvent utiliser `Portfolio.currentValue` pour une valorisation agrégée manuelle ;
- un mode calculé pourra ensuite sommer `Portfolio.cashBalance` et `HoldingLot.marketValue` ;
- les dettes utilisent `Liability.currentBalance` ;
- la valeur nette vaut `totalAssets - totalLiabilities` dans la devise du snapshot.

La conversion de devises n’est volontairement pas résolue dans cette issue de schéma. Les snapshots persistent leur devise d’affichage/reporting et peuvent conserver des chaînes JSON de détail pour l’audit.

## Pourquoi ajouter HoldingLot et PriceSnapshot maintenant

Ils sont inclus dès maintenant parce que la forme de base de données est peu coûteuse à poser et plus coûteuse à rétrofiter plus tard. Ils ne nécessitent aucune API externe : `PriceSnapshot.source = MANUAL` couvre le MVP, tandis que `IMPORTED` et `API` réservent seulement une trajectoire future.
