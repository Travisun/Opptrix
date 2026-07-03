/** Per-job concurrency, delay and TTL — conservative defaults for Eastmoney/CNINFO. */
export interface JobSyncConfig {
  concurrency: number
  delayMs: number
  ttlDays?: number
  /** Extra pages for paginated APIs (announcements). */
  pages?: number
}

export type SyncSpeedProfile = 'safe' | 'balanced' | 'fast'

export interface SyncProfileSettings {
  label: string
  apiGapMs: number
  quotesBatchSize: number
  quotesBatchDelayMs: number
  jobOverrides: Partial<Record<string, Partial<JobSyncConfig>>>
}

/** ~6 months of trading days for momentum / volume factors */
export const KLINE_BOOTSTRAP_DAYS = 130

/** Factors computed locally during bootstrap (no per-stock API analyze). */
export const SCREEN_PACK_FACTORS = [
  'pe',
  'pb',
  'roe',
  'debt_ratio',
  'gross_margin',
  'net_profit_yoy',
  'profit_cagr_3y',
  'roe_trend',
  'peg',
  'momentum_1m',
  'momentum_3m',
  'momentum_6m',
  'volume_ratio',
] as const

/** L0 bootstrap — enough for local screening / discover. */
export const BOOTSTRAP_SYNC_JOBS = [
  'universe',
  'quotes',
  'kline_bootstrap',
  'financials',
  'screen_factors',
  'industry_stats',
] as const

/** Daily refresh after bootstrap ready. */
export const DAILY_SYNC_JOBS = [...BOOTSTRAP_SYNC_JOBS] as const

/** L2 deep sync — only on full rebuild or explicit force. */
export const DEEP_SYNC_JOBS = [
  'profiles',
  'etf_list',
  'etf_nav',
  'etf_holdings',
  'etf_kline_bootstrap',
  'us_list',
  'us_quotes',
  'crypto_list',
  'crypto_quotes',
  'financials_quarterly',
  'business',
  'partners',
  'announcements',
  'dividends',
  'shareholders',
  'forecasts',
  'inst_holdings',
  'insider_trades',
  'buybacks',
  'factors',
] as const

/** L1 on-demand hydration (quarterly TTL). */
export const HYDRATE_SYNC_JOBS = [
  'shareholders',
  'partners',
] as const

/** Full legacy pipeline = bootstrap + deep. */
export const ALL_SYNC_JOBS = [
  ...BOOTSTRAP_SYNC_JOBS,
  'profiles',
  'etf_list',
  'etf_nav',
  'etf_holdings',
  'etf_kline_bootstrap',
  'us_list',
  'us_quotes',
  'crypto_list',
  'crypto_quotes',
  'financials_quarterly',
  'business',
  'partners',
  'announcements',
  'dividends',
  'shareholders',
  'forecasts',
  'inst_holdings',
  'insider_trades',
  'buybacks',
  'factors',
] as const

export const SYNC_PROFILES: Record<SyncSpeedProfile, SyncProfileSettings> = {
  safe: {
    label: '保守',
    apiGapMs: 150,
    quotesBatchSize: 60,
    quotesBatchDelayMs: 600,
    jobOverrides: {},
  },
  balanced: {
    label: '均衡',
    apiGapMs: 60,
    quotesBatchSize: 120,
    quotesBatchDelayMs: 180,
    jobOverrides: {
      quotes: { concurrency: 3, delayMs: 100 },
      profiles: { concurrency: 3, delayMs: 200 },
      financials: { concurrency: 3, delayMs: 220 },
      financials_quarterly: { concurrency: 3, delayMs: 220 },
      announcements: { concurrency: 3, delayMs: 200 },
      dividends: { concurrency: 3, delayMs: 200 },
      shareholders: { concurrency: 3, delayMs: 220 },
      forecasts: { concurrency: 3, delayMs: 220 },
      inst_holdings: { concurrency: 3, delayMs: 220 },
      insider_trades: { concurrency: 3, delayMs: 220 },
      buybacks: { concurrency: 3, delayMs: 220 },
      factors: { concurrency: 3, delayMs: 180 },
    },
  },
  fast: {
    label: '快速',
    apiGapMs: 25,
    quotesBatchSize: 200,
    quotesBatchDelayMs: 60,
    jobOverrides: {
      quotes: { concurrency: 4, delayMs: 40 },
      profiles: { concurrency: 4, delayMs: 120 },
      financials: { concurrency: 4, delayMs: 140 },
      financials_quarterly: { concurrency: 4, delayMs: 140 },
      business: { concurrency: 2, delayMs: 280 },
      partners: { concurrency: 2, delayMs: 300 },
      announcements: { concurrency: 4, delayMs: 120 },
      dividends: { concurrency: 4, delayMs: 120 },
      shareholders: { concurrency: 4, delayMs: 140 },
      forecasts: { concurrency: 4, delayMs: 140 },
      inst_holdings: { concurrency: 4, delayMs: 140 },
      insider_trades: { concurrency: 4, delayMs: 140 },
      buybacks: { concurrency: 4, delayMs: 140 },
      factors: { concurrency: 5, delayMs: 80 },
    },
  },
}

export function resolveSyncProfile(profile?: string): SyncSpeedProfile {
  const raw = profile ?? process.env.OPPTRIX_MARKET_SYNC_PROFILE ?? 'balanced'
  return raw in SYNC_PROFILES ? (raw as SyncSpeedProfile) : 'balanced'
}

export function getSyncProfileSettings(profile?: string): SyncProfileSettings {
  return SYNC_PROFILES[resolveSyncProfile(profile)]
}

/** Jobs that hit Tushare per-stock when Pro is enabled (safe to raise concurrency). */
export const TUSHARE_PER_STOCK_JOBS = new Set([
  'profiles',
  'financials',
  'financials_quarterly',
  'dividends',
  'shareholders',
  'forecasts',
  'inst_holdings',
  'insider_trades',
  'buybacks',
  'business',
])

/** Still Eastmoney/CNINFO — keep conservative pacing even with Tushare on. */
export const EASTMONEY_HEAVY_JOBS = new Set(['partners', 'announcements'])

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Tushare 满额度时可并行 3–5 路请求 — override via OPPTRIX_TUSHARE_SYNC_CONCURRENCY */
export function getTushareSyncBoost(): {
  maxConcurrent: number
  quotesBatchDelayMs: number
  jobOverrides: Partial<Record<string, Partial<JobSyncConfig>>>
} {
  const concurrency = clampInt(
    Number(process.env.OPPTRIX_TUSHARE_SYNC_CONCURRENCY ?? 4),
    2,
    5,
  )
  const delayMs = clampInt(Number(process.env.OPPTRIX_TUSHARE_STOCK_DELAY_MS ?? 15), 0, 120)
  const perJob = { concurrency, delayMs }
  const jobOverrides: Partial<Record<string, Partial<JobSyncConfig>>> = {}
  for (const job of TUSHARE_PER_STOCK_JOBS) jobOverrides[job] = { ...perJob }
  return {
    maxConcurrent: concurrency,
    quotesBatchDelayMs: Number(process.env.OPPTRIX_TUSHARE_QUOTES_BATCH_DELAY_MS ?? 40),
    jobOverrides,
  }
}

export function isTushareBackedSyncJob(job: string): boolean {
  return TUSHARE_PER_STOCK_JOBS.has(job)
}

export const SYNC_JOB_CONFIG: Record<string, JobSyncConfig> = {
  /** 股票池 — 增量 7 天刷新一次 */
  universe: { concurrency: 1, delayMs: 0, ttlDays: 7 },
  /** 日频截面 — 每个交易日刷新 */
  quotes: { concurrency: 2, delayMs: 280, ttlDays: 1 },
  /** 6 月日 K — 截面按交易日批量拉取 */
  kline_bootstrap: { concurrency: 1, delayMs: 80, ttlDays: 1 },
  /** 本地初选因子 — 从 SQLite 计算 */
  screen_factors: { concurrency: 1, delayMs: 0, ttlDays: 1 },
  profiles: { concurrency: 2, delayMs: 320, ttlDays: 30 },
  etf_list: { concurrency: 1, delayMs: 0, ttlDays: 7 },
  etf_nav: { concurrency: 2, delayMs: 280, ttlDays: 7 },
  etf_holdings: { concurrency: 2, delayMs: 320, ttlDays: 30 },
  etf_kline_bootstrap: { concurrency: 2, delayMs: 200, ttlDays: 1 },
  us_list: { concurrency: 1, delayMs: 300, ttlDays: 7 },
  us_quotes: { concurrency: 2, delayMs: 280, ttlDays: 1 },
  crypto_list: { concurrency: 1, delayMs: 300, ttlDays: 1 },
  crypto_quotes: { concurrency: 3, delayMs: 120, ttlDays: 1 },
  financials: { concurrency: 2, delayMs: 360, ttlDays: 7 },
  financials_quarterly: { concurrency: 2, delayMs: 360, ttlDays: 7 },
  business: { concurrency: 1, delayMs: 480, ttlDays: 90 },
  partners: { concurrency: 1, delayMs: 520, ttlDays: 90 },
  announcements: { concurrency: 2, delayMs: 420, ttlDays: 1, pages: 2 },
  dividends: { concurrency: 2, delayMs: 360, ttlDays: 30 },
  shareholders: { concurrency: 2, delayMs: 400, ttlDays: 90 },
  forecasts: { concurrency: 2, delayMs: 400, ttlDays: 7 },
  inst_holdings: { concurrency: 2, delayMs: 420, ttlDays: 90 },
  insider_trades: { concurrency: 2, delayMs: 420, ttlDays: 30 },
  buybacks: { concurrency: 2, delayMs: 420, ttlDays: 30 },
  /** 因子 — 每个交易日重算未覆盖标的 */
  factors: { concurrency: 1, delayMs: 950, ttlDays: 1 },
  industry_stats: { concurrency: 1, delayMs: 0, ttlDays: 1 },
}

export const DEFAULT_API_MIN_GAP_MS = Number(
  process.env.OPPTRIX_MARKET_API_GAP_MS ?? getSyncProfileSettings().apiGapMs,
)

export const QUOTES_BATCH_SIZE = getSyncProfileSettings().quotesBatchSize
export const QUOTES_BATCH_DELAY_MS = getSyncProfileSettings().quotesBatchDelayMs
