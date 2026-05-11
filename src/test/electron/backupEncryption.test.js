import {describe, expect, it} from 'vitest'

function loadBackupEncryption() {
    return require('../../../electron/security/backupEncryption')
}

function sampleBackupJson() {
    return JSON.stringify({
        kind: 'budget-backup',
        version: 6,
        exportedAt: '2026-05-08T12:00:00.000Z',
        data: {
            accounts: [{id: 1, name: 'Main', type: 'BANK', currency: 'CAD'}],
            categories: [],
            budgetTargets: [],
            recurringTemplates: [],
            transactions: [],
            taxProfiles: [],
            financialGoals: [],
            projectionScenarios: [],
            projectionSettings: null,
            importBackup: null,
        },
    }, null, 2)
}

function flipBase64Byte(value) {
    const buffer = Buffer.from(value, 'base64')
    buffer[0] = buffer[0] ^ 0xff
    return buffer.toString('base64')
}

describe('backup encryption primitives', () => {
    it('encrypts and decrypts a backup JSON roundtrip', () => {
        const {
            ENCRYPTED_BACKUP_KIND,
            ENCRYPTED_BACKUP_VERSION,
            decryptBackupJson,
            encryptBackupJson,
            serializeEncryptedBackup,
            parseEncryptedBackup,
        } = loadBackupEncryption()
        const backupJson = sampleBackupJson()

        const envelope = encryptBackupJson(backupJson, 'correct horse battery staple', {
            now: () => new Date('2026-05-08T12:00:00.000Z'),
            metadata: {source: 'unit-test', backupVersion: 6},
        })

        expect(envelope).toMatchObject({
            kind: ENCRYPTED_BACKUP_KIND,
            version: ENCRYPTED_BACKUP_VERSION,
            cipher: 'aes-256-gcm',
            createdAt: '2026-05-08T12:00:00.000Z',
            metadata: expect.objectContaining({
                contentType: 'application/json',
                purpose: 'local-backup-export',
                source: 'unit-test',
                backupVersion: 6,
            }),
        })
        expect(envelope.ciphertext).not.toContain('Main')
        expect(JSON.stringify(envelope)).not.toContain('correct horse battery staple')

        const serialized = serializeEncryptedBackup(envelope)
        const parsed = parseEncryptedBackup(serialized)
        const decrypted = decryptBackupJson(parsed, 'correct horse battery staple')

        expect(JSON.parse(decrypted)).toEqual(JSON.parse(backupJson))
    })

    it('fails cleanly when the password is wrong', () => {
        const {
            BACKUP_ENCRYPTION_ERROR_CODES,
            decryptBackupJson,
            encryptBackupJson,
        } = loadBackupEncryption()
        const envelope = encryptBackupJson(sampleBackupJson(), 'right-password')

        expect(() => decryptBackupJson(envelope, 'wrong-password'))
            .toThrow(expect.objectContaining({
                code: BACKUP_ENCRYPTION_ERROR_CODES.WRONG_PASSWORD,
            }))
    })

    it('detects modified encrypted content', () => {
        const {
            BACKUP_ENCRYPTION_ERROR_CODES,
            decryptBackupJson,
            encryptBackupJson,
        } = loadBackupEncryption()
        const envelope = encryptBackupJson(sampleBackupJson(), 'right-password')
        const tampered = {
            ...envelope,
            ciphertext: flipBase64Byte(envelope.ciphertext),
        }

        expect(() => decryptBackupJson(tampered, 'right-password'))
            .toThrow(expect.objectContaining({
                code: BACKUP_ENCRYPTION_ERROR_CODES.CORRUPTED_CIPHERTEXT,
            }))
    })

    it('rejects unknown encrypted backup versions', () => {
        const {
            BACKUP_ENCRYPTION_ERROR_CODES,
            decryptBackupJson,
            encryptBackupJson,
        } = loadBackupEncryption()
        const envelope = encryptBackupJson(sampleBackupJson(), 'password')

        expect(() => decryptBackupJson({...envelope, version: 999}, 'password'))
            .toThrow(expect.objectContaining({
                code: BACKUP_ENCRYPTION_ERROR_CODES.UNSUPPORTED_ENCRYPTION_VERSION,
            }))
    })

    it('uses different salt, nonce and ciphertext for two identical exports', () => {
        const {encryptBackupJson} = loadBackupEncryption()
        const backupJson = sampleBackupJson()
        const first = encryptBackupJson(backupJson, 'same-password', {
            now: () => new Date('2026-05-08T12:00:00.000Z'),
        })
        const second = encryptBackupJson(backupJson, 'same-password', {
            now: () => new Date('2026-05-08T12:00:00.000Z'),
        })

        expect(first.salt).not.toBe(second.salt)
        expect(first.nonce).not.toBe(second.nonce)
        expect(first.ciphertext).not.toBe(second.ciphertext)
    })

    it('rejects non-backup JSON before encryption', () => {
        const {
            BACKUP_ENCRYPTION_ERROR_CODES,
            encryptBackupJson,
        } = loadBackupEncryption()

        expect(() => encryptBackupJson('not-json', 'password'))
            .toThrow(expect.objectContaining({
                code: BACKUP_ENCRYPTION_ERROR_CODES.INVALID_INPUT,
            }))
    })
})
