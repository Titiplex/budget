# Contribuer à Budget

Merci de vouloir contribuer à Budget. Ce projet est une application desktop locale-first de gestion financière personnelle, construite avec Electron, Vue 3, Prisma et SQLite.

## Avant de commencer

Assure-toi d’avoir lu :

- [`README.md`](README.md) pour l’installation, les commandes et la structure du projet ;
- [`SECURITY.md`](SECURITY.md) pour les règles de signalement de vulnérabilités ;
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) pour les règles de contribution.

## Préparer l’environnement

```shell
npm install
cp .env.example .env
npm run prisma:generate
npm run db:push
```

Sous PowerShell :

```shell
Copy-Item .env.example .env
```

Lancer l’application :

```shell
npm run start
```

## Branches et workflow

- Crée une branche dédiée pour chaque changement.
- Garde les pull requests petites et ciblées.
- Évite de mélanger refactor, UI, migrations et fonctionnalités dans la même PR.
- Documente les changements visibles utilisateur dans la description de PR.

Exemples de noms de branche :

```text
fix/import-duplicates
feature/goals-scenarios
chore/update-docs
```

## Qualité attendue

Avant d’ouvrir une PR, lance au minimum :

```shell
npm run typecheck
npm run test:run
npm run build:vite
```

Pour les changements sensibles avant release :

```shell
npm run release:check
```

Si tu touches l’i18n, lance aussi :

```shell
npm run i18n:audit
```

## Tests

Ajoute ou adapte les tests quand tu modifies :

- la logique métier ;
- les imports CSV ;
- les sauvegardes/restaurations ;
- les projections/objectifs ;
- les flux de sécurité/récupération ;
- les composants avec comportement utilisateur non trivial.

Les tests ciblés utiles sont listés dans le README.

## Internationalisation

Tout texte visible utilisateur doit passer par le système i18n, même si le texte est identique en français et en anglais. C’est important pour pouvoir ajouter d’autres langues plus tard.

À éviter dans les composants :

```vue
<button>Save</button>
```

À préférer :

```vue
<button>{{ t('common.save') }}</button>
```

## Base de données et Prisma

- Ne modifie pas le schéma Prisma sans expliquer la migration attendue.
- Ne casse pas les données existantes sans chemin de migration clair.
- Les changements liés aux données doivent être couverts par tests ou scénario de validation manuel.

## Sécurité

N’ouvre pas d’issue publique avec des détails exploitables sur une vulnérabilité. Suis [`SECURITY.md`](SECURITY.md).

Ne commit jamais :

- secrets ;
- tokens ;
- fichiers `.env` réels ;
- bases SQLite personnelles ;
- exports contenant des données financières réelles.

## Style de PR

Une bonne PR contient :

- le contexte du problème ;
- la solution appliquée ;
- les fichiers ou zones impactés ;
- les commandes de validation lancées ;
- les limites connues ;
- des captures si le changement est visuel.

## Revue

Les mainteneurs peuvent demander des ajustements sur :

- la lisibilité ;
- la couverture de tests ;
- la compatibilité locale-first ;
- la sécurité ;
- l’i18n ;
- la cohérence UX.

Les retours de revue font partie du processus normal, pas d’un jugement personnel.
