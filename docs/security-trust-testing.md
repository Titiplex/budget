# Security, recovery and trust testing

Cette page complète le modèle de sécurité local de Budget. Elle décrit les tests et vérifications attendus pour les backups, la restauration, les secrets locaux, l’audit, l’intégrité, la provenance et les snapshots.

Budget est local-first. Ces mécanismes réduisent les risques d’erreur, de corruption ou de perte locale. Ils ne remplacent pas une sauvegarde externe, le chiffrement disque ou un audit indépendant.

## Couverture automatisée

| Domaine | Vérification attendue | Tests concernés |
| --- | --- | --- |
| Secrets locaux | valeurs jamais exposées dans la metadata, fallback local identifié, coffre corrompu géré | `secretStore.test.js` |
| Backups chiffrés | roundtrip, mauvais mot de passe, contenu modifié, version inconnue | `backupEncryption.test.js` |
| Restore dry-run | backup valide, legacy, corrompu, erreurs bloquantes | `restoreDryRun.test.ts`, `securityTrustFixtures.test.js` |
| Intégrité | références manquantes, montants invalides, transferts cassés, audit critique | `integrityCheckService.test.js` |
| Audit log | événements lisibles, export, rétention, pas de secrets | tests audit/import existants |
| Provenance/fraîcheur | fresh, stale, unknown, userProvided, unavailable | `provenance.test.ts`, `domainProvenance.test.ts` |
| Snapshots | création locale, metadata, rétention, nettoyage des clés sensibles | `recoverySnapshotService.test.js` |
| Paramètres sécurité | actions regroupées, check manuel, limites visibles | `securityRecoveryPanel.test.ts` |

## Fixtures

Les fixtures sont dans `src/test/fixtures/security`.

- `valid-backup-v6.json` : backup v6 minimal cohérent.
- `legacy-backup-v2.json` : ancien format supporté.
- `corrupted-backup.json` : JSON invalide pour tester les erreurs avant restore.
- `incoherent-database.json` : dataset cassé pour tests d’intégrité.

Le backup chiffré de test est généré pendant les tests depuis `valid-backup-v6.json` avec le mot de passe `fixture-password`. Ce mot de passe est réservé aux tests.

## Points à prouver

### Backup JSON

Un backup JSON non chiffré est portable et lisible. Il doit être validé avant restore, mais il n’est pas confidentiel.

### Backup chiffré

Un backup chiffré doit cacher le contenu clair, échouer avec un mauvais mot de passe et refuser les fichiers modifiés. Budget ne peut pas récupérer un mot de passe perdu.

### Restore dry-run

Le dry-run est le garde-fou avant écriture. Il doit afficher les erreurs bloquantes, warnings, compteurs et éléments ignorés.

### Audit log

L’audit doit expliquer les actions importantes sans contenir de valeurs secrètes ou dumps inutiles.

### Integrity check

Le check d’intégrité détecte des incohérences applicatives connues. Il ne prouve pas que les données financières sont exactes.

### Provenance et fraîcheur

La provenance indique l’origine et la fraîcheur d’une donnée. Elle ne garantit pas que la source externe était correcte.

### Snapshots locaux

Les snapshots aident à revenir après certaines actions destructrices locales. Ils ne remplacent pas une sauvegarde hors machine.

## Commandes ciblées

```shell
npm run test:run -- src/test/electron/backupEncryption.test.js src/test/electron/secretStore.test.js src/test/electron/integrityCheckService.test.js src/test/electron/recoverySnapshotService.test.js src/test/electron/securityTrustFixtures.test.js src/test/utils/backupIntegrity.test.ts src/test/utils/provenance.test.ts src/test/utils/domainProvenance.test.ts src/test/components/securityRecoveryPanel.test.ts
```

```shell
npm run typecheck
```

## Formulations produit à conserver

- Dire “local”, pas “cloud”.
- Dire “chiffré par mot de passe”, pas “récupérable”.
- Dire “snapshot local”, pas “sauvegarde garantie”.
- Dire “check d’intégrité applicatif”, pas “preuve absolue”.
- Dire “audit lisible”, pas “audit de conformité”.
