# Security, recovery and trust fixtures

Ces fixtures servent aux tests de l’epic 7. Elles sont volontairement petites et lisibles pour permettre de reproduire rapidement les cas de backup, restore, intégrité et récupération.

## Fichiers

- `valid-backup-v6.json` : backup v6 minimal mais cohérent, utilisable pour restore dry-run et tests de chiffrement.
- `legacy-backup-v2.json` : ancien format supporté pour vérifier la compatibilité legacy.
- `corrupted-backup.json` : JSON volontairement invalide pour tester les erreurs de parsing/restauration.
- `incoherent-database.json` : dataset incohérent pour tests d’intégrité, avec références manquantes, dates invalides et transfert incomplet.

## Backup chiffré de test

Les tests génèrent le backup chiffré à partir de `valid-backup-v6.json` avec le mot de passe de test `fixture-password`.

Ne pas réutiliser ce mot de passe en production. Il existe uniquement pour rendre les tests reproductibles.

## Règle de sécurité

Aucune fixture ne doit contenir de vrai secret, token, compte bancaire réel, identifiant personnel ou export utilisateur réel.
