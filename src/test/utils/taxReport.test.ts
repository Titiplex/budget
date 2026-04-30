import {describe, expect, it} from 'vitest'
import type {Account, TaxProfile, Transaction} from '../../types/budget'
import {
    buildTaxReport,
    getApplicableTaxRuleSets,
    getTaxResidenceOption,
    type TaxJurisdictionRuleSet,
    taxReportToMarkdown,
} from '../../utils/taxReport'

function account(overrides: Partial<Account>): Account {
    return {
        id: 1,
        name: 'Compte test',
        type: 'BANK',
        currency: 'EUR',
        description: null,
        taxReportingType: 'STANDARD',
        institutionCountry: 'FR',
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
        taxCategory: 'OTHER',
        taxTreatment: 'TAXABLE_NO_WITHHOLDING',
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
    it('flags foreign accounts, foreign income and foreign tax credits for a French tax profile', () => {
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
            taxTreatment: 'FOREIGN_TAX_CREDIT_CANDIDATE',
            taxWithheldAmount: 15,
            taxWithheldCurrency: 'CAD',
            taxWithheldCountry: 'CA',
            accountId: foreignAccount.id,
            account: foreignAccount,
        })

        const report = buildTaxReport(franceProfile, [foreignAccount], [income])
        const allItems = report.sections.flatMap((section) => section.items)

        expect(report.sections.some((section) => section.jurisdiction === 'FR' && section.titleKey === 'tax.report.sections.foreignAccounts')).toBe(true)
        expect(report.sections.some((section) => section.jurisdiction === 'FR' && section.titleKey === 'tax.report.sections.foreignIncome')).toBe(true)
        expect(report.sections.some((section) => section.jurisdiction === 'FR' && section.titleKey === 'tax.report.sections.foreignTaxCredits')).toBe(true)
        expect(allItems.some((item) => item.suggestedForms.includes('3916'))).toBe(true)
        expect(allItems.some((item) => item.suggestedForms.includes('2047'))).toBe(true)
        expect(allItems.some((item) => item.label === 'Dividendes Canada' && item.amount === 15)).toBe(true)
    })

    it('adds income treatment sections for taxable, withheld, non-taxable and treaty-candidate income', () => {
        const report = buildTaxReport(franceProfile, [], [
            transaction({id: 1, label: 'Freelance', taxTreatment: 'TAXABLE_NO_WITHHOLDING'}),
            transaction({id: 2, label: 'Salaire', taxTreatment: 'TAX_WITHHELD_AT_SOURCE', taxWithheldAmount: 200, taxWithheldCurrency: 'EUR', taxWithheldCountry: 'FR'}),
            transaction({id: 3, label: 'Remboursement', taxTreatment: 'NOT_TAXABLE'}),
            transaction({id: 4, label: 'Convention', taxTreatment: 'TREATY_EXEMPT_CANDIDATE'}),
        ])

        expect(report.sections.some((section) => section.titleKey === 'tax.report.sections.taxableIncomeNoWithholding')).toBe(true)
        expect(report.sections.some((section) => section.titleKey === 'tax.report.sections.taxWithheldAtSource')).toBe(true)
        expect(report.sections.some((section) => section.titleKey === 'tax.report.sections.taxExemptReview')).toBe(true)
        expect(report.sections.some((section) => section.titleKey === 'tax.report.sections.treatyExemption')).toBe(true)
    })

    it('flags incomplete account and income tax metadata as low-confidence review items', () => {
        const report = buildTaxReport(franceProfile, [
            account({id: 11, name: 'Compte sans pays', institutionCountry: null}),
        ], [
            transaction({id: 12, label: 'Revenu incomplet', taxCategory: null, taxTreatment: 'UNKNOWN'}),
        ])

        expect(report.sections.some((section) => section.titleKey === 'tax.report.sections.missingAccountTaxMetadata')).toBe(true)
        expect(report.sections.some((section) => section.titleKey === 'tax.report.sections.incomeClassification')).toBe(true)
        expect(report.sections.flatMap((section) => section.items).some((item) => item.confidence === 'low')).toBe(true)
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
            taxTreatment: 'FOREIGN_TAX_CREDIT_CANDIDATE',
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

    it('uses account country and region fallbacks when transaction tax source fields are absent', () => {
        const ontarioAccount = account({
            id: 40,
            name: 'Compte Ontario',
            currency: 'CAD',
            institutionCountry: 'CA',
            institutionRegion: 'ON',
        })
        const income = transaction({
            id: 41,
            label: 'Salaire Ontario',
            amount: 2000,
            sourceAmount: null,
            sourceCurrency: null,
            taxSourceCountry: null,
            taxSourceRegion: null,
            taxTreatment: 'TAXABLE_NO_WITHHOLDING',
            taxWithheldAmount: 100,
            taxWithheldCurrency: null,
            taxWithheldCountry: 'CA',
            accountId: ontarioAccount.id,
            account: ontarioAccount,
        })

        const report = buildTaxReport(quebecProfile, [ontarioAccount], [income])
        const quebecItems = report.sections
            .filter((section) => section.jurisdiction === 'QC')
            .flatMap((section) => section.items)
        const quebecOutsideTaxItems = report.sections
            .filter((section) => section.jurisdiction === 'QC' && section.titleKey === 'tax.report.sections.qcOutsideTax')
            .flatMap((section) => section.items)

        expect(quebecItems.some((item) => item.label === 'Salaire Ontario')).toBe(true)
        expect(quebecOutsideTaxItems.some((item) => item.amount === 100)).toBe(false)
    })

    it('flags Quebec tax withheld when the transaction source region identifies another province', () => {
        const income = transaction({
            id: 42,
            label: 'Retenue Ontario',
            amount: 2000,
            sourceAmount: null,
            sourceCurrency: null,
            taxSourceCountry: 'CA',
            taxSourceRegion: 'ON',
            taxTreatment: 'TAX_WITHHELD_AT_SOURCE',
            taxWithheldAmount: 100,
            taxWithheldCurrency: null,
            taxWithheldCountry: 'CA',
        })

        const report = buildTaxReport(quebecProfile, [], [income])
        const quebecItems = report.sections
            .filter((section) => section.jurisdiction === 'QC')
            .flatMap((section) => section.items)

        expect(quebecItems.some((item) => item.label === 'Retenue Ontario' && item.amount === 100 && item.currency === 'EUR')).toBe(true)
    })

    it('skips Quebec rules for Canadian residents outside Quebec and unsupported countries', () => {
        const ontarioProfile: TaxProfile = {
            id: 3,
            year: 2026,
            residenceCountry: 'CA',
            residenceRegion: 'ON',
            currency: 'CAD',
        }
        const unknownProfile: TaxProfile = {
            id: 4,
            year: 2026,
            residenceCountry: 'US',
            residenceRegion: null,
            currency: 'USD',
        }
        const foreignIncome = transaction({taxSourceCountry: 'US', taxWithheldAmount: 10, taxWithheldCountry: 'US'})

        const ontarioReport = buildTaxReport(ontarioProfile, [], [foreignIncome])
        const unknownReport = buildTaxReport(unknownProfile, [], [foreignIncome])

        expect(ontarioReport.sections.some((section) => section.jurisdiction === 'CA')).toBe(true)
        expect(ontarioReport.sections.some((section) => section.jurisdiction === 'QC')).toBe(false)
        expect(unknownReport.sections).toEqual([])
    })

    it('accepts custom jurisdiction rule sets without changing buildTaxReport internals', () => {
        const customProfile: TaxProfile = {
            id: 5,
            year: 2026,
            residenceCountry: 'US',
            residenceRegion: 'NY',
            currency: 'USD',
        }
        const customRuleSet: TaxJurisdictionRuleSet = {
            jurisdiction: 'US-NY',
            labelKey: 'tax.jurisdictions.US_NY',
            label: 'New York',
            appliesTo: (profile) => profile.residenceCountry === 'US' && profile.residenceRegion === 'NY',
            buildSections: ({incomeTransactions}) => incomeTransactions.length ? [{
                jurisdiction: 'US-NY',
                title: 'Custom state income review',
                titleKey: 'tax.report.sections.customStateIncome',
                severity: 'review',
                items: incomeTransactions.map((entry) => ({
                    entityType: 'transaction',
                    entityId: entry.id,
                    label: entry.label,
                    amount: Math.abs(entry.amount),
                    currency: entry.sourceCurrency || 'USD',
                    explanation: 'Custom rule fired.',
                    suggestedForms: ['CUSTOM-1'],
                    confidence: 'medium',
                })),
            }] : [],
        }

        const report = buildTaxReport(customProfile, [], [transaction({label: 'US income', sourceCurrency: 'USD'})], [customRuleSet])

        expect(report.sections).toHaveLength(1)
        expect(report.sections[0].jurisdiction).toBe('US-NY')
        expect(report.sections[0].items[0].suggestedForms).toEqual(['CUSTOM-1'])
    })
})

describe('tax rule registry helpers', () => {
    it('resolves applicable default rule sets and supported residence options', () => {
        expect(getApplicableTaxRuleSets(quebecProfile).map((ruleSet) => ruleSet.jurisdiction)).toEqual(['CA', 'QC'])
        expect(getApplicableTaxRuleSets(franceProfile).map((ruleSet) => ruleSet.jurisdiction)).toEqual(['FR'])
        expect(getTaxResidenceOption('CA', 'QC')?.labelKey).toBe('tax.residences.CA_QC')
        expect(getTaxResidenceOption('CA', 'ON')?.labelKey).toBe('tax.residences.CA')
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

    it('serializes an empty report with the no-signal message and regionless residence', () => {
        const report = buildTaxReport(franceProfile, [], [])
        const markdown = taxReportToMarkdown(report)

        expect(markdown).toContain('Résidence fiscale : FR')
        expect(markdown).toContain('Aucun signal fiscal détecté')
        expect(markdown).not.toContain('Résidence fiscale : FR-')
    })
})
