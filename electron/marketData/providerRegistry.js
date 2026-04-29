const {createProviderError, normalizeProviderError} = require('./providerErrors')

const DEFAULT_MARKET_DATA_PROVIDER_CONFIG = {
    activeProviderId: null,
    timeoutMs: 5000,
    maxFailuresBeforeCooldown: 3,
    failureCooldownMs: 60_000,
    rateLimitCooldownMs: 60_000,
}

function normalizeText(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
}

function normalizeProviderId(value, fieldName = 'providerId') {
    const normalized = normalizeText(value)
    if (!normalized) throw new Error(`${fieldName} est obligatoire.`)
    return normalized
}

function normalizePositiveInteger(value, fallback, fieldName) {
    const candidate = value == null || value === '' ? fallback : value
    const parsed = Number(candidate)
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${fieldName} doit être un entier positif ou nul.`)
    }
    return parsed
}

function normalizeProvider(provider) {
    if (!provider || typeof provider !== 'object') {
        throw new Error('Le provider de données de marché est invalide.')
    }

    const id = normalizeProviderId(provider.id)
    if (typeof provider.getQuotes !== 'function') {
        throw new Error(`Le provider ${id} doit exposer une méthode getQuotes.`)
    }

    return {
        id,
        name: normalizeText(provider.name) || id,
        enabled: provider.enabled !== false,
        supportsSearch: Boolean(provider.supportsSearch || typeof provider.search === 'function'),
        supportsBatchQuotes: provider.supportsBatchQuotes !== false,
        supportsHistoricalQuotes: Boolean(provider.supportsHistoricalQuotes),
        supportedInstrumentTypes: Array.isArray(provider.supportedInstrumentTypes)
            ? [...provider.supportedInstrumentTypes]
            : null,
        supportedCurrencies: Array.isArray(provider.supportedCurrencies) ? [...provider.supportedCurrencies] : null,
        priority: Number.isFinite(Number(provider.priority)) ? Number(provider.priority) : 100,
        rateLimit: provider.rateLimit || null,
        getQuotes: provider.getQuotes.bind(provider),
        search: typeof provider.search === 'function' ? provider.search.bind(provider) : null,
        rawProvider: provider,
    }
}

function createInitialProviderState() {
    return {
        consecutiveFailures: 0,
        disabledUntil: null,
        lastFailureAt: null,
        lastSuccessAt: null,
        lastError: null,
    }
}

class MarketDataProviderRegistry {
    constructor(options = {}) {
        this.providers = new Map()
        this.runtime = new Map()
        this.config = {
            ...DEFAULT_MARKET_DATA_PROVIDER_CONFIG,
            ...options,
            activeProviderId: options.activeProviderId || DEFAULT_MARKET_DATA_PROVIDER_CONFIG.activeProviderId,
            timeoutMs: normalizePositiveInteger(
                options.timeoutMs,
                DEFAULT_MARKET_DATA_PROVIDER_CONFIG.timeoutMs,
                'Le timeout provider',
            ),
            maxFailuresBeforeCooldown: normalizePositiveInteger(
                options.maxFailuresBeforeCooldown,
                DEFAULT_MARKET_DATA_PROVIDER_CONFIG.maxFailuresBeforeCooldown,
                'Le seuil de failures provider',
            ),
            failureCooldownMs: normalizePositiveInteger(
                options.failureCooldownMs,
                DEFAULT_MARKET_DATA_PROVIDER_CONFIG.failureCooldownMs,
                'Le cooldown provider',
            ),
            rateLimitCooldownMs: normalizePositiveInteger(
                options.rateLimitCooldownMs,
                DEFAULT_MARKET_DATA_PROVIDER_CONFIG.rateLimitCooldownMs,
                'Le cooldown rate-limit provider',
            ),
        }

        if (Array.isArray(options.providers)) {
            options.providers.forEach((provider) => this.register(provider))
        }
    }

    register(provider) {
        const normalized = normalizeProvider(provider)
        this.providers.set(normalized.id, normalized)

        if (!this.runtime.has(normalized.id)) {
            this.runtime.set(normalized.id, createInitialProviderState())
        }

        if (!this.config.activeProviderId && normalized.enabled) {
            this.config.activeProviderId = normalized.id
        }

        return normalized
    }

    unregister(providerId) {
        const id = normalizeProviderId(providerId)
        const removed = this.providers.delete(id)
        this.runtime.delete(id)

        if (this.config.activeProviderId === id) {
            this.config.activeProviderId = this.list({enabledOnly: true})[0]?.id || null
        }

        return removed
    }

    list(options = {}) {
        const providers = [...this.providers.values()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
        return options.enabledOnly ? providers.filter((provider) => provider.enabled) : providers
    }

    get(providerId) {
        if (!providerId) return null
        return this.providers.get(providerId) || null
    }

    requireProvider(providerId) {
        const id = normalizeProviderId(providerId)
        const provider = this.get(id)

        if (!provider) {
            throw createProviderError('PROVIDER_UNAVAILABLE', `Le provider ${id} n’est pas enregistré.`, {
                providerId: id,
            })
        }

        if (!provider.enabled) {
            throw createProviderError('PROVIDER_UNAVAILABLE', `Le provider ${id} est désactivé.`, {
                providerId: id,
            })
        }

        return provider
    }

    getActiveProviderId() {
        return this.config.activeProviderId
    }

    setActiveProviderId(providerId) {
        if (providerId == null || providerId === '') {
            this.config.activeProviderId = null
            return null
        }

        const provider = this.requireProvider(providerId)
        this.config.activeProviderId = provider.id
        return provider.id
    }

    getActiveProvider() {
        if (!this.config.activeProviderId) return null
        return this.requireProvider(this.config.activeProviderId)
    }

    getConfig() {
        return {...this.config}
    }

    setConfig(config = {}) {
        if (Object.prototype.hasOwnProperty.call(config, 'activeProviderId')) {
            this.setActiveProviderId(config.activeProviderId)
        }

        if (Object.prototype.hasOwnProperty.call(config, 'timeoutMs')) {
            this.config.timeoutMs = normalizePositiveInteger(config.timeoutMs, this.config.timeoutMs, 'Le timeout provider')
        }

        if (Object.prototype.hasOwnProperty.call(config, 'maxFailuresBeforeCooldown')) {
            this.config.maxFailuresBeforeCooldown = normalizePositiveInteger(
                config.maxFailuresBeforeCooldown,
                this.config.maxFailuresBeforeCooldown,
                'Le seuil de failures provider',
            )
        }

        if (Object.prototype.hasOwnProperty.call(config, 'failureCooldownMs')) {
            this.config.failureCooldownMs = normalizePositiveInteger(
                config.failureCooldownMs,
                this.config.failureCooldownMs,
                'Le cooldown provider',
            )
        }

        if (Object.prototype.hasOwnProperty.call(config, 'rateLimitCooldownMs')) {
            this.config.rateLimitCooldownMs = normalizePositiveInteger(
                config.rateLimitCooldownMs,
                this.config.rateLimitCooldownMs,
                'Le cooldown rate-limit provider',
            )
        }

        return this.getConfig()
    }

    getProviderRuntimeState(providerId) {
        const id = normalizeProviderId(providerId)
        return {...(this.runtime.get(id) || createInitialProviderState())}
    }

    isProviderAvailable(providerId, now = new Date()) {
        const provider = this.get(providerId)
        if (!provider || !provider.enabled) return false

        const state = this.runtime.get(provider.id) || createInitialProviderState()
        if (!state.disabledUntil) return true

        return new Date(state.disabledUntil).getTime() <= now.getTime()
    }

    markSuccess(providerId, now = new Date()) {
        const id = normalizeProviderId(providerId)
        const state = this.runtime.get(id) || createInitialProviderState()

        state.consecutiveFailures = 0
        state.disabledUntil = null
        state.lastError = null
        state.lastSuccessAt = now.toISOString()
        this.runtime.set(id, state)

        return {...state}
    }

    markFailure(providerId, error, now = new Date()) {
        const id = normalizeProviderId(providerId)
        const state = this.runtime.get(id) || createInitialProviderState()
        const normalizedError = normalizeProviderError(error, {providerId: id})

        state.consecutiveFailures += 1
        state.lastFailureAt = now.toISOString()
        state.lastError = normalizedError

        const shouldCooldown =
            normalizedError.status === 'RATE_LIMITED' ||
            state.consecutiveFailures >= this.config.maxFailuresBeforeCooldown

        if (shouldCooldown) {
            const retryAfterMs = Number(normalizedError.retryAfterSeconds || 0) * 1000
            const cooldownMs =
                normalizedError.status === 'RATE_LIMITED'
                    ? Math.max(retryAfterMs, this.config.rateLimitCooldownMs)
                    : this.config.failureCooldownMs

            state.disabledUntil = new Date(now.getTime() + cooldownMs).toISOString()
        }

        this.runtime.set(id, state)
        return {...state}
    }
}

function createMarketDataProviderRegistry(options = {}) {
    return new MarketDataProviderRegistry(options)
}

module.exports = {
    DEFAULT_MARKET_DATA_PROVIDER_CONFIG,
    MarketDataProviderRegistry,
    createMarketDataProviderRegistry,
}
