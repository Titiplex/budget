import type {ImportEntityId, IsoDateString} from './imports'

declare module './imports' {
    interface ImportAppliedLink {
        transactionId?: ImportEntityId | null
        assetId?: ImportEntityId | null
    }

    interface ImportMappingTemplate {
        defaultCurrency?: string
        dateFormat?: string
        decimalSeparator?: string
        isSystem?: boolean
        isPreset?: boolean
        isActive?: boolean
        notes?: string
        universalCompatibility?: boolean
    }

    interface ImportBatch {
        restoredFromBackup?: boolean
        restoredAt?: IsoDateString
        restoredAsAuditOnly?: boolean
        originalBackupBatchId?: ImportEntityId
    }
}
