export {
  MarketDataEngine,
  AshareEngine,
  type InstrumentDataCapability,
  Capability, CACHE_TYPE, DriverRegistry, Cache,
  BaseDriver, CAP_METHOD, computeIndicators, registerAllDrivers,
  normalizePreOpenRealtimeQuote, normalizePreOpenRealtimeQuotes, isMissingLivePrice,
  TushareDriver,
  TickflowDriver, BinanceDriver, OkxDriver, BaostockDriver, ZzshareDriver,
  getProviderConfigStore, ProviderConfigStore, ProviderCatalogService, createProviderCatalog,
  PROVIDER_MANIFESTS, listProviderManifests, getProviderManifest,
  ProviderLoader, createProviderLoader, getProviderLoader,
  ManifestRegistry, getManifestRegistry,
  QueryPlanExecutor, QUERY_PLANS, defaultCacheType, executeIntradaySessionsPlan,
} from './engine.js'

export {
  installFromOppx,
  installFromDirectory,
  uninstallProviderPlugin,
  listInstalledProviders as listInstalledProviderEntries,
  providersRootDir,
} from './providers/index.js'

export type { InstalledProviderEntry, InstalledProvidersIndex } from './providers/installer.js'

export type {
  QueryPlan,
  QueryPlanId,
  QueryPlanStrategy,
  QueryExecutionContext,
} from './engine.js'

export type { IntradayTrendBar, IntradayTrendFetchResult, IntradayTrendSession } from './utils/intraday-trends.js'
export {
  cnMarketNow,
  cnTodayString,
  isCnAfterMarketClose,
  isCnBeforeMarketOpen,
  isCnMarketOpen,
  isCnTradingWeekday,
  shouldPreferTodayIntraday,
} from './utils/market-session.js'
export { pickIntradaySession } from './utils/intraday-trends.js'
export {
  parseStockMarket,
  resolveStockMarketCode,
  isShIndexCode,
  type StockMarket,
} from './utils/helpers.js'

export {
  loadTushareConfig, saveTushareConfig, publicTushareConfig, isTushareEnabled, tushareConfigPath,
  testTushareConnection, TushareClient, toTsCode, fromTsCode,
} from './providers/tushare/index.js'
export type { TushareRuntimeConfig, PublicTushareConfig, TushareRow } from './providers/tushare/index.js'

export {
  testTickflowConnection,
  loadTickflowConfig,
  isTickflowEnabled,
  TICKFLOW_MANIFEST,
  TICKFLOW_SETTINGS,
} from './providers/tickflow/index.js'

export {
  BINANCE_MANIFEST,
  BINANCE_SETTINGS,
} from './providers/binance/index.js'

export {
  OKX_MANIFEST,
  OKX_SETTINGS,
} from './providers/okx/index.js'

export {
  testBaostockConnection,
  loadBaostockConfig,
  isBaostockEnabled,
  BAOSTOCK_MANIFEST,
  BAOSTOCK_SETTINGS,
} from './providers/baostock/index.js'

export {
  testZzshareConnection,
  loadZzshareConfig,
  isZzshareEnabled,
  ZZSHARE_MANIFEST,
  ZZSHARE_SETTINGS,
} from './providers/zzshare/index.js'

export { TdxClient, tdxClient, TdxDailyBarReader, readTdxDayFile, toTdxSymbol, isIndexCode, toTdxMarketId, patchNodetdxBjMarket, tdxMinuteIndexToTime, transformTdxMinutePoints } from './providers/tdx/index.js'

export { PortfolioManager } from './portfolio/manager.js'
export type { TradeRecord, HoldingPosition, PnLSummary } from './portfolio/models.js'
export { WatchlistManager } from './watchlist/manager.js'
export type { WatchlistItem } from './watchlist/models.js'
export { normalizeWatchlistItem, watchlistItemKey, displayCodeFromInstrument, legacyToInstrument } from './watchlist/instrument.js'

export { normalizeCode, isBseCode, isBse920Code, resolveMarket, resolveSecId, resolveStockSecId, secFullCode, secXueqiuSymbol } from './utils/helpers.js'
export { isCnEtfCode, toInstrumentRef, inferCnAssetClass, inferMarketFromSymbol, instrumentId } from './core/instrument.js'
export {
  normalizeUsSymbol,
  isValidUsSymbol,
  usTodayString,
  isUsMarketOpen,
  isUsTradingWeekday,
  isUsTradingDay,
  isNyseHoliday,
  nyseHolidaysForYear,
  resolveUsQuoteSession,
  usQuoteSessionLabel,
  isUsPreMarket,
  isUsPostMarket,
} from './utils/us-market.js'
export type { UsQuoteSession } from './utils/us-market.js'
export {
  normalizeRegionalSymbol,
  toYahooFinanceSymbol,
  isRegionalEquityMarket,
} from './utils/regional-symbol.js'
export type { RegionalEquityMarket } from './utils/regional-symbol.js'
export { regionalTodayString, isRegionalTradingWeekday, isRegionalTradingDay, isRegionalHoliday, regionalHolidaysForYear } from './utils/regional-calendar.js'
export { parseYahooSearchQuotes, fetchYahooFinanceSearch, type YahooSearchQuote } from './utils/yahoo-search.js'
export {
  getRegionalEquitySeeds,
  getRegionalEquitySeedCount,
  type RegionalEquitySeed,
} from './data/regional-equity-seeds.js'
export {
  fetchRegionalStockListFromYahoo,
  regionalSeedStockList,
  yahooQuoteToRegionalStockRow,
} from './utils/regional-stock-list.js'
export { parseCryptoPair, isCryptoPairNotation, normalizeCryptoBase } from './utils/crypto-market.js'
export type { CryptoPairRef } from './utils/crypto-market.js'
export {
  resolveInstrumentQueryPlan,
  unsupportedInstrumentCapabilityMessage,
  type InstrumentQueryOpts,
  type InstrumentQueryPlan,
} from './core/instrument-query.js'
export { resolveInstrumentFromParams, instrumentRefsFromList, normalizeInstrumentHubParams, instrumentProviderSymbol } from '@opptrix/shared'
export type { AssetClass, Market, InstrumentRef } from '@opptrix/shared'

export type {
  MoneyFlow, IndexRealtime, IndexKline, MarketMoneyFlow, SectorMoneyFlow,
  StockProfile, NewsItem, SentimentData, Dividend, DragonTiger, LimitUpDown,
  GlobalIndex, TechnicalIndicator, ChipDistribution,
} from './core/schema.js'
