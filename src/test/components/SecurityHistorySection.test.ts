import {mount} from '@vue/test-utils'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import SecurityHistorySection from '../../components/SecurityHistorySection.vue'

function ok<T>(data: T) {
    return {ok: true, data, error: null}
}

const auditEvents = [
    {
        id: 1,
        eventType: 'restoreFailed',
        timestamp: '2026-05-10T02:00:00.000Z',
        domain: 'restore',
        action: 'apply',
        severity: 'ERROR',
        summary: 'Restauration échouée.',
        entityIds: [{type: 'file', id: 'backup.json'}],
        metadata: {
            reason: 'missing account',
            password: 'should-redact',
            nested: {token: 'should-redact-too', safe: 'visible'},
        },
        source: 'restore-flow',
        status: 'FAILED',
    },
    {
        id: 2,
        eventType: 'backupExported',
        timestamp: '2026-05-09T12:00:00.000Z',
        domain: 'backup',
        action: 'exportJson',
        severity: 'INFO',
        summary: 'Backup JSON exporté.',
        entityIds: [{type: 'file', id: 'budget-backup.json'}],
        metadata: {format: 'json'},
        source: 'backup-flow',
        status: 'SUCCESS',
    },
]

function mockWindowApis() {
    Object.defineProperty(window, 'auditLog', {
        configurable: true,
        value: {
            list: vi.fn().mockResolvedValue(ok(auditEvents)),
            exportMarkdown: vi.fn().mockResolvedValue(ok('# Historique de sécurité')),
            exportCsv: vi.fn().mockResolvedValue(ok('date;type')),
        },
    })
    Object.defineProperty(window, 'file', {
        configurable: true,
        value: {
            saveText: vi.fn().mockResolvedValue({canceled: false, filePath: '/tmp/security-history.md'}),
        },
    })
}

describe('SecurityHistorySection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockWindowApis()
    })

    it('loads security history and displays failed events clearly', async () => {
        const wrapper = mount(SecurityHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        expect(window.auditLog.list).toHaveBeenCalledWith(expect.objectContaining({limit: 300}))
        expect(wrapper.text()).toContain('Historique de sécurité')
        expect(wrapper.text()).toContain('restoreFailed')
        expect(wrapper.text()).toContain('FAILED')
        expect(wrapper.text()).toContain('Backup JSON exporté')
        expect(wrapper.text()).toContain('À vérifier')
        wrapper.unmount()
    })

    it('applies filters through the audit bridge', async () => {
        const wrapper = mount(SecurityHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        const selects = wrapper.findAll('select.input')
        await selects[0].setValue('restoreFailed')
        await selects[1].setValue('ERROR')
        await selects[2].setValue('restore')
        const filterButton = wrapper.findAll('button').find((button) => button.text() === 'Filtrer')
        await filterButton!.trigger('click')

        expect(window.auditLog.list).toHaveBeenLastCalledWith(expect.objectContaining({
            eventType: 'restoreFailed',
            severity: 'ERROR',
            domain: 'restore',
            limit: 300,
        }))
        wrapper.unmount()
    })

    it('shows redacted event details', async () => {
        const wrapper = mount(SecurityHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        await wrapper.find('tbody tr').trigger('click')
        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toContain('Métadonnées redacted')
        expect(wrapper.text()).toContain('[redacted]')
        expect(wrapper.text()).not.toContain('should-redact')
        expect(wrapper.text()).not.toContain('should-redact-too')
        expect(wrapper.text()).toContain('visible')
        wrapper.unmount()
    })

    it('exports markdown and csv history files', async () => {
        const wrapper = mount(SecurityHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await wrapper.vm.$nextTick()

        const markdownButton = wrapper.findAll('button').find((button) => button.text() === 'Exporter Markdown')
        await markdownButton!.trigger('click')
        await vi.dynamicImportSettled()
        expect(window.auditLog.exportMarkdown).toHaveBeenCalledWith(expect.objectContaining({limit: 300}))
        expect(window.file.saveText).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: 'security-history.md',
            content: '# Historique de sécurité',
        }))

        const csvButton = wrapper.findAll('button').find((button) => button.text() === 'Exporter CSV')
        await csvButton!.trigger('click')
        await vi.dynamicImportSettled()
        expect(window.auditLog.exportCsv).toHaveBeenCalledWith(expect.objectContaining({limit: 300}))
        expect(window.file.saveText).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: 'security-history.csv',
            content: 'date;type',
        }))
        wrapper.unmount()
    })

    it('renders empty and error states', async () => {
        window.auditLog.list = vi.fn().mockResolvedValueOnce(ok([]))
        const emptyWrapper = mount(SecurityHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await emptyWrapper.vm.$nextTick()
        expect(emptyWrapper.text()).toContain('Aucun événement de sécurité')
        emptyWrapper.unmount()

        window.auditLog.list = vi.fn().mockResolvedValueOnce({ok: false, data: null, error: {message: 'db unavailable'}})
        const errorWrapper = mount(SecurityHistorySection, {attachTo: document.body})
        await vi.dynamicImportSettled()
        await errorWrapper.vm.$nextTick()
        expect(errorWrapper.text()).toContain('db unavailable')
        errorWrapper.unmount()
    })
})
