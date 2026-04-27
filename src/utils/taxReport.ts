import type {
    Account,
    TaxProfile,
    TaxReport,
    TaxReportConfidence,
    TaxReportItem,
    TaxReportSection,
    TaxReportSeverity,
    Transaction,
} from '../types/budget'
import {toUtcDate} from './date'

export type TaxReportTextValues = Record<string, string | number | null | undefined>

export interface LocalizedTaxReportItem extends TaxReportItem {
    explanationKey?: string
    explanationValues?: TaxReportTextValues
}

export interface LocalizedTaxReportSection extends Omit<TaxReportSection, 'jurisdiction' | 'items'> {
    jurisdiction: string
    titleKey?: string
    items: LocalizedTaxReportItem[]
}

export interface TaxRuleContext {
    profile: TaxProfile
    accounts: Account[]
    transactions: Transaction[]
    incomeTransactions: Transaction[]
}

export interface TaxJurisdictionRuleSet {
    jurisdiction: string
    labelKey: string
    label: string
    appliesTo: (profile: TaxProfile) => boolean
    buildSections: (context: TaxRuleContext) => LocalizedTaxReportSection[]
}

export interface TaxResidenceOption {
    country: string
    region: string | null
    currency: string
    labelKey: string
    label: string
}

export const SUPPORTED_TAX_RESIDENCES: TaxResidenceOption[] = [
    {
        country: 'FR',
        region: null,
        currency: 'EUR',
        labelKey: 'tax.residences.FR',
        label: 'France',
    },
    {
        country: 'CA',
        region: null,
        currency: 'CAD',
        labelKey: 'tax.residences.CA',
        label: 'Canada',
    },
    {
        country: 'CA',
        region: 'QC',
        currency: 'CAD',
        labelKey: 'tax.residences.CA_QC',
        label: 'Canada · Québec',
    },
]

const TAX_DISCLAIMER = [
    "Ce rapport est une aide à l'inventaire fiscal, pas un conseil fiscal ni un calcul d'impôt.",
    'Il signale les comptes, revenus, retenues, justificatifs et formulaires probables à vérifier.',
    'Les seuils, conventions fiscales, crédits et cases exactes doivent être confirmés avec les administrations ou un professionnel.',
].join(' ')

function normalizeCode(value: string | null | undefined) {
    const trimmed = value?.trim().toUpperCase()
    return trimmed || null
}

export function taxResidenceKey(country: string | null | undefined, region?: string | null) {
    const normalizedCountry = normalizeCode(country) || 'CUSTOM'
    const normalizedRegion = normalizeCode(region)
    return normalizedRegion ? `${normalizedCountry}-${normalizedRegion}` : normalizedCountry
}

export function getTaxResidenceOption(country: string | null | undefined, region?: string | null) {
    const key = taxResidenceKey(country, region)
    const exact = SUPPORTED_TAX_RESIDENCES.find((option) => taxResidenceKey(option.country, option.region) === key)
    if (exact) return exact

    return SUPPORTED_TAX_RESIDENCES.find((option) => option.country === normalizeCode(country) && option.region === null) || null
}

function profileMatches(profile: TaxProfile, country: string, region?: string | null) {
    if (normalizeCode(profile.residenceCountry) !== normalizeCode(country)) return false
    if (region === undefined) return true

    return normalizeCode(profile.residenceRegion) === normalizeCode(region)
}

function taxYearOf(transaction: Transaction) {
    return toUtcDate(transaction.date).getUTCFullYear()
}

function isIncomeInProfileYear(transaction: Transaction, profile: TaxProfile) {
    return transaction.kind === 'INCOME' && taxYearOf(transaction) === profile.year
}

function amountOf(transaction: Transaction) {
    return Math.abs(transaction.sourceAmount ?? transaction.amount)
}

function currencyOf(transaction: Transaction) {
    return normalizeCode(transaction.sourceCurrency) || normalizeCode(transaction.account?.currency) || 'CAD'
}

function accountCountry(account: Account | null | undefined) {
    return normalizeCode(account?.institutionCountry)
}

function transactionSourceCountry(transaction: Transaction) {
    return normalizeCode(transaction.taxSourceCountry) || accountCountry(transaction.account)
}

function transactionSourceRegion(transaction: Transaction) {
    return normalizeCode(transaction.taxSourceRegion) || normalizeCode(transaction.account?.institutionRegion)
}

function isForeignCountry(country: string | null | undefined, residenceCountry: string) {
    const normalized = normalizeCode(country)
    return Boolean(normalized && normalized !== normalizeCode(residenceCountry))
}

function hasForeignTaxWithheld(transaction: Transaction, residenceCountry: string) {
    const withheldAmount = transaction.taxWithheldAmount ?? 0
    if (withheldAmount <= 0) return false

    const withheldCountry = normalizeCode(transaction.taxWithheldCountry)
    return Boolean(withheldCountry && withheldCountry !== normalizeCode(residenceCountry))
}

function hasDomesticTaxWithheld(transaction: Transaction, residenceCountry: string) {
    const withheldAmount = transaction.taxWithheldAmount ?? 0
    if (withheldAmount <= 0) return false

    const withheldCountry = normalizeCode(transaction.taxWithheldCountry)
    return !withheldCountry || withheldCountry === normalizeCode(residenceCountry)
}

function section(
    jurisdiction: string,
    title: string,
    severity: TaxReportSeverity,
    items: LocalizedTaxReportItem[],
    titleKey?: string,
): LocalizedTaxReportSection | null {
    if (!items.length) return null
    return {
        jurisdiction,
        title,
        titleKey,
        severity,
        items,
    }
}

function item(options: {
    entityType: LocalizedTaxReportItem['entityType']
    entityId?: number
    label: string
    amount?: number
    currency?: string
    explanation: string
    explanationKey?: string
    explanationValues?: TaxReportTextValues
    suggestedForms: string[]
    confidence: TaxReportConfidence
}): LocalizedTaxReportItem {
    return options
}

function missingAccountTaxMetadata(accounts: Account[]) {
    return accounts
        .filter((account) => !normalizeCode(account.institutionCountry))
        .map((account) => item({
            entityType: 'account',
            entityId: account.id,
            label: account.name,
            explanation: 'Pays de détention du compte manquant. Renseigne au minimum le pays pour fiabiliser le rapport déclaratif.',
            explanationKey: 'tax.report.items.accountMissingMetadata',
            suggestedForms: ['profil compte'],
            confidence: 'low',
        }))
}

function incomeClassificationItems(incomeTransactions: Transaction[]) {
    return incomeTransactions
        .filter((transaction) => !transaction.taxCategory || transaction.taxTreatment === 'UNKNOWN' || transaction.taxTreatment === 'REVIEW_REQUIRED')
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: 'Revenu à qualifier fiscalement : catégorie, source ou traitement fiscal incomplet.',
            explanationKey: 'tax.report.items.incomeClassification',
            suggestedForms: ['catégorie fiscale', 'traitement fiscal'],
            confidence: transaction.taxCategory ? 'medium' : 'low',
        }))
}

function taxableWithoutWithholdingItems(incomeTransactions: Transaction[], forms: string[]) {
    return incomeTransactions
        .filter((transaction) => transaction.taxTreatment === 'TAXABLE_NO_WITHHOLDING')
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: 'Revenu marqué imposable sans retenue à la source. Il doit probablement être déclaré et provisionné.',
            explanationKey: 'tax.report.items.taxableNoWithholding',
            suggestedForms: forms,
            confidence: 'high',
        }))
}

function domesticWithholdingItems(incomeTransactions: Transaction[], residenceCountry: string, forms: string[]) {
    return incomeTransactions
        .filter((transaction) => transaction.taxTreatment === 'TAX_WITHHELD_AT_SOURCE' || hasDomesticTaxWithheld(transaction, residenceCountry))
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: transaction.taxWithheldAmount ?? undefined,
            currency: normalizeCode(transaction.taxWithheldCurrency) || currencyOf(transaction),
            explanation: 'Revenu avec impôt déjà retenu à la source. Conserve le justificatif et vérifie le report dans la déclaration.',
            explanationKey: 'tax.report.items.taxWithheldAtSource',
            suggestedForms: forms,
            confidence: transaction.taxWithheldAmount ? 'high' : 'medium',
        }))
}

function nonTaxableItems(incomeTransactions: Transaction[], forms: string[]) {
    return incomeTransactions
        .filter((transaction) => transaction.taxTreatment === 'NOT_TAXABLE')
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: 'Revenu marqué non imposable. À garder dans le rapport pour documenter pourquoi il est exclu.',
            explanationKey: 'tax.report.items.notTaxable',
            suggestedForms: forms,
            confidence: 'medium',
        }))
}

function treatyExemptionItems(incomeTransactions: Transaction[], forms: string[]) {
    return incomeTransactions
        .filter((transaction) => transaction.taxTreatment === 'TREATY_EXEMPT_CANDIDATE')
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: 'Exemption ou réduction par convention fiscale potentielle. À confirmer avant d’exclure ou réduire l’imposition.',
            explanationKey: 'tax.report.items.treatyExempt',
            suggestedForms: forms,
            confidence: 'medium',
        }))
}

function incomeTreatmentSections(
    jurisdiction: string,
    incomeTransactions: Transaction[],
    residenceCountry: string,
    forms: {
        classification: string[]
        taxable: string[]
        withheld: string[]
        nonTaxable: string[]
        treaty: string[]
    },
) {
    return [
        section(jurisdiction, 'Revenus à qualifier fiscalement', 'review', incomeClassificationItems(incomeTransactions), 'tax.report.sections.incomeClassification'),
        section(jurisdiction, 'Revenus imposables sans retenue', 'warning', taxableWithoutWithholdingItems(incomeTransactions, forms.taxable), 'tax.report.sections.taxableIncomeNoWithholding'),
        section(jurisdiction, 'Revenus déjà taxés / retenus à la source', 'info', domesticWithholdingItems(incomeTransactions, residenceCountry, forms.withheld), 'tax.report.sections.taxWithheldAtSource'),
        section(jurisdiction, 'Revenus marqués non imposables', 'info', nonTaxableItems(incomeTransactions, forms.nonTaxable), 'tax.report.sections.taxExemptReview'),
        section(jurisdiction, 'Exemptions par convention à confirmer', 'review', treatyExemptionItems(incomeTransactions, forms.treaty), 'tax.report.sections.treatyExemption'),
    ].filter(Boolean) as LocalizedTaxReportSection[]
}

function franceRules(context: TaxRuleContext) {
    const {accounts, incomeTransactions} = context

    const foreignAccounts = accounts
        .filter((account) => isForeignCountry(account.institutionCountry, 'FR'))
        .map((account) => item({
            entityType: 'account',
            entityId: account.id,
            label: account.name,
            explanation: `Compte situé hors de France (${account.institutionCountry}). À vérifier comme compte, actif numérique, contrat ou placement étranger déclarable selon sa nature.`,
            explanationKey: 'tax.report.items.franceForeignAccount',
            explanationValues: {country: account.institutionCountry},
            suggestedForms: ['3916', '3916-bis'],
            confidence: account.institutionCountry ? 'high' : 'medium',
        }))

    const foreignIncome = incomeTransactions
        .filter((transaction) => isForeignCountry(transactionSourceCountry(transaction), 'FR'))
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: `Revenu de source étrangère détecté (${transactionSourceCountry(transaction)}). À vérifier pour déclaration des revenus étrangers puis report sur la déclaration principale.`,
            explanationKey: 'tax.report.items.franceForeignIncome',
            explanationValues: {country: transactionSourceCountry(transaction)},
            suggestedForms: ['2047', '2042'],
            confidence: transaction.taxSourceCountry ? 'high' : 'medium',
        }))

    const foreignTaxCredits = incomeTransactions
        .filter((transaction) => hasForeignTaxWithheld(transaction, 'FR') || transaction.taxTreatment === 'FOREIGN_TAX_CREDIT_CANDIDATE')
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: transaction.taxWithheldAmount ?? undefined,
            currency: normalizeCode(transaction.taxWithheldCurrency) || currencyOf(transaction),
            explanation: `Impôt retenu hors de France (${transaction.taxWithheldCountry || transactionSourceCountry(transaction) || 'juridiction inconnue'}). Crédit d'impôt ou mécanisme conventionnel potentiel à vérifier.`,
            explanationKey: 'tax.report.items.foreignTaxCredit',
            explanationValues: {country: transaction.taxWithheldCountry || transactionSourceCountry(transaction) || '—'},
            suggestedForms: ['2047', '2042'],
            confidence: transaction.taxWithheldAmount ? 'high' : 'medium',
        }))

    return [
        section('FR', 'Métadonnées fiscales de comptes à compléter', 'info', missingAccountTaxMetadata(accounts), 'tax.report.sections.missingAccountTaxMetadata'),
        section('FR', 'Comptes étrangers potentiellement déclarables', 'review', foreignAccounts, 'tax.report.sections.foreignAccounts'),
        section('FR', 'Revenus étrangers à vérifier', 'review', foreignIncome, 'tax.report.sections.foreignIncome'),
        section('FR', 'Impôt étranger retenu / crédit potentiel', 'warning', foreignTaxCredits, 'tax.report.sections.foreignTaxCredits'),
        ...incomeTreatmentSections('FR', incomeTransactions, 'FR', {
            classification: ['2042', '2047 si source étrangère'],
            taxable: ['2042', '2047 si source étrangère'],
            withheld: ['2042', 'justificatif de retenue'],
            nonTaxable: ['justificatif', '2042 selon cas'],
            treaty: ['2047', 'convention fiscale applicable'],
        }),
    ].filter(Boolean) as LocalizedTaxReportSection[]
}

function canadaFederalRules(context: TaxRuleContext) {
    const {accounts, incomeTransactions} = context

    const foreignPropertyAccounts = accounts
        .filter((account) => isForeignCountry(account.institutionCountry, 'CA'))
        .map((account) => item({
            entityType: 'account',
            entityId: account.id,
            label: account.name,
            explanation: `Compte ou actif situé hors Canada (${account.institutionCountry}). À vérifier pour le formulaire T1135 si les biens étrangers déterminés dépassent le seuil applicable.`,
            explanationKey: 'tax.report.items.canadaForeignProperty',
            explanationValues: {country: account.institutionCountry},
            suggestedForms: ['T1135'],
            confidence: ['BROKERAGE', 'CRYPTO', 'INVESTMENT', 'LIFE_INSURANCE'].includes(account.taxReportingType || '') ? 'high' : 'medium',
        }))

    const foreignIncome = incomeTransactions
        .filter((transaction) => isForeignCountry(transactionSourceCountry(transaction), 'CA'))
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: `Revenu de source étrangère détecté (${transactionSourceCountry(transaction)}). À déclarer en dollars canadiens et à vérifier pour crédit fédéral d'impôt étranger si un impôt étranger a été payé.`,
            explanationKey: 'tax.report.items.canadaForeignIncome',
            explanationValues: {country: transactionSourceCountry(transaction)},
            suggestedForms: ['T1', 'T2209', 'line 40500'],
            confidence: transaction.taxSourceCountry ? 'high' : 'medium',
        }))

    const foreignTaxCredits = incomeTransactions
        .filter((transaction) => hasForeignTaxWithheld(transaction, 'CA') || transaction.taxTreatment === 'FOREIGN_TAX_CREDIT_CANDIDATE')
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: transaction.taxWithheldAmount ?? undefined,
            currency: normalizeCode(transaction.taxWithheldCurrency) || currencyOf(transaction),
            explanation: `Impôt retenu hors Canada (${transaction.taxWithheldCountry || transactionSourceCountry(transaction) || 'juridiction inconnue'}). Crédit fédéral d'impôt étranger potentiel à vérifier.`,
            explanationKey: 'tax.report.items.foreignTaxCredit',
            explanationValues: {country: transaction.taxWithheldCountry || transactionSourceCountry(transaction) || '—'},
            suggestedForms: ['T2209', 'line 40500'],
            confidence: transaction.taxWithheldAmount ? 'high' : 'medium',
        }))

    return [
        section('CA', 'Métadonnées fiscales de comptes à compléter', 'info', missingAccountTaxMetadata(accounts), 'tax.report.sections.missingAccountTaxMetadata'),
        section('CA', 'Biens étrangers déterminés à vérifier', 'review', foreignPropertyAccounts, 'tax.report.sections.caForeignProperty'),
        section('CA', 'Revenus étrangers fédéraux à vérifier', 'review', foreignIncome, 'tax.report.sections.caForeignIncome'),
        section('CA', "Crédit fédéral d'impôt étranger potentiel", 'warning', foreignTaxCredits, 'tax.report.sections.caForeignTaxCredits'),
        ...incomeTreatmentSections('CA', incomeTransactions, 'CA', {
            classification: ['T1', 'feuillets fiscaux'],
            taxable: ['T1', 'feuillet fiscal applicable'],
            withheld: ['T1', 'feuillet T4/T5/autre'],
            nonTaxable: ['justificatif', 'T1 selon cas'],
            treaty: ['T1', 'T2209', 'convention fiscale applicable'],
        }),
    ].filter(Boolean) as LocalizedTaxReportSection[]
}

function quebecRules(context: TaxRuleContext) {
    const {incomeTransactions} = context

    const outsideQuebecIncome = incomeTransactions
        .filter((transaction) => {
            const country = transactionSourceCountry(transaction)
            const region = transactionSourceRegion(transaction)
            return isForeignCountry(country, 'CA') || (country === 'CA' && Boolean(region && region !== 'QC'))
        })
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: `Revenu gagné hors Québec détecté (${transactionSourceCountry(transaction) || 'pays inconnu'}${transactionSourceRegion(transaction) ? `-${transactionSourceRegion(transaction)}` : ''}). À vérifier dans la déclaration Québec.`,
            explanationKey: 'tax.report.items.quebecOutsideIncome',
            explanationValues: {
                country: transactionSourceCountry(transaction) || '—',
                region: transactionSourceRegion(transaction) || null,
            },
            suggestedForms: ['TP-1', 'Annexe E'],
            confidence: transaction.taxSourceCountry || transaction.taxSourceRegion ? 'high' : 'medium',
        }))

    const outsideQuebecTaxWithheld = incomeTransactions
        .filter((transaction) => {
            const amount = transaction.taxWithheldAmount ?? 0
            if (amount <= 0) return false
            const country = normalizeCode(transaction.taxWithheldCountry)
            const region = normalizeCode(transaction.taxSourceRegion)
            return Boolean(country && country !== 'CA') || (country === 'CA' && Boolean(region && region !== 'QC'))
        })
        .map((transaction) => item({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: transaction.taxWithheldAmount ?? undefined,
            currency: normalizeCode(transaction.taxWithheldCurrency) || currencyOf(transaction),
            explanation: `Impôt retenu hors Québec (${transaction.taxWithheldCountry || 'juridiction inconnue'}). Crédit Québec ou transfert d'impôt d'une autre province potentiellement applicable.`,
            explanationKey: 'tax.report.items.quebecOutsideTax',
            explanationValues: {country: transaction.taxWithheldCountry || '—'},
            suggestedForms: ['TP-772-V', 'ligne 409', 'ligne 454'],
            confidence: 'medium',
        }))

    return [
        section('QC', 'Revenus hors Québec à vérifier', 'review', outsideQuebecIncome, 'tax.report.sections.qcOutsideIncome'),
        section('QC', "Crédit Québec ou transfert d'impôt potentiel", 'warning', outsideQuebecTaxWithheld, 'tax.report.sections.qcOutsideTax'),
        ...incomeTreatmentSections('QC', incomeTransactions, 'CA', {
            classification: ['TP-1', 'annexes Québec selon catégorie'],
            taxable: ['TP-1'],
            withheld: ['TP-1', 'RL / justificatif de retenue'],
            nonTaxable: ['justificatif', 'TP-1 selon cas'],
            treaty: ['TP-1', 'convention fiscale applicable'],
        }),
    ].filter(Boolean) as LocalizedTaxReportSection[]
}

export const TAX_JURISDICTION_RULESETS: TaxJurisdictionRuleSet[] = [
    {
        jurisdiction: 'FR',
        labelKey: 'tax.jurisdictions.FR',
        label: 'France',
        appliesTo: (profile) => profileMatches(profile, 'FR'),
        buildSections: franceRules,
    },
    {
        jurisdiction: 'CA',
        labelKey: 'tax.jurisdictions.CA',
        label: 'Canada fédéral',
        appliesTo: (profile) => profileMatches(profile, 'CA'),
        buildSections: canadaFederalRules,
    },
    {
        jurisdiction: 'QC',
        labelKey: 'tax.jurisdictions.QC',
        label: 'Québec',
        appliesTo: (profile) => profileMatches(profile, 'CA', 'QC'),
        buildSections: quebecRules,
    },
]

export function getApplicableTaxRuleSets(
    profile: TaxProfile,
    ruleSets: TaxJurisdictionRuleSet[] = TAX_JURISDICTION_RULESETS,
) {
    return ruleSets.filter((ruleSet) => ruleSet.appliesTo(profile))
}

export function buildTaxReport(
    profile: TaxProfile,
    accounts: Account[],
    transactions: Transaction[],
    ruleSets: TaxJurisdictionRuleSet[] = TAX_JURISDICTION_RULESETS,
): TaxReport {
    const incomeTransactions = transactions.filter((transaction) => isIncomeInProfileYear(transaction, profile))
    const context: TaxRuleContext = {profile, accounts, transactions, incomeTransactions}
    const sections = getApplicableTaxRuleSets(profile, ruleSets)
        .flatMap((ruleSet) => ruleSet.buildSections(context))

    return {
        profile,
        generatedAt: new Date().toISOString(),
        sections: sections as TaxReportSection[],
        disclaimer: TAX_DISCLAIMER,
    }
}

export function taxReportToMarkdown(report: TaxReport) {
    const lines = [
        `# Rapport fiscal ${report.profile.year}`,
        '',
        `Résidence fiscale : ${report.profile.residenceCountry}${report.profile.residenceRegion ? `-${report.profile.residenceRegion}` : ''}`,
        `Devise de déclaration : ${report.profile.currency}`,
        '',
        `> ${report.disclaimer}`,
        '',
    ]

    if (!report.sections.length) {
        lines.push('Aucun signal fiscal détecté avec les règles actuellement configurées.', '')
        return `${lines.join('\n')}\n`
    }

    for (const section of report.sections) {
        lines.push(`## [${section.jurisdiction}] ${section.title}`)
        lines.push(`Sévérité : ${section.severity}`)
        lines.push('')

        for (const item of section.items) {
            const amount = item.amount == null ? '' : ` — ${item.amount.toFixed(2)} ${item.currency || report.profile.currency}`
            lines.push(`- ${item.label}${amount}`)
            lines.push(`  - ${item.explanation}`)
            lines.push(`  - Formulaires / lignes à vérifier : ${item.suggestedForms.join(', ')}`)
            lines.push(`  - Confiance : ${item.confidence}`)
        }

        lines.push('')
    }

    return `${lines.join('\n')}\n`
}
