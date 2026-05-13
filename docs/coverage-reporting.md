# Coverage reporting

La couverture sert ici à repérer les zones critiques non testées. Elle ne doit pas devenir un objectif de pourcentage abstrait, ni pousser à écrire des tests qui exécutent du code sans vérifier de comportement métier.

## Commande

```bash
npm run test:coverage
```

La commande lance `vitest run --coverage` et génère plusieurs sorties :

- résumé texte dans le terminal ;
- rapport HTML local dans `coverage/index.html` ;
- `coverage/coverage-summary.json` pour inspection automatique future ;
- `coverage/lcov.info` pour des outils externes si besoin.

Le rapport HTML est le point d’entrée recommandé pour l’analyse humaine. Ouvre `coverage/index.html`, trie par fichiers peu couverts, puis regarde surtout les lignes rouges/oranges dans les modules métier.

## Périmètre instrumenté

La configuration cible volontairement le code qui porte de la logique :

- `src/utils/**` : calculs, backup JSON, restore dry-run, parsing, formatage non trivial ;
- `src/composables/**` : orchestration renderer testable ;
- `src/i18n/**` : helpers de traduction/localisation ;
- `electron/goals/**` : objectifs, scénarios et projections ;
- `electron/import/**` : pipeline d’import, preview, dry-run, doublons et réconciliation ;
- `electron/audit/**`, `electron/integrity/**`, `electron/recovery/**`, `electron/security/**`, `electron/secrets/**` : chemins sensibles sécurité/récupération ;
- `electron/portfolio/**`, `electron/marketData/**`, `electron/backup/**`, `electron/db/**` : services purs ou quasi purs ;
- handlers IPC contenant de la logique métier réelle, comme `transactionHandlers`, `wealthHandlers` et `wealthOverviewHandlers`.

Les fichiers de bootstrap, wrappers triviaux, types purs, composants UI non ciblés et scripts d’outillage sont exclus pour éviter de diluer le signal.

## Ce qu’il ne faut pas faire

Ne pas ajouter de tests qui vérifient seulement qu’une fonction existe. Ne pas tester des getters/setters triviaux uniquement pour faire monter un score. Ne pas fixer un seuil global arbitraire tant que les domaines critiques n’ont pas chacun leur propre niveau de maturité.

Un fichier à faible couverture n’est pas automatiquement un problème. Un moteur de calcul financier, une validation restore ou une décision d’import à faible couverture, oui.

## Checklist qualitative

Pour chaque module critique nouvellement ajouté ou modifié, vérifier :

- Le chemin nominal est couvert avec des données réalistes.
- Au moins une erreur métier explicite est couverte.
- Les cas limites sont couverts : zéro, montant négatif refusé, devise absente/invalide, date invalide, liste vide, doublon, référence cassée.
- Les décisions destructives ou irréversibles ont un test de garde-fou : restore, suppression, import final, migration, chiffrement/déchiffrement.
- Les contrats IPC critiques sont couverts quand le renderer dépend d’une enveloppe `{ ok, data, error }` ou d’une erreur normalisée.
- Les tests assertent le comportement observable, pas l’implémentation interne.

## Zones critiques à surveiller en priorité

1. **Backup / restore / migrations** : aucun restore invalide ne doit écrire en base ; les références cassées doivent bloquer clairement.
2. **Import CSV** : parsing, mapping, dry-run, doublons et réconciliation ne doivent pas polluer les données utilisateur.
3. **Patrimoine et projections** : valeur nette, objectifs, dates estimées, taux et contributions doivent rester déterministes.
4. **Sécurité et audit** : chiffrement, récupération, intégrité, audit trail et erreurs doivent rester explicites et non verbeux côté renderer.
5. **IPC main/renderer** : les payloads invalides doivent échouer proprement sans fuite de stack, Prisma ou détails SQLite inutiles.

## Évolution future des seuils

Aucun seuil global n’est défini pour l’instant. Quand le signal sera stable, préférer des seuils ciblés par domaine critique, par exemple uniquement sur `src/utils/restoreDryRun.ts` ou `electron/import/importWorkflowService.js`, plutôt qu’un seuil global qui encourage la couverture artificielle.

Un futur seuil doit être justifié par le risque métier du domaine et accompagné de tests lisibles.
