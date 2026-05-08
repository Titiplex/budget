const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const SECRET_STORE_KIND = 'budget-secret-store'
const SECRET_STORE_FORMAT_VERSION = 1

const SECRET_STORE_BACKENDS = Object.freeze({
    ELECTRON_SAFE_STORAGE: 'electronSafeStorage',
    LOCAL_FALLBACK: 'localFallback',
    MEMORY: 'memory',
})

const SECRET_SECURITY_LEVELS = Object.freeze({
    OS_PROTECTED: 'osProtected',
    LOCAL_FALLBACK: 'localFallbackLessSecure',
    MEMORY_ONLY: 'memoryOnly',
})

const SECRET_ERROR_CODES = Object.freeze({
    SECRET_UNAVAILABLE: 'secretUnavailable',
    SECRET_STORE_UNAVAILABLE: 'secretStoreUnavailable',
    SECRET_ACCESS_DENIED: 'secretAccessDenied',
    SECRET_CORRUPTED: 'secretCorrupted',
    INVALID_INPUT: 'invalidSecretInput',
})

class SecretStoreError extends Error {
    constructor(code, message, details = null, recoverable = true) {
        super(message)
        this.name = 'SecretStoreError'
        this.code = code
        this.details = details
        this.recoverable = recoverable
    }
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function nowIso(now = () => new Date()) {
    const value = typeof now === 'function' ? now() : now
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function failInvalid(message, details = null) {
    throw new SecretStoreError(SECRET_ERROR_CODES.INVALID_INPUT, message, details)
}

function normalizeSecretRef(input, fieldName = 'secret') {
    const raw = typeof input === 'string'
        ? {id: input}
        : isRecord(input)
            ? input
            : null

    if (!raw) {
        failInvalid(`${fieldName} doit être une chaîne ou un objet.`)
    }

    const namespace = normalizeText(raw.namespace) || normalizeText(raw.provider) || normalizeText(raw.service) || 'default'
    const key = normalizeText(raw.id) || normalizeText(raw.secretId) || normalizeText(raw.key) || normalizeText(raw.name)

    if (!key) {
        failInvalid(`${fieldName}.id est obligatoire.`, {fieldName})
    }

    if (/\p{C}/u.test(key) || /\p{C}/u.test(namespace)) {
        failInvalid(`${fieldName}.id ne doit pas contenir de caractères de contrôle.`, {fieldName, key, namespace})
    }

    const id = key.includes(':') ? key : `${namespace}:${key}`

    if (id.length > 240) {
        failInvalid(`${fieldName}.id est trop long.`, {fieldName, idLength: id.length})
    }

    return {
        id,
        namespace,
        key,
        label: normalizeText(raw.label) || key,
        description: normalizeText(raw.description),
    }
}

function normalizeSecretInput(input) {
    if (!isRecord(input)) {
        failInvalid('Le secret doit être un objet.')
    }

    const ref = normalizeSecretRef(input)
    const value = input.value ?? input.secret ?? input.secretValue

    if (typeof value !== 'string') {
        failInvalid('La valeur du secret doit être une chaîne de caractères.', {id: ref.id})
    }

    if (!value.length) {
        failInvalid('La valeur du secret ne peut pas être vide.', {id: ref.id})
    }

    return {...ref, value}
}

function isAccessDeniedError(error) {
    return ['EACCES', 'EPERM'].includes(error?.code)
}

function toSecretStoreError(error, fallbackMessage = 'Erreur inconnue du coffre de secrets local.') {
    if (error instanceof SecretStoreError) return error

    if (isAccessDeniedError(error)) {
        return new SecretStoreError(
            SECRET_ERROR_CODES.SECRET_ACCESS_DENIED,
            'Accès refusé au coffre de secrets local.',
            {cause: error.message || null, code: error.code || null},
        )
    }

    return new SecretStoreError(
        error?.code || SECRET_ERROR_CODES.SECRET_STORE_UNAVAILABLE,
        error?.message || fallbackMessage,
        error?.details || null,
    )
}

function toSecretStoreIpcError(error) {
    const normalized = toSecretStoreError(error)
    return {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details || null,
        recoverable: normalized.recoverable !== false,
    }
}

function metadataFromRecord(record) {
    return {
        id: record.id,
        namespace: record.namespace,
        label: record.label,
        description: record.description || null,
        storageBackend: record.storageBackend,
        securityLevel: record.securityLevel,
        lessSecureFallback: record.securityLevel === SECRET_SECURITY_LEVELS.LOCAL_FALLBACK,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastReadAt: record.lastReadAt || null,
    }
}

function ensureDirectory(directory) {
    fs.mkdirSync(directory, {recursive: true, mode: 0o700})
}

function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null
        const raw = fs.readFileSync(filePath, 'utf8')
        return JSON.parse(raw)
    } catch (error) {
        if (isAccessDeniedError(error)) throw toSecretStoreError(error)
        throw new SecretStoreError(
            SECRET_ERROR_CODES.SECRET_CORRUPTED,
            'Le fichier du coffre de secrets local est invalide ou corrompu.',
            {filePath},
        )
    }
}

function writeJsonFileAtomic(filePath, value) {
    const directory = path.dirname(filePath)
    ensureDirectory(directory)
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    const serialized = `${JSON.stringify(value, null, 2)}\n`

    try {
        fs.writeFileSync(temporaryPath, serialized, {encoding: 'utf8', mode: 0o600})
        fs.renameSync(temporaryPath, filePath)
    } catch (error) {
        try {
            if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
        } catch (_cleanupError) {
            // Best effort cleanup only.
        }
        throw toSecretStoreError(error)
    }
}

function emptyVault(storageBackend, securityLevel) {
    return {
        kind: SECRET_STORE_KIND,
        version: SECRET_STORE_FORMAT_VERSION,
        storageBackend,
        securityLevel,
        records: {},
    }
}

function normalizeVault(value, expectedBackend, expectedSecurityLevel) {
    if (value == null) return emptyVault(expectedBackend, expectedSecurityLevel)

    if (!isRecord(value) || value.kind !== SECRET_STORE_KIND || value.version !== SECRET_STORE_FORMAT_VERSION || !isRecord(value.records)) {
        throw new SecretStoreError(
            SECRET_ERROR_CODES.SECRET_CORRUPTED,
            'Le coffre de secrets local ne correspond pas au format attendu.',
        )
    }

    return {
        kind: SECRET_STORE_KIND,
        version: SECRET_STORE_FORMAT_VERSION,
        storageBackend: value.storageBackend || expectedBackend,
        securityLevel: value.securityLevel || expectedSecurityLevel,
        records: value.records,
    }
}

function assertSafeStorageAvailable(safeStorage) {
    const available = safeStorage &&
        typeof safeStorage.encryptString === 'function' &&
        typeof safeStorage.decryptString === 'function' &&
        (typeof safeStorage.isEncryptionAvailable !== 'function' || safeStorage.isEncryptionAvailable())

    if (!available) {
        throw new SecretStoreError(
            SECRET_ERROR_CODES.SECRET_STORE_UNAVAILABLE,
            'Aucun coffre OS compatible n’est disponible pour les secrets locaux.',
        )
    }
}

function createSafeStorageCipher(safeStorage) {
    assertSafeStorageAvailable(safeStorage)

    return {
        storageBackend: SECRET_STORE_BACKENDS.ELECTRON_SAFE_STORAGE,
        securityLevel: SECRET_SECURITY_LEVELS.OS_PROTECTED,
        encrypt(value) {
            try {
                return {
                    algorithm: 'electron.safeStorage',
                    encoding: 'base64',
                    ciphertext: Buffer.from(safeStorage.encryptString(value)).toString('base64'),
                }
            } catch (error) {
                throw new SecretStoreError(
                    SECRET_ERROR_CODES.SECRET_ACCESS_DENIED,
                    'Le coffre OS a refusé le chiffrement du secret.',
                    {cause: error.message || null},
                )
            }
        },
        decrypt(payload) {
            try {
                if (!isRecord(payload) || payload.algorithm !== 'electron.safeStorage' || typeof payload.ciphertext !== 'string') {
                    throw new Error('Invalid safeStorage payload')
                }
                return safeStorage.decryptString(Buffer.from(payload.ciphertext, 'base64'))
            } catch (error) {
                throw new SecretStoreError(
                    SECRET_ERROR_CODES.SECRET_CORRUPTED,
                    'Le secret ne peut pas être déchiffré depuis le coffre OS.',
                    {cause: error.message || null},
                )
            }
        },
    }
}

function readOrCreateFallbackKey(keyPath) {
    try {
        ensureDirectory(path.dirname(keyPath))

        if (!fs.existsSync(keyPath)) {
            const key = crypto.randomBytes(32).toString('base64')
            fs.writeFileSync(keyPath, `${key}\n`, {encoding: 'utf8', mode: 0o600})
            return Buffer.from(key, 'base64')
        }

        const raw = fs.readFileSync(keyPath, 'utf8').trim()
        const key = Buffer.from(raw, 'base64')
        if (key.length !== 32) {
            throw new SecretStoreError(
                SECRET_ERROR_CODES.SECRET_CORRUPTED,
                'La clé locale de fallback du coffre de secrets est invalide.',
                {keyPath},
            )
        }
        return key
    } catch (error) {
        throw toSecretStoreError(error)
    }
}

function createLocalFallbackCipher({directory}) {
    const keyPath = path.join(directory, 'local-fallback.key')
    const key = readOrCreateFallbackKey(keyPath)

    return {
        storageBackend: SECRET_STORE_BACKENDS.LOCAL_FALLBACK,
        securityLevel: SECRET_SECURITY_LEVELS.LOCAL_FALLBACK,
        warning: 'Fallback local moins sûr : la clé de chiffrement est stockée sur la même machine que les secrets chiffrés.',
        encrypt(value) {
            const iv = crypto.randomBytes(12)
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
            const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
            const tag = cipher.getAuthTag()

            return {
                algorithm: 'aes-256-gcm-local-fallback',
                encoding: 'base64',
                iv: iv.toString('base64'),
                tag: tag.toString('base64'),
                ciphertext: ciphertext.toString('base64'),
            }
        },
        decrypt(payload) {
            try {
                if (!isRecord(payload) || payload.algorithm !== 'aes-256-gcm-local-fallback') {
                    throw new Error('Invalid fallback payload')
                }

                const decipher = crypto.createDecipheriv(
                    'aes-256-gcm',
                    key,
                    Buffer.from(payload.iv, 'base64'),
                )
                decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
                return Buffer.concat([
                    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
                    decipher.final(),
                ]).toString('utf8')
            } catch (error) {
                throw new SecretStoreError(
                    SECRET_ERROR_CODES.SECRET_CORRUPTED,
                    'Le secret local de fallback ne peut pas être déchiffré.',
                    {cause: error.message || null},
                )
            }
        },
    }
}

class FileBackedSecretStore {
    constructor({directory, cipher, now = () => new Date()} = {}) {
        if (!directory) {
            throw new SecretStoreError(
                SECRET_ERROR_CODES.SECRET_STORE_UNAVAILABLE,
                'Un répertoire local est obligatoire pour initialiser le coffre de secrets.',
            )
        }
        if (!cipher) {
            throw new SecretStoreError(
                SECRET_ERROR_CODES.SECRET_STORE_UNAVAILABLE,
                'Aucun backend de chiffrement de secrets n’est disponible.',
            )
        }

        this.directory = directory
        this.filePath = path.join(directory, 'secret-store.json')
        this.cipher = cipher
        this.now = now
    }

    loadVault() {
        return normalizeVault(
            readJsonFile(this.filePath),
            this.cipher.storageBackend,
            this.cipher.securityLevel,
        )
    }

    saveVault(vault) {
        writeJsonFileAtomic(this.filePath, vault)
    }

    async saveSecret(input) {
        const normalized = normalizeSecretInput(input)
        const vault = this.loadVault()
        const existing = vault.records[normalized.id]
        const timestamp = nowIso(this.now)
        const record = {
            id: normalized.id,
            namespace: normalized.namespace,
            label: normalized.label,
            description: normalized.description,
            storageBackend: this.cipher.storageBackend,
            securityLevel: this.cipher.securityLevel,
            createdAt: existing?.createdAt || timestamp,
            updatedAt: timestamp,
            lastReadAt: existing?.lastReadAt || null,
            encryptedValue: this.cipher.encrypt(normalized.value),
        }

        vault.storageBackend = this.cipher.storageBackend
        vault.securityLevel = this.cipher.securityLevel
        vault.records[normalized.id] = record
        this.saveVault(vault)
        return metadataFromRecord(record)
    }

    async readSecret(input) {
        const ref = normalizeSecretRef(input)
        const vault = this.loadVault()
        const record = vault.records[ref.id]

        if (!record) {
            throw new SecretStoreError(
                SECRET_ERROR_CODES.SECRET_UNAVAILABLE,
                'Secret local introuvable.',
                {id: ref.id},
            )
        }

        const value = this.cipher.decrypt(record.encryptedValue)
        record.lastReadAt = nowIso(this.now)
        vault.records[ref.id] = record
        this.saveVault(vault)
        return {value, metadata: metadataFromRecord(record)}
    }

    async deleteSecret(input) {
        const ref = normalizeSecretRef(input)
        const vault = this.loadVault()
        const deleted = Boolean(vault.records[ref.id])
        delete vault.records[ref.id]
        this.saveVault(vault)
        return {id: ref.id, deleted}
    }

    async hasSecret(input) {
        const ref = normalizeSecretRef(input)
        const vault = this.loadVault()
        return Boolean(vault.records[ref.id])
    }

    async listSecretMetadata(options = {}) {
        const namespace = isRecord(options) ? normalizeText(options.namespace) : null
        const vault = this.loadVault()
        return Object.values(vault.records)
            .filter((record) => !namespace || record.namespace === namespace)
            .map(metadataFromRecord)
            .sort((a, b) => a.id.localeCompare(b.id))
    }

    async clearSecrets(options = {}) {
        const namespace = isRecord(options) ? normalizeText(options.namespace) : null
        const vault = this.loadVault()
        const ids = Object.keys(vault.records).filter((id) => !namespace || vault.records[id].namespace === namespace)

        for (const id of ids) {
            delete vault.records[id]
        }

        this.saveVault(vault)
        return {deletedCount: ids.length, namespace: namespace || null}
    }

    getStorageInfo() {
        return {
            storageBackend: this.cipher.storageBackend,
            securityLevel: this.cipher.securityLevel,
            lessSecureFallback: this.cipher.securityLevel === SECRET_SECURITY_LEVELS.LOCAL_FALLBACK,
            warning: this.cipher.warning || null,
            filePath: this.filePath,
        }
    }
}

function createMemorySecretStore({now = () => new Date()} = {}) {
    const records = new Map()

    return {
        async saveSecret(input) {
            const normalized = normalizeSecretInput(input)
            const existing = records.get(normalized.id)
            const timestamp = nowIso(now)
            const record = {
                id: normalized.id,
                namespace: normalized.namespace,
                label: normalized.label,
                description: normalized.description,
                storageBackend: SECRET_STORE_BACKENDS.MEMORY,
                securityLevel: SECRET_SECURITY_LEVELS.MEMORY_ONLY,
                createdAt: existing?.createdAt || timestamp,
                updatedAt: timestamp,
                lastReadAt: existing?.lastReadAt || null,
                value: normalized.value,
            }
            records.set(normalized.id, record)
            return metadataFromRecord(record)
        },
        async readSecret(input) {
            const ref = normalizeSecretRef(input)
            const record = records.get(ref.id)
            if (!record) {
                throw new SecretStoreError(
                    SECRET_ERROR_CODES.SECRET_UNAVAILABLE,
                    'Secret local introuvable.',
                    {id: ref.id},
                )
            }
            record.lastReadAt = nowIso(now)
            records.set(ref.id, record)
            return {value: record.value, metadata: metadataFromRecord(record)}
        },
        async deleteSecret(input) {
            const ref = normalizeSecretRef(input)
            return {id: ref.id, deleted: records.delete(ref.id)}
        },
        async hasSecret(input) {
            const ref = normalizeSecretRef(input)
            return records.has(ref.id)
        },
        async listSecretMetadata(options = {}) {
            const namespace = isRecord(options) ? normalizeText(options.namespace) : null
            return [...records.values()]
                .filter((record) => !namespace || record.namespace === namespace)
                .map(metadataFromRecord)
                .sort((a, b) => a.id.localeCompare(b.id))
        },
        async clearSecrets(options = {}) {
            const namespace = isRecord(options) ? normalizeText(options.namespace) : null
            const ids = [...records.keys()].filter((id) => !namespace || records.get(id).namespace === namespace)
            ids.forEach((id) => records.delete(id))
            return {deletedCount: ids.length, namespace: namespace || null}
        },
        getStorageInfo() {
            return {
                storageBackend: SECRET_STORE_BACKENDS.MEMORY,
                securityLevel: SECRET_SECURITY_LEVELS.MEMORY_ONLY,
                lessSecureFallback: false,
                warning: null,
                filePath: null,
            }
        },
        _dumpForTests() {
            return clone([...records.values()])
        },
    }
}

function createFileSecretStore({directory, safeStorage = null, allowLocalFallback = true, now = () => new Date()} = {}) {
    let cipher = null

    if (safeStorage) {
        try {
            cipher = createSafeStorageCipher(safeStorage)
        } catch (error) {
            if (!allowLocalFallback) throw error
        }
    }

    if (!cipher) {
        if (!allowLocalFallback) {
            throw new SecretStoreError(
                SECRET_ERROR_CODES.SECRET_STORE_UNAVAILABLE,
                'Aucun coffre OS disponible et le fallback local est désactivé.',
            )
        }
        cipher = createLocalFallbackCipher({directory})
    }

    return new FileBackedSecretStore({directory, cipher, now})
}

function createSecretStore({app = null, safeStorage = null, directory = null, allowLocalFallback = true, now = () => new Date()} = {}) {
    const baseDirectory = directory || (app && typeof app.getPath === 'function'
        ? path.join(app.getPath('userData'), 'secrets')
        : null)

    return createFileSecretStore({
        directory: baseDirectory,
        safeStorage,
        allowLocalFallback,
        now,
    })
}

module.exports = {
    SECRET_ERROR_CODES,
    SECRET_SECURITY_LEVELS,
    SECRET_STORE_BACKENDS,
    SECRET_STORE_FORMAT_VERSION,
    SECRET_STORE_KIND,
    SecretStoreError,
    createFileSecretStore,
    createMemorySecretStore,
    createSecretStore,
    normalizeSecretRef,
    toSecretStoreError,
    toSecretStoreIpcError,
}
