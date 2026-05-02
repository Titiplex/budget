import {describe, expect, it} from 'vitest'

import {
    GOALS_BACKUP_FORMAT_VERSION,
    createBudgetBackupSnapshotWithGoals,
    exportFinancialGoalsCsv,
    exportFinancialGoalsMarkdown,
    parseBudgetBackupWithGoals,
    serializeBudgetBackupWithGoals,
} from '../../utils/goalsJsonBackup'

const account = {
    id: 1,
    name: 'Main',
    type: 'BANK' as const,
    currency: 'CAD',
    description: null,
}
const category = {id: 2, name: 'Income', kind: 'INCOME' as const, color: null, description: null}
const goal = {
    id: 10,
    name: 'Emergency fund',
    type: 'EMERGENCY_FUND' as const,
    targetAmount: 5000,
    currency: 'CAD',
    targetDate: '2027-01-01',
    startingAmount: 1000,
    status: 'ACTIVE' as const,
    priority: 1,
    notes: 'Keep liquid',
    trackedAssetId: null,
    trackedPortfolioId: null,
    trackedLiabilityId: null,
    baselineNetWorthSnapshotId: null,
}
const scenario = {
    id: 20,
    name: 'Base',
    kind: 'BASE' as const,
    description: 'Baseline assumptions',
    monthlySurplus: 500,
    annualGrowthRate: 0.03,
    annualInflationRate: 0.02,
    horizonMonths: 24,
    currency: 'CAD',
    isDefault: true,
    isActive: true,
    notes: 'No advice',
}

function createSnapshot() {
    return createBudgetBackupSnapshotWithGoals(
        [account],
        [category],
        [],
        [],
        [],
        [],
        [goal],
        [scenario],
        {
            currency: 'CAD',
            defaultScenarioId: scenario.id,
            horizonMonths: scenario.horizonMonths,
            manualMonthlyContribution: null,
        },
    )
}

describe('goalsJsonBackup', () => {
    it('creates and parses a v5 backup with financial goals and projection scenarios', () => {
        const snapshot = createSnapshot()
        const parsed = parseBudgetBackupWithGoals(serializeBudgetBackupWithGoals(snapshot))

        expect(parsed.version).toBe(GOALS_BACKUP_FORMAT_VERSION)
        expect(parsed.data.financialGoals).toEqual([goal])
        expect(parsed.data.projectionScenarios).toEqual([scenario])
        expect(parsed.data.projectionSettings).toEqual({
            currency: 'CAD',
            defaultScenarioId: 20,
            horizonMonths: 24,
            manualMonthlyContribution: null,
        })
    })

    it('normalizes legacy backups without goals as empty goal data', () => {
        const legacy = {
            ...createSnapshot(),
            version: 4,
            data: {
                ...createSnapshot().data,
                financialGoals: undefined,
                projectionScenarios: undefined,
                projectionSettings: undefined,
            },
        }
        delete (legacy.data as any).financialGoals
        delete (legacy.data as any).projectionScenarios
        delete (legacy.data as any).projectionSettings

        const parsed = parseBudgetBackupWithGoals(JSON.stringify(legacy))

        expect(parsed.version).toBe(4)
        expect(parsed.data.financialGoals).toEqual([])
        expect(parsed.data.projectionScenarios).toEqual([])
        expect(parsed.data.projectionSettings).toBeNull()
    })

    it('rejects invalid restored goal data before import', () => {
        const snapshot = createSnapshot()
        snapshot.data.financialGoals[0].targetAmount = 0

        expect(() => parseBudgetBackupWithGoals(JSON.stringify(snapshot)))
            .toThrow('data.financialGoals[0].targetAmount')
    })

    it('rejects projection settings pointing to a missing scenario', () => {
        const snapshot = createSnapshot()
        snapshot.data.projectionSettings = {
            currency: 'CAD',
            defaultScenarioId: 999,
            horizonMonths: 24,
            manualMonthlyContribution: null,
        }

        expect(() => parseBudgetBackupWithGoals(JSON.stringify(snapshot)))
            .toThrow('defaultScenarioId référence un scénario absent')
    })

    it('exports simple markdown and CSV goal summaries', () => {
        const markdown = exportFinancialGoalsMarkdown([goal])
        const csv = exportFinancialGoalsCsv([goal])

        expect(markdown).toContain('| Objectif | Type | Statut | Cible | Départ | Date cible | Devise |')
        expect(markdown).toContain('Emergency fund')
        expect(csv).toContain('id;name;type;status;targetAmount')
        expect(csv).toContain('Emergency fund')
        expect(csv).toContain('EMERGENCY_FUND')
    })
})
