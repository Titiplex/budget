const providerErrors = require('./providerErrors')
const quoteNormalizer = require('./quoteNormalizer')
const providerRegistry = require('./providerRegistry')
const mockProvider = require('./mockProvider')
const marketDataService = require('./marketDataService')
const valuationErrors = require('./valuationErrors')
const fxConversion = require('./fxConversion')
const priceSnapshotRepository = require('./priceSnapshotRepository')
const valuationService = require('./valuationService')

module.exports = {
    ...providerErrors,
    ...quoteNormalizer,
    ...providerRegistry,
    ...mockProvider,
    ...marketDataService,
    ...valuationErrors,
    ...fxConversion,
    ...priceSnapshotRepository,
    ...valuationService,
}