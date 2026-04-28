import {createRequire} from 'node:module'
import {describe, expect, it} from 'vitest'

const require_ = createRequire(import.meta.url)

const {
    buildAssetPayload,
    buildPortfolioPayload,
    buildLiabilityPayload,
    buildWealthWhere,
} = require_('../../../electron/ipc/wealthHandlers')

describe('wealthHandlers payload builders', () => {
    it('keeps asset net-worth flags and ownership percentage', () => {
        const payload = buildAssetPayload({
            name: ' Maison ',
            type: 'real_estate',
            status: 'active',
            currency: 'cad',
            valuationMode: 'manual',
            currentValue: '500000',
            includeInNetWorth: false,
            ownershipPercent: '50',
            acquisitionValue: '450000',
            acquiredAt: '2022-01-01',
            valueAsOf: '2026-04-28',
            institutionName: ' Banque ',
            institutionCountry: 'ca',
            institutionRegion: 'QC',
            note: ' Test ',
        })

        expect(payload).toMatchObject({
            name: 'Maison',
            type: 'REAL_ESTATE',
            status: 'ACTIVE',
            currency: 'CAD',
            valuationMode: 'MANUAL',
            currentValue: 500000,
            includeInNetWorth: false,
            ownershipPercent: 50,
            acquisitionValue: 450000,
            institutionName: 'Banque',
            institutionCountry: 'ca',
            institutionRegion: 'QC',
            note: 'Test',
        })

        expect(payload.acquiredAt).toBeInstanceOf(Date)
        expect(payload.valueAsOf).toBeInstanceOf(Date)
    })

    it('keeps portfolio net-worth flags, ownership percentage and account link', () => {
        const payload = buildPortfolioPayload({
            name: ' CELI ',
            type: 'retirement',
            status: 'active',
            currency: 'cad',
            institutionName: ' Wealthsimple ',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            taxWrapper: 'tfsa',
            valuationMode: 'manual',
            currentValue: '40000',
            includeInNetWorth: true,
            ownershipPercent: '75',
            cashBalance: '1500',
            valueAsOf: '2026-04-28',
            accountId: '3',
            note: 'Long term',
        })

        expect(payload).toMatchObject({
            name: 'CELI',
            type: 'RETIREMENT',
            status: 'ACTIVE',
            currency: 'CAD',
            institutionName: 'Wealthsimple',
            taxWrapper: 'TFSA',
            valuationMode: 'MANUAL',
            currentValue: 40000,
            includeInNetWorth: true,
            ownershipPercent: 75,
            cashBalance: 1500,
            accountId: 3,
            note: 'Long term',
        })

        expect(payload.valueAsOf).toBeInstanceOf(Date)
    })

    it('keeps liability payment metadata', () => {
        const payload = buildLiabilityPayload({
            name: ' Hypothèque ',
            type: 'mortgage',
            status: 'active',
            currency: 'cad',
            currentBalance: '120000',
            includeInNetWorth: true,
            initialAmount: '200000',
            interestRate: '4.75',
            minimumPayment: '1500',
            paymentFrequency: 'monthly',
            rateType: 'variable',
            lenderName: ' Banque ',
            institutionCountry: 'CA',
            institutionRegion: 'QC',
            openedAt: '2020-01-01',
            dueAt: '2045-01-01',
            balanceAsOf: '2026-04-28',
            securedAssetId: '2',
            accountId: '4',
            note: 'Main mortgage',
        })

        expect(payload).toMatchObject({
            name: 'Hypothèque',
            type: 'MORTGAGE',
            status: 'ACTIVE',
            currency: 'CAD',
            currentBalance: 120000,
            includeInNetWorth: true,
            initialAmount: 200000,
            interestRate: 4.75,
            minimumPayment: 1500,
            paymentFrequency: 'MONTHLY',
            rateType: 'VARIABLE',
            lenderName: 'Banque',
            securedAssetId: 2,
            accountId: 4,
            note: 'Main mortgage',
        })

        expect(payload.openedAt).toBeInstanceOf(Date)
        expect(payload.dueAt).toBeInstanceOf(Date)
        expect(payload.balanceAsOf).toBeInstanceOf(Date)
    })

    it('rejects invalid negative values and invalid ownership percentage', () => {
        expect(() =>
            buildAssetPayload({
                name: 'Bad asset',
                type: 'OTHER',
                currentValue: -1,
            }),
        ).toThrow(/positif ou nul/)

        expect(() =>
            buildPortfolioPayload({
                name: 'Bad portfolio',
                type: 'OTHER',
                ownershipPercent: 101,
            }),
        ).toThrow(/inférieur ou égal à 100/)
    })

    it('builds filters without leaking ALL pseudo-values', () => {
        expect(
            buildWealthWhere(
                {
                    search: ' maison ',
                    status: 'ALL',
                    currency: 'CAD',
                    assetType: 'REAL_ESTATE',
                },
                'assetType',
            ),
        ).toMatchObject({
            currency: 'CAD',
            type: 'REAL_ESTATE',
            OR: [
                {name: {contains: 'maison'}},
                {institutionName: {contains: 'maison'}},
                {note: {contains: 'maison'}},
            ],
        })
    })
})