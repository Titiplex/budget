import {describe, expect, it} from 'vitest'
import {createRestoreDryRunReport, markRecoveryBackupCreated} from '../../utils/restoreDryRun'
import type {BudgetBackupWithImportDataSnapshot} from '../../utils/importJsonBackup'

function validSnapshot(overrides: Partial<BudgetBackupWithImportDataSnapshot> = {}): BudgetBackupWithImportDataSnapshot {
    const snapshot: BudgetBackupWithImportDataSnapshot = {
        kind: 'budget-backup',
        version: 6,
        exportedAt: '2026-05-08T12:00:00.000Z',
        data: {
            accounts: [
                {
                    id: 1,
                    name: 'Main',
                    type: 'BANK',
                    currency: 'CAD',
                    description: null,
                    institutionCountry: 'CA',
                    institutionRegion: 'QC',
                    taxReportingType: 'BANK',
                    openedAt: null,
                    closedAt: null,
                },
            ],
            categories: [
                {id: 10, name: 'Groceries', kind: 'EXPENSE', color: null, description: null},
            ],
            budgetTargets: [
                {
                    id: 20,
                    name: 'Food',
                    amount: 500,
                    period: 'MONTHLY',
                    startDate: '2026-05-01',
                    endDate: null,
                    currency: 'CAD',
                    isActive: true,
                    note: null,
                    categoryId: 10,
                },
            ],
            recurringTemplates: [],
            transactions: [
                {
                    id: 100,
                    label: 'Groceries',
                    amount: 42,
                    sourceAmount: 42,
                    sourceCurrency: 'CAD',
                    conversionMode: 'NONE',
                    exchangeRate: 1,
                    exchangeProvider: 'ACCOUNT',
                    exchangeDate: '2026-05-08',
                    kind: 'EXPENSE',
                    date: '2026-05-08',
                    note: null,
                    taxCategory: null,
                    taxSourceCountry: null,
                    taxSourceRegion: null,
                    taxTreatment: 'UNKNOWN',
                    taxWithheldAmount: null,
                    taxWithheldCurrency: null,
                    taxWithheldCountry: null,
                    taxDocumentRef: null,
                    accountId: 1,
                    categoryId: 10,
                    transferGroup: null,
                    transferDirection: null,
                    transferPeerAccountId: null,
                },
            ],
            taxProfiles: [],
            financialGoals: [
                {
                    id: 300,
                    name: 'Emergency fund',
                    type: 'SAVINGS',
                    targetAmount: 10000,
                    currency: 'CAD',
                    targetDate: null,
                    startingAmount: null,
                    status: 'ACTIVE',
                    priority: null,
                    notes: null,
                    trackedAssetId: null,
                    trackedPortfolioId: null,
                    trackedLiabilityId: null,
                    baselineNetWorthSnapshotId: null,
                },
            ],
            projectionScenarios: [
                {
                    id: 400,
                    name: 'Base',
                    kind: 'BASE',
                    description: null,
                    monthlySurplus: 500,
                    annualGrowthRate: null,
                    annualInflationRate: null,
                    horizonMonths: 24,
                    currency: 'CAD',
                    isDefault: true,
                    isActive: true,
                    notes: null,
                },
            ],
            projectionSettings: null,
            importBackup: {
                schemaVersion: 1,
                documentation: {included: [], excluded: [], notes: []},
                mappingTemplates: [],
                importSources: [],
                importHistory: [],
                metadata: {
                    exportedAt: '2026-05-08T12:00:00.000Z',
                    auditOnlyRestore: true,
                    financialDataNotRestoredFromImportHistory: true,
                },
            },
        },
    }

    return {...snapshot, ...overrides, data: {...snapshot.data, ...(overrides.data || {})}}
}

describe('restore dry-run report', () => {
    it('summarizes a valid restore without mutating the current state', () => {
        const current = {
            accounts: [{id: 999}],
            categories: [{id: 998}],
            budgetTargets: [{id: 997}],
            recurringTemplates: [],
            transactions: [{id: 996}],
            taxProfiles: [],
        }
        const snapshot = validSnapshot()
        const before = JSON.stringify(current)

        const report = createRestoreDryRunReport(snapshot, current)

        expect(JSON.stringify(current)).toBe(before)
        expect(report.ok).toBe(true)
        expect(report.canApply).toBe(true)
        expect(report.counts.accountsToCreate).toBe(1)
        expect(report.counts.categoriesToCreate).toBe(1)
        expect(report.counts.transactionsToCreate).toBe(1)
        expect(report.counts.financialGoalsToCreate).toBe(1)
        expect(report.counts.projectionScenariosToCreate).toBe(1)
        expect(report.counts.existingAccountsToReplace).toBe(1)
        expect(report.recovery).toMatchObject({
            preRestoreBackupRequired: true,
            createdBeforeWrite: false,
            path: null,
        })
    })

    it('blocks duplicated ids, invalid currencies, invalid dates, invalid amounts and broken references', () => {
        const snapshot = validSnapshot({
            data: {
                ...validSnapshot().data,
                accounts: [
                    {...validSnapshot().data.accounts[0], id: 1, currency: 'CAD'},
                    {...validSnapshot().data.accounts[0], id: 1, name: 'Duplicate', currency: 'CAD'},
                ],
                budgetTargets: [
                    {...validSnapshot().data.budgetTargets[0], amount: 0, categoryId: 999, startDate: 'bad-date'},
                ],
                transactions: [
                    {...validSnapshot().data.transactions[0], amount: -1, accountId: 999, date: 'not-a-date'},
                ],
                financialGoals: [
                    {...validSnapshot().data.financialGoals[0], currency: 'CA', targetAmount: 0},
                ],
            },
        })

        const report = createRestoreDryRunReport(snapshot)

        expect(report.ok).toBe(false)
        expect(report.canApply).toBe(false)
        expect(report.blockingErrors.join('\n')).toContain('identifiant dupliqué')
        expect(report.blockingErrors.join('\n')).toContain('catégorie absente')
        expect(report.blockingErrors.join('\n')).toContain('montant non positif')
        expect(report.blockingErrors.join('\n')).toContain('date de début invalide')
        expect(report.blockingErrors.join('\n')).toContain('compte absent')
        expect(report.blockingErrors.join('\n')).toContain('devise invalide')
        expect(report.warnings.some((warning) => warning.startsWith('Erreur bloquante :'))).toBe(true)
    })

    it('keeps warnings visible without blocking a restore', () => {
        const snapshot = validSnapshot({
            data: {
                ...validSnapshot().data,
                accounts: [{...validSnapshot().data.accounts[0], name: ''}],
            },
        })

        const report = createRestoreDryRunReport(snapshot)

        expect(report.canApply).toBe(true)
        expect(report.warnings).toContain('Un compte a un nom vide.')
    })

    it('marks a pre-restore recovery backup as created', () => {
        const report = createRestoreDryRunReport(validSnapshot())
        const updated = markRecoveryBackupCreated(report, '/tmp/pre-restore.json')

        expect(updated.recovery).toMatchObject({
            preRestoreBackupRequired: true,
            createdBeforeWrite: true,
            path: '/tmp/pre-restore.json',
        })
        expect(report.recovery.createdBeforeWrite).toBe(false)
    })
})
