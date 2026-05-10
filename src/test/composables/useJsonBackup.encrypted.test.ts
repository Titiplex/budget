import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'
import {useJsonBackup} from '../../composables/useJsonBackup'
import type {BudgetBackupSnapshot} from '../../types/budget'
import {i18n} from '../../i18n'

function validSnapshot(): BudgetBackupSnapshot {
    return {
        kind: 'budget-backup',
        version: 4,
        exportedAt: '2026-05-08T12:00:00.000Z',
        data: {
            accounts: [{
                id: 1,
                name: 'Main',
                type: 'BANK',
                currency: 'CAD',
                description: null,
                institutionCountry: null,
                institutionRegion: null,
                taxReportingType: 'STANDARD',
                openedAt: null,
                closedAt: null,
            }],
            categories: [],
            budgetTargets: [],
            recurringTemplates: [],
            transactions: [],
            taxProfiles: [],
        },
    }
}

function installBridgeMocks() {
    ;(window as any).file = {
        saveText: vi.fn().mockResolvedValue({canceled: false, filePath: '/tmp/backup.budget.enc.json'}),
        openText: vi.fn(),
    }
    ;(window as any).backupEncryption = {
        encrypt: vi.fn().mockResolvedValue({
            ok: true,
            data: {content: '{"kind":"budget-encrypted-backup","ciphertext":"opaque"}'},
            error: null,
        }),
        decrypt: vi.fn(),
    }
    ;(window as any).imports = {
        mappingTemplate: {list: vi.fn().mockResolvedValue({ok: true, data: []})},
        listSources: vi.fn().mockResolvedValue({ok: true, data: []}),
        listHistory: vi.fn().mockResolvedValue({ok: true, data: []}),
        restoreBackup: vi.fn().mockResolvedValue({ok: true, data: null}),
    }
    ;(window as any).db = {
        transaction: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 301}),
        },
        recurringTemplate: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 401}),
        },
        budgetTarget: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 501}),
        },
        category: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 201}),
        },
        account: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 101}),
        },
        taxProfile: {
            delete: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue({id: 601}),
        },
        taxMetadata: {
            updateAccount: vi.fn().mockResolvedValue(undefined),
            updateTransaction: vi.fn().mockResolvedValue(undefined),
        },
    }
    ;(window as any).prompt = vi.fn()
    ;(window as any).confirm = vi.fn().mockReturnValue(true)
}

function createHarness() {
    const refreshAllData = vi.fn().mockResolvedValue(undefined)
    const showNotice = vi.fn()
    const backup = useJsonBackup({
        accounts: ref([{id: 901, name: 'Old account', type: 'BANK', currency: 'CAD', description: null}] as any),
        categories: ref([] as any),
        budgetTargets: ref([] as any),
        recurringTemplates: ref([] as any),
        transactions: ref([] as any),
        taxProfiles: ref([] as any),
        refreshAllData,
        showNotice,
    })

    return {backup, refreshAllData, showNotice}
}

describe('useJsonBackup encrypted backup flows', () => {
    beforeEach(() => {
        i18n.global.locale.value = 'en'
        installBridgeMocks()
    })

    it('exports a canonical backup through the encrypted backup bridge', async () => {
        ;(window as any).prompt
            .mockReturnValueOnce('safe-password')
            .mockReturnValueOnce('safe-password')
        const {backup, showNotice} = createHarness()

        await backup.exportEncryptedBackupJson()

        expect((window as any).backupEncryption.encrypt).toHaveBeenCalledWith(expect.objectContaining({
            password: 'safe-password',
            metadata: expect.objectContaining({encryptedExport: true}),
        }))
        const encryptedInput = (window as any).backupEncryption.encrypt.mock.calls[0][0].backupJson
        expect(JSON.parse(encryptedInput)).toMatchObject({kind: 'budget-backup'})
        expect((window as any).file.saveText).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: 'budget-backup.budget.enc.json',
            content: '{"kind":"budget-encrypted-backup","ciphertext":"opaque"}',
        }))
        expect(showNotice).toHaveBeenCalledWith('success', 'Backup chiffré exporté.')
    })

    it('cancels encrypted export when password confirmation differs', async () => {
        ;(window as any).prompt
            .mockReturnValueOnce('first-password')
            .mockReturnValueOnce('second-password')
        const {backup, showNotice} = createHarness()

        await backup.exportEncryptedBackupJson()

        expect((window as any).backupEncryption.encrypt).not.toHaveBeenCalled()
        expect((window as any).file.saveText).not.toHaveBeenCalled()
        expect(showNotice).toHaveBeenCalledWith('error', expect.stringContaining('ne correspondent pas'))
    })

    it('decrypts an encrypted backup in memory before opening the restore preview', async () => {
        ;(window as any).prompt.mockReturnValueOnce('safe-password')
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/backup.budget.enc.json',
            content: '{"kind":"budget-encrypted-backup"}',
        })
        ;(window as any).backupEncryption.decrypt.mockResolvedValueOnce({
            ok: true,
            data: {backupJson: JSON.stringify(validSnapshot())},
            error: null,
        })
        const {backup} = createHarness()

        await backup.beginRestoreEncryptedBackupJson()

        expect((window as any).backupEncryption.decrypt).toHaveBeenCalledWith({
            content: '{"kind":"budget-encrypted-backup"}',
            password: 'safe-password',
        })
        expect((window as any).file.saveText).not.toHaveBeenCalled()
        expect(backup.restorePreviewOpen.value).toBe(true)
        expect(backup.restorePreviewPath.value).toBe('/tmp/backup.budget.enc.json')
        expect(backup.restorePreviewValidation.value?.counts.accounts).toBe(1)
    })

    it('keeps existing data untouched when encrypted restore password is wrong', async () => {
        ;(window as any).prompt.mockReturnValueOnce('wrong-password')
        ;(window as any).file.openText.mockResolvedValueOnce({
            canceled: false,
            filePath: '/tmp/backup.budget.enc.json',
            content: '{"kind":"budget-encrypted-backup"}',
        })
        ;(window as any).backupEncryption.decrypt.mockResolvedValueOnce({
            ok: false,
            data: null,
            error: {code: 'wrongPassword', message: 'Wrong password'},
        })
        const {backup, showNotice, refreshAllData} = createHarness()

        await backup.beginRestoreEncryptedBackupJson()

        expect(backup.restorePreviewOpen.value).toBe(false)
        expect((window as any).db.account.delete).not.toHaveBeenCalled()
        expect(refreshAllData).not.toHaveBeenCalled()
        expect(showNotice).toHaveBeenCalledWith('error', expect.stringContaining('Mot de passe incorrect'))
    })

    it('continues to export plain JSON backups unchanged', async () => {
        const {backup} = createHarness()

        await backup.exportBackupJson()

        expect((window as any).backupEncryption.encrypt).not.toHaveBeenCalled()
        expect((window as any).file.saveText).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: 'budget-backup.json',
            filters: [{name: 'JSON', extensions: ['json']}],
        }))
    })
})
