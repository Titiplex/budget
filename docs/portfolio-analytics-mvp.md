# Portfolio analytics MVP — méthode et limites

Cette page documente les hypothèses du MVP Portfolio analytics. Elle doit être visible pour éviter de donner une impression de précision fiscale ou institutionnelle que l'application ne possède pas encore.

## Méthode de coût moyen

Le MVP utilise une méthode de **coût moyen pondéré**.

- Les achats augmentent la quantité et le coût investi.
- Les frais d'achat sont inclus dans le coût investi.
- Une vente partielle retire du coût au coût moyen disponible juste avant la vente.
- Le gain réalisé simple correspond au produit net de vente moins le coût moyen retiré.
- La plus-value latente correspond à la valeur actuelle moins le coût restant.

Cette méthode est volontairement simple et stable pour l'UI. Elle n'est pas une méthode fiscale complète.

## Valeur de marché vs valeur manuelle

- Une **valeur de marché** provient d'un snapshot de prix local associé à un instrument.
- Une **valeur manuelle** provient d'une saisie utilisateur ou d'une valeur de fallback.
- Une valeur manuelle est utile pour garder le dashboard lisible, mais elle doit rester identifiable comme moins robuste qu'un prix de marché frais.

Le dashboard ne doit jamais masquer la source d'une valorisation.

## Prix stale

Un prix stale est un prix local trop ancien ou explicitement marqué comme `STALE` par la couche market data.

- Il peut encore être utilisé pour afficher une estimation.
- Il doit rester signalé dans les statuts de données.
- Il ne doit pas être présenté comme un prix frais.

## Prix manquant

Une position sans prix de marché et sans fallback manuel reste dans les tableaux et allocations avec un statut incomplet.

Elle ne doit pas être interprétée comme une position valant zéro. Le MVP la garde visible pour forcer l'utilisateur à compléter la donnée.

## Rendement brut simple

Le rendement affiché est un indicateur simple :

```text
(totalUnrealizedGain + realizedGainSimple) / totalCostBasis
```

Il ne s'agit pas d'un TWR, MWR, IRR ou XIRR. Il ne tient pas compte du calendrier précis des flux.

## Hors limites du MVP

- Pas de FIFO/LIFO fiscal configurable.
- Pas de lots fiscaux avancés.
- Pas de benchmark.
- Pas de rebalancing.
- Pas d'optimisation fiscale.
- Pas de provider broker réel dans les tests.
- Pas de performance annualisée.

## Fixtures démo

La fixture `src/test/fixtures/portfolioAnalyticsDemo.js` contient un scénario local démontrable :

- compte d'investissement CAD;
- ETF avec achat multiple et vente partielle;
- action avec prix stale;
- cash;
- dividendes et intérêts;
- frais de gestion;
- actif avec prix manquant;
- historique de snapshots local.
