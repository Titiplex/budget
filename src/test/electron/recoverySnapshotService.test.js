import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import {afterEach, describe, expect, it, vi} from 'vitest'

const {createRecoverySnapshotService, sanitizeJsonContent} = require('../../../electron/recovery/recoverySnapshotService')

const tempDirs = []

async function tempUserData() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-recovery-'))
    tempDirs.push(dir)
    return dir
}

function fakeApp(userData) {
    return {
        getPath(name) {
            if (name !== 'userData') throw new Error(`unexpected path ${name}`)
            return userData
        },
    }
}

afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
        await fs.rm(dir, {recursive: true, force: true})
    }
})

describe('recovery snapshot service', () => {
    it('creates local snapshots, scrubs secrets and writes audit events', async () => {
        const userData = await tempUserData()
        const auditLog = {recordAuditEvent: vi.fn(async () => null)}
        const service = createRecoverySnapshotService({
            app: fakeApp(userData),
            auditLog,
            clock: () => new Date('2026-05-11T12:00:00.000Z'),
        })

        const snapshot = await service.createSnapshot({
            operationType: 'delete-account',
            reason: 'Suppression test',
            source: 'unit-test',
            content: JSON.stringify({kind: 'budget-backup', apiKey: 'secret-value', data: {accounts: []}}),
        })

        expect(snapshot.id).toContain('delete-account')
        expect(snapshot.filePath).toContain('recovery-snapshots')
        const content = await fs.readFile(snapshot.filePath, 'utf8')
        expect(content).toContain('budget-backup')
        expect(content).not.toContain('secret-value')
        expect(content).not.toContain('apiKey')
        expect(auditLog.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'recoverySnapshotCreated',
            domain: 'recovery',
            status: 'SUCCESS',
            entityIds: [{type: 'recoverySnapshot', id: snapshot.id}],
        }))
    })

    it('lists, reads and deletes snapshots', async () => {
        const userData = await tempUserData()
        const service = createRecoverySnapshotService({
            app: fakeApp(userData),
            auditLog: {recordAuditEvent: vi.fn(async () => null)},
            clock: () => new Date('2026-05-11T12:00:00.000Z'),
        })
        const snapshot = await service.createSnapshot({operationType: 'restore-full', reason: 'before restore', content: '{"ok":true}'})

        const listed = await service.listSnapshots()
        expect(listed).toHaveLength(1)
        expect(listed[0]).toMatchObject({id: snapshot.id, operationType: 'restore-full'})

        const read = await service.readSnapshot(snapshot.id)
        expect(read.content).toContain('ok')

        await expect(service.deleteSnapshot(snapshot.id)).resolves.toMatchObject({deleted: true, id: snapshot.id})
        await expect(service.listSnapshots()).resolves.toEqual([])
    })

    it('enforces count retention by deleting oldest snapshots', async () => {
        const userData = await tempUserData()
        let minute = 0
        const service = createRecoverySnapshotService({
            app: fakeApp(userData),
            auditLog: {recordAuditEvent: vi.fn(async () => null)},
            clock: () => new Date(Date.UTC(2026, 4, 11, 12, minute++, 0)),
            policy: {maxSnapshots: 2, maxBytes: 1024 * 1024},
        })

        await service.createSnapshot({operationType: 'first', reason: 'one', content: '{"n":1}'})
        await service.createSnapshot({operationType: 'second', reason: 'two', content: '{"n":2}'})
        await service.createSnapshot({operationType: 'third', reason: 'three', content: '{"n":3}'})

        const rows = await service.listSnapshots()
        expect(rows).toHaveLength(2)
        expect(rows.map((row) => row.operationType)).toEqual(['third', 'second'])
    })

    it('sanitizes nested secret-like keys from backup JSON', () => {
        const sanitized = sanitizeJsonContent(JSON.stringify({
            metadata: {
                token: 'hidden',
                nested: {password: 'hidden', visible: true},
            },
            data: {accounts: []},
        }))

        expect(sanitized).toContain('visible')
        expect(sanitized).not.toContain('hidden')
        expect(sanitized).not.toContain('password')
        expect(sanitized).not.toContain('token')
    })
})
