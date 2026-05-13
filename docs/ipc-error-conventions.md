# IPC contracts and error conventions

Budget garde le renderer léger : le preload expose des fonctions métier ciblées et les handlers Electron main possèdent la logique de validation, de base de données et d'audit. Le renderer ne doit jamais accéder directement à Prisma, à un chemin de base SQLite ou à un objet Electron interne.

## Surface IPC critique

Les domaines IPC critiques sont :

- `db.*` : comptes, catégories, transactions, budgets, récurrences, profils fiscaux et métadonnées fiscales.
- `wealth.*` : actifs, portefeuilles, passifs, snapshots de valeur nette et analytics portefeuille.
- `marketData.*` : instruments, snapshots, freshness, valorisation et watchlist.
- `goals.*` : objectifs financiers, scénarios de projection et estimation du surplus mensuel.
- `imports.*` : batch, parsing CSV, preview dry-run, apply, audit, réconciliation et templates de mapping.
- `backupEncryption.*` : chiffrement, déchiffrement et inspection des backups chiffrés.
- `integrityCheck.*`, `recoverySnapshots.*`, `auditLog.*` : sécurité locale, récupération et audit.
- `file.*` : ouverture/sauvegarde de texte utilisée notamment pour backup/export/import locaux.

Les rapports n'ont pas d'API preload dédiée dans l'état actuel : ils restent côté renderer/utils et utilisent `file.saveText` pour l'export. Ce choix évite d'élargir la surface IPC sans besoin.

## Enveloppe de résultat recommandée

Pour les nouveaux handlers IPC métier, préférer une enveloppe stable :

```ts
interface IpcSuccess<T> {
    ok: true
    data: T
    error: null
}

interface IpcFailure {
    ok: false
    data: null
    error: IpcError
}
```

Les handlers legacy qui retournent directement une entité Prisma peuvent rester compatibles, mais tout nouveau flux sensible devrait utiliser l'enveloppe ci-dessus pour éviter que le renderer dépende d'exceptions brutes.

## Forme d'erreur

Une erreur IPC exploitable doit rester sérialisable et minimale :

```ts
interface IpcError {
    code: string
    message: string
    field: string | null
    recoverable: boolean
    details?: unknown | null
}
```

`details` doit rester petit, explicite et sans secret. Il ne doit pas contenir :

- stack trace ;
- objet `Error` brut ;
- objet Prisma ;
- chemin local sensible inutile ;
- contenu complet d'un backup, d'un CSV ou d'une base ;
- mot de passe, token, clé ou secret.

## Responsabilités par couche

Le preload :

- expose uniquement les APIs listées ;
- transmet les payloads tels quels ;
- ne valide pas les règles métier ;
- ne modifie pas les erreurs normalisées ;
- ne transmet pas l'objet `_event` Electron aux callbacks renderer.

Le main process :

- valide les payloads ;
- applique les règles métier ;
- crée les snapshots/audits requis avant opérations critiques ;
- normalise les erreurs ;
- garde Prisma et les chemins DB hors du renderer.

Le renderer :

- consomme les DTOs exposés ;
- affiche les erreurs normalisées ;
- ne fait pas d'hypothèse sur Prisma, SQLite ou Electron main.

## Ajout d'un nouveau canal IPC

Pour ajouter un canal :

1. ajouter le handler côté Electron main ;
2. exposer une fonction nommée côté preload, pas un canal brut ;
3. documenter le payload et le résultat ;
4. ajouter le chemin de fonction dans `EXPECTED_PRELOAD_API_PATHS` ;
5. ajouter au moins un cas dans `CRITICAL_IPC_FORWARDING_CASES` si le flux est critique ;
6. vérifier les erreurs invalides et techniques avec une enveloppe stable.

Un changement de nom de canal ou de fonction preload doit casser les tests de contrat pour forcer une mise à jour explicite du renderer et des types.
