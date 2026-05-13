# Conventions de dates et récurrences

Cette application manipule surtout des dates métier : date de transaction, date de budget, prochaine occurrence récurrente, date de snapshot ou mois de projection. Ces valeurs ne doivent pas dépendre du fuseau horaire local du runner, de la machine utilisateur ou d’un changement d’heure.

## Règles générales

- Les dates métier sont représentées en `YYYY-MM-DD` dès que l’heure n’a pas de valeur métier.
- Une date `YYYY-MM-DD` est lue comme minuit UTC, pas comme minuit local.
- Les comparaisons de périodes utilisent des bornes inclusives : `startOfUtcDay(startDate)` → `endOfUtcDay(endDate)`.
- Les timestamps ISO complets sont réservés aux traces techniques : audit, export, `createdAt`, `updatedAt`, `generatedAt`.
- Les tests temporels doivent utiliser des dates fixes et ne doivent pas dépendre de `new Date()` sauf quand le test fige explicitement l’horloge.

## Rapports

Les rapports doivent filtrer les transactions par date métier, sans décaler une transaction vers le jour précédent ou suivant.

Contrat attendu :

```text
withinRange('2026-03-31', '2026-03-01', '2026-03-31') === true
withinRange('2026-04-01', '2026-03-01', '2026-03-31') === false
```

La période précédente est calculée avec la même durée inclusive que la période courante. Exemple :

```text
2024-02-01 → 2024-02-29
période précédente : 2024-01-03 → 2024-01-31
```

## Récurrences

La génération des récurrences utilise les helpers UTC côté Electron main :

- `addUtcDays`
- `addUtcWeeks`
- `addUtcMonths`
- `addUtcYears`

Les mois courts sont gérés par clamp sur le dernier jour disponible du mois cible. Le curseur de génération repart de la dernière occurrence générée.

Exemples couverts par tests :

```text
2024-01-31 + 1 mois = 2024-02-29
2023-01-31 + 1 mois = 2023-02-28
2024-02-29 + 1 an = 2025-02-28
2025-12-31 + 1 mois = 2026-01-31
```

Cette règle évite les dates invalides, les boucles infinies et les occurrences fantômes en fin de mois. Une évolution future peut choisir une sémantique d’ancrage différente, mais elle devra changer les tests volontairement.

## Projections mensuelles

Le moteur de projection mensuelle travaille par mois civil. La date de départ est normalisée au premier jour du mois UTC.

Exemple :

```text
startDate = 2024-02-29
projection.startDate = 2024-02-01
mois projetés = 2024-03-01, 2024-04-01, ...
```

Le résultat ne doit pas varier selon la timezone du runner. Les fixtures de projection doivent donc fournir des `YYYY-MM-DD` et vérifier les mois attendus explicitement.

## Checklist pour ajouter un test temporel

Avant d’ajouter ou de modifier une logique de date, vérifier au moins :

- fin de mois 29/30/31 ;
- février en année bissextile et non bissextile ;
- passage décembre → janvier ;
- comparaison de période inclusive ;
- comportement sur une date proche d’un changement d’heure ;
- absence de dépendance à la date réelle du jour ;
- absence de mutation silencieuse entre date métier et timestamp technique.

## Fichiers de régression

Les tests ajoutés pour ces conventions sont :

```text
src/test/fixtures/dateEdgeCaseFixtures.ts
src/test/utils/dateTestHelpers.ts
src/test/utils/dateTimezoneRegression.test.ts
src/test/electron/recurrenceDateRegression.test.js
```
