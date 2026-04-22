# Release checklist

## Vérifications techniques

- [ ] `npm install`
- [ ] `npm run prisma:generate`
- [ ] `npm run db:push`
- [ ] `npm run test:run`
- [ ] `npm run typecheck`
- [ ] `npm run package`

## Vérifications métier

- [ ] création d’un compte
- [ ] création d’une catégorie
- [ ] création d’un revenu
- [ ] création d’une dépense
- [ ] création d’un transfert interne
- [ ] modification d’un transfert interne
- [ ] suppression d’un transfert interne
- [ ] budgets visibles et corrects
- [ ] récurrences générées correctement
- [ ] rapports corrects sur une période
- [ ] comparaison période précédente correcte
- [ ] transferts exclus des revenus / dépenses dans les rapports

## Vérifications sauvegarde

- [ ] export JSON
- [ ] restauration JSON
- [ ] réouverture app après restauration
- [ ] données intactes après redémarrage

## Vérifications UI

- [ ] overview lisible
- [ ] transactions lisibles
- [ ] rapports lisibles
- [ ] états vides propres
- [ ] pas de texte template restant