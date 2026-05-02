import {describe, expect, it, vi} from 'vitest'

import type {BudgetBackupWithGoalsSnapshot} from '../../utils/goalsJsonBackup'
import {restoreGoalsBackupSnapshot, remapProjectionSettings} from '../../utils/goalsBackupRestore'

function ok<T>(data: T) {
    return Promise.resolve({ok: true, data, error: null})
}

function snapshot(): BudgetBackupWithGoalsSnapshot {
    return {
        kind: 'budget-backup',
        version: 5,
        exportedAt: '2026-05-01T00:00:00.000Z',
        data: {
            accounts: [],
            categories: [],
            budgetTargets: [],
            recurringTemplates: [],
            transactions: [],
            taxProfiles: [],
            financialGoals: [{
                id: 10,
                name: 'Emergency fund',
                type: 'EMERGENCY_FUND',
                targetAmount: 5000,
                currency: 'CAD',
                targetDate: '2027-01-01',
                startingAmount: 1000,
                status: 'ACTIVE',
                priority: 1,
                notes: 'Liquid cash',
                trackedAssetId: 99,
                trackedPortfolioId: null,
                trackedLiabilityId: null,
                baselineNetWorthSnapshotId: null,
            }],
            projectionScenarios: [{
                id: 20,
                name: 'Base',
                kind: 'BASE',
                description: 'Baseline',
                monthlySurplus: 500,
                annualGrowthRate: 0.03,
                annualInflationRate: 0.02,
                horizonMonths: 24,
                currency: 'CAD',
                isDefault: true,
                isActive: true,
                notes: null,
            }],
            projectionSettings: {
                currency: 'CAD',
                defaultScenarioId: 20,
                horizonMonths: 24,
                manualMonthlyContribution: null,
            },
        },
    }
}

describe('goalsBackupRestore', () => {
    it('restores scenarios then goals while remapping projection settings', async () => {
        const api = {
            listFinancialGoals: vi.fn(() => ok([{id: 1}])),
            deleteFinancialGoal: vi.fn(() => ok({ok: true})),
            createFinancialGoal: vi.fn(() => ok({id: 101})),
            listProjectionScenarios: vi.fn(() => ok([{id: 2, isDefault: false}, {id: 3, isDefault: true}])),
            removeProjectionScenario: vi.fn(() => ok({ok: true})),
            createProjectionScenario: vi.fn(() => ok({id: 202})),
        }

        const result = await restoreGoalsBackupSnapshot(snapshot(), api)

        expect(api.deleteFinancialGoal).toHaveBeenCalledWith(1)
        expect(api.removeProjectionScenario).toHaveBeenCalledWith(2)
        expect(api.removeProjectionScenario).not.toHaveBeenCalledWith(3)
        expect(api.createProjectionScenario).toHaveBeenCalledWith(expect.objectContaining({name: 'Base', kind: 'BASE'}))
        expect(api.createFinancialGoal).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Emergency fund',
            trackedAssetId: null,
            trackedPortfolioId: null,
            trackedLiabilityId: null,
        }))
        expect(result.restoredGoals).toBe(1)
        expect(result.restoredScenarios).toBe(1)
        expect(result.projectionSettings?.defaultScenarioId).toBe(202)
    })

    it('remaps missing default scenario ids to null', () => {
        const settings = remapProjectionSettings({
            currency: 'CAD',
            defaultScenarioId: 20,
            horizonMonths: 24,
            manualMonthlyContribution: 100,
        }, new Map())

        expect(settings).toEqual({
            currency: 'CAD',
            defaultScenarioId: null,
            horizonMonths: 24,
            manualMonthlyContribution: 100,
        })
    })
})
