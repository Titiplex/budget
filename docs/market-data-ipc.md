# IPC données de marché

Cette couche expose les données de marché au renderer sans donner accès à Prisma ni au provider réel. Toutes les réponses utilisent le même format :

```ts
{
  ok: boolean
  data: T | null
  error: { code: string; message: string; details: unknown | null } | null
}
```

## Canaux exposés

| API preload | Canal IPC | Rôle |
| --- | --- | --- |
| `window.marketData.listInstruments(filters)` | `marketData:instrument:list` | Liste les instruments locaux connus. |
| `window.marketData.getLatestSnapshot(options)` | `marketData:snapshot:latest` | Lit le dernier snapshot local pour un instrument ou un lot. |
| `window.marketData.listSnapshotHistory(options)` | `marketData:snapshot:history` | Lit l’historique local minimal des snapshots. |
| `window.marketData.refresh(options)` | `marketData:refresh` | Déclenche un refresh manuel sans exposer le provider au renderer. |
| `window.marketData.getAssetValuation(options)` | `marketData:valuation:get` | Retourne une valorisation exploitable par l’UI. |
| `window.marketData.listFreshnessStatuses(filters)` | `marketData:freshness:list` | Retourne les statuts de fraîcheur des instruments. |

## Erreurs structurées

Les erreurs ne sont pas jetées jusqu’au renderer. Elles sont normalisées dans `error.code` :

- `PROVIDER_UNAVAILABLE` : aucun provider actif ou provider incapable de répondre.
- `UNKNOWN_SYMBOL` : symbole/instrument inconnu.
- `NO_LOCAL_DATA` : aucun snapshot local ou fallback manuel disponible.
- `STALE_DATA` : donnée présente mais obsolète, lorsque le handler doit la signaler.
- `INVALID_INPUT` : payload IPC incomplet ou invalide.
- `INVALID_PRICE` : prix provider inexploitable.
- `INVALID_PROVIDER_RESPONSE` : réponse provider non conforme.
- `REPOSITORY_ERROR` : erreur inattendue côté stockage local.

## Fallback offline

`marketData:refresh` ne casse pas l’écran si le provider échoue. Le résultat contient :

- `status: 'REFRESHED'` quand un nouveau snapshot a été écrit ;
- `status: 'FAILED_WITH_FALLBACK'` quand le provider échoue mais qu’un snapshot local existe ;
- `status: 'FAILED_NO_DATA'` quand aucun fallback local n’est disponible.

Le renderer peut donc afficher le dernier prix local connu tout en signalant clairement l’erreur provider.

## Notes de périmètre

Cette issue ajoute seulement les IPC, le preload et les types renderer. Elle ne crée pas d’UI, pas de refresh automatique, pas de provider temps réel et pas de passage d’ordres.
