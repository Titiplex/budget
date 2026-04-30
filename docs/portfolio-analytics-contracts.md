# Portfolio analytics contracts

Cette note fixe les conventions de calcul utilisées par les contrats partagés de portefeuille. Le module concerné est `src/types/portfolio.ts`; il doit rester utilisable côté Electron main, services métier et renderer Vue sans dépendance à Prisma, Electron, Vue ou un provider externe.

## Périmètre MVP

Le MVP expose des formes stables pour :

- les actifs (`PortfolioAsset`) ;
- les positions (`PortfolioPosition`) ;
- les mouvements (`PortfolioMovement`) ;
- les valorisations (`PortfolioValuation`) ;
- les gains/pertes (`PortfolioGainLoss`) ;
- les allocations (`PortfolioAllocation`) ;
- les revenus (`PortfolioIncome`) ;
- les frais (`PortfolioFee`) ;
- les snapshots de portefeuille (`PortfolioSnapshot`).

Ces contrats décrivent les données nécessaires au dashboard. Ils ne lancent aucun calcul de performance avancé, aucun appel market data et aucune opération de trading.

## Statuts de valorisation

Les statuts sont volontairement explicites et minuscules pour l’UI :

- `market` : valeur calculée avec un prix de marché exploitable ;
- `manual` : valeur saisie ou importée manuellement ;
- `stale` : valeur de marché ancienne mais encore affichable ;
- `missing` : aucune valeur exploitable ;
- `error` : erreur pendant la valorisation ou donnée incohérente.

L’UI doit afficher les positions `stale`, `missing` et `error` sans casser le total global. Une position sans valeur de marché peut contribuer à `0` au total, mais doit garder un avertissement lisible dans le snapshot.

## Regroupements supportés

Les allocations peuvent être regroupées par :

- actif ;
- compte ;
- classe d’actifs ;
- secteur ;
- géographie ;
- devise.

Les clés non renseignées doivent être rangées dans `unclassified` côté helper, puis traduites proprement dans l’UI.

## Conventions de calcul

- Les devises sont normalisées en ISO-like 3 lettres majuscules (`CAD`, `USD`, `EUR`). Une devise invalide retombe sur `CAD` par défaut ou sur le fallback fourni.
- Les montants monétaires sont arrondis à 2 décimales par défaut. Les helpers acceptent une précision explicite quand un calcul intermédiaire en a besoin.
- Les pourcentages d’allocation utilisent uniquement les valeurs de marché positives dans le dénominateur implicite. Une valeur négative garde sa valeur affichée, mais contribue à `0 %` dans l’allocation MVP.
- Les gains/pertes valent `marketValue - bookValue`. Le pourcentage est `null` quand le coût de base vaut `0`, afin d’éviter un faux infini.
- L’agrégation par clé est pure, déterministe et indépendante de la base de données.

## Hors périmètre

- calcul annualisé, TWR, MWR ou IRR ;
- fiscalité avancée ;
- conversion FX historique ;
- provider market data réel ;
- rendu UI complet.
