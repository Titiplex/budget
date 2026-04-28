/**
 * Shared renderer/main types for the wealth domain.
 *
 * Budget records describe cash-flow events.
 * Wealth records describe balance-sheet state at a given date.
 */

export type WealthDateString = string
export type WealthDateTimeString = string
export type WealthCurrencyCode = string

export type WealthEntityType = 'asset' | 'portfolio' | 'holdingLot' | 'priceSnapshot' | 'liability' | 'netWorthSnapshot'
export type WealthOverviewEntityType = 'asset' | 'portfolio' | 'liability'

export type WealthAssetType =
    | 'CASH'
    | 'REAL_ESTATE'
    | 'VEHICLE'
    | 'COLLECTIBLE'
    | 'BUSINESS'
    | 'PRIVATE_EQUITY'
    | 'CRYPTO'
    | 'OTHER'

export type PortfolioType =
    | 'TAXABLE_BROKERAGE'
    | 'RETIREMENT'
    | 'EDUCATION'
    | 'CRYPTO'
    | 'SAVINGS_INVESTMENT'
    | 'OTHER'

export type PortfolioTaxWrapper =
    | 'NONE'
    | 'TFSA'
    | 'RRSP'
    | 'FHSA'
    | 'RESP'
    | 'PEA'
    | 'ASSURANCE_VIE'
    | 'PER'
    | 'OTHER'

export type HoldingAssetClass =
    | 'CASH'
    | 'EQUITY'
    | 'ETF'
    | 'MUTUAL_FUND'
    | 'BOND'
    | 'CRYPTO'
    | 'OPTION'
    | 'COMMODITY'
    | 'REAL_ESTATE_FUND'
    | 'OTHER'

export type LiabilityType =
    | 'MORTGAGE'
    | 'STUDENT_LOAN'
    | 'PERSONAL_LOAN'
    | 'CREDIT_CARD'
    | 'LINE_OF_CREDIT'
    | 'AUTO_LOAN'
    | 'TAX_DEBT'
    | 'OTHER'

export type LiabilityPaymentFrequency = 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY' | 'YEARLY' | 'OTHER'
export type LiabilityRateType = 'FIXED' | 'VARIABLE' | 'PROMOTIONAL' | 'UNKNOWN'

export type WealthRecordStatus = 'ACTIVE' | 'ARCHIVED'
export type WealthValuationMode = 'MANUAL' | 'CALCULATED' | 'IMPORTED'
export type PriceSnapshotSource = 'MANUAL' | 'IMPORTED' | 'API'
export type NetWorthSnapshotSource = 'MANUAL' | 'GENERATED' | 'IMPORTED'

export const WEALTH_ASSET_TYPES = [
    'CASH',
    'REAL_ESTATE',
    'VEHICLE',
    'COLLECTIBLE',
    'BUSINESS',
    'PRIVATE_EQUITY',
    'CRYPTO',
    'OTHER',
] as const satisfies readonly WealthAssetType[]

export const PORTFOLIO_TYPES = [
    'TAXABLE_BROKERAGE',
    'RETIREMENT',
    'EDUCATION',
    'CRYPTO',
    'SAVINGS_INVESTMENT',
    'OTHER',
] as const satisfies readonly PortfolioType[]

export const PORTFOLIO_TAX_WRAPPERS = [
    'NONE',
    'TFSA',
    'RRSP',
    'FHSA',
    'RESP',
    'PEA',
    'ASSURANCE_VIE',
    'PER',
    'OTHER',
] as const satisfies readonly PortfolioTaxWrapper[]

export const HOLDING_ASSET_CLASSES = [
    'CASH',
    'EQUITY',
    'ETF',
    'MUTUAL_FUND',
    'BOND',
    'CRYPTO',
    'OPTION',
    'COMMODITY',
    'REAL_ESTATE_FUND',
    'OTHER',
] as const satisfies readonly HoldingAssetClass[]

export const LIABILITY_TYPES = [
    'MORTGAGE',
    'STUDENT_LOAN',
    'PERSONAL_LOAN',
    'CREDIT_CARD',
    'LINE_OF_CREDIT',
    'AUTO_LOAN',
    'TAX_DEBT',
    'OTHER',
] as const satisfies readonly LiabilityType[]

export const LIABILITY_PAYMENT_FREQUENCIES = [
    'MONTHLY',
    'BIWEEKLY',
    'WEEKLY',
    'YEARLY',
    'OTHER',
] as const satisfies readonly LiabilityPaymentFrequency[]

export const LIABILITY_RATE_TYPES = [
    'FIXED',
    'VARIABLE',
    'PROMOTIONAL',
    'UNKNOWN',
] as const satisfies readonly LiabilityRateType[]

export const WEALTH_RECORD_STATUSES = ['ACTIVE', 'ARCHIVED'] as const satisfies readonly WealthRecordStatus[]
export const WEALTH_VALUATION_MODES = ['MANUAL', 'CALCULATED', 'IMPORTED'] as const satisfies readonly WealthValuationMode[]
export const PRICE_SNAPSHOT_SOURCES = ['MANUAL', 'IMPORTED', 'API'] as const satisfies readonly PriceSnapshotSource[]
export const NET_WORTH_SNAPSHOT_SOURCES = ['MANUAL', 'GENERATED', 'IMPORTED'] as const satisfies readonly NetWorthSnapshotSource[]

export const WEALTH_ASSET_TYPE_LABELS: Record<WealthAssetType, string> = {
    CASH: 'Cash',
    REAL_ESTATE: 'Immobilier',
    VEHICLE: 'Véhicule',
    COLLECTIBLE: 'Objet de collection',
    BUSINESS: 'Entreprise',
    PRIVATE_EQUITY: 'Private equity',
    CRYPTO: 'Crypto',
    OTHER: 'Autre',
}

export const PORTFOLIO_TYPE_LABELS: Record<PortfolioType, string> = {
    TAXABLE_BROKERAGE: 'Compte-titres imposable',
    RETIREMENT: 'Retraite',
    EDUCATION: 'Éducation',
    CRYPTO: 'Crypto',
    SAVINGS_INVESTMENT: 'Épargne investie',
    OTHER: 'Autre',
}

export const PORTFOLIO_TAX_WRAPPER_LABELS: Record<PortfolioTaxWrapper, string> = {
    NONE: 'Aucune enveloppe',
    TFSA: 'CELI / TFSA',
    RRSP: 'REER / RRSP',
    FHSA: 'CELIAPP / FHSA',
    RESP: 'REEE / RESP',
    PEA: 'PEA',
    ASSURANCE_VIE: 'Assurance-vie',
    PER: 'PER',
    OTHER: 'Autre',
}

export const HOLDING_ASSET_CLASS_LABELS: Record<HoldingAssetClass, string> = {
    CASH: 'Cash',
    EQUITY: 'Action',
    ETF: 'ETF',
    MUTUAL_FUND: 'Fonds commun',
    BOND: 'Obligation',
    CRYPTO: 'Crypto',
    OPTION: 'Option',
    COMMODITY: 'Matière première',
    REAL_ESTATE_FUND: 'Fonds immobilier',
    OTHER: 'Autre',
}

export const LIABILITY_TYPE_LABELS: Record<LiabilityType, string> = {
    MORTGAGE: 'Hypothèque',
    STUDENT_LOAN: 'Prêt étudiant',
    PERSONAL_LOAN: 'Prêt personnel',
    CREDIT_CARD: 'Carte de crédit',
    LINE_OF_CREDIT: 'Marge de crédit',
    AUTO_LOAN: 'Prêt auto',
    TAX_DEBT: 'Dette fiscale',
    OTHER: 'Autre',
}

export const LIABILITY_PAYMENT_FREQUENCY_LABELS: Record<LiabilityPaymentFrequency, string> = {
    MONTHLY: 'Mensuel',
    BIWEEKLY: 'Aux deux semaines',
    WEEKLY: 'Hebdomadaire',
    YEARLY: 'Annuel',
    OTHER: 'Autre',
}

export const LIABILITY_RATE_TYPE_LABELS: Record<LiabilityRateType, string> = {
    FIXED: 'Fixe',
    VARIABLE: 'Variable',
    PROMOTIONAL: 'Promotionnel',
    UNKNOWN: 'Inconnu',
}

export const WEALTH_RECORD_STATUS_LABELS: Record<WealthRecordStatus, string> = {
    ACTIVE: 'Actif',
    ARCHIVED: 'Archivé',
}

export const WEALTH_VALUATION_MODE_LABELS: Record<WealthValuationMode, string> = {
    MANUAL: 'Manuel',
    CALCULATED: 'Calculé',
    IMPORTED: 'Importé',
}

export interface WealthBudgetAccountLink {
    id: number
    name: string
    type: string
    currency: WealthCurrencyCode
}

export interface WealthBaseRecord {
    id: number
    name: string
    status: WealthRecordStatus
    currency: WealthCurrencyCode
    includeInNetWorth: boolean
    note: string | null
    createdAt: WealthDateTimeString
    updatedAt: WealthDateTimeString
}

export interface WealthInstitutionFields {
    institutionName: string | null
    institutionCountry: string | null
    institutionRegion: string | null
}

export interface WealthAsset extends WealthBaseRecord, WealthInstitutionFields {
    type: WealthAssetType
    valuationMode: WealthValuationMode
    currentValue: number
    ownershipPercent: number
    acquisitionValue: number | null
    acquiredAt: WealthDateTimeString | null
    valueAsOf: WealthDateTimeString | null
    securedLiabilities?: WealthLiability[]
}

export type Asset = WealthAsset

export interface WealthPortfolio extends WealthBaseRecord, WealthInstitutionFields {
    type: PortfolioType
    taxWrapper: PortfolioTaxWrapper
    valuationMode: WealthValuationMode
    currentValue: number
    ownershipPercent: number
    cashBalance: number
    valueAsOf: WealthDateTimeString | null
    accountId: number | null
    account?: WealthBudgetAccountLink | null
    holdings?: HoldingLot[]
}

export type Portfolio = WealthPortfolio

export interface HoldingLot {
    id: number
    name: string
    symbol: string | null
    assetClass: HoldingAssetClass
    quantity: number
    currency: WealthCurrencyCode
    unitCost: number | null
    costBasis: number | null
    unitPrice: number | null
    marketValue: number | null
    openedAt: WealthDateTimeString | null
    valueAsOf: WealthDateTimeString | null
    note: string | null
    createdAt: WealthDateTimeString
    updatedAt: WealthDateTimeString
    portfolioId: number
    portfolio?: WealthPortfolio | null
    priceSnapshots?: PriceSnapshot[]
}

export interface PriceSnapshot {
    id: number
    unitPrice: number
    currency: WealthCurrencyCode
    pricedAt: WealthDateTimeString
    source: PriceSnapshotSource
    note: string | null
    createdAt: WealthDateTimeString
    updatedAt: WealthDateTimeString
    holdingLotId: number
    holdingLot?: HoldingLot | null
}

export interface WealthLiability extends WealthBaseRecord, Omit<WealthInstitutionFields, 'institutionName'> {
    type: LiabilityType
    currentBalance: number
    initialAmount: number | null
    interestRate: number | null
    minimumPayment: number | null
    paymentFrequency: LiabilityPaymentFrequency | null
    rateType: LiabilityRateType
    lenderName: string | null
    openedAt: WealthDateTimeString | null
    dueAt: WealthDateTimeString | null
    balanceAsOf: WealthDateTimeString | null
    securedAssetId: number | null
    securedAsset?: WealthAsset | null
    accountId: number | null
    account?: WealthBudgetAccountLink | null
}

export type Liability = WealthLiability

export interface NetWorthSnapshotBreakdownItem {
    id: number | null
    label: string
    type: string
    amount: number
    currency: WealthCurrencyCode
    percentOfTotal: number | null
}

export interface NetWorthSnapshotBreakdown {
    assets: NetWorthSnapshotBreakdownItem[]
    portfolios: NetWorthSnapshotBreakdownItem[]
    liabilities: NetWorthSnapshotBreakdownItem[]
}

export interface NetWorthSnapshot {
    id: number
    snapshotDate: WealthDateTimeString
    currency: WealthCurrencyCode
    totalStandaloneAssets: number
    totalPortfolios: number
    totalAssets: number
    totalLiabilities: number
    netWorth: number
    source: NetWorthSnapshotSource
    assetBreakdownJson: string | null
    portfolioBreakdownJson: string | null
    liabilityBreakdownJson: string | null
    note: string | null
    createdAt: WealthDateTimeString
    updatedAt: WealthDateTimeString
    breakdown?: NetWorthSnapshotBreakdown
}

export interface WealthAssetFormData {
    name: string
    type: WealthAssetType
    status: WealthRecordStatus
    currency: WealthCurrencyCode
    valuationMode: WealthValuationMode
    currentValue: number
    includeInNetWorth: boolean
    ownershipPercent: number
    acquisitionValue: number | null
    acquiredAt: WealthDateTimeString | null
    valueAsOf: WealthDateTimeString | null
    institutionName: string | null
    institutionCountry: string | null
    institutionRegion: string | null
    note: string | null
}

export type CreateWealthAssetInput = WealthAssetFormData
export type UpdateWealthAssetInput = Partial<WealthAssetFormData>

export interface WealthPortfolioFormData {
    name: string
    type: PortfolioType
    status: WealthRecordStatus
    currency: WealthCurrencyCode
    institutionName: string | null
    institutionCountry: string | null
    institutionRegion: string | null
    taxWrapper: PortfolioTaxWrapper
    valuationMode: WealthValuationMode
    currentValue: number
    includeInNetWorth: boolean
    ownershipPercent: number
    cashBalance: number
    valueAsOf: WealthDateTimeString | null
    accountId: number | null
    note: string | null
}

export type CreateWealthPortfolioInput = WealthPortfolioFormData
export type UpdateWealthPortfolioInput = Partial<WealthPortfolioFormData>

export interface HoldingLotFormData {
    name: string
    symbol: string | null
    assetClass: HoldingAssetClass
    quantity: number
    currency: WealthCurrencyCode
    unitCost: number | null
    costBasis: number | null
    unitPrice: number | null
    marketValue: number | null
    openedAt: WealthDateTimeString | null
    valueAsOf: WealthDateTimeString | null
    portfolioId: number
    note: string | null
}

export type CreateHoldingLotInput = HoldingLotFormData
export type UpdateHoldingLotInput = Partial<HoldingLotFormData>

export interface PriceSnapshotFormData {
    holdingLotId: number
    unitPrice: number
    currency: WealthCurrencyCode
    pricedAt: WealthDateTimeString
    source: PriceSnapshotSource
    note: string | null
}

export type CreatePriceSnapshotInput = PriceSnapshotFormData
export type UpdatePriceSnapshotInput = Partial<PriceSnapshotFormData>

export interface WealthLiabilityFormData {
    name: string
    type: LiabilityType
    status: WealthRecordStatus
    currency: WealthCurrencyCode
    currentBalance: number
    includeInNetWorth: boolean
    initialAmount: number | null
    interestRate: number | null
    minimumPayment: number | null
    paymentFrequency: LiabilityPaymentFrequency | null
    rateType: LiabilityRateType
    lenderName: string | null
    institutionCountry: string | null
    institutionRegion: string | null
    openedAt: WealthDateTimeString | null
    dueAt: WealthDateTimeString | null
    balanceAsOf: WealthDateTimeString | null
    securedAssetId: number | null
    accountId: number | null
    note: string | null
}

export type CreateWealthLiabilityInput = WealthLiabilityFormData
export type UpdateWealthLiabilityInput = Partial<WealthLiabilityFormData>

export interface CreateGeneratedNetWorthSnapshotInput {
    currency?: WealthCurrencyCode | null
    snapshotDate?: WealthDateTimeString | WealthDateString | null
    note?: string | null
}

export interface WealthDateRangeFilter {
    startDate?: WealthDateString | null
    endDate?: WealthDateString | null
    currency?: WealthCurrencyCode | null
}

export interface WealthCurrencyTotals {
    totalStandaloneAssets: number
    totalPortfolios: number
    totalAssets: number
    totalLiabilities: number
    netWorth: number
}

export interface WealthTotals {
    totalStandaloneAssets: number | null
    totalPortfolios: number | null
    totalAssets: number | null
    totalLiabilities: number | null
    netWorth: number | null
    assetCount: number
    portfolioCount: number
    liabilityCount: number
    snapshotDate?: WealthDateTimeString | null
}

export interface WealthBreakdownRow {
    key: string
    label: string
    type: string
    entityType: WealthOverviewEntityType
    amount: number
    currency: WealthCurrencyCode
    percentOfTotal: number | null
}

export interface WealthOverview {
    currency: WealthCurrencyCode | null
    currencies: WealthCurrencyCode[]
    canConsolidate: boolean
    totals: WealthTotals
    totalsByCurrency: Record<WealthCurrencyCode, WealthCurrencyTotals>
    assets: WealthAsset[]
    portfolios: WealthPortfolio[]
    liabilities: WealthLiability[]
    breakdown: WealthBreakdownRow[]
    latestSnapshot: NetWorthSnapshot | null
}

export interface WealthOverviewOptions {
    currency?: WealthCurrencyCode | null
}

export interface WealthListFilters {
    search?: string
    status?: WealthRecordStatus | 'ALL'
    currency?: WealthCurrencyCode | 'ALL'
    assetType?: WealthAssetType | 'ALL'
    portfolioType?: PortfolioType | 'ALL'
    liabilityType?: LiabilityType | 'ALL'
}

export interface WealthDeleteResult {
    ok: boolean
    id: number
    entityType: WealthEntityType
    error?: string
}

export interface WealthRendererApi {
    listAssets(filters?: WealthListFilters): Promise<WealthAsset[]>

    createAsset(input: CreateWealthAssetInput): Promise<WealthAsset>

    updateAsset(id: number, input: UpdateWealthAssetInput): Promise<WealthAsset>

    deleteAsset(id: number): Promise<WealthDeleteResult>

    listPortfolios(filters?: WealthListFilters): Promise<WealthPortfolio[]>

    createPortfolio(input: CreateWealthPortfolioInput): Promise<WealthPortfolio>

    updatePortfolio(id: number, input: UpdateWealthPortfolioInput): Promise<WealthPortfolio>

    deletePortfolio(id: number): Promise<WealthDeleteResult>

    listLiabilities(filters?: WealthListFilters): Promise<WealthLiability[]>

    createLiability(input: CreateWealthLiabilityInput): Promise<WealthLiability>

    updateLiability(id: number, input: UpdateWealthLiabilityInput): Promise<WealthLiability>

    deleteLiability(id: number): Promise<WealthDeleteResult>

    getOverview(options?: WealthOverviewOptions): Promise<WealthOverview>

    createGeneratedNetWorthSnapshot(options?: CreateGeneratedNetWorthSnapshotInput): Promise<NetWorthSnapshot>

    listNetWorthSnapshots(filters?: WealthDateRangeFilter): Promise<NetWorthSnapshot[]>
}

declare global {
    interface Window {
        wealth: WealthRendererApi
    }
}

export const DEFAULT_WEALTH_ASSET_FORM: WealthAssetFormData = {
    name: '',
    type: 'OTHER',
    status: 'ACTIVE',
    currency: 'CAD',
    valuationMode: 'MANUAL',
    currentValue: 0,
    includeInNetWorth: true,
    ownershipPercent: 100,
    acquisitionValue: null,
    acquiredAt: null,
    valueAsOf: null,
    institutionName: null,
    institutionCountry: null,
    institutionRegion: null,
    note: null,
}

export const DEFAULT_WEALTH_PORTFOLIO_FORM: WealthPortfolioFormData = {
    name: '',
    type: 'TAXABLE_BROKERAGE',
    status: 'ACTIVE',
    currency: 'CAD',
    institutionName: null,
    institutionCountry: null,
    institutionRegion: null,
    taxWrapper: 'NONE',
    valuationMode: 'MANUAL',
    currentValue: 0,
    includeInNetWorth: true,
    ownershipPercent: 100,
    cashBalance: 0,
    valueAsOf: null,
    accountId: null,
    note: null,
}

export const DEFAULT_WEALTH_LIABILITY_FORM: WealthLiabilityFormData = {
    name: '',
    type: 'OTHER',
    status: 'ACTIVE',
    currency: 'CAD',
    currentBalance: 0,
    includeInNetWorth: true,
    initialAmount: null,
    interestRate: null,
    minimumPayment: null,
    paymentFrequency: null,
    rateType: 'UNKNOWN',
    lenderName: null,
    institutionCountry: null,
    institutionRegion: null,
    openedAt: null,
    dueAt: null,
    balanceAsOf: null,
    securedAssetId: null,
    accountId: null,
    note: null,
}