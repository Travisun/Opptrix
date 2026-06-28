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

/** Daily essentials — skip slow F10 jobs for quick incremental refresh. */
export const DAILY_SYNC_JOBS = [
  'universe',
  'quotes',
  'announcements',
  'factors',
  'industry_stats',
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
  const raw = profile ?? process.env.INNO_MARKET_SYNC_PROFILE ?? 'balanced'
  return raw in SYNC_PROFILES ? (raw as SyncSpeedProfile) : 'balanced'
}

export function getSyncProfileSettings(profile?: string): SyncProfileSettings {
  return SYNC_PROFILES[resolveSyncProfile(profile)]
}

export const SYNC_JOB_CONFIG: Record<string, JobSyncConfig> = {
  /** 股票池 — 增量 7 天刷新一次 */
  universe: { concurrency: 1, delayMs: 0, ttlDays: 7 },
  /** 日频截面 — 每个交易日刷新 */
  quotes: { concurrency: 2, delayMs: 280, ttlDays: 1 },
  profiles: { concurrency: 2, delayMs: 320, ttlDays: 30 },
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
  process.env.INNO_MARKET_API_GAP_MS ?? getSyncProfileSettings().apiGapMs,
)

export const QUOTES_BATCH_SIZE = getSyncProfileSettings().quotesBatchSize
export const QUOTES_BATCH_DELAY_MS = getSyncProfileSettings().quotesBatchDelayMs
