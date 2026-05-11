const crypto = require('node:crypto')

const ENCRYPTED_BACKUP_KIND = 'budget-encrypted-backup'
const ENCRYPTED_BACKUP_VERSION = 1
const ENCRYPTED_BACKUP_CIPHER = 'aes-256-gcm'
const ENCRYPTED_BACKUP_KDF = 'scrypt'

const BACKUP_ENCRYPTION_ERROR_CODES = Object.freeze({
    INVALID_ENCRYPTED_BACKUP: 'invalidEncryptedBackup',
    WRONG_PASSWORD: 'wrongPassword',
    UNSUPPORTED_ENCRYPTION_VERSION: 'unsupportedEncryptionVersion',
    CORRUPTED_CIPHERTEXT: 'corruptedCiphertext',
    INVALID_INPUT: 'invalidEncryptionInput',
})

const DEFAULT_KDF_PARAMS = Object.freeze({
    name: ENCRYPTED_BACKUP_KDF,
    saltEncoding: 'base64',
    keyLength: 64,
    N: 16384,
    r: 8,
    p: 1,
})

const DEFAULT_METADATA = Object.freeze({
    contentType: 'application/json',
    purpose: 'local-backup-export',
})

class BackupEncryptionError extends Error {
    constructor(code, message, details = null, recoverable = true) {
        super(message)
        this.name = 'BackupEncryptionError'
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

function fail(code, message, details = null, recoverable = true) {
    throw new BackupEncryptionError(code, message, details, recoverable)
}

function normalizePassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_INPUT,
            'Un mot de passe non vide est obligatoire pour chiffrer ou déchiffrer le backup.',
        )
    }
    return password
}

function normalizeBackupJson(backupJson) {
    if (typeof backupJson !== 'string' || !backupJson.trim()) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_INPUT,
            'Le backup JSON à chiffrer doit être une chaîne non vide.',
        )
    }

    try {
        JSON.parse(backupJson)
    } catch (_error) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_INPUT,
            'Le contenu à chiffrer doit être un JSON valide.',
        )
    }

    return backupJson
}

function normalizeMetadata(metadata = {}) {
    if (metadata == null) return clone(DEFAULT_METADATA)
    if (!isRecord(metadata)) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_INPUT,
            'Les métadonnées de backup chiffré doivent être un objet simple.',
        )
    }

    const normalized = {...DEFAULT_METADATA}

    for (const [key, value] of Object.entries(metadata)) {
        if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key)) {
            fail(
                BACKUP_ENCRYPTION_ERROR_CODES.INVALID_INPUT,
                'Une clé de métadonnées de backup chiffré est invalide.',
                {key},
            )
        }

        if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
            normalized[key] = value
        } else {
            fail(
                BACKUP_ENCRYPTION_ERROR_CODES.INVALID_INPUT,
                'Les métadonnées de backup chiffré doivent rester scalaires et non sensibles.',
                {key},
            )
        }
    }

    return normalized
}

function base64Encode(buffer) {
    return Buffer.from(buffer).toString('base64')
}

function base64Decode(value, fieldName) {
    if (typeof value !== 'string' || !value.length) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            `Le champ ${fieldName} du backup chiffré est obligatoire.`,
            {fieldName},
        )
    }

    try {
        const decoded = Buffer.from(value, 'base64')
        if (!decoded.length || base64Encode(decoded) !== value) {
            throw new Error('Invalid base64')
        }
        return decoded
    } catch (_error) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.CORRUPTED_CIPHERTEXT,
            `Le champ ${fieldName} du backup chiffré n’est pas un base64 valide.`,
            {fieldName},
        )
    }
}

function normalizePositiveInteger(value, fieldName) {
    if (!Number.isInteger(value) || value <= 0) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            `Le paramètre ${fieldName} du KDF est invalide.`,
            {fieldName, value},
        )
    }
    return value
}

function normalizeKdf(kdf) {
    if (!isRecord(kdf)) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            'Le backup chiffré doit déclarer un KDF.',
        )
    }

    if (kdf.name !== ENCRYPTED_BACKUP_KDF) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            'Le KDF du backup chiffré n’est pas supporté.',
            {kdf: kdf.name || null},
        )
    }

    return {
        name: ENCRYPTED_BACKUP_KDF,
        saltEncoding: kdf.saltEncoding === 'base64' ? 'base64' : 'base64',
        keyLength: normalizePositiveInteger(kdf.keyLength, 'keyLength'),
        N: normalizePositiveInteger(kdf.N, 'N'),
        r: normalizePositiveInteger(kdf.r, 'r'),
        p: normalizePositiveInteger(kdf.p, 'p'),
    }
}

function deriveKeys(password, salt, kdf = DEFAULT_KDF_PARAMS) {
    const normalizedPassword = normalizePassword(password)
    const normalizedKdf = normalizeKdf(kdf)
    const keyMaterial = crypto.scryptSync(normalizedPassword, salt, normalizedKdf.keyLength, {
        N: normalizedKdf.N,
        r: normalizedKdf.r,
        p: normalizedKdf.p,
        maxmem: 64 * 1024 * 1024,
    })

    if (keyMaterial.length < 64) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            'La dérivation de clé n’a pas produit assez de matière cryptographique.',
        )
    }

    return {
        encryptionKey: keyMaterial.subarray(0, 32),
        verifierKey: keyMaterial.subarray(32, 64),
    }
}

function stableJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(',')}]`
    }

    if (isRecord(value)) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
    }

    return JSON.stringify(value)
}

function buildAssociatedData(envelope) {
    const aad = {
        kind: envelope.kind,
        version: envelope.version,
        cipher: envelope.cipher,
        kdf: envelope.kdf,
        salt: envelope.salt,
        nonce: envelope.nonce,
        createdAt: envelope.createdAt,
        metadata: envelope.metadata || {},
    }
    return Buffer.from(stableJson(aad), 'utf8')
}

function createPasswordVerifier(verifierKey, associatedData) {
    return crypto
        .createHmac('sha256', verifierKey)
        .update('budget-encrypted-backup-password-verifier')
        .update(associatedData)
        .digest()
}

function assertEnvelopeVersion(version) {
    if (version !== ENCRYPTED_BACKUP_VERSION) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.UNSUPPORTED_ENCRYPTION_VERSION,
            `Version de backup chiffré non supportée (${version}).`,
            {version, supportedVersions: [ENCRYPTED_BACKUP_VERSION]},
        )
    }
}

function normalizeEnvelope(input) {
    let envelope = input

    if (typeof input === 'string') {
        try {
            envelope = JSON.parse(input)
        } catch (_error) {
            fail(
                BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
                'Le backup chiffré doit être un JSON valide.',
            )
        }
    }

    if (!isRecord(envelope)) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            'Le backup chiffré doit être un objet.',
        )
    }

    if (envelope.kind !== ENCRYPTED_BACKUP_KIND) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            'Le fichier ne correspond pas à un backup chiffré Budget valide.',
            {kind: envelope.kind || null},
        )
    }

    assertEnvelopeVersion(envelope.version)

    if (envelope.cipher !== ENCRYPTED_BACKUP_CIPHER) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            'Le chiffrement du backup n’est pas supporté.',
            {cipher: envelope.cipher || null},
        )
    }

    if (typeof envelope.createdAt !== 'string' || Number.isNaN(Date.parse(envelope.createdAt))) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
            'Le backup chiffré doit déclarer une date createdAt valide.',
        )
    }

    const kdf = normalizeKdf(envelope.kdf)
    const metadata = normalizeMetadata(envelope.metadata || {})

    return {
        kind: ENCRYPTED_BACKUP_KIND,
        version: ENCRYPTED_BACKUP_VERSION,
        cipher: ENCRYPTED_BACKUP_CIPHER,
        kdf,
        salt: envelope.salt,
        nonce: envelope.nonce,
        ciphertext: envelope.ciphertext,
        authTag: envelope.authTag,
        keyCheck: envelope.keyCheck,
        createdAt: envelope.createdAt,
        metadata,
    }
}

function encryptBackupJson(backupJson, password, options = {}) {
    const plaintext = normalizeBackupJson(backupJson)
    const metadata = normalizeMetadata(options.metadata || {})
    const salt = crypto.randomBytes(options.saltBytes || 16)
    const nonce = crypto.randomBytes(options.nonceBytes || 12)
    const createdAt = nowIso(options.now)
    const kdf = {...DEFAULT_KDF_PARAMS}
    const keys = deriveKeys(password, salt, kdf)

    const envelopeBase = {
        kind: ENCRYPTED_BACKUP_KIND,
        version: ENCRYPTED_BACKUP_VERSION,
        cipher: ENCRYPTED_BACKUP_CIPHER,
        kdf,
        salt: base64Encode(salt),
        nonce: base64Encode(nonce),
        createdAt,
        metadata,
    }
    const associatedData = buildAssociatedData(envelopeBase)
    const cipher = crypto.createCipheriv(ENCRYPTED_BACKUP_CIPHER, keys.encryptionKey, nonce)
    cipher.setAAD(associatedData)
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ])
    const authTag = cipher.getAuthTag()
    const keyCheck = createPasswordVerifier(keys.verifierKey, associatedData)

    return {
        ...envelopeBase,
        ciphertext: base64Encode(ciphertext),
        authTag: base64Encode(authTag),
        keyCheck: base64Encode(keyCheck),
    }
}

function decryptBackupJson(input, password) {
    const envelope = normalizeEnvelope(input)
    const salt = base64Decode(envelope.salt, 'salt')
    const nonce = base64Decode(envelope.nonce, 'nonce')
    const ciphertext = base64Decode(envelope.ciphertext, 'ciphertext')
    const authTag = base64Decode(envelope.authTag, 'authTag')
    const keyCheck = base64Decode(envelope.keyCheck, 'keyCheck')

    if (nonce.length !== 12) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.CORRUPTED_CIPHERTEXT,
            'Le nonce du backup chiffré a une taille invalide.',
            {nonceLength: nonce.length},
        )
    }

    if (authTag.length !== 16) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.CORRUPTED_CIPHERTEXT,
            'Le tag d’authentification du backup chiffré a une taille invalide.',
            {authTagLength: authTag.length},
        )
    }

    const keys = deriveKeys(password, salt, envelope.kdf)
    const associatedData = buildAssociatedData(envelope)
    const expectedKeyCheck = createPasswordVerifier(keys.verifierKey, associatedData)

    if (keyCheck.length !== expectedKeyCheck.length || !crypto.timingSafeEqual(keyCheck, expectedKeyCheck)) {
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.WRONG_PASSWORD,
            'Le mot de passe du backup chiffré est incorrect.',
        )
    }

    try {
        const decipher = crypto.createDecipheriv(ENCRYPTED_BACKUP_CIPHER, keys.encryptionKey, nonce)
        decipher.setAAD(associatedData)
        decipher.setAuthTag(authTag)
        const plaintext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]).toString('utf8')

        normalizeBackupJson(plaintext)
        return plaintext
    } catch (error) {
        if (error instanceof BackupEncryptionError) throw error
        fail(
            BACKUP_ENCRYPTION_ERROR_CODES.CORRUPTED_CIPHERTEXT,
            'Le contenu chiffré du backup est corrompu ou a été modifié.',
            {cause: error.message || null},
        )
    }
}

function serializeEncryptedBackup(envelope) {
    const normalized = normalizeEnvelope(envelope)
    return `${JSON.stringify(normalized, null, 2)}\n`
}

function parseEncryptedBackup(content) {
    return normalizeEnvelope(content)
}

function toBackupEncryptionIpcError(error) {
    if (error instanceof BackupEncryptionError) {
        return {
            code: error.code,
            message: error.message,
            details: error.details || null,
            recoverable: error.recoverable !== false,
        }
    }

    return {
        code: error?.code || BACKUP_ENCRYPTION_ERROR_CODES.INVALID_ENCRYPTED_BACKUP,
        message: error?.message || 'Erreur de chiffrement de backup inconnue.',
        details: error?.details || null,
        recoverable: true,
    }
}

module.exports = {
    BACKUP_ENCRYPTION_ERROR_CODES,
    DEFAULT_KDF_PARAMS,
    ENCRYPTED_BACKUP_CIPHER,
    ENCRYPTED_BACKUP_KDF,
    ENCRYPTED_BACKUP_KIND,
    ENCRYPTED_BACKUP_VERSION,
    BackupEncryptionError,
    decryptBackupJson,
    encryptBackupJson,
    parseEncryptedBackup,
    serializeEncryptedBackup,
    toBackupEncryptionIpcError,
}
