import type { MarketDbStatus } from '../store.js'
import { BOOTSTRAP_SYNC_JOBS } from './config.js'
import { daysSince } from '../utils.js'

function stockRatio(done: number, stockCount: number): number {
  if (stockCount <= 0) return 0
  return Math.min(1, done / stockCount)
}

/** Per-job completion ratio aligned with bootstrap readiness gates. */
export function bootstrapJobRatio(
  job: string,
  dbStatus: MarketDbStatus,
  stockCount: number,
): number {
  const b = dbStatus.bootstrap
  const progress = dbStatus.job_progress[job]
  const ratioPct = (key: 'quote_stock_ratio' | 'kline_stock_ratio' | 'fin_stock_ratio' | 'factor_stock_ratio') => {
    const v = b?.[key]
    return typeof v === 'number' && Number.isFinite(v) ? v / 100 : null
  }

  switch (job) {
    case 'universe':
    case 'initial_cn_universe':
      return b?.initial_cn ?? b?.universe ? 1 : stockRatio(progress?.done ?? 0, stockCount)
    case 'initial_hk_universe':
      return b?.initial_hk ? 1 : stockRatio(progress?.done ?? 0, dbStatus.hk_count || 1)
    case 'initial_us_universe':
      return b?.initial_us ? 1 : stockRatio(progress?.done ?? 0, dbStatus.us_count || 1)
    case 'initial_cn_etf':
      return b?.initial_cn_etf ? 1 : stockRatio(progress?.done ?? 0, dbStatus.etf_count || 1)
    case 'initial_taxonomy':
      return b?.initial_taxonomy ? 1 : (progress?.done ? 1 : 0)
    case 'quotes':
      return b?.quotes ? 1 : (ratioPct('quote_stock_ratio') ?? stockRatio(progress?.done ?? 0, stockCount))
    case 'kline_bootstrap':
      return b?.klines ? 1 : (ratioPct('kline_stock_ratio') ?? stockRatio(progress?.done ?? 0, stockCount))
    case 'financials':
      return b?.fundamentals ? 1 : (ratioPct('fin_stock_ratio') ?? stockRatio(progress?.done ?? 0, stockCount))
    case 'screen_factors':
      return b?.screen_factors ? 1 : (ratioPct('factor_stock_ratio') ?? stockRatio(progress?.done ?? 0, stockCount))
    case 'industry_stats': {
      const last = dbStatus.last_sync.industry_stats
      if (last && daysSince(last) < 1) return 1
      return stockRatio(progress?.done ?? 0, stockCount)
    }
    default:
      return stockRatio(progress?.done ?? 0, stockCount)
  }
}

export function isBootstrapJobComplete(
  job: string,
  dbStatus: MarketDbStatus,
  stockCount: number,
): boolean {
  return bootstrapJobRatio(job, dbStatus, stockCount) >= 0.995
}

export function computeBootstrapOverallPercent(
  jobs: readonly string[],
  dbStatus: MarketDbStatus,
): number {
  if (jobs.length === 0) return 0
  const stockCount = dbStatus.stock_count
  let sum = 0
  for (const job of jobs) sum += bootstrapJobRatio(job, dbStatus, stockCount)
  return Math.round((sum / jobs.length) * 1000) / 10
}

export function countBootstrapCompletedJobs(
  jobs: readonly string[],
  dbStatus: MarketDbStatus,
): number {
  const stockCount = dbStatus.stock_count
  return jobs.filter(job => isBootstrapJobComplete(job, dbStatus, stockCount)).length
}

export function isBootstrapJobList(jobs: readonly string[]): boolean {
  return jobs.length > 0 && jobs.length <= BOOTSTRAP_SYNC_JOBS.length
    && jobs.every(j => (BOOTSTRAP_SYNC_JOBS as readonly string[]).includes(j))
}
