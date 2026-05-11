# Release security and recovery checklist

À exécuter avant une release qui touche backups, restore, audit, intégrité, secrets, provenance ou snapshots.

## Tests automatisés

- [ ] `npm run test:run`
- [ ] `npm run typecheck`
- [ ] Tests ciblés sécurité :

```shell
npm run test:run -- src/test/electron/backupEncryption.test.js src/test/electron/secretStore.test.js src/test/electron/integrityCheckService.test.js src/test/electron/recoverySnapshotService.test.js src/test/electron/securityTrustFixtures.test.js src/test/utils/backupIntegrity.test.ts src/test/utils/provenance.test.ts src/test/utils/domainProvenance.test.ts src/test/components/securityRecoveryPanel.test.ts
```

## Vérifications manuelles

- [ ] Exporter un backup JSON non chiffré depuis l’app.
- [ ] Relire ce backup via le flow restore dry-run sans l’appliquer.
- [ ] Exporter un backup chiffré.
- [ ] Restaurer le backup chiffré avec le bon mot de passe.
- [ ] Vérifier qu’un mauvais mot de passe échoue proprement.
- [ ] Tenter un restore avec un backup corrompu et vérifier que l’erreur arrive avant écriture.
- [ ] Lancer le check d’intégrité depuis Paramètres > Sécurité & récupération.
- [ ] Supprimer une entité critique dans une base de test et vérifier qu’un snapshot local est créé.
- [ ] Exporter l’audit log et vérifier qu’il ne contient pas de secret brut.
- [ ] Vérifier que les secrets locaux affichés dans l’UI sont seulement des métadonnées.
- [ ] Vérifier que les textes UI rappellent les limites locales : pas de cloud sync, pas de récupération de mot de passe perdu, snapshots locaux uniquement.
- [ ] Vérifier que les fixtures dans `src/test/fixtures/security` ne contiennent aucune donnée réelle.

## Packaging

- [ ] `npm run release:check`
- [ ] `npm run package`
- [ ] Démarrer le package local et refaire au moins un export JSON, un export chiffré et un restore dry-run.

## Décision release

Ne pas releaser si :

- un mauvais mot de passe peut produire un succès silencieux ;
- un backup corrompu peut atteindre une écriture partielle ;
- un secret brut apparaît dans audit, backup, snapshot ou UI ;
- les messages promettent plus que le modèle local ne garantit ;
- les snapshots ne sont pas créés avant les actions critiques déjà couvertes.
