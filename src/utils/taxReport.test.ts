import {describe, expect, it} from 'vitest'
import type {Account, TaxProfile, Transaction} from '../types/budget'
import {buildTaxReport, taxReportToMarkdown} from './taxReport'

function account(overrides: Partial<Account>): Account {
    return {
        id: 1,
        name: 'Compte test',
        type: 'BANK',
        currency: 'EUR',
        description: null,
        taxReportingType: 'STANDARD',
        ...overrides,
    }
}

function transaction(overrides: Partial<Transaction>): Transaction {
    const baseAccount = account({id: 1, name: 'Compte France'})

    return {
        id: 1,
        label: 'Revenu test',
        amount: 100,
        sourceAmount: 100,
        sourceCurrency: 'EUR',
        conversionMode: 'NONE',
        exchangeRate: 1,
        exchangeProvider: 'ACCOUNT',
        exchangeDate: '2026-01-15T00:00:00.000Z',
        kind: 'INCOME',
        date: '2026-01-15',
        note: null,
        taxTreatment: 'UNKNOWN',
        accountId: baseAccount.id,
        categoryId: null,
        account: baseAccount,
        category: null,
        ...overrides,
    }
}

const franceProfile: TaxProfile = {
    id: 1,
    year: 2026,
    residenceCountry: 'FR',
    residenceRegion: null,
    currency: 'EUR',
}

const quebecProfile: TaxProfile = {
    id: 2,
    year: 2026,
    residenceCountry: 'CA',
    residenceRegion: 'QC',
    currency: 'CAD',
}

describe('buildTaxReport', () => {
    it('flags foreign accounts and foreign income for a French tax profile', () => {
        const foreignAccount = account({
            id: 10,
            name: 'Courtier Canada',
            currency: 'CAD',
            institutionCountry: 'CA',
            taxReportingType: 'BROKERAGE',
        })

        const income = transaction({
            id: 20,
            label: 'Dividendes Canada',
            amount: 140,
            sourceAmount: 100,
            sourceCurrency: 'CAD',
            taxCategory: 'DIVIDEND',
            taxSourceCountry: 'CA',
            taxWithheldAmount: 15,
            taxWithheldCurrency: 'CAD',
            taxWithheldCountry: 'CA',
            accountId: foreignAccount.id,
            account: foreignAccount,
        })

        const report = buildTaxReport(franceProfile, [foreignAccount], [income])

        expect(report.sections.map((section) => section.title)).toEqual([
            'Comptes étrangers potentiellement déclarables',
            'Revenus étrangers à vérifier',
            'Impôt étranger retenu / crédit potentiel',
        ])
        expect(report.sections[0].items[0].suggestedForms).toContain('3916')
        expect(report.sections[1].items[0].suggestedForms).toContain('2047')
        expect(report.sections[2].items[0].amount).toBe(15)
    })

    it('ignores income outside the selected tax year', () => {
        const income = transaction({
            date: '2025-12-31',
            taxSourceCountry: 'CA',
            taxWithheldAmount: 10,
            taxWithheldCurrency: 'CAD',
            taxWithheldCountry: 'CA',
        })

        const report = buildTaxReport(franceProfile, [], [income])

        expect(report.sections).toEqual([])
    })

    it('generates federal and Quebec sections for a Quebec resident', () => {
        const usAccount = account({
            id: 30,
            name: 'Broker US',
            currency: 'USD',
            institutionCountry: 'US',
            taxReportingType: 'BROKERAGE',
        })

        const usIncome = transaction({
            id: 31,
            label: 'Intérêts US',
            amount: 136,
            sourceAmount: 100,
            sourceCurrency: 'USD',
            taxCategory: 'INTEREST',
            taxSourceCountry: 'US',
            taxWithheldAmount: 12,
            taxWithheldCurrency: 'USD',
            taxWithheldCountry: 'US',
            accountId: usAccount.id,
            account: usAccount,
        })

        const report = buildTaxReport(quebecProfile, [usAccount], [usIncome])

        expect(report.sections.some((section) => section.jurisdiction === 'CA')).toBe(true)
        expect(report.sections.some((section) => section.jurisdiction === 'QC')).toBe(true)
        expect(report.sections.flatMap((section) => section.items).some((item) => item.suggestedForms.includes('T1135'))).toBe(true)
    })
})

describe('taxReportToMarkdown', () => {
    it('serializes sections and disclaimer', () => {
        const report = buildTaxReport(franceProfile, [
            account({id: 99, name: 'Banque Québec', institutionCountry: 'CA'}),
        ], [])

        const markdown = taxReportToMarkdown(report)

        expect(markdown).toContain('# Rapport fiscal 2026')
        expect(markdown).toContain("aide à l'inventaire fiscal")
        expect(markdown).toContain('Banque Québec')
    })
})
