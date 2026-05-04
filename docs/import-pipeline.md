# Import pipeline MVP

Cette page décrit la pipeline d’import locale de l’epic 6. Elle couvre les CSV, les templates, la preview dry-run, le dédoublonnage, la réconciliation, l’audit et les limites assumées.

## Flux

1. Choisir un CSV local.
2. Choisir un template ou utiliser les aliases par défaut.
3. Parser les lignes brutes.
4. Normaliser les champs utiles.
5. Générer une preview dry-run, sans écriture financière.
6. Détecter les doublons.
7. Produire ou modifier les décisions de réconciliation.
8. Appliquer uniquement les lignes valides.
9. Conserver l’audit : erreurs, warnings, décisions, liens appliqués et métadonnées.

## Champs CSV attendus

Transactions bancaires :

| Champ | Colonnes fréquentes |
| --- | --- |
| `date` | `Date`, `Transaction Date`, `Operation Date` |
| `label` | `Description`, `Label`, `Details`, `Libellé` |
| `amount` | `Amount`, `Montant`, `Total`, `Value` |
| `currency` | `Currency`, `Devise`, `CCY` |
| `accountName` | `Account`, `Compte` |

Broker/exchange :

| Champ | Usage |
| --- | --- |
| `operationType` | BUY, SELL, DIVIDEND, INTEREST, DEPOSIT, WITHDRAWAL |
| `symbol` | Ticker ou crypto asset |
| `isin` | Identifiant titre si disponible |
| `quantity` | Parts ou unités |
| `unitPrice` | Prix unitaire |
| `grossAmount` | Montant brut |
| `cashAmount` | Flux cash net |
| `fees` | Frais |
| `taxes` | Retenue, taxe ou frais réseau selon le fichier |
| `externalRef` | ID broker, trade ID ou transaction hash |

## Templates

Un template définit le mapping colonnes CSV -> champs normalisés. Les templates système ne sont pas édités directement : il faut les dupliquer puis adapter la copie.

Presets fournis :

- broker transactions ;
- broker holdings ;
- dividends/interests ;
- crypto trades ;
- crypto deposits/withdrawals.

Ces presets sont des points de départ. Ils ne garantissent pas une compatibilité universelle avec tous les brokers ou exchanges.

## Preview dry-run

La preview classe les lignes en actions proposées :

- `createTransaction` ;
- `updateTransaction` ;
- `createAssetOperation` ;
- `needsReview` ;
- `skip`.

Elle expose aussi les erreurs, warnings, champs manquants, doublons candidats et compteurs. Une application sans preview active est refusée.

## Doublons

La détection utilise :

- hash de ligne normalisée ;
- même fichier déjà traité ;
- répétitions dans le même batch ;
- matching flou sur date, montant, devise, compte et libellé.

Les doublons probables doivent rester vérifiables avant application.

## Réconciliation

Décisions principales :

- `importAsNew` ;
- `linkToExisting` ;
- `updateExisting` ;
- `markAsDuplicate` ;
- `skip` ;
- `needsManualReview`.

Chaque décision conserve une raison et un historique de statut.

## Audit et backup

La section Imports conserve les batches, erreurs, warnings, doublons, décisions et liens appliqués. Les rapports d’audit peuvent être exportés en Markdown ou CSV.

Le backup JSON v6 inclut les templates utilisateur, sources, historique, décisions et métadonnées d’import. La restauration de l’historique est audit-only : les transactions et assets financiers viennent des sections financières du backup, pas de l’historique d’import. Ce choix évite les doublons évidents.

## Démo et fixtures

CSV de démonstration :

```text
docs/demo/imports/
```

Fixtures de test :

```text
src/test/fixtures/import-presets/
```

Cas couverts : transactions bancaires, broker transactions, holdings, dividendes, exchange trades, fichier cassé, lignes répétées.

## Tests ciblés

```shell
npm run test:run -- src/test/utils/importCsvEngine.test.ts
npm run test:run -- src/test/utils/importCsvPresets.test.ts
npm run test:run -- src/test/utils/importDuplicateDetection.test.ts
npm run test:run -- src/test/utils/importPreviewService.test.ts
npm run test:run -- src/test/utils/importReconciliationEngine.test.ts
npm run test:run -- src/test/electron/importWorkflowIpc.test.js
npm run test:run -- src/test/electron/importPipelineFixtures.test.js
npm run test:run -- src/test/electron/importAuditService.test.js
npm run test:run -- src/test/components/ImportWizardDialog.test.ts
npm run test:run -- src/test/components/ImportHistorySection.test.ts
```

## Limites MVP

Hors périmètre : vrais comptes externes, connecteurs bancaires réels, écriture vers services externes, PDF/OCR, support universel brokers, sync cloud, merge multi-appareils, rollback complet.

La sync externe prévue par l’architecture reste read-only et future-facing dans ce MVP. Elle cadre des contrats de lecture, pas une connexion massive à des institutions financières.
