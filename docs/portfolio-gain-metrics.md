# Portfolio gain metrics MVP

Cette note décrit la méthode retenue pour les gains/pertes du dashboard portefeuille MVP.

## Méthode retenue

Le MVP utilise le **coût moyen pondéré** par position.

- Un achat augmente la quantité détenue et le coût de revient.
- Les frais d'achat sont inclus dans le coût de revient par défaut.
- Une vente retire une partie du coût de revient au coût moyen courant.
- Le gain réalisé simple vaut : `produit net de vente - coût moyen retiré`.
- Le produit net de vente déduit les frais de vente.
- La plus-value latente vaut : `valeur actuelle - coût restant`.

Cette méthode est volontairement simple et déterministe. Elle évite de gérer des lots fiscaux dans le MVP tout en donnant des chiffres lisibles pour l'utilisateur.

## Définitions

### Plus-value latente par position

```text
unrealizedGain = currentValue - remainingAverageCostBasis
unrealizedGainPercent = unrealizedGain / remainingAverageCostBasis
```

Elle n'est calculée que si la position a une valeur actuelle. Une position sans prix de marché ni fallback manuel garde `unrealizedGainLoss = null`, afin de ne pas afficher un faux gain.

### Plus-value réalisée simple

```text
realizedGain = netSaleProceeds - removedAverageCostBasis
```

Le coût retiré lors d'une vente partielle est calculé avec le coût moyen pondéré juste avant la vente.

### Rendement brut simple

```text
grossReturnSimple = (totalUnrealizedGain + realizedGainSimple) / totalCostBasis
```

Le rendement brut simple n'est pas un TWR, un MWR, un IRR ou un XIRR. Il ne tient pas compte du timing exact des flux; il sert seulement d'indicateur lisible dans le MVP.

## Position fermée

Une position fermée a une quantité à `0`, un coût restant à `0` et peut conserver un gain réalisé. Sa plus-value latente est `0` et son gain/perte total correspond au gain réalisé simple.

## Limites assumées

- Pas de FIFO/LIFO configurable.
- Pas de fiscalité des gains en capital.
- Pas de lots fiscaux avancés.
- Pas de rendement annualisé.
- Pas de TWR/IRR/XIRR.
