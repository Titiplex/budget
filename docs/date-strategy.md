# Stratégie dates

## Règle de base

Le produit manipule deux familles de valeurs temporelles :

- **dates métier** : transaction.date, exchangeDate, budget.startDate, budget.endDate,
  recurring.startDate, recurring.nextOccurrenceDate, recurring.endDate
- **timestamps techniques** : createdAt, updatedAt, exportedAt

## Convention retenue

### Dates métier

- format canonique en entrée/sortie : `YYYY-MM-DD`
- stockage Prisma/SQLite : `DateTime` correspondant à `YYYY-MM-DDT00:00:00.000Z`
- affichage UI : toujours à partir de cette date métier, jamais à partir de l’heure locale machine

### Timestamps techniques

- format ISO complet
- utilisés uniquement pour l’audit, l’export technique et les métadonnées

## Règles d’implémentation

- ne jamais utiliser `new Date(value)` directement pour une date métier
- toujours passer par les helpers partagés
- toute arithmétique sur les récurrences se fait en UTC
- toute comparaison de période se fait sur des bornes UTC inclusives
- “aujourd’hui” côté UI doit être calculé en date locale (`todayDateOnly()`), pas via `toISOString()`

## Effets attendus

- une transaction enregistrée le 2026-04-24 reste le 2026-04-24
- un rapport ne change pas parce que la machine est en UTC, UTC-4 ou UTC+2
- une récurrence ne glisse pas à cause de DST ou du fuseau