import {mount} from '@vue/test-utils'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import SecurityRecoveryPanel from '../../components/SecurityRecoveryPanel.vue'

describe('SecurityRecoveryPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        Object.assign(window, {
            appShell: {sendMenuCommand: vi.fn()},
            auditLog: {
                list: vi.fn(async () => [
                    {eventType: 'backupExported', domain: 'backup', severity: 'INFO', status: 'SUCCESS', summary: 'Backup JSON exporté.', timestamp: '2026-05-11T10:00:00.000Z'},
                    {eventType: 'criticalDelete', domain: 'account', severity: 'CRITICAL', status: 'SUCCESS', summary: 'Compte supprimé.', timestamp: '2026-05-11T11:00:00.000Z'},
                ]),
                exportMarkdown: vi.fn(async () => '# Audit'),
            },
            recoverySnapshots: {
                list: vi.fn(async () => ({ok: true, data: [{id: 'snap-1'}], error: null})),
            },
            secrets: {
                getStorageInfo: vi.fn(async () => ({ok: true, data: {available: true}, error: null})),
                listSecretMetadata: vi.fn(async () => ({ok: true, data: [{key: 'provider-token'}], error: null})),
            },
            integrityCheck: {
                run: vi.fn(async () => ({ok: true, data: {ok: true, generatedAt: '2026-05-11T12:00:00.000Z', summary: 'Contrôle OK', totals: {info: 0, warning: 0, error: 0, critical: 0}, issueCount: 0}, error: null})),
            },
            file: {
                saveText: vi.fn(async () => ({canceled: false, filePath: '/tmp/audit.md'})),
            },
        })
    })

    it('shows security status cards and local limitations', async () => {
        const wrapper = mount(SecurityRecoveryPanel, {
            global: {stubs: {RecoverySnapshotsPanel: true}},
        })
        await vi.dynamicImportSettled()

        expect(wrapper.text()).toContain('Sécurité & récupération')
        expect(wrapper.text()).toContain('Dernier backup')
        expect(wrapper.text()).toContain('Snapshots')
        expect(wrapper.text()).toContain('Stockage sécurisé')
        expect(wrapper.text()).toContain('pas de synchronisation cloud')
    })

    it('triggers existing backup menu commands', async () => {
        const wrapper = mount(SecurityRecoveryPanel, {
            global: {stubs: {RecoverySnapshotsPanel: true}},
        })
        await vi.dynamicImportSettled()

        await wrapper.findAll('button').find((button) => button.text().includes('Exporter JSON'))!.trigger('click')

        expect((window.appShell as unknown as {sendMenuCommand: ReturnType<typeof vi.fn>}).sendMenuCommand).toHaveBeenCalledWith('export-json')
    })

    it('runs integrity checks from settings', async () => {
        const wrapper = mount(SecurityRecoveryPanel, {
            global: {stubs: {RecoverySnapshotsPanel: true}},
        })
        await vi.dynamicImportSettled()

        await wrapper.findAll('button').find((button) => button.text().includes('Vérifier'))!.trigger('click')
        await vi.dynamicImportSettled()

        expect(window.integrityCheck.run).toHaveBeenCalledWith({source: 'security-settings-panel', reason: 'manual-settings-check'})
    })
})
