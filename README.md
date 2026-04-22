# Budget

Application desktop locale-first pour gérer :

- des comptes
- des catégories
- des transactions
- des budgets par catégorie
- des transactions récurrentes
- des rapports avec comparaison intelligente
- des sauvegardes / restaurations JSON

Le projet est construit avec :

- Electron
- Vue 3
- Vite
- Tailwind CSS
- Prisma
- SQLite

## Principes

- **local-first** : les données sont stockées localement
- **renderer léger** : pas d’accès direct Prisma dans Vue
- **IPC étroit** : la logique base de données reste côté Electron main
- **backup explicite** : export / restauration JSON pour sécuriser les données

## Fonctionnalités

### Comptes

- création, édition, suppression
- types de comptes
- multi-devise
- vue consolidée revenus / dépenses / net

### Transactions

- revenus, dépenses, transferts internes
- édition / suppression
- support des montants source et montants comptables
- support conversion manuelle / automatique

### Budgets

- objectifs par catégorie
- suivi de consommation
- statuts under / near / over

### Récurrences

- templates quotidiens, hebdomadaires, mensuels, annuels
- génération des occurrences dues
- projection rapide sur 30 jours

### Rapports

- résumé de période
- comparaison avec période précédente équivalente
- types de comptes
- catégories
- devises
- insights
- export markdown

### Sauvegarde / import

- export JSON complet
- restauration JSON validée
- import / export CSV selon la section active

## Structure du projet

```text
.
├── electron/
│   ├── db/
│   ├── ipc/
│   ├── main.js
│   └── preload.js
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── src/
│   ├── components/
│   ├── composables/
│   ├── test/
│   ├── types/
│   ├── utils/
│   ├── App.vue
│   ├── input.css
│   └── renderer.js
├── index.html
├── forge.config.js
├── package.json
└── README.md
```

## Installation

````shell
npm install
````

Crée ensuite ton fichier d’environnement :

````shell
cp .env.example .env
````

Sous PowerShell :

````shell
Copy-Item .env.example .env
````

## Base de données

Générer Prisma :

````shell
npm run prisma:generate
````

Créer / synchroniser la base :

````shell
npm run db:push
````

Si tu veux travailler avec des migrations Prisma en dev :

````shell
npm run db:migrate
````

## Lancement en développement

````shell
npm run start
````

## Tests

````shell
npm run test:run
````

## Vérification TypeScript

````shell
npm run typecheck
````

## Packaging

````shell
npm run package
````

Créer les artefacts :

````shell
npm run make
````

## Notes base de données

- en dev, la base SQLite est stockée dans ``prisma/dev.db``
- en build packagé, la base SQLite est stockée dans le répertoire Electron ``userData``

## Sauvegarde

Le format de sauvegarde fiable est le **JSON**.
Le CSV est un format d’échange pratique, mais ce n’est pas le format canonique complet du projet.

## Roadmap courte

Avant `1.0.0`, les priorités sont :

- stabilisation dates / timezone
- solidification des rapports
- UX transferts internes
- validation backup / restore
- packaging propre

## Licence

MIT