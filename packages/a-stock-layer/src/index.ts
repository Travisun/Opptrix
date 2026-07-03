export {
  MarketDataEngine,
  AshareEngine,
  type InstrumentDataCapability,
  Capability, CACHE_TYPE, DriverRegistry, Cache,
  BaseDriver, CAP_METHOD, computeIndicators, registerAllDrivers,
  normalizePreOpenRealtimeQuote, normalizePreOpenRealtimeQuotes, isMissingLivePrice,
  EastMoneyDriver, EfinanceDriver, TdxDriver, TencentDriver,
  SinaDriver, TonghuashunDriver, NeteaseDriver, XueqiuDriver,
  GubaDriver, CninfoDriver, CsindexDriver, StatsGovDriver, TushareDriver,
  PolygonDriver, TiingoDriver, FmpDriver, YahooUsDriver, BinanceDriver, OkxDriver,
  getProviderConfigStore, ProviderConfigStore, ProviderCatalogService, createProviderCatalog,
  PROVIDER_MANIFESTS, listProviderManifests, getProviderManifest,
  QueryPlanExecutor, QUERY_PLANS, defaultCacheType, executeIntradaySessionsPlan,
} from './engine.js'

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

export { TdxClient, tdxClient, TdxDailyBarReader, readTdxDayFile, toTdxSymbol, isIndexCode, toTdxMarketId, patchNodetdxBjMarket, tdxMinuteIndexToTime, transformTdxMinutePoints } from './providers/tdx/index.js'
export { ef, stock as efStock, fund as efFund, bond as efBond, futures as efFutures, searchQuote } from './providers/efinance/index.js'
export type { SearchQuote, EfRow } from './providers/efinance/index.js'

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
export type { AssetClass, Market, InstrumentRef } from '@opptrix/shared'

export type {
  MoneyFlow, IndexRealtime, IndexKline, MarketMoneyFlow, SectorMoneyFlow,
  StockProfile, NewsItem, SentimentData, Dividend, DragonTiger, LimitUpDown,
  GlobalIndex, TechnicalIndicator, ChipDistribution,
} from './core/schema.js'
