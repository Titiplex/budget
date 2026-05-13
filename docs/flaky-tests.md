# Flaky tests: suivi, isolation et stabilisation

Une suite de tests instable finit par être ignorée. Cette convention sert à rendre les tests flaky visibles, temporaires et actionnables, surtout pour Electron/E2E.

## Règle générale

Un test ne doit pas être désactivé silencieusement.

Si un test est instable :

1. confirmer que l’échec n’est pas un vrai bug produit ;
2. ouvrir une issue de correction dédiée ;
3. ajouter un marqueur `@flaky` près du test concerné ;
4. limiter la désactivation dans le temps avec une date d’expiration ;
5. corriger la cause racine dès que possible.

Un test critique ne doit pas rester désactivé durablement. Les domaines critiques sont : backup/restore, import, DB locale, migrations, IPC, patrimoine, objectifs/projections, récurrences et packaging Electron.

## Format du marqueur temporaire

Le marqueur doit être placé dans les lignes qui précèdent le test désactivé.

```ts
// @flaky(issue: https://github.com/Titiplex/budget/issues/123, expires: 2026-06-30, reason: "E2E CDP race au premier rendu")
it.skip('ouvre le tableau de bord patrimoine', async () => {
  // ...
})
```

Champs obligatoires :

- `issue` : lien vers l’issue de correction ;
- `expires` : date limite au format `YYYY-MM-DD` ;
- `reason` : cause suspectée ou symptôme observable.

La date d’expiration n’est pas une date de confort. Elle sert à empêcher qu’un test désactivé devienne permanent.

## Audit local

Le script suivant échoue si un test `.only` est commité, ou si un test `.skip` n’a pas de marqueur `@flaky` valide :

```shell
node scripts/check-flaky-tests.cjs
```

Il vérifie notamment :

- `it.only`, `test.only`, `describe.only` ;
- `it.skip`, `test.skip`, `describe.skip` sans issue ;
- marqueur `@flaky` sans date d’expiration ;
- marqueur expiré.

Ce script peut être ajouté dans la CI si la suite commence à accumuler des désactivations temporaires.

## Causes fréquentes

### Attente UI trop courte

Symptômes :

- échec E2E aléatoire sur `document.body.innerText` ;
- bouton non trouvé alors qu’il existe dans une capture ultérieure ;
- CDP disponible mais renderer pas encore hydraté.

Stabilisation :

- attendre une condition fonctionnelle, pas un délai fixe ;
- attendre plusieurs lectures stables quand l’état peut changer ;
- capturer screenshot, URL, texte visible et logs Electron en cas d’échec.

À éviter :

```js
await sleep(1000)
button.click()
```

À privilégier :

```js
await stableRendererEval(cdp, 'Boolean(window.db && document.readyState === "complete")')
```

### Dépendance à l’ordre des tests

Symptômes :

- le test passe seul mais échoue après un autre ;
- état global, fake timers ou mocks non restaurés.

Stabilisation :

- nettoyer les mocks dans `afterEach` ;
- éviter les singletons mutables partagés ;
- utiliser `useFixedTestClock()` seulement dans le scope du test ;
- recréer les fixtures par test.

### DB partagée

Symptômes :

- doublons inattendus ;
- compteurs non déterministes ;
- une suite dépend d’un seed exécuté avant.

Stabilisation :

- utiliser une DB SQLite temporaire par run ;
- ne jamais pointer les E2E vers `prisma/dev.db` ;
- supprimer le dossier temporaire en `finally`.

Helpers disponibles :

```ts
import {createIsolatedSqliteDatabase, withTempDir} from './dateTestHelpers'
```

ou, pour E2E Electron :

```js
const {createE2eRunContext, assertTempDatabasePath} = require('./flakyE2eGuards.cjs')
```

### Date réelle et timezone

Symptômes :

- échec uniquement en fin de mois ;
- différence CI/local ;
- transaction incluse le jour précédent ou suivant ;
- projection mensuelle qui change selon le runner.

Stabilisation :

- utiliser une clock fixe ;
- privilégier les dates `YYYY-MM-DD` interprétées en UTC ;
- tester explicitement les fins de mois, années bissextiles et changements d’année.

Helper recommandé :

```ts
useFixedTestClock('2026-01-15T12:00:00.000Z')
```

### État global

Symptômes :

- `localStorage`, `process.env`, `window` ou fake timers polluent le test suivant.

Stabilisation :

- restaurer `process.env` après modification ;
- limiter les mutations globales au scope du test ;
- éviter de modifier le prototype ou les singletons hors `beforeEach`.

### Fichiers temporaires non nettoyés

Symptômes :

- test qui passe la première fois puis échoue ;
- artefacts E2E polluant `/tmp` ;
- import/backup qui réutilise un fichier ancien.

Stabilisation :

- utiliser un répertoire temporaire unique ;
- supprimer en `finally` ;
- conserver les artefacts seulement en cas d’échec.

## Helpers disponibles

### `src/test/helpers/flakyTestGuards.ts`

Pour tests Vitest/unitaires :

- `useFixedTestClock()` : fake timers avec date stable ;
- `createTempTestDir()` : dossier temporaire unique ;
- `withTempDir()` : cleanup automatique ;
- `createIsolatedSqliteDatabase()` : chemin SQLite et `DATABASE_URL` isolés ;
- `cleanupPaths()` : suppression sûre ;
- `waitForStableCondition()` : attente déterministe sans sleep fragile ;
- `flakyTestName()` : nomme explicitement un test suivi par issue.

### `src/test/e2e/flakyE2eGuards.cjs`

Pour tests Electron/CDP :

- `createE2eRunContext()` : dossier run, DB temporaire, artefacts et logs ;
- `assertTempDatabasePath()` : garde-fou contre `prisma/dev.db` et chemins non temporaires ;
- `attachProcessLogs()` : capture stdout/stderr Electron ;
- `waitFor()` : polling avec message utile ;
- `stableRendererEval()` : condition renderer stable sur plusieurs lectures ;
- `captureRendererDiagnostics()` : screenshot, URL, texte visible, logs ;
- `runWithE2eDiagnostics()` : capture automatique en cas d’échec.

## Procédure de correction

Quand un test est identifié flaky :

1. reproduire avec plusieurs runs locaux ;
2. lire les logs et captures E2E ;
3. isoler la cause : UI, DB, date, filesystem, ordre, réseau, fake timer ;
4. remplacer les sleeps par des attentes fonctionnelles ;
5. isoler la DB ou les fichiers temporaires ;
6. fixer l’horloge si le comportement dépend du temps ;
7. supprimer le `.skip` et le marqueur `@flaky` ;
8. fermer l’issue de correction avec la cause racine.

## Logs E2E attendus

Un échec E2E doit fournir assez de contexte pour comprendre le problème sans rerun immédiat :

- stdout/stderr Electron ;
- URL renderer ;
- `document.readyState` ;
- texte visible du body, tronqué raisonnablement ;
- screenshot PNG si CDP peut le capturer ;
- chemin DB temporaire utilisé ;
- chemin des artefacts de diagnostic.

Les logs ne doivent jamais contenir de secret, token, mot de passe ou vraie donnée bancaire.

## Ce qu’il ne faut pas faire

- convertir un test critique en `it.skip` sans issue ;
- augmenter les timeouts au hasard ;
- ajouter des sleeps fixes pour masquer une race ;
- partager une DB entre suites ;
- dépendre de la date réelle ;
- accepter un test flaky comme “normal” ;
- supprimer un test utile parce qu’il est instable.

## Checklist de stabilisation

Avant de considérer une suite stabilisée :

- [ ] chaque test désactivé a un `@flaky` avec issue et expiration ;
- [ ] aucun `.only` n’est présent ;
- [ ] les tests E2E utilisent une DB temporaire ;
- [ ] les fichiers temporaires sont nettoyés ;
- [ ] les tests de dates utilisent une clock fixe ou des dates explicites ;
- [ ] les attentes UI portent sur des conditions fonctionnelles ;
- [ ] les échecs E2E produisent logs et screenshot ;
- [ ] les tests critiques désactivés ont une priorité de correction claire.
