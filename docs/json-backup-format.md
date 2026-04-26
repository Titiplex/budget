# Format de backup JSON

Le JSON est le format canonique de sauvegarde complète de Budget. Le CSV reste un format d’échange partiel.

## Version

- `kind`: `budget-backup`
- version courante: `4`
- versions lues: `2`, `3`, `4`

Un fichier doit déclarer explicitement `kind`, `version`, `exportedAt` et `data`. Une version inconnue est refusée avec un message clair.

## Collections

`data` contient:

- `accounts`
- `categories`
- `budgetTargets`
- `recurringTemplates`
- `transactions`
- `taxProfiles`

Pour les versions `2` et `3`, les champs fiscaux ajoutés ensuite sont optionnels. Le parseur les complète avec des valeurs neutres comme `[]`, `null`, `STANDARD` ou `UNKNOWN`.

## Validation

Avant restauration, le parseur vérifie:

- JSON lisible;
- version supportée;
- tableaux attendus;
- types scalaires des champs;
- identifiants entiers positifs;
- montants attendus positifs;
- dates journalières au format `YYYY-MM-DD`;
- références entre comptes, catégories, budgets, récurrences et transactions;
- cohérence des transferts internes avec une jambe `OUT`, une jambe `IN` et des comptes pairs croisés;
- absence de doublons d’identifiants dans chaque collection.

Un fichier invalide échoue avant l’écran de prévisualisation quand l’erreur est structurelle. Les erreurs indiquent le champ ou la relation en cause quand c’est possible.

## Garanties

- Un export JSON courant peut être relu par l’application.
- Les backups `2` et `3` restent acceptés.
- Un format corrompu ou incohérent est refusé avant restauration.
- Les profils fiscaux et les métadonnées fiscales sont inclus dans le snapshot et réappliqués pendant la restauration.

## Limites

- Les versions antérieures à `2` ne sont pas supportées.
- Les champs inconnus sont ignorés.
- La restauration est une opération applicative côté renderer, pas une transaction SQLite globale.
