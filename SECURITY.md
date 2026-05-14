# Politique de sécurité

## Versions supportées

Le projet évolue rapidement. Sauf indication contraire, seule la dernière version publiée et la branche principale de développement sont considérées comme supportées pour les correctifs de sécurité.

| Version | Support sécurité |
| --- | --- |
| Dernière release | Oui |
| Branche principale | Oui, au cas par cas |
| Anciennes releases | Non, sauf décision explicite |

## Signaler une vulnérabilité

Ne crée pas d’issue publique pour une vulnérabilité exploitable.

Pour signaler un problème de sécurité, utilise les canaux privés disponibles sur GitHub, par exemple GitHub Security Advisories si activé sur le dépôt. Si ce canal n’est pas disponible, contacte directement les mainteneurs via les moyens indiqués sur le profil ou le dépôt.

Inclue autant que possible :

- une description claire du problème ;
- les étapes de reproduction ;
- l’impact potentiel ;
- la version ou le commit concerné ;
- les logs ou captures utiles, sans données personnelles ;
- une proposition de correction si tu en as une.

## Données sensibles

Budget manipule des données financières locales. Ne partage jamais publiquement :

- exports JSON réels ;
- bases SQLite réelles ;
- captures contenant des comptes, soldes ou transactions personnelles ;
- tokens, secrets, mots de passe ou clés API ;
- fichiers `.env` réels.

Utilise des données fictives ou anonymisées dans les issues et pull requests.

## Périmètre de sécurité

Le projet est local-first. Les points sensibles incluent notamment :

- sauvegarde et restauration JSON ;
- backup chiffré par mot de passe ;
- import CSV et réconciliation ;
- stockage local de secrets ;
- accès IPC entre renderer Electron et main process ;
- intégrité des fichiers applicatifs ;
- snapshots de récupération avant actions critiques.

Les limites connues sont documentées dans le README et dans les fichiers de documentation du dossier `docs/`.

## Processus attendu

Après réception d’un signalement :

1. les mainteneurs accusent réception dès que possible ;
2. le problème est reproduit ou qualifié ;
3. un correctif est préparé en privé ou dans une PR limitée si le risque est faible ;
4. une release corrective est publiée si nécessaire ;
5. les détails peuvent être rendus publics une fois le correctif disponible.

## Bonnes pratiques pour les contributions

- Garde les IPC aussi stricts que possible.
- Ne donne jamais d’accès direct Prisma au renderer.
- Valide les entrées utilisateur avant écriture locale.
- Préserve les dry-runs sur les flows destructifs ou ambigus.
- Ajoute des tests pour les changements touchant sauvegarde, restore, imports, sécurité ou récupération.
