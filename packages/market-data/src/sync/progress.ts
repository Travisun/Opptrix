import type { MarketDbStatus } from '../store.js'
import { CN_AUTO_SYNC_JOB_UNIVERSE } from './config.js'
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
    case 'initial_hk_universe':
    case 'initial_us_universe':
    case 'initial_cn_etf':
      // 标的库名录同步已下线 — 视为完成
      return 1
    case 'initial_taxonomy':
      return 1
    case 'quotes':
      return b?.quotes ? 1 : (ratioPct('quote_stock_ratio') ?? stockRatio(progress?.done ?? 0, stockCount))
    case 'kline_bootstrap':
    case 'kline_daily':
      // 主库静态日 K 已下线；历史 job 名视为完成，避免进度卡死
      return 1
    case 'financials':
      return b?.fundamentals ? 1 : (ratioPct('fin_stock_ratio') ?? stockRatio(progress?.done ?? 0, stockCount))
    case 'screen_factors':
      return dbStatus.derived?.screen_factors ? 1 : (ratioPct('factor_stock_ratio') ?? 0)
    case 'industry_stats': {
      if (dbStatus.derived?.industry_stats) return 1
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
  const allowed = new Set<string>([...CN_AUTO_SYNC_JOB_UNIVERSE])
  return jobs.length > 0 && jobs.every(j => allowed.has(j))
}
