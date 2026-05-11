export {}

interface RecoverySnapshotMetadataDto {
    id: string
    fileName: string
    filePath: string
    metadataPath?: string
    createdAt: string
    operationType: string
    reason: string
    source: string
    sizeBytes: number
}

interface RecoverySnapshotPolicyDto {
    maxSnapshots: number
    maxBytes: number
    directory: string
}

interface RecoverySnapshotReadDto {
    metadata: RecoverySnapshotMetadataDto
    content: string
}

interface RecoverySnapshotIpcResultDto<T> {
    ok: boolean
    data: T | null
    error: {code: string; message: string} | null
}

declare global {
    interface Window {
        recoverySnapshots?: {
            create: (input: {
                content: string
                operationType: string
                reason: string
                source?: string
            }) => Promise<RecoverySnapshotIpcResultDto<RecoverySnapshotMetadataDto>>
            list: () => Promise<RecoverySnapshotIpcResultDto<RecoverySnapshotMetadataDto[]>>
            read: (id: string) => Promise<RecoverySnapshotIpcResultDto<RecoverySnapshotReadDto>>
            delete: (id: string) => Promise<RecoverySnapshotIpcResultDto<{deleted: boolean; id?: string}>>
            markRestored: (input: {
                id?: string
                filePath?: string
                source?: string
            }) => Promise<RecoverySnapshotIpcResultDto<{ok: boolean}>>
            getPolicy: () => Promise<RecoverySnapshotIpcResultDto<RecoverySnapshotPolicyDto>>
        }
    }
}
