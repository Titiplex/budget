import type {
    Account,
    TaxProfile,
    TaxReport,
    TaxReportItem,
    TaxReportSection,
    Transaction,
} from '../types/budget'
import {toUtcDate} from './date'

interface TaxRuleContext {
    profile: TaxProfile
    accounts: Account[]
    transactions: Transaction[]
}

const TAX_DISCLAIMER = [
    "Ce rapport est une aide à l'inventaire fiscal, pas un conseil fiscal ni un calcul d'impôt.",
    'Il signale les comptes, revenus et retenues à vérifier avec les formulaires probables.',
    'Les seuils, conventions fiscales, crédits et cases exactes doivent être confirmés avec les administrations ou un professionnel.',
].join(' ')

function normalizeCode(value: string | null | undefined) {
    const trimmed = value?.trim().toUpperCase()
    return trimmed || null
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

function section(
    jurisdiction: TaxReportSection['jurisdiction'],
    title: string,
    severity: TaxReportSection['severity'],
    items: TaxReportItem[],
): TaxReportSection | null {
    if (!items.length) return null
    return {
        jurisdiction,
        title,
        severity,
        items,
    }
}

function franceRules(context: TaxRuleContext) {
    const {accounts, transactions, profile} = context
    const incomeTransactions = transactions.filter((transaction) => isIncomeInProfileYear(transaction, profile))

    const foreignAccounts = accounts
        .filter((account) => isForeignCountry(account.institutionCountry, 'FR'))
        .map<TaxReportItem>((account) => ({
            entityType: 'account',
            entityId: account.id,
            label: account.name,
            explanation: `Compte situé hors de France (${account.institutionCountry}). À vérifier comme compte, actif numérique, contrat ou placement étranger déclarable selon sa nature.`,
            suggestedForms: ['3916', '3916-bis'],
            confidence: account.institutionCountry ? 'high' : 'medium',
        }))

    const foreignIncome = incomeTransactions
        .filter((transaction) => isForeignCountry(transactionSourceCountry(transaction), 'FR'))
        .map<TaxReportItem>((transaction) => ({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: `Revenu de source étrangère détecté (${transactionSourceCountry(transaction)}). À vérifier pour déclaration des revenus étrangers puis report sur la déclaration principale.`,
            suggestedForms: ['2047', '2042'],
            confidence: transaction.taxSourceCountry ? 'high' : 'medium',
        }))

    const foreignTaxCredits = incomeTransactions
        .filter((transaction) => hasForeignTaxWithheld(transaction, 'FR'))
        .map<TaxReportItem>((transaction) => ({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: transaction.taxWithheldAmount ?? undefined,
            currency: normalizeCode(transaction.taxWithheldCurrency) || currencyOf(transaction),
            explanation: `Impôt retenu hors de France (${transaction.taxWithheldCountry}). Crédit d'impôt ou mécanisme conventionnel potentiel à vérifier.`,
            suggestedForms: ['2047', '2042'],
            confidence: 'medium',
        }))

    return [
        section('FR', 'Comptes étrangers potentiellement déclarables', 'review', foreignAccounts),
        section('FR', 'Revenus étrangers à vérifier', 'review', foreignIncome),
        section('FR', 'Impôt étranger retenu / crédit potentiel', 'warning', foreignTaxCredits),
    ].filter(Boolean) as TaxReportSection[]
}

function canadaFederalRules(context: TaxRuleContext) {
    const {accounts, transactions, profile} = context
    const incomeTransactions = transactions.filter((transaction) => isIncomeInProfileYear(transaction, profile))

    const foreignPropertyAccounts = accounts
        .filter((account) => isForeignCountry(account.institutionCountry, 'CA'))
        .map<TaxReportItem>((account) => ({
            entityType: 'account',
            entityId: account.id,
            label: account.name,
            explanation: `Compte ou actif situé hors Canada (${account.institutionCountry}). À vérifier pour le formulaire T1135 si les biens étrangers déterminés dépassent le seuil applicable.`,
            suggestedForms: ['T1135'],
            confidence: ['BROKERAGE', 'CRYPTO', 'INVESTMENT', 'LIFE_INSURANCE'].includes(account.taxReportingType || '') ? 'high' : 'medium',
        }))

    const foreignIncome = incomeTransactions
        .filter((transaction) => isForeignCountry(transactionSourceCountry(transaction), 'CA'))
        .map<TaxReportItem>((transaction) => ({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: `Revenu de source étrangère détecté (${transactionSourceCountry(transaction)}). À déclarer en dollars canadiens et à vérifier pour crédit fédéral d'impôt étranger si un impôt étranger a été payé.`,
            suggestedForms: ['T1', 'T2209', 'line 40500'],
            confidence: transaction.taxSourceCountry ? 'high' : 'medium',
        }))

    const foreignTaxCredits = incomeTransactions
        .filter((transaction) => hasForeignTaxWithheld(transaction, 'CA'))
        .map<TaxReportItem>((transaction) => ({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: transaction.taxWithheldAmount ?? undefined,
            currency: normalizeCode(transaction.taxWithheldCurrency) || currencyOf(transaction),
            explanation: `Impôt retenu hors Canada (${transaction.taxWithheldCountry}). Crédit fédéral d'impôt étranger potentiel à vérifier.`,
            suggestedForms: ['T2209', 'line 40500'],
            confidence: 'medium',
        }))

    return [
        section('CA', 'Biens étrangers déterminés à vérifier', 'review', foreignPropertyAccounts),
        section('CA', 'Revenus étrangers fédéraux à vérifier', 'review', foreignIncome),
        section('CA', "Crédit fédéral d'impôt étranger potentiel", 'warning', foreignTaxCredits),
    ].filter(Boolean) as TaxReportSection[]
}

function quebecRules(context: TaxRuleContext) {
    const {transactions, profile} = context
    const incomeTransactions = transactions.filter((transaction) => isIncomeInProfileYear(transaction, profile))

    const outsideQuebecIncome = incomeTransactions
        .filter((transaction) => {
            const country = transactionSourceCountry(transaction)
            const region = transactionSourceRegion(transaction)
            return isForeignCountry(country, 'CA') || (country === 'CA' && Boolean(region && region !== 'QC'))
        })
        .map<TaxReportItem>((transaction) => ({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: amountOf(transaction),
            currency: currencyOf(transaction),
            explanation: `Revenu gagné hors Québec détecté (${transactionSourceCountry(transaction) || 'pays inconnu'}${transactionSourceRegion(transaction) ? `-${transactionSourceRegion(transaction)}` : ''}). À vérifier dans la déclaration Québec.`,
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
        .map<TaxReportItem>((transaction) => ({
            entityType: 'transaction',
            entityId: transaction.id,
            label: transaction.label,
            amount: transaction.taxWithheldAmount ?? undefined,
            currency: normalizeCode(transaction.taxWithheldCurrency) || currencyOf(transaction),
            explanation: `Impôt retenu hors Québec (${transaction.taxWithheldCountry || 'juridiction inconnue'}). Crédit Québec ou transfert d'impôt d'une autre province potentiellement applicable.`,
            suggestedForms: ['TP-772-V', 'ligne 409', 'ligne 454'],
            confidence: 'medium',
        }))

    return [
        section('QC', 'Revenus hors Québec à vérifier', 'review', outsideQuebecIncome),
        section('QC', "Crédit Québec ou transfert d'impôt potentiel", 'warning', outsideQuebecTaxWithheld),
    ].filter(Boolean) as TaxReportSection[]
}

export function buildTaxReport(
    profile: TaxProfile,
    accounts: Account[],
    transactions: Transaction[],
): TaxReport {
    const residenceCountry = normalizeCode(profile.residenceCountry)
    const residenceRegion = normalizeCode(profile.residenceRegion)
    const context: TaxRuleContext = {profile, accounts, transactions}

    const sections: TaxReportSection[] = []

    if (residenceCountry === 'FR') {
        sections.push(...franceRules(context))
    }

    if (residenceCountry === 'CA') {
        sections.push(...canadaFederalRules(context))

        if (residenceRegion === 'QC') {
            sections.push(...quebecRules(context))
        }
    }

    return {
        profile,
        generatedAt: new Date().toISOString(),
        sections,
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
