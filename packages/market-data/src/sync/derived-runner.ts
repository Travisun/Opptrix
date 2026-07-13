import {
  getMarketDuckGateway,
  type DerivedMaintenanceResult,
} from '../duck/market-duck-gateway.js'
import type { MarketDataStore } from '../store.js'

export interface DerivedRunnerHooks {
  onLog?: (message: string) => void
  onProgress?: (job: string, current: number, total: number, message?: string) => void
}

/** 子进程完成后在主进程写入 cursor 并刷新缓存（轻量） */
export function applyDerivedMaintenanceResult(
  store: MarketDataStore,
  result: DerivedMaintenanceResult,
  source = 'derived_maintenance',
): void {
  const tradeDate = result.tradeDate
  if (result.screen_factors && result.screen_factors.computed > 0 && tradeDate) {
    store.setCursor('screen_factors', {
      trade_date: tradeDate,
      success: result.screen_factors.computed,
      skipped: 0,
      source,
    })
  }
  if (result.industry_stats && tradeDate) {
    store.setCursor('industry_stats', {
      trade_date: tradeDate,
      industries: result.industry_stats.industries,
    })
  }
  store.invalidateKlineStatsCache()
  store.invalidateDuckMarketStatsCache()
}

/** 子进程批量重算初选因子（覆盖所有有 K 线标的） */
export async function runDerivedScreenFactors(
  store: MarketDataStore,
  hooks?: DerivedRunnerHooks,
  source = 'derived_maintenance',
): Promise<{ computed: number }> {
  const gw = getMarketDuckGateway(store.klineDuckDbPath, store.dbPath)
  const stats = gw.klineStatsSync()
  if (!stats.rows) {
    hooks?.onLog?.('无 K 线数据，跳过因子计算')
    return { computed: 0 }
  }

  hooks?.onLog?.('启动因子计算子进程…')
  hooks?.onProgress?.('screen_factors', 10, 100, '启动因子计算子进程…')

  store.flushDuckWritesSync()
  const result = await gw.spawnDerivedMaintenanceAsync({
    jobs: ['screen_factors'],
    tradeDate: stats.maxDate ?? undefined,
    onEvent: event => {
      if (event.type === 'progress' && event.job === 'screen_factors') {
        hooks?.onProgress?.(
          'screen_factors',
          event.current ?? 0,
          event.total ?? 100,
          event.message,
        )
      }
    },
  })

  applyDerivedMaintenanceResult(store, result, source)
  const computed = result.screen_factors?.computed ?? 0
  if (computed > 0) {
    hooks?.onLog?.(`初选因子已更新：${computed.toLocaleString()} 只（${result.tradeDate}）`)
  } else {
    hooks?.onLog?.('初选因子：无可计算标的（跳过）')
  }
  return { computed }
}

/** 重建行业统计（依赖最新因子截面，子进程执行） */
export async function runDerivedIndustryStats(
  store: MarketDataStore,
  hooks?: DerivedRunnerHooks,
): Promise<{ industries: number }> {
  hooks?.onLog?.('启动行业统计子进程…')
  hooks?.onProgress?.('industry_stats', 20, 100, '汇总行业指标…')

  store.flushDuckWritesSync()
  const gw = getMarketDuckGateway(store.klineDuckDbPath, store.dbPath)
  const result = await gw.spawnDerivedMaintenanceAsync({
    jobs: ['industry_stats'],
    onEvent: event => {
      if (event.type === 'progress' && event.job === 'industry_stats') {
        hooks?.onProgress?.(
          'industry_stats',
          event.current ?? 0,
          event.total ?? 100,
          event.message,
        )
      }
    },
  })

  applyDerivedMaintenanceResult(store, result)
  const n = result.industry_stats?.industries ?? 0
  hooks?.onProgress?.('industry_stats', 100, 100, '行业统计完成')
  hooks?.onLog?.(`行业统计已更新：${n} 个行业（${result.tradeDate}）`)
  return { industries: n }
}
