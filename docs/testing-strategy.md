# Testing strategy and release quality gates

Cette stratégie définit les tests attendus pour Budget, les commandes de validation et les critères bloquants avant merge ou release.

Budget est une application desktop local-first. Les tests doivent donc protéger en priorité les calculs financiers, les écritures locales, les backups/restores, les imports, les migrations et le packaging Electron. Ils ne doivent pas chercher à simuler une infrastructure cloud absente du produit.

## Objectifs

- Donner une lecture claire de ce que chaque niveau de test protège.
- Rendre explicites les commandes de validation utilisées en développement, avant merge et avant release.
- Prioriser les flux qui peuvent corrompre ou perdre des données locales.
- Éviter la couverture artificielle : un test utile prouve un comportement critique, pas seulement qu'une ligne a été exécutée.

## Pyramide de tests

| Niveau | Cible | Risques protégés | Exemples de vérifications attendues |
| --- | --- | --- | --- |
| Unitaires domaine | Fonctions pures métier et calculs financiers | erreurs de montants, périodes, arrondis, statuts ou agrégations | budgets, patrimoine, projections, rapports, récurrences, règles de catégories |
| Unitaires utils/composables | Helpers TypeScript, formatters, validateurs, composables Vue | régressions de parsing, normalisation, formatage ou état dérivé | dates, devises, CSV, JSON backup, provenance, préférences UI |
| Services Electron main | Services qui lisent/écrivent la DB ou le disque | corruption locale, mauvaise gestion des erreurs, secrets exposés, chemins invalides | backups, restore dry-run, snapshots, intégrité, imports, packaged DB |
| IPC | Contrats entre renderer/preload/main | payloads invalides, exposition excessive, erreurs non propagées | canaux étroits, validation d'entrée, mapping d'erreur, absence d'accès Prisma côté Vue |
| Composants Vue | Interfaces qui orchestrent les actions utilisateur | mauvais état affiché, action critique déclenchée sans garde-fou, régression d'accessibilité basique | panneaux sécurité/récupération, imports, budgets, projections, patrimoine |
| E2E Electron | Parcours desktop dans une app buildée | rupture d'intégration entre Vite, Electron, preload, DB et UI | smoke test, flux patrimoine, création/lecture de données locales, persistance simple |
| Packaging/release | Préparation des artefacts desktop | build incomplet, assets manquants, DB packagée invalide, risque d'écraser une DB utilisateur | assets Electron, template SQLite, release check, package local lançable |

## Commandes de validation

### `npm run typecheck`

Commande rapide de sécurité TypeScript. Elle doit passer avant merge pour toute modification TypeScript, Vue, preload ou Electron main.

Elle protège principalement :

- les contrats entre modules ;
- les types des props/composables ;
- les payloads IPC typés côté renderer ;
- les régressions évidentes après refactor.

### `npm run test:run`

Suite Vitest non interactive. C'est la commande de base pour valider les tests unitaires, composants et services existants.

Elle doit rester suffisamment rapide pour être lancée fréquemment en local.

### `npm run test:coverage`

Suite Vitest avec couverture. Elle sert à détecter les zones critiques non exercées, pas à viser un pourcentage arbitraire.

Une baisse de couverture sur une zone sensible doit être expliquée ou corrigée. Une hausse de couverture obtenue par des tests triviaux n'est pas une amélioration réelle.

### `npm run test:e2e`

Suite E2E Electron. Elle exécute les parcours desktop qui prouvent que l'application fonctionne hors navigateur, avec le renderer buildé et le runtime Electron.

Elle est plus coûteuse que Vitest et doit être utilisée comme garde d'intégration, pas comme substitut aux tests unitaires.

### `npm run release:check`

Commande de validation release. Elle regroupe la génération Prisma, le typecheck, les tests unitaires, la validation des assets desktop et la génération du template DB packagé.

Elle est bloquante avant tout tag ou artefact destiné à être partagé.

## Garde qualité avant merge

Avant de merger une branche de travail dans `epic-8` ou dans une branche de release, les validations suivantes sont bloquantes :

1. `npm run typecheck`
2. `npm run test:run`
3. Tests ciblés liés à la zone modifiée, si la suite complète ne suffit pas à isoler le risque.
4. Relecture des fixtures ajoutées ou modifiées.
5. Documentation mise à jour quand le comportement utilisateur, le format de données ou le flux release change.

`npm run test:coverage` est attendu avant merge si la modification touche une zone critique ou ajoute une logique métier non triviale.

`npm run test:e2e` est attendu avant merge quand la modification touche :

- Electron main, preload ou IPC ;
- le démarrage de l'application ;
- la persistance locale ;
- un parcours utilisateur critique ;
- le build Vite ou le packaging desktop.

Un merge ne doit pas être bloqué par l'absence de tests sur du texte statique, du style isolé ou une refonte purement visuelle sans logique, sauf si la modification masque une action critique.

## Garde qualité avant release

Avant une release, les validations suivantes sont bloquantes :

1. `npm run typecheck`
2. `npm run test:run`
3. `npm run test:coverage`
4. `npm run test:e2e`
5. `npm run release:check`
6. Vérification manuelle d'un package local sur un profil utilisateur propre.
7. Vérification que les données locales existantes ne sont pas écrasées lors d'un relancement ou d'une mise à jour.
8. Relecture des documents release, sécurité/récupération et formats de sauvegarde si l'un de ces périmètres a changé.

Une release doit être stoppée si un des points suivants est observé :

- restore ou backup non fiable ;
- migration DB risquant de perdre des données ;
- import pouvant écrire des doublons ou des montants incohérents sans avertissement ;
- E2E Electron cassé ;
- assets desktop manquants ;
- template SQLite absent, vide ou non régénéré après changement Prisma ;
- divergence entre l'app packagée et le comportement en développement ;
- erreur connue non documentée dans un flux critique.

## Zones à risque et couverture attendue

### Patrimoine

Le patrimoine agrège actifs, portefeuilles, passifs, snapshots et valeur nette. Les tests doivent couvrir :

- les agrégations positives/négatives ;
- les comptes multi-types ;
- les snapshots de valeur nette ;
- les cas vides ;
- les valeurs nulles, manquantes ou supprimées.

Les tests utiles vérifient les résultats financiers et les transitions d'état, pas seulement le rendu d'un libellé.

### Analytics portefeuille

Les analytics de portefeuille doivent être protégés par des tests de calcul déterministes :

- allocations ;
- variation de valeur ;
- répartition par classe, compte ou devise ;
- handling des données absentes ou stale ;
- cohérence des arrondis.

Les assertions doivent porter sur les agrégats et les hypothèses, pas sur des détails de présentation fragiles.

### Projections

Les projections sont sensibles parce qu'elles peuvent influencer des décisions utilisateur. Les tests doivent prouver :

- le caractère déterministe du moteur ;
- les scénarios pessimiste/base/optimiste/personnalisé ;
- les limites quand une date d'atteinte est incalculable ;
- les hypothèses visibles ;
- l'absence de promesse financière implicite.

Les projections doivent rester descriptives : le test vérifie la transformation des hypothèses, pas une prédiction réelle.

### Imports

Les imports sont une zone critique car ils écrivent en masse dans la DB locale. Les tests doivent couvrir :

- parsing CSV ;
- presets/templates ;
- preview dry-run ;
- détection de doublons exacts, probables et intra-batch ;
- réconciliation ;
- audit avant/après application ;
- rollback ou refus propre en cas d'erreur bloquante.

Un import ne doit pas être validé uniquement par un test de rendu. Il faut prouver ce qui est écrit, ignoré, signalé et audité.

### Backup/restore

Backup et restore sont bloquants pour la confiance du produit. Les tests doivent couvrir :

- roundtrip JSON ;
- versions legacy supportées ;
- fichiers corrompus ;
- références pendantes ;
- dry-run avant écriture ;
- erreurs bloquantes vs warnings ;
- backups chiffrés si le flux est concerné ;
- absence d'exposition de secrets dans les erreurs et metadata.

Le restore doit échouer tôt et clairement quand les données sont incohérentes.

### Migrations DB

Les migrations et changements Prisma doivent être traités comme des changements à haut risque. Les tests ou checks associés doivent vérifier :

- compatibilité avec une base existante ;
- conservation des données utilisateur ;
- génération Prisma ;
- template DB packagé ;
- chemins de DB en développement et en build packagé ;
- absence d'écrasement de la DB dans `userData`.

Tout changement de `prisma/schema.prisma` doit déclencher une attention particulière sur `npm run release:check`.

### Packaging desktop

Le packaging prouve que l'application fonctionne dans son vrai mode de distribution. Les checks doivent couvrir :

- build Vite ;
- génération Prisma ;
- présence et validité des icônes ;
- création du template SQLite ;
- lancement d'un package local ;
- persistance après fermeture/réouverture ;
- comportement sur profil utilisateur propre.

Un test navigateur ne remplace pas un E2E Electron ni un package local.

## Conventions de fixtures et datasets

Les fixtures doivent être lisibles, petites et orientées risque.

### Nommage

- Utiliser des noms explicites : `valid-backup-v6.json`, `corrupted-backup.json`, `portfolio-multi-currency.json`.
- Éviter les noms vagues comme `data.json`, `test1.csv` ou `mock-final-final.json`.
- Inclure la version du format quand elle fait partie du comportement testé.

### Taille

- Préférer plusieurs petites fixtures ciblées plutôt qu'un dataset massif partagé partout.
- Garder les gros datasets uniquement pour les tests d'import ou de performance locale quand ils sont justifiés.
- Ne pas dupliquer une fixture si un builder de test rend le scénario plus clair.

### Données financières

- Utiliser des montants simples pour les calculs de base.
- Ajouter des montants limites quand le risque porte sur les arrondis, les devises ou les signes.
- Nommer clairement les comptes, catégories et transactions pour que l'échec d'assertion soit compréhensible.

### Données locales et confidentialité

- Ne jamais inclure de vraie donnée bancaire, clé API, token, secret, email personnel ou chemin machine réel.
- Utiliser des identifiants factices stables.
- Documenter les mots de passe de test quand un backup chiffré est généré pour une fixture.

### Évolution

Une fixture doit évoluer avec le comportement qu'elle protège. Si une fixture est modifiée, la PR ou le commit doit expliquer :

- le risque couvert ;
- ce qui change dans le format ;
- si le changement est rétrocompatible ;
- quels tests échoueraient si le comportement régressait.

## Règle anti-couverture artificielle

La couverture est un outil de diagnostic, pas un objectif produit.

À privilégier :

- calculs financiers sensibles ;
- écritures DB ;
- migrations ;
- backups/restores ;
- imports ;
- IPC ;
- projections ;
- erreurs utilisateur récupérables ;
- packaging et démarrage desktop.

À éviter :

- tests qui recopient l'implémentation ;
- snapshots de composants trop larges ;
- tests de getters triviaux sans logique ;
- assertions sur du texte décoratif instable ;
- mocks si profonds qu'ils ne prouvent plus le comportement réel ;
- tests ajoutés uniquement pour faire monter un pourcentage global.

Une ligne non couverte dans une zone non critique peut être acceptable. Une ligne couverte dans un flux critique peut rester insuffisante si le test ne vérifie pas les erreurs, les cas limites et les effets de bord.

## Spécificités local-first

La stratégie de test doit respecter le fonctionnement local-first de Budget :

- pas de dépendance à un service cloud pour valider un flux principal ;
- pas de test qui suppose une synchronisation distante ;
- pas de vraie donnée externe obligatoire dans les fixtures ;
- pas de secret réel ;
- priorité aux fichiers locaux, à SQLite, aux chemins `userData` et aux backups explicites ;
- comportement hors ligne considéré comme normal, pas comme un mode dégradé.

Quand une intégration externe future sera ajoutée, elle devra être testée comme une source optionnelle, faillible et non canonique. La donnée locale reste la source de vérité de l'application.

## Matrice de décision rapide

| Changement | Validation minimale | Validation renforcée |
| --- | --- | --- |
| Texte/doc uniquement | relecture | aucun test automatisé requis sauf lien ou exemple exécutable |
| Style Vue isolé | `npm run typecheck` si fichier Vue modifié | test composant si action critique visible |
| Composable/helper | `npm run typecheck`, `npm run test:run` ciblé | `npm run test:coverage` si logique sensible |
| Calcul financier | `npm run typecheck`, `npm run test:run` | cas limites + coverage |
| Service Electron main | `npm run typecheck`, `npm run test:run` ciblé | E2E si impact démarrage/persistance |
| IPC/preload | `npm run typecheck`, tests IPC | `npm run test:e2e` |
| Import/backup/restore | `npm run test:run`, fixtures dédiées | coverage + E2E si flux UI touché |
| Prisma/migration | `npm run typecheck`, tests services | `npm run release:check`, package local |
| Packaging/assets | `npm run release:check` | package local lancé manuellement |

## Définition de fini

Une modification est considérée prête quand :

- le niveau de test correspond au risque ;
- les commandes bloquantes adaptées ont été exécutées ;
- les fixtures sont compréhensibles et non sensibles ;
- les erreurs critiques sont testées, pas seulement les happy paths ;
- la documentation est à jour ;
- le comportement local-first est préservé.
