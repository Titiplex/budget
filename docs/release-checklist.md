# Release checklist

Voir aussi [`release-flow.md`](release-flow.md) pour le process détaillé.

## Avant le build

- [ ] `npm ci` ou `npm install` sur une copie propre
- [ ] `npm run release:check`
- [ ] aucun fichier généré inattendu n’est prêt à être commité
- [ ] version `package.json` cohérente avec le tag prévu

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
- [ ] lancement de l’app packagée depuis `out/`
- [ ] création d’une DB fraîche dans `userData/data/app.db`
- [ ] fermeture puis réouverture de l’app packagée
- [ ] les données créées avant fermeture sont toujours présentes
- [ ] `npm run make`
- [ ] icône visible dans l’application
- [ ] icône visible dans l’installateur
- [ ] installation Windows testée
- [ ] installation Linux testée
- [ ] installation macOS testée

## Publication

- [ ] tag Git propre (`v0.9.0`, etc.)
- [ ] `npm run publish`
- [ ] release GitHub créée en draft
- [ ] artefacts présents
- [ ] notes de release relues
- [ ] draft publiée manuellement seulement après smoke test des artefacts
