# Release checklist

## Avant le build

- [ ] `npm install`
- [ ] `npm run prisma:generate`
- [ ] `npm run test:run`
- [ ] `npm run typecheck`

## Vérifications métier

- [ ] création d’un compte
- [ ] création d’une catégorie
- [ ] création d’un revenu
- [ ] création d’une dépense
- [ ] création d’un transfert interne
- [ ] création d’un transfert multi-devise
- [ ] affichage correct des transferts dans Overview
- [ ] affichage correct des transferts dans Transactions
- [ ] budgets : statuts UNDER / NEAR / OVER cohérents
- [ ] récurrences : génération correcte
- [ ] rapports : transferts exclus des revenus / dépenses
- [ ] rapports : période vide sans crash
- [ ] export markdown du rapport

## Vérifications sauvegarde

- [ ] export JSON
- [ ] ouverture de la prévisualisation restore JSON
- [ ] restauration JSON
- [ ] fermeture puis réouverture de l’application
- [ ] données intactes après redémarrage

## Packaging

- [ ] `npm run package`
- [ ] `npm run make`
- [ ] icône visible dans l’application
- [ ] icône visible dans l’installateur
- [ ] installation Windows testée
- [ ] installation Linux testée
- [ ] installation macOS testée

## Publication

- [ ] tag Git propre (`v0.9.0`, etc.)
- [ ] release GitHub créée
- [ ] artefacts présents
- [ ] notes de release relues