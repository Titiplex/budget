# Local security and recovery threat model

Ce document cadre le modèle de sécurité local de Budget. Il sert de référence pour les futures issues liées au chiffrement, aux sauvegardes, à la restauration, à l’audit, aux imports et aux secrets locaux.

Budget est une application desktop **local-first**. Le modèle vise donc à protéger des données financières sensibles stockées ou manipulées localement, sans promettre une sécurité cloud, enterprise ou multi-utilisateur.

Les tests, fixtures et vérifications manuelles associés à ce modèle sont documentés dans [`security-trust-testing.md`](security-trust-testing.md) et [`release-security-checklist.md`](release-security-checklist.md).

## Objectifs

- rendre explicite ce que l’application protège ;
- clarifier ce qui reste hors périmètre ;
- guider les choix de sauvegarde, restauration, chiffrement et audit ;
- éviter les promesses de sécurité irréalistes ;
- privilégier la récupération et l’explicabilité avant les mécanismes destructifs.

Ce document décrit une cible produit et architecturale. Une protection citée ici doit être implémentée par une issue dédiée avant d’être considérée comme effective dans l’application.

## Données sensibles

### Base SQLite locale

La base locale contient les comptes, catégories, transactions, budgets, récurrences, objectifs, scénarios de projection, données de patrimoine, snapshots, historiques d’import et métadonnées utiles à l’application.

Risques principaux : copie du fichier, modification manuelle, corruption disque, migration cassée, restauration partielle ou incohérente.

### Backups JSON

Le backup JSON est le format portable canonique. Il peut contenir une vision très complète des finances de l’utilisateur : comptes, soldes, transactions, patrimoine, objectifs, imports et décisions de réconciliation.

Risques principaux : fuite d’un fichier non chiffré, conservation trop longue, partage accidentel, restauration d’un fichier obsolète ou mal formé.

### Backups chiffrés

Les backups chiffrés sont destinés à réduire l’impact d’une fuite de fichier. Ils doivent rester explicites : l’utilisateur doit comprendre qu’il protège le contenu avec un mot de passe, une clé ou un secret local.

Risques principaux : perte du secret de déchiffrement, mauvais choix de mot de passe, confusion entre backup chiffré et non chiffré, absence de vérification d’intégrité.

### Secrets locaux

Les secrets locaux peuvent inclure des clés de chiffrement, mots de passe dérivés, tokens de connecteurs futurs, paramètres de chiffrement ou clés stockées par le système d’exploitation.

Risques principaux : stockage en clair, logs accidentels, inclusion dans un backup, exposition dans un fichier de configuration ou dans les outils de développement.

### Imports financiers

Les imports CSV, broker ou exchange peuvent exposer des transactions réelles, références externes, libellés, identifiants de comptes, tickers, quantités, frais, taxes et soldes implicites.

Risques principaux : fichier source laissé sur disque, import incorrect, doublon, mapping de colonnes erroné, décision de réconciliation non comprise.

### Historique d’audit

L’audit conserve des décisions, erreurs, warnings, statuts, liens appliqués, timestamps et informations de provenance. Il ne doit pas devenir un second stockage opaque ou plus sensible que les données principales.

Risques principaux : audit trop verbeux, conservation de données brutes inutiles, confusion entre historique d’import et source financière canonique.

### Métadonnées de provenance

La provenance inclut les noms de fichiers, hashes, dates d’import, sources, templates, versions de backup, versions de migration et états de traitement.

Risques principaux : fuite indirecte d’informations personnelles, mauvais diagnostic si la fraîcheur ou la source n’est pas visible, restauration depuis une provenance ambiguë.

## Menaces réalistes

| Menace | Impact | Protection attendue |
| --- | --- | --- |
| Fuite d’un backup JSON non chiffré | Exposition complète des finances exportées | signaler clairement le caractère non chiffré, proposer un export chiffré, éviter d’y inclure des secrets |
| Corruption de backup | Restauration impossible ou incohérente | validation stricte du format, versionnement, erreurs lisibles, vérification d’intégrité pour les backups chiffrés |
| Suppression accidentelle | Perte de données locales | préférer confirmation, backup avant opérations risquées, restauration vérifiable |
| Import incorrect | Transactions fausses ou mal classées | preview dry-run, validation, warnings, décisions de réconciliation, application explicite |
| Import dupliqué | Soldes, rapports et patrimoine faussés | détection de doublons exacts, probables et intra-batch ; audit des décisions |
| Secret stocké en clair | Compromission des backups ou connecteurs futurs | ne jamais écrire les secrets dans la base ou les backups en clair ; privilégier le stockage OS quand disponible |
| Modification locale inattendue | Données incohérentes ou perte de confiance | audit compréhensible, timestamps, provenance, validations côté main process |
| Migration cassée | Données inutilisables après mise à jour | migrations testées, erreurs explicites, stratégie de backup avant migration sensible |
| Restauration d’un backup obsolète | Retour arrière involontaire ou écrasement | afficher date, version, source, contenu résumé et effets avant restauration |
| Logs trop bavards | Exposition de données financières ou secrets | limiter les logs aux diagnostics nécessaires, masquer secrets et contenus financiers bruts |

## Menaces hors périmètre

Budget ne prétend pas protéger contre :

- compromission complète de l’OS ;
- malware ayant accès au compte utilisateur ;
- keylogger, screen reader malveillant ou outil d’exfiltration local ;
- accès physique non contrôlé à une session déjà ouverte ;
- chiffrement complet du disque ;
- sécurité cloud ;
- serveur distant ;
- IAM multi-utilisateur ;
- permissions fines par rôle ;
- révocation distante ;
- synchronisation sécurisée multi-appareils ;
- protection contre un utilisateur local administrateur déterminé.

Dans ces scénarios, l’application peut réduire certains dégâts accidentels, mais elle ne peut pas garantir la confidentialité ou l’intégrité face à un environnement local déjà compromis.

## Principes de sécurité

### Local-first

Les données principales restent sur la machine de l’utilisateur. Aucune infrastructure serveur ne doit être requise pour créer, consulter, sauvegarder ou restaurer un budget local.

### Aucune dépendance serveur obligatoire

Les fonctionnalités critiques doivent continuer à fonctionner sans compte cloud, serveur distant, IAM externe ou service propriétaire obligatoire.

### Chiffrement optionnel mais explicite

Le chiffrement doit être présenté comme une action volontaire et compréhensible. L’utilisateur doit savoir quand un export est chiffré, quand il ne l’est pas, et ce qui se passe si le secret est perdu.

### Récupération avant destruction

Les flux risqués doivent privilégier la récupération : backup avant migration sensible, validation avant restauration, preview avant import, confirmations avant suppression ou écrasement.

### Audit compréhensible

L’audit doit expliquer ce qui s’est passé sans noyer l’utilisateur dans des détails techniques. Il doit être utile pour diagnostiquer un import, une restauration ou une modification inattendue.

### Transparence sur la fraîcheur et la provenance

Les écrans et exports sensibles doivent exposer les métadonnées utiles : date d’export, version du format, source d’import, statut, erreurs, warnings et décisions appliquées.

### Minimisation

Les backups, logs, audits et exports ne doivent pas contenir plus de données que nécessaire. Les secrets ne doivent pas être exportés dans les formats financiers portables.

## Frontières de confiance

| Zone | Niveau de confiance | Règle |
| --- | --- | --- |
| Electron main process | élevé | accès base, migrations, fichiers et IPC sensibles |
| Renderer Vue | limité | pas d’accès direct Prisma ou filesystem sensible |
| Fichiers importés | non fiables | parsing défensif, validation, preview, erreurs lisibles |
| Backups fournis par l’utilisateur | non fiables jusqu’à validation | valider version, schéma, cohérence et effets avant restauration |
| Secrets locaux | très sensibles | ne pas logger, ne pas exporter en clair, limiter l’exposition en mémoire |
| Services externes futurs | non fiables par défaut | lecture explicite, pas d’écriture automatique dans le MVP local-first |

## Protections attendues par domaine

### Sauvegardes

- distinguer visuellement backup JSON non chiffré et backup chiffré ;
- inclure version, date d’export, résumé du contenu et provenance ;
- valider le format avant restauration ;
- refuser les versions inconnues ou dangereusement incomplètes ;
- ne pas inclure de secrets locaux en clair ;
- documenter les limites du format.

### Restauration

- afficher ce qui va être restauré avant application ;
- éviter les écrasements silencieux ;
- signaler les données ignorées ou détachées ;
- garder des messages d’erreur compréhensibles ;
- préserver une stratégie de retour arrière quand une opération peut détruire l’état courant.

### Imports

- traiter les fichiers importés comme non fiables ;
- produire une preview sans écriture financière ;
- détecter les doublons exacts, probables et intra-batch ;
- conserver les décisions de réconciliation ;
- ne pas confondre historique d’import et données financières canoniques.

### Audit

- conserver les actions importantes avec date, source, statut et résultat ;
- privilégier des messages lisibles ;
- éviter les secrets et dumps complets de données sensibles ;
- permettre l’export d’un audit utile sans exposer plus que nécessaire.

### Secrets

- ne pas stocker de secret en clair dans SQLite, les backups ou les logs ;
- utiliser les mécanismes de stockage sécurisés de l’OS quand ils sont disponibles ;
- rendre explicite la perte irréversible d’un backup chiffré si le secret est perdu ;
- prévoir une rotation ou régénération quand un connecteur futur le nécessite.

### Migrations

- tester les migrations sur des données représentatives ;
- documenter les changements de format ;
- effectuer des validations post-migration ;
- afficher une erreur claire plutôt que de produire un état partiel silencieux.

## Règles pour les futures issues

Toute issue de sécurité ou de récupération doit préciser :

- quelles données sensibles sont concernées ;
- quelle menace réaliste est traitée ;
- quelle menace reste hors périmètre ;
- si la protection est obligatoire, optionnelle ou informative ;
- comment l’utilisateur récupère ses données en cas d’échec ;
- quelles métadonnées de fraîcheur ou de provenance doivent être visibles.

Les futures issues ne doivent pas promettre de sécurité cloud, enterprise, IAM, multi-utilisateur ou anti-malware si ces capacités ne sont pas explicitement conçues et implémentées.
