# Scénarios QA manuels

Ces scénarios complètent les tests automatisés. Ils servent à repérer les régressions visibles, les incohérences UX, les erreurs de persistance locale et les ruptures de workflow qui se voient mieux dans une vraie session desktop.

Ils ne remplacent pas `npm run check`, `npm run test:e2e` ou la checklist de release packagée. Pour une release candidate, exécuter ces scénarios en plus de `docs/release-qa-checklist.md`.

## Principes

- Utiliser une base de test dédiée, jamais la DB utilisateur principale.
- Noter l’OS, la version de Node, la version de l’app et le dataset utilisé.
- Ne pas corriger les données en cours de scénario sans le noter.
- Vérifier les données après fermeture/réouverture quand le scénario touche la persistance.
- Capturer une capture écran pour tout bug visuel, message d’erreur ou état incohérent.
- Privilégier les dates fixes indiquées dans les scénarios pour éviter les faux positifs liés au jour courant.

## Datasets disponibles

| Dataset | Usage recommandé |
| --- | --- |
| `npm run db:seed` | Budget personnel simple, comptes, catégories, transactions de base. |
| `npm run db:seed:goals` | Objectifs financiers et scénarios de projection. |
| `npm run db:seed:imports` | Historique et templates d’import. |
| `prisma/demo/simple-budget.json` | Dataset simple si les fixtures demo de l’epic 8 sont présentes. |
| `prisma/demo/advanced-wealth-imports.json` | Dataset avancé patrimoine, multi-devise et imports si les fixtures demo de l’epic 8 sont présentes. |
| `src/test/fixtures/import-csv/*.csv` | Fixtures CSV réalistes pour import manuel si elles sont présentes. |
| `src/test/e2e/fixtures/advanced-import.csv` | Fixture E2E avancée d’import si elle est présente. |

Si un dataset optionnel n’existe pas encore dans la branche locale, utiliser les scripts `db:seed*` existants ou créer les lignes manuellement en suivant les étapes.

## Préparation commune

1. Partir d’un clone propre ou d’une branche de travail dédiée.
2. Installer les dépendances :

   ```shell
   npm install
   ```

3. Générer Prisma :

   ```shell
   npm run prisma:generate
   ```

4. Préparer une DB isolée. Exemple macOS/Linux :

   ```shell
   export BUDGET_DATABASE_PATH="$(pwd)/.qa/manual-qa.db"
   rm -f "$BUDGET_DATABASE_PATH"
   npm run db:push
   ```

   Exemple PowerShell :

   ```powershell
   $env:BUDGET_DATABASE_PATH = "$PWD\.qa\manual-qa.db"
   Remove-Item $env:BUDGET_DATABASE_PATH -ErrorAction SilentlyContinue
   npm run db:push
   ```

5. Lancer l’app :

   ```shell
   npm run start
   ```

6. Après chaque scénario qui modifie les données, fermer puis rouvrir l’app si le résultat attendu inclut une vérification de persistance.

## Smoke manual 10 minutes

À utiliser pour valider rapidement une branche avant de continuer le développement.

### Prérequis

- DB isolée vide.
- App lancée en mode desktop.

### Étapes

1. Vérifier que l’app démarre sans erreur visible.
2. Créer un compte `QA Chèques` en `CAD`.
3. Créer une catégorie de dépense `QA Épicerie`.
4. Créer une transaction de dépense de `42.50 CAD` datée `2026-01-15`.
5. Ouvrir la section Transactions et vérifier que la transaction apparaît.
6. Modifier la transaction à `45.00 CAD`.
7. Supprimer la transaction.
8. Créer un budget mensuel `QA Épicerie mensuel` de `300 CAD` pour la catégorie `QA Épicerie`.
9. Ouvrir Rapports et vérifier que la page s’affiche sans erreur.
10. Fermer puis rouvrir l’app et vérifier que le compte, la catégorie et le budget persistent.

### Résultat attendu

- Aucun écran blanc.
- Aucun message d’erreur inattendu.
- Les créations, modifications et suppressions se reflètent immédiatement dans l’UI.
- Les données non supprimées persistent après redémarrage.

### Bugs fréquents à surveiller

- Formulaire qui reste bloqué en état `saving`.
- Section qui ne se rafraîchit pas après création.
- Montants formatés avec une mauvaise devise.
- Données créées dans la mauvaise DB.

## Scénario 1 — Budget personnel simple

### Prérequis

- DB isolée vide ou dataset `npm run db:seed`.
- Date de référence : janvier 2026.

### Dataset à utiliser

- Recommandé : `npm run db:seed`.
- Alternative manuelle : un compte courant CAD, une catégorie revenu, deux catégories dépenses.

### Étapes

1. Créer ou vérifier un compte courant `Compte courant QA` en `CAD`.
2. Créer les catégories `Salaire QA`, `Loyer QA`, `Épicerie QA`.
3. Créer un revenu `Salaire QA` de `3200 CAD` daté `2026-01-01`.
4. Créer une dépense `Loyer QA` de `1200 CAD` datée `2026-01-02`.
5. Créer une dépense `Épicerie QA` de `180 CAD` datée `2026-01-10`.
6. Ouvrir Vue d’ensemble.
7. Ouvrir Rapports avec la période `2026-01-01` → `2026-01-31`.

### Résultat attendu

- La Vue d’ensemble affiche un solde net positif cohérent.
- Les rapports comptent 3 transactions.
- Les revenus valent `3200 CAD`.
- Les dépenses valent `1380 CAD`.
- Le net vaut `1820 CAD`.

### Bugs fréquents à surveiller

- Revenu et dépense inversés.
- Transaction hors période à cause d’un décalage timezone.
- Résumé non recalculé après ajout.

## Scénario 2 — Multi-compte et multi-devise

### Prérequis

- DB isolée.
- Aucun service de taux externe requis.

### Dataset à utiliser

- `prisma/demo/advanced-wealth-imports.json` si disponible.
- Sinon, créer les données manuellement.

### Étapes

1. Créer un compte `QA Banque CAD` en `CAD`.
2. Créer un compte `QA Banque EUR` en `EUR`.
3. Créer une dépense en EUR sur le compte EUR.
4. Créer une dépense en USD comptabilisée en CAD avec conversion manuelle sur le compte CAD.
5. Ouvrir Rapports.
6. Vérifier la section devises étrangères.

### Résultat attendu

- Les comptes gardent leur devise propre.
- La transaction multi-devise conserve `sourceAmount`, `sourceCurrency`, montant comptabilisé et taux.
- Les rapports exposent les transactions en devise étrangère sans mélanger les totaux.

### Bugs fréquents à surveiller

- Devise source perdue après édition.
- Montant converti recalculé sans accord utilisateur.
- Totaux agrégés entre devises incompatibles.

## Scénario 3 — Transferts internes

### Prérequis

- Deux comptes actifs dans la même devise.

### Dataset à utiliser

- Manuel recommandé pour bien contrôler les montants.

### Étapes

1. Créer `QA Chèques` et `QA Épargne` en `CAD`.
2. Créer un transfert interne de `250 CAD` de `QA Chèques` vers `QA Épargne`, daté `2026-02-15`.
3. Vérifier la liste Transactions.
4. Ouvrir Rapports sur février 2026.
5. Modifier le transfert à `300 CAD`.
6. Supprimer le transfert.

### Résultat attendu

- Le transfert est représenté de façon cohérente, sans catégorie de dépense.
- Les rapports ne comptent pas le transfert comme revenu ou dépense.
- L’édition met à jour les deux jambes du transfert si elles sont visibles ou gérées côté main.
- La suppression ne laisse pas de jambe orpheline.

### Bugs fréquents à surveiller

- Une jambe `IN` ou `OUT` reste seule.
- Le transfert apparaît comme dépense réelle dans les rapports.
- La destination et la source sont inversées après édition.

## Scénario 4 — Budget mensuel

### Prérequis

- Compte CAD.
- Catégorie dépense `QA Épicerie`.

### Dataset à utiliser

- Budget personnel simple.

### Étapes

1. Créer un budget `QA Épicerie février` de `500 CAD` du `2026-02-01` au `2026-02-28`.
2. Créer une dépense `Épicerie semaine 1` de `120 CAD` le `2026-02-03`.
3. Créer une dépense `Épicerie semaine 2` de `430 CAD` le `2026-02-10`.
4. Ouvrir Budgets.
5. Vérifier l’état du budget.

### Résultat attendu

- Le budget affiche `550 CAD` consommés.
- Le statut indique un dépassement.
- Les transactions hors catégorie ou hors période ne sont pas comptées.

### Bugs fréquents à surveiller

- La date de fin exclut par erreur le dernier jour.
- Les transferts sont inclus dans le budget.
- Le budget ne se rafraîchit pas après création de transaction.

## Scénario 5 — Récurrences

### Prérequis

- Compte CAD.
- Catégorie dépense `QA Abonnements`.

### Dataset à utiliser

- Manuel recommandé avec dates fixes.

### Étapes

1. Créer une récurrence mensuelle `QA Internet` de `70 CAD`, départ `2026-01-31`, prochaine occurrence `2026-01-31`.
2. Générer les récurrences dues jusqu’au `2026-03-31`.
3. Vérifier les transactions générées.
4. Créer une récurrence hebdomadaire `QA Transport` de `25 CAD`, départ `2026-02-02`.
5. Générer les occurrences dues sur février 2026.

### Résultat attendu

- La récurrence du 31 janvier génère une occurrence sur le dernier jour de février puis revient correctement en mars selon la logique app.
- Aucune occurrence en double.
- La prochaine occurrence avance après génération.
- Les montants et catégories sont conservés.

### Bugs fréquents à surveiller

- Off-by-one sur le dernier jour du mois.
- Boucle de génération anormale.
- Prochaine occurrence qui reste bloquée dans le passé.

## Scénario 6 — Rapports avec comparaison

### Prérequis

- Transactions sur deux périodes consécutives.

### Dataset à utiliser

- Budget personnel simple enrichi avec janvier et février 2026.

### Étapes

1. Créer des revenus et dépenses du `2026-01-01` au `2026-01-31`.
2. Créer des revenus et dépenses du `2026-02-01` au `2026-02-28`.
3. Ouvrir Rapports.
4. Choisir la période février 2026.
5. Vérifier la comparaison avec la période précédente.
6. Exporter le rapport Markdown.

### Résultat attendu

- La période précédente est janvier 2026.
- Les deltas sont cohérents.
- L’export Markdown contient la période courante et la période précédente.

### Bugs fréquents à surveiller

- Comparaison sur une durée incorrecte.
- Dernier jour de période ignoré.
- Export vide ou fichier non sauvegardé.

## Scénario 7 — Patrimoine

### Prérequis

- DB isolée.
- Section Patrimoine disponible.

### Dataset à utiliser

- `prisma/demo/advanced-wealth-imports.json` si disponible.
- Sinon, création manuelle.

### Étapes

1. Créer un portefeuille `QA CELI` de `40000 CAD`.
2. Créer un actif immobilier `QA Maison` de `500000 CAD`, propriété `50 %`.
3. Créer un passif `QA Hypothèque` de `120000 CAD` lié à l’actif si l’UI le permet.
4. Ouvrir la vue patrimoine.
5. Créer ou générer un snapshot de valeur nette.
6. Fermer puis rouvrir l’app.

### Résultat attendu

- Valeur actifs CAD : `290000 CAD` si l’app applique `50 %` sur la maison et ajoute le portefeuille.
- Passifs CAD : `120000 CAD`.
- Valeur nette CAD : `170000 CAD`.
- Le snapshot est listé après création.
- Les données persistent après redémarrage.

### Bugs fréquents à surveiller

- Pourcentage de propriété ignoré.
- Passif non déduit de la valeur nette.
- Snapshot créé avec une devise ou une date incorrecte.

## Scénario 8 — Objectifs et projections

### Prérequis

- Handlers objectifs/projections disponibles.
- Date cible future fixe.

### Dataset à utiliser

- `npm run db:seed:goals` ou création manuelle.

### Étapes

1. Créer un objectif `QA Fonds urgence` de `10000 CAD` avec départ `2500 CAD`.
2. Créer ou sélectionner un scénario `QA Base` avec contribution mensuelle `500 CAD`, horizon `24` mois, croissance annuelle `3 %`.
3. Vérifier la projection mensuelle.
4. Vérifier la date estimée d’atteinte si elle est calculable.
5. Modifier la contribution à `250 CAD` et vérifier que l’objectif devient plus long ou non atteignable dans l’horizon.

### Résultat attendu

- L’objectif est créé avec la bonne devise et le bon statut.
- La projection ne dépend pas de la date réelle du jour si une date de départ fixe est utilisée.
- La date estimée recule quand la contribution baisse.

### Bugs fréquents à surveiller

- Contribution mensuelle négative acceptée.
- Date estimée instable selon timezone.
- Scénario par défaut dupliqué.

## Scénario 9 — Import CSV

### Prérequis

- Compte de destination existant.
- Fixture CSV disponible.

### Dataset à utiliser

- `src/test/fixtures/import-csv/transactions-simple.csv` si disponible.
- `src/test/e2e/fixtures/advanced-import.csv` si disponible.
- Sinon, créer un CSV local avec colonnes `date,label,amount,currency,kind`.

### Étapes

1. Ouvrir l’import CSV guidé.
2. Choisir la fixture CSV.
3. Sélectionner un preset ou mapper les colonnes manuellement.
4. Lancer la preview.
5. Vérifier les erreurs visibles pour au moins une ligne invalide si la fixture en contient.
6. Appliquer l’import.
7. Ouvrir Transactions.
8. Réimporter le même fichier si le scénario de doublons est disponible.

### Résultat attendu

- La preview affiche le nombre de lignes valides, invalides et doublons.
- Les erreurs de lignes sont compréhensibles.
- Les transactions valides sont créées après application.
- Le réimport exact détecte les doublons ou évite les créations évidentes en double.
- L’historique d’import contient le batch.

### Bugs fréquents à surveiller

- Colonnes inversées sans alerte.
- Montant négatif mal interprété.
- Doublons non détectés.
- Batch marqué appliqué alors que rien n’a été créé.

## Scénario 10 — Backup et restore

### Prérequis

- DB isolée avec données variées : comptes, transactions, budget, récurrence, patrimoine, objectifs si possible.
- Emplacement temporaire pour sauvegarder le JSON.

### Dataset à utiliser

- Dataset avancé si disponible.
- Sinon, combiner les scénarios 1, 4, 5, 7 et 8.

### Étapes

1. Exporter un backup JSON.
2. Vérifier que le fichier existe et n’est pas vide.
3. Ajouter une donnée temporaire `QA À supprimer` dans l’app.
4. Restaurer le backup JSON exporté.
5. Confirmer le dry-run si l’UI le demande.
6. Vérifier qu’une sauvegarde pré-restore est créée si la procédure l’impose.
7. Vérifier les données restaurées.
8. Fermer puis rouvrir l’app.

### Résultat attendu

- Le backup contient les sections attendues.
- Le restore ne démarre pas si le dry-run détecte une erreur bloquante.
- Les données restaurées remplacent ou fusionnent selon le comportement documenté.
- La donnée temporaire ne survit pas si le restore est censé remplacer l’état.
- Les données persistent après redémarrage.

### Bugs fréquents à surveiller

- Restore partiel silencieux.
- Données d’import restaurées comme transactions réelles alors qu’elles sont audit-only.
- Backup pré-restore non créé avant écriture.
- Références cassées après restauration.

## Scénario 11 — Release packagée

### Prérequis

- Suivre `docs/release-qa-checklist.md`.
- Build packagé local disponible.

### Dataset à utiliser

- Smoke manual 10 minutes dans l’app packagée.
- Dataset avancé pour release candidate.

### Étapes

1. Exécuter `npm run release:check`.
2. Exécuter `npm run package`.
3. Lancer l’app depuis `out/`.
4. Créer compte, catégorie, transaction, budget.
5. Fermer puis rouvrir l’app packagée.
6. Vérifier la persistance dans `userData/data/app.db`.
7. Exécuter `npm run make`.
8. Vérifier les artefacts générés.
9. Installer ou ouvrir l’artefact selon l’OS.
10. Répéter le smoke manual 10 minutes.

### Résultat attendu

- L’app packagée démarre sans dépendre du dossier dev.
- La DB utilisateur est dans `userData/data/app.db`.
- Une DB utilisateur existante n’est pas écrasée par un nouveau lancement/build.
- Les icônes et le nom de l’app sont corrects.

### Bugs fréquents à surveiller

- Template DB utilisé directement comme DB utilisateur.
- Icône absente ou invalide.
- Build qui démarre seulement depuis le repo.
- Mise à jour locale qui efface les données.

## Checklist complète release candidate

À exécuter avant publication d’une version stable ou d’une version release candidate.

| Domaine | Scénario | Statut | Notes |
| --- | --- | --- | --- |
| Démarrage | Smoke manual 10 minutes | ☐ |  |
| Budget simple | Scénario 1 | ☐ |  |
| Multi-devise | Scénario 2 | ☐ |  |
| Transferts | Scénario 3 | ☐ |  |
| Budgets | Scénario 4 | ☐ |  |
| Récurrences | Scénario 5 | ☐ |  |
| Rapports | Scénario 6 | ☐ |  |
| Patrimoine | Scénario 7 | ☐ |  |
| Objectifs/projections | Scénario 8 | ☐ |  |
| Import CSV | Scénario 9 | ☐ |  |
| Backup/restore | Scénario 10 | ☐ |  |
| App packagée | Scénario 11 | ☐ |  |
| Release checklist | `docs/release-qa-checklist.md` | ☐ |  |

## Critères bloquants

Bloquer la release si l’un des points suivants est observé :

- perte ou écrasement de données utilisateur ;
- app packagée incapable de démarrer ;
- DB écrite dans un emplacement inattendu ;
- restore qui modifie les données malgré un dry-run bloquant ;
- import qui crée des doublons massifs sans avertissement ;
- rapports financiers manifestement faux ;
- patrimoine ou valeur nette incorrecte sur un cas simple ;
- récurrences qui génèrent des occurrences infinies ou hors période ;
- erreur non récupérable sans message utilisateur compréhensible ;
- artefact release incomplet ou mauvais OS.

## Modèle de rapport QA manuel

```markdown
# Rapport QA manuel

- Version testée :
- Branche / commit :
- OS :
- Mode : dev / packaged / installer
- Dataset :
- DB isolée : oui / non
- Date :

## Résumé

- Smoke 10 minutes : OK / KO
- Release candidate complète : OK / KO / partielle

## Scénarios exécutés

| Scénario | Résultat | Notes |
| --- | --- | --- |
| Smoke manual 10 minutes |  |  |
| Budget personnel simple |  |  |
| Multi-compte/multi-devise |  |  |
| Transferts internes |  |  |
| Budget mensuel |  |  |
| Récurrences |  |  |
| Rapports avec comparaison |  |  |
| Patrimoine |  |  |
| Objectifs/projections |  |  |
| Import CSV |  |  |
| Backup/restore |  |  |
| Release packagée |  |  |

## Bugs trouvés

1.

## Captures/logs

- 

## Décision

- Release autorisée : oui / non
- Raisons :
```
