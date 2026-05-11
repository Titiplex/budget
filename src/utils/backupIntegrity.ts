export const BACKUP_INTEGRITY_MANIFEST_VERSION = 1
export const BACKUP_INTEGRITY_CHECKSUM_ALGORITHM = 'stable-json-fnv1a32-v1'

export type BackupIntegrityStatus = 'valid' | 'legacy' | 'invalid' | 'unsupported'

export interface BackupIntegrityManifest {
    version: typeof BACKUP_INTEGRITY_MANIFEST_VERSION
    formatVersion: number
    exportedAt: string
    algorithm: typeof BACKUP_INTEGRITY_CHECKSUM_ALGORITHM
    sections: string[]
    counts: Record<string, number>
    checksum: string
    sectionChecksums: Record<string, string>
}

export interface BackupIntegrityVerification {
    status: BackupIntegrityStatus
    ok: boolean
    manifestVersion: number | null
    algorithm: string | null
    checksum: string | null
    expectedChecksum: string | null
    sections: string[]
    counts: Record<string, number>
    warnings: string[]
    errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeForIntegrity(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sanitizeForIntegrity)
    if (!isRecord(value)) return value

    const entries = Object.entries(value)
        .filter(([key]) => key !== 'integrity' && key !== 'integrityVerification')
        .sort(([left], [right]) => left.localeCompare(right))

    return Object.fromEntries(entries.map(([key, entry]) => [key, sanitizeForIntegrity(entry)]))
}

export function stableStringify(value: unknown): string {
    return JSON.stringify(sanitizeForIntegrity(value))
}

export function checksumStableJson(value: unknown): string {
    const input = stableStringify(value)
    let hash = 0x811c9dc5

    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }

    return `${BACKUP_INTEGRITY_CHECKSUM_ALGORITHM}:${hash.toString(16).padStart(8, '0')}`
}

function sectionNames(root: Record<string, unknown>) {
    const data = isRecord(root.data) ? root.data : {}
    return Object.keys(data).sort()
}

function sectionCount(value: unknown): number {
    if (Array.isArray(value)) return value.length
    if (value == null) return 0
    return 1
}

function sectionCounts(root: Record<string, unknown>, sections = sectionNames(root)) {
    const data = isRecord(root.data) ? root.data : {}
    return Object.fromEntries(sections.map((section) => [section, sectionCount(data[section])]))
}

function sectionChecksums(root: Record<string, unknown>, sections = sectionNames(root)) {
    const data = isRecord(root.data) ? root.data : {}
    return Object.fromEntries(sections.map((section) => [section, checksumStableJson(data[section])]))
}

function normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) return null
    const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    return strings.length === value.length ? strings : null
}

function normalizeCounts(value: unknown): Record<string, number> | null {
    if (!isRecord(value)) return null
    const entries: Array<[string, number]> = []
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0) return null
        entries.push([key, entry])
    }
    return Object.fromEntries(entries)
}

function normalizeChecksumMap(value: unknown): Record<string, string> | null {
    if (!isRecord(value)) return null
    const entries: Array<[string, string]> = []
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string' || !entry.trim()) return null
        entries.push([key, entry])
    }
    return Object.fromEntries(entries)
}

export function createBackupIntegrityManifest(root: Record<string, unknown>): BackupIntegrityManifest {
    const baseRoot = sanitizeForIntegrity(root) as Record<string, unknown>
    const sections = sectionNames(baseRoot)
    const counts = sectionCounts(baseRoot, sections)
    const perSection = sectionChecksums(baseRoot, sections)

    return {
        version: BACKUP_INTEGRITY_MANIFEST_VERSION,
        formatVersion: Number(baseRoot.version || 0),
        exportedAt: typeof baseRoot.exportedAt === 'string' ? baseRoot.exportedAt : new Date(0).toISOString(),
        algorithm: BACKUP_INTEGRITY_CHECKSUM_ALGORITHM,
        sections,
        counts,
        checksum: checksumStableJson(baseRoot),
        sectionChecksums: perSection,
    }
}

export function withBackupIntegrityManifest<T extends Record<string, unknown>>(snapshot: T): T & {integrity: BackupIntegrityManifest} {
    const cleanSnapshot = sanitizeForIntegrity(snapshot) as T
    return {
        ...cleanSnapshot,
        integrity: createBackupIntegrityManifest(cleanSnapshot),
    }
}

export function verifyBackupIntegrityManifest(root: Record<string, unknown>): BackupIntegrityVerification {
    const manifest = root.integrity
    const actualRoot = sanitizeForIntegrity(root) as Record<string, unknown>
    const actualSections = sectionNames(actualRoot)
    const actualCounts = sectionCounts(actualRoot, actualSections)
    const errors: string[] = []
    const warnings: string[] = []

    if (manifest == null) {
        warnings.push('Checksum manquant : backup legacy sans manifeste d’intégrité.')
        return {
            status: 'legacy',
            ok: true,
            manifestVersion: null,
            algorithm: null,
            checksum: null,
            expectedChecksum: checksumStableJson(actualRoot),
            sections: actualSections,
            counts: actualCounts,
            warnings,
            errors,
        }
    }

    if (!isRecord(manifest)) {
        errors.push('Manifeste d’intégrité invalide : la section integrity doit être un objet.')
        return {
            status: 'invalid',
            ok: false,
            manifestVersion: null,
            algorithm: null,
            checksum: null,
            expectedChecksum: checksumStableJson(actualRoot),
            sections: actualSections,
            counts: actualCounts,
            warnings,
            errors,
        }
    }

    const manifestVersion = typeof manifest.version === 'number' ? manifest.version : null
    const algorithm = typeof manifest.algorithm === 'string' ? manifest.algorithm : null
    const checksum = typeof manifest.checksum === 'string' ? manifest.checksum : null
    const expectedChecksum = checksumStableJson(actualRoot)
    const declaredSections = normalizeStringArray(manifest.sections)
    const declaredCounts = normalizeCounts(manifest.counts)
    const declaredSectionChecksums = normalizeChecksumMap(manifest.sectionChecksums)

    if (manifestVersion !== BACKUP_INTEGRITY_MANIFEST_VERSION) {
        errors.push(`Version de manifeste d’intégrité non supportée (${String(manifest.version)}).`)
    }
    if (algorithm !== BACKUP_INTEGRITY_CHECKSUM_ALGORITHM) {
        errors.push(`Algorithme de checksum non supporté (${String(manifest.algorithm || 'absent')}).`)
    }
    if (!checksum) {
        errors.push('Checksum global manquant dans le manifeste d’intégrité.')
    }
    if (!declaredSections) {
        errors.push('Liste des sections manquante ou invalide dans le manifeste d’intégrité.')
    }
    if (!declaredCounts) {
        errors.push('Compteurs de sections manquants ou invalides dans le manifeste d’intégrité.')
    }

    if (declaredSections) {
        for (const section of declaredSections) {
            if (!actualSections.includes(section)) errors.push(`Section data.${section} absente du backup.`)
        }
        for (const section of actualSections) {
            if (!declaredSections.includes(section)) warnings.push(`Section data.${section} absente du manifeste d’intégrité.`)
        }
    }

    if (declaredCounts) {
        for (const [section, expected] of Object.entries(declaredCounts)) {
            const actual = actualCounts[section]
            if (actual == null) {
                errors.push(`Section data.${section} absente du backup.`)
            } else if (actual !== expected) {
                errors.push(`Nombre d’éléments incohérent pour data.${section}: attendu ${expected}, obtenu ${actual}.`)
            }
        }
    }

    if (declaredSectionChecksums) {
        const actualSectionChecksums = sectionChecksums(actualRoot, actualSections)
        for (const [section, expected] of Object.entries(declaredSectionChecksums)) {
            if (!actualSections.includes(section)) continue
            if (actualSectionChecksums[section] !== expected) {
                errors.push(`Checksum invalide pour data.${section}.`)
            }
        }
    } else {
        warnings.push('Checksums par section absents du manifeste d’intégrité.')
    }

    if (checksum && checksum !== expectedChecksum) {
        errors.push('Checksum global invalide : le backup a été modifié ou corrompu.')
    }

    const unsupported = errors.some((error) => /non support/.test(error))
    return {
        status: errors.length ? (unsupported ? 'unsupported' : 'invalid') : 'valid',
        ok: errors.length === 0,
        manifestVersion,
        algorithm,
        checksum,
        expectedChecksum,
        sections: declaredSections || actualSections,
        counts: declaredCounts || actualCounts,
        warnings,
        errors,
    }
}
