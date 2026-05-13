# Checklist QA release packagée

Cette checklist complète `docs/release-flow.md`. Elle sert à valider manuellement une release desktop avant publication, en particulier les risques qu’un test unitaire ne voit pas : mauvais chemin de base SQLite, assets absents, artefact incomplet, données utilisateur écrasées après mise à jour, ou build signé/notarisé de manière incomplète.

## Principes

- Une release ne part pas tant qu’un point bloquant reste ouvert.
- Les tests manuels doivent être faits sur un profil utilisateur propre, puis sur un profil contenant déjà des données.
- Le template `assets/database/app.db` est un template applicatif. La DB utilisateur réelle doit rester dans `<userData>/data/app.db`.
- Aucun test ne doit utiliser la DB personnelle du mainteneur.
- Les commandes doivent être lancées depuis un clone propre de la branche de release.

## Informations release

| Champ | Valeur |
| --- | --- |
| Version testée |  |
| Branche / commit |  |
| Date |  |
| OS principal |  |
| Testeur |  |
| Build signé ? | Oui / Non / N/A |
| Notarisation macOS ? | Oui / Non / N/A |

## 1. Préparation propre

- [ ] Partir d’un clone propre ou d’un workspace nettoyé.
- [ ] Vérifier que la branche de release est à jour.
- [ ] Supprimer les artefacts locaux précédents : `out/`, `dist/renderer/`, `coverage/` si présents.
- [ ] Vérifier qu’aucune variable locale ne pointe vers une DB personnelle : `BUDGET_DATABASE_PATH`, `DATABASE_URL`.
- [ ] Installer les dépendances avec la commande standard :

```shell
npm install
```

- [ ] Vérifier que `package-lock.json` ne change pas de manière inattendue.
- [ ] Vérifier la version déclarée dans `package.json` et le nom produit attendu.

## 2. Checks automatiques avant packaging

### Check complet projet

```shell
npm run check
```

- [ ] Prisma client généré sans erreur.
- [ ] Typecheck OK.
- [ ] Tests unitaires OK.
- [ ] Aucun warning nouveau n’est ignoré sans décision explicite.

### Check release desktop

```shell
npm run release:check
```

- [ ] `npm run validate:desktop-assets` OK.
- [ ] `npm run build:packaged-db` OK.
- [ ] `assets/database/app.db` existe.
- [ ] `assets/database/app.db` n’est pas vide.
- [ ] Le template DB a été régénéré après tout changement Prisma.

### Coverage, lecture qualitative

```shell
npm run test:coverage
```

- [ ] Le rapport HTML s’ouvre localement dans `coverage/index.html`.
- [ ] Les zones critiques modifiées dans cette release sont visibles dans le rapport.
- [ ] Les trous de couverture importants sont notés dans la release ou transformés en issues.
- [ ] Aucun test inutile n’a été ajouté uniquement pour faire monter un pourcentage.

## 3. Package local lançable

```shell
npm run package
```

- [ ] La commande termine sans erreur.
- [ ] Un dossier est généré dans `out/`.
- [ ] L’exécutable packagé existe.
- [ ] L’app se lance depuis `out/` sans lancer Vite ni Electron Forge.
- [ ] La fenêtre affiche le bon nom d’application.
- [ ] L’icône de fenêtre est présente.
- [ ] Le renderer se charge sans écran blanc.
- [ ] Le menu applicatif est disponible.

## 4. Smoke manuel dans l’app packagée

Effectuer ces étapes dans l’app packagée, pas en mode dev.

### Création de données minimales

- [ ] Créer un compte `QA Compte` en devise `CAD`.
- [ ] Créer une catégorie de dépense `QA Catégorie`.
- [ ] Créer une transaction `QA Transaction` liée au compte et à la catégorie.
- [ ] Modifier la transaction et vérifier que le changement est affiché.
- [ ] Supprimer une transaction de test et vérifier qu’elle disparaît.
- [ ] Créer un budget lié à la catégorie.
- [ ] Créer une récurrence et générer les occurrences dues si applicable.
- [ ] Ouvrir les rapports et vérifier que les données créées sont prises en compte.

### Domaines avancés

- [ ] Créer un actif patrimoine.
- [ ] Créer un portefeuille patrimoine.
- [ ] Créer un passif patrimoine.
- [ ] Vérifier que la valeur nette affichée correspond aux données saisies.
- [ ] Créer ou générer un snapshot de valeur nette.
- [ ] Créer un objectif financier.
- [ ] Vérifier qu’un scénario de projection est disponible.
- [ ] Vérifier qu’une projection ou estimation s’affiche sans erreur.
- [ ] Ouvrir l’historique d’import.

## 5. Persistance DB utilisateur

### Premier lancement packagé

- [ ] Identifier le chemin `userData` de l’OS testé.
- [ ] Vérifier que la DB utilisateur est créée dans :

```text
<userData>/data/app.db
```

Emplacements usuels :

| OS | Chemin usuel |
| --- | --- |
| Windows | `%APPDATA%/Budget/data/app.db` |
| macOS | `~/Library/Application Support/Budget/data/app.db` |
| Linux | `~/.config/Budget/data/app.db` |

- [ ] Vérifier que l’app n’utilise pas directement `assets/database/app.db` comme DB utilisateur.
- [ ] Fermer complètement l’app.
- [ ] Relancer l’app packagée.
- [ ] Vérifier que le compte, la catégorie, la transaction, le budget et les données patrimoine existent encore.

### Simulation de mise à jour

- [ ] Conserver la DB utilisateur existante.
- [ ] Relancer une nouvelle build packagée de la même app ou d’une version suivante.
- [ ] Vérifier que `<userData>/data/app.db` n’est pas remplacée.
- [ ] Vérifier que les données précédemment créées existent toujours.
- [ ] Vérifier qu’une DB vide packagée ne remplace jamais une DB utilisateur non vide.

## 6. Backup / restore

- [ ] Exporter un backup JSON depuis l’app packagée.
- [ ] Vérifier que le fichier exporté existe et n’est pas vide.
- [ ] Vérifier que le JSON contient `kind: "budget-backup"` et une version supportée.
- [ ] Créer une nouvelle donnée après export.
- [ ] Lancer une restauration du backup exporté.
- [ ] Vérifier que la preview/dry-run s’affiche avant modification.
- [ ] Vérifier qu’une sauvegarde pré-restore est demandée ou créée avant remplacement.
- [ ] Confirmer la restauration.
- [ ] Vérifier que les données restaurées correspondent au backup.
- [ ] Tester un fichier JSON invalide et vérifier que l’erreur est compréhensible, sans modification de données.
- [ ] Si le backup chiffré est disponible, tester export + restore avec un mot de passe connu.
- [ ] Tester un mauvais mot de passe et vérifier qu’aucune donnée n’est modifiée.

## 7. Artefacts installables

```shell
npm run make
```

- [ ] La commande termine sans erreur.
- [ ] Les artefacts attendus sont présents dans `out/make/`.
- [ ] Les artefacts correspondent à l’OS de build.
- [ ] Les noms de fichiers contiennent la version attendue si configuré.
- [ ] Les artefacts ne sont pas vides.
- [ ] Installer l’artefact généré sur un profil utilisateur propre.
- [ ] Lancer l’app installée, pas seulement l’app packagée locale.
- [ ] Refaire le smoke minimal : compte, catégorie, transaction, fermeture/réouverture.
- [ ] Désinstaller puis réinstaller si applicable et vérifier le comportement attendu des données utilisateur.

## 8. Vérifications desktop communes

- [ ] Nom affiché : `Budget`.
- [ ] Version affichée cohérente avec `package.json`.
- [ ] Icône de fenêtre correcte.
- [ ] Icône d’artefact correcte.
- [ ] Pas de chemin de développement visible dans l’UI.
- [ ] Pas d’erreur console bloquante au lancement.
- [ ] Le menu `Fichier` ou équivalent déclenche les actions prévues.
- [ ] Les dialogues fichier s’ouvrent pour import/export.
- [ ] Les chemins contenant des espaces fonctionnent.
- [ ] L’app démarre hors connexion réseau.
- [ ] Aucun service externe n’est requis pour les flux local-first.

## 9. Windows

- [ ] Build généré depuis un environnement Windows ou compatible Forge Windows.
- [ ] `assets/icons/app.ico` valide.
- [ ] L’installeur Squirrel/Windows est généré si attendu.
- [ ] L’installation fonctionne sur un profil utilisateur standard non admin si supporté.
- [ ] Le chemin `%APPDATA%/Budget/data/app.db` est utilisé.
- [ ] Les chemins avec espaces dans le profil utilisateur fonctionnent.
- [ ] Si signature activée, `cert.pfx` et `WIN_CERT_PASSWORD` sont présents dans l’environnement de build.
- [ ] Si signature attendue, l’artefact est signé.
- [ ] Sans certificat, la release note mentionne explicitement que le build Windows est non signé.
- [ ] Une mise à jour/réinstallation ne supprime pas la DB utilisateur.

## 10. macOS

- [ ] Build produit sur macOS.
- [ ] `assets/icons/app.icns` valide.
- [ ] L’app s’ouvre depuis le dossier généré ou l’artefact installé.
- [ ] Le chemin `~/Library/Application Support/Budget/data/app.db` est utilisé.
- [ ] Fermeture via `Cmd+Q` puis réouverture : données conservées.
- [ ] Si notarisation attendue, les variables suivantes sont configurées :
  - [ ] `APPLE_API_KEY`
  - [ ] `APPLE_API_KEY_ID`
  - [ ] `APPLE_API_ISSUER`
- [ ] Si notarisation attendue, Gatekeeper accepte l’app.
- [ ] Sans notarisation, la release note mentionne clairement la limitation.
- [ ] Une mise à jour/réinstallation ne supprime pas la DB utilisateur.

## 11. Linux

- [ ] Build produit sur Linux.
- [ ] `assets/icons/app.png` valide.
- [ ] Les artefacts Linux attendus sont générés, par exemple DEB/RPM/ZIP selon Forge.
- [ ] Les dépendances système nécessaires sont documentées si l’installation échoue sur une distribution cible.
- [ ] Le chemin `~/.config/Budget/data/app.db` est utilisé.
- [ ] L’app démarre depuis un environnement sans serveur dev.
- [ ] Les permissions du fichier DB permettent lecture/écriture par l’utilisateur courant.
- [ ] Une mise à jour/réinstallation ne supprime pas la DB utilisateur.

## 12. Auto-update

L’auto-update ne doit être validé que si le canal de distribution est configuré pour cette release.

- [ ] Vérifier si `update-electron-app` est actif pour le canal visé.
- [ ] Vérifier que la release GitHub reste en draft tant que la QA n’est pas terminée.
- [ ] Vérifier que la version publiée est supérieure à la version installée utilisée pour le test update.
- [ ] Vérifier que le téléchargement update ne démarre pas depuis une release non validée.
- [ ] Après update, vérifier que la DB utilisateur est conservée.
- [ ] Si l’auto-update n’est pas testé, le noter explicitement dans la release note.

## 13. Critères bloquants release

La release est bloquée si au moins un point ci-dessous est vrai :

- [ ] `npm run check` échoue.
- [ ] `npm run release:check` échoue.
- [ ] `npm run package` échoue sur l’OS cible.
- [ ] `npm run make` échoue pour un artefact attendu.
- [ ] L’app packagée ne démarre pas.
- [ ] Le renderer affiche un écran blanc.
- [ ] La DB utilisateur est écrite au mauvais endroit.
- [ ] Une DB utilisateur existante est remplacée par le template packagé.
- [ ] Les données ne persistent pas après fermeture/réouverture.
- [ ] Backup/restore peut supprimer ou remplacer les données sans preview ni sauvegarde pré-restore.
- [ ] Un backup invalide modifie les données.
- [ ] Les assets desktop requis sont absents ou invalides.
- [ ] Un build censé être signé/notarisé ne l’est pas.
- [ ] Un flux cœur est inutilisable : compte, catégorie, transaction, budget, récurrence, rapport.
- [ ] Un flux avancé annoncé dans la release est inutilisable : patrimoine, objectifs/projections, imports.
- [ ] Une erreur contient des détails internes sensibles ou incompréhensibles pour l’utilisateur.

## 14. Checklist hotfix rapide

Pour un hotfix urgent, ne pas faire moins que :

- [ ] Vérifier le patch avec revue ciblée.
- [ ] Lancer `npm run check`.
- [ ] Lancer `npm run release:check`.
- [ ] Lancer `npm run package`.
- [ ] Démarrer l’app packagée.
- [ ] Vérifier le bug corrigé.
- [ ] Vérifier création compte/catégorie/transaction.
- [ ] Fermer/réouvrir et vérifier persistance.
- [ ] Exporter un backup JSON.
- [ ] Tester que la DB utilisateur existante n’est pas écrasée.
- [ ] Générer l’artefact hotfix avec `npm run make`.
- [ ] Documenter clairement le périmètre du hotfix.

## 15. Template de note de release

```markdown
# Budget vX.Y.Z

## Résumé

- Objectif de la release : ...
- Type : stable / beta / hotfix
- Commit validé : ...

## Nouveautés

- ...

## Corrections

- ...

## Changements desktop

- Packaging : ...
- DB packagée : template régénéré oui/non
- Chemin DB utilisateur vérifié : oui/non
- Auto-update testé : oui/non/N/A

## Données utilisateur

- Migration DB requise : oui/non
- Backup conseillé avant update : oui/non
- Risque connu : ...

## Plateformes validées

| OS | Version | Artefact | Signature/notarisation | Statut |
| --- | --- | --- | --- | --- |
| Windows |  |  |  |  |
| macOS |  |  |  |  |
| Linux |  |  |  |  |

## QA effectuée

- `npm run check` : OK/NOK
- `npm run release:check` : OK/NOK
- `npm run package` : OK/NOK
- `npm run make` : OK/NOK
- Smoke app packagée : OK/NOK
- Persistance DB utilisateur : OK/NOK
- Backup/restore : OK/NOK

## Limitations connues

- ...

## Instructions utilisateur

- Télécharger l’artefact adapté à l’OS.
- Faire un backup JSON avant une mise à jour majeure.
- Signaler tout problème avec l’OS, la version et les logs disponibles.
```

## 16. Résultat QA

| Décision | Responsable | Date | Commentaire |
| --- | --- | --- | --- |
| Go / No-Go |  |  |  |
