# Budget

Application desktop locale-first pour gérer tes finances personnelles sans dépendre d’un service cloud.

Budget permet de suivre :

- des comptes ;
- des catégories ;
- des transactions ;
- des budgets par catégorie ;
- des transactions récurrentes ;
- des rapports avec comparaison intelligente ;
- des objectifs financiers et projections locales ;
- des imports CSV guidés et auditables ;
- des sauvegardes / restaurations JSON.

Le projet est construit avec :

- Electron ;
- Vue 3 ;
- Vite ;
- Tailwind CSS ;
- Prisma ;
- SQLite.

## Sommaire

- [Principes](#principes)
- [Fonctionnalités](#fonctionnalités)
- [Structure du projet](#structure-du-projet)
- [Installation](#installation)
- [Développement](#développement)
- [Tests et validation](#tests-et-validation)
- [Packaging et release](#packaging-et-release)
- [Base de données](#base-de-données)
- [Sauvegarde](#sauvegarde)
- [Contribution](#contribution)
- [Sécurité](#sécurité)
- [Roadmap courte](#roadmap-courte)
- [Licence](#licence)

## Principes

- **local-first** : les données sont stockées localement ;
- **renderer léger** : pas d’accès direct Prisma dans Vue ;
- **IPC étroit** : la logique base de données reste côté Electron main ;
- **backup explicite** : export / restauration JSON pour sécuriser les données ;
- **imports défensifs** : preview dry-run, détection de doublons, réconciliation et audit avant/après application ;
- **sync externe read-only/future** : pas d’écriture vers comptes externes dans le MVP ;
- **projections descriptives** : les calculs dépendent d’hypothèses visibles et ne sont pas des conseils financiers ;
- **i18n systématique** : tout texte visible utilisateur doit passer par les fichiers de traduction.

Le modèle de sécurité et de récupération local est documenté dans [`docs/security-model.md`](docs/security-model.md).
Les tests, fixtures et limites de confiance sont documentés dans [`docs/security-trust-testing.md`](docs/security-trust-testing.md), avec une checklist release dédiée dans [`docs/release-security-checklist.md`](docs/release-security-checklist.md).

## Fonctionnalités

### Comptes

- création, édition, suppression ;
- types de comptes ;
- multi-devise ;
- vue consolidée revenus / dépenses / net.

### Transactions

- revenus, dépenses, transferts internes ;
- édition / suppression ;
- support des montants source et montants comptables ;
- support conversion manuelle / automatique.

### Budgets

- objectifs par catégorie ;
- suivi de consommation ;
- statuts under / near / over.

### Récurrences

- templates quotidiens, hebdomadaires, mensuels, annuels ;
- génération des occurrences dues ;
- projection rapide sur 30 jours.

### Patrimoine

- actifs, portefeuilles et passifs ;
- snapshots de valeur nette ;
- dashboard patrimoine ;
- synthèse objectifs/projections accessible depuis l’app.

### Objectifs et projections

- objectifs financiers locaux ;
- scénarios pessimiste / base / optimiste / personnalisé ;
- moteur pur de projection mensuelle ;
- comparaison de trajectoires ;
- date estimée d’atteinte si calculable ;
- export / restore JSON des objectifs et scénarios.

Les projections sont déterministes : elles indiquent ce que donnent les hypothèses saisies, pas ce qui va forcément arriver. Elles ne remplacent pas un avis financier personnalisé.

Documentation dédiée : [`docs/goals-projections.md`](docs/goals-projections.md).

### Import CSV guidé

- imports CSV locaux sans service externe ;
- templates et presets broker/exchange copiables ;
- preview dry-run avant écriture locale ;
- détection de doublons exacts, probables et dans le même batch ;
- décisions de réconciliation traçables ;
- historique d’import consultable dans l’app ;
- export d’audit Markdown/CSV ;
- fixtures et fichiers démo sans compte externe.

Documentation dédiée : [`docs/import-pipeline.md`](docs/import-pipeline.md).

Fichiers de démonstration : [`docs/demo/imports`](docs/demo/imports).

### Sécurité et récupération locales

- centre “Sécurité & récupération” dans les paramètres ;
- backup JSON et backup chiffré par mot de passe ;
- restore avec dry-run avant écriture ;
- audit log exportable ;
- vérification d’intégrité applicative ;
- snapshots locaux avant actions critiques couvertes ;
- stockage local de secrets exposé uniquement via métadonnées côté renderer.

Limites explicites : pas de cloud sync, pas d’authentification utilisateur intégrée, pas de récupération d’un mot de passe de backup chiffré perdu, et les snapshots locaux ne remplacent pas une sauvegarde externe.

Documentation : [`docs/security-model.md`](docs/security-model.md), [`docs/security-trust-testing.md`](docs/security-trust-testing.md).

### Rapports

- résumé de période ;
- comparaison avec période précédente équivalente ;
- types de comptes ;
- catégories ;
- devises ;
- insights ;
- export markdown.

### Sauvegarde / import

- export JSON complet ;
- restauration JSON validée ;
- import / export CSV selon la section active ;
- import CSV guidé avec preview, dédoublonnage, réconciliation et audit ;
- format backup v6 avec objectifs, scénarios et données d’import documenté dans [`docs/backup-format.md`](docs/backup-format.md).

## Structure du projet

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
├── electron/
│   ├── db/
│   ├── goals/
│   ├── ipc/
│   ├── main.js
│   └── preload.js
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── scripts/
├── src/
│   ├── components/
│   ├── composables/
│   ├── locales/
│   ├── test/
│   ├── types/
│   ├── utils/
│   ├── App.vue
│   ├── input.css
│   └── renderer.js
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
├── index.html
├── forge.config.js
├── package.json
└── README.md
```

## Installation

```shell
npm install
```

Crée ensuite ton fichier d’environnement :

```shell
cp .env.example .env
```

Sous PowerShell :

```shell
Copy-Item .env.example .env
```

## Développement

Générer Prisma :

```shell
npm run prisma:generate
```

Créer / synchroniser la base :

```shell
npm run db:push
```

Si tu veux travailler avec des migrations Prisma en dev :

```shell
npm run db:migrate
```

Lancer l’application :

```shell
npm run start
```

## Tests et validation

Lancer les tests :

```shell
npm run test:run
```

Vérifier TypeScript :

```shell
npm run typecheck
```

Auditer les textes hardcodés visibles utilisateur :

```shell
npm run i18n:audit
```

Build renderer :

```shell
npm run build:vite
```

Tests ciblés import :

```shell
npm run test:run -- src/test/electron/importPipelineFixtures.test.js src/test/electron/importWorkflowIpc.test.js src/test/utils/importCsvPresets.test.ts
```

Tests ciblés sécurité/récupération :

```shell
npm run test:run -- src/test/electron/backupEncryption.test.js src/test/electron/secretStore.test.js src/test/electron/integrityCheckService.test.js src/test/electron/recoverySnapshotService.test.js src/test/electron/securityTrustFixtures.test.js src/test/utils/backupIntegrity.test.ts src/test/utils/provenance.test.ts src/test/utils/domainProvenance.test.ts src/test/components/securityRecoveryPanel.test.ts
```

## Packaging et release

Vérifier le flux desktop complet avant de créer des artefacts :

```shell
npm run release:check
```

Créer un package local lançable :

```shell
npm run package
```

Créer les artefacts installables :

```shell
npm run make
```

Le process complet est documenté dans [`docs/release-flow.md`](docs/release-flow.md).
La checklist sécurité/récupération avant release est dans [`docs/release-security-checklist.md`](docs/release-security-checklist.md).

## Base de données

- en dev, la base SQLite est stockée dans `prisma/dev.db` ;
- en build packagé, un template SQLite est généré dans `assets/database/app.db` avant le packaging ;
- au premier lancement d’un build packagé, ce template est copié vers `userData/data/app.db` ;
- les lancements suivants réutilisent la base de `userData` afin de préserver les données utilisateur.

## Sauvegarde

Le format de sauvegarde fiable est le **JSON**.
Le CSV est un format d’échange pratique, mais ce n’est pas le format canonique complet du projet.

Ne partage jamais publiquement un export réel, une base SQLite réelle ou une capture contenant des données financières personnelles.

## Contribution

Les contributions sont bienvenues. Avant d’ouvrir une issue ou une PR, lis :

- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) ;
- [`CONTRIBUTING.md`](CONTRIBUTING.md) ;
- [`SECURITY.md`](SECURITY.md).

Le dépôt inclut aussi :

- des templates d’issues dans [`.github/ISSUE_TEMPLATE`](.github/ISSUE_TEMPLATE) ;
- un template de pull request dans [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

## Sécurité

Si tu découvres une vulnérabilité, n’ouvre pas d’issue publique avec des détails exploitables. Suis la procédure de [`SECURITY.md`](SECURITY.md).

## Roadmap courte

Avant `1.0.0`, les priorités sont :

- stabilisation dates / timezone ;
- solidification des rapports ;
- UX transferts internes ;
- validation backup / restore ;
- packaging propre.

## Licence

MIT. Voir [`LICENSE`](LICENSE).
