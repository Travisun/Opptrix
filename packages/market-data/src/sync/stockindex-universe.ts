/**
 * A 股 / 港股 / 美股名录灌库。
 * CN / HK / US 均走 Tickflow `getExchangeInstruments`（含中文名，供本地搜索）。
 * Tickflow 不可用或无数据时跳过，不调用已移除的 OpptrixQuant。
 */
import {
  TickflowClient,
  mapTickflowInstrumentToListItem,
  type TickflowInstrument,
} from '@opptrix/a-stock-layer'
import type { StockListItem } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import type { InitialEquityMarket } from './instrument-gateway.js'
import type { JobSyncConfig } from './config.js'
import type { InitialSyncCallbacks } from './initial-sync.js'
import { persistListRow } from './persist-universe.js'
import { sleep } from './pool.js'
import { yieldToEventLoop } from './event-loop.js'

export type StockIndexUniverseMarket = 'CN' | 'HK' | 'US'

const MARKET_LABEL: Record<StockIndexUniverseMarket, string> = {
  CN: 'A 股',
  HK: '港股',
  US: '美股',
}

const TICKFLOW_EXCHANGES: Record<StockIndexUniverseMarket, readonly string[]> = {
  CN: ['SH', 'SZ', 'BJ'],
  HK: ['HK'],
  US: ['US'],
}

async function fetchTickflowExchangeStocks(
  market: StockIndexUniverseMarket,
  onPage?: (fetched: number, total: number | null) => void,
): Promise<StockListItem[] | null> {
  const client = TickflowClient.fromConfig()
  if (!client) return null
  const exchanges = TICKFLOW_EXCHANGES[market]
  const instruments: TickflowInstrument[] = []
  for (const ex of exchanges) {
    try {
      const json = await client.getExchangeInstruments(ex, 'stock')
      const batch = (json.data ?? []) as TickflowInstrument[]
      instruments.push(...batch)
      onPage?.(instruments.length, null)
    } catch {
      // 单交易所失败不阻断其余
    }
  }
  if (!instruments.length) return []
  return instruments.map(mapTickflowInstrumentToListItem)
}

async function persistRows(
  store: MarketDataStore,
  market: StockIndexUniverseMarket,
  job: string,
  rows: Array<{ item: StockListItem; exchange?: string | null; industryFallback?: string | null }>,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks,
  label: string,
): Promise<{ total: number; success: number }> {
  callbacks.onProgress?.(0, rows.length, `写入${label}名录`)
  let success = 0
  for (const [i, row] of rows.entries()) {
    const code = persistListRow(store, market as InitialEquityMarket, row.item, {
      exchange: row.exchange,
      industryFallback: row.industryFallback,
    })
    if (code) {
      success++
      store.markJobProgress(job, code, '', 'done')
    }
    if (i % 25 === 0 || i === rows.length - 1) {
      callbacks.onProgress?.(i + 1, rows.length, `写入${label}名录`)
    }
    if (i > 0 && i % 200 === 0) store.flushDuckWritesSync({ throwOnError: false })
    if (i > 0 && i % 25 === 0) await yieldToEventLoop()
    if (cfg.delayMs > 0 && i % 50 === 0) await sleep(cfg.delayMs)
  }
  store.flushDuckWritesSync()
  callbacks.onProgress?.(rows.length, rows.length, `${label}名录完成`)
  return { total: rows.length, success }
}

/**
 * 同步 A 股 / 港股 / 美股名录到 instruments（+ A 股 stocks 表）。
 * 全部市场仅走 Tickflow。
 */
export async function syncStockIndexUniverse(
  store: MarketDataStore,
  market: StockIndexUniverseMarket,
  job: string,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const label = MARKET_LABEL[market]
  callbacks.onLog?.(`拉取${label}名录（Tickflow）…`)
  callbacks.onProgress?.(0, 0, `拉取${label}名录…`)

  const tickflowRows = await fetchTickflowExchangeStocks(market, (fetched, total) => {
    const denom = total && total > 0 ? total : Math.max(fetched, 1)
    callbacks.onProgress?.(fetched, denom, `拉取${label}名录`)
  })

  if (tickflowRows && tickflowRows.length > 0) {
    const persistInput = tickflowRows.map(item => ({
      item,
      exchange: market === 'HK'
        ? 'HK'
        : item.market === 'SH' || item.market === 'SZ' || item.market === 'BJ'
          ? item.market
          : market === 'US'
            ? undefined
            : null,
      industryFallback: item.industry || null,
    }))
    const result = await persistRows(store, market, job, persistInput, cfg, callbacks, label)
    callbacks.onLog?.(`Tickflow ${label}名录已写入 ${result.success} / ${result.total} 只`)
    return result
  }

  if (tickflowRows === null) {
    callbacks.onLog?.(`Tickflow 客户端不可用，跳过${label}名录同步（搜索仍可用扶摇 CN + 别名）`)
  } else {
    callbacks.onLog?.(`Tickflow 暂无${label}名录，跳过`)
  }
  return { total: 0, success: 0 }
}

/** initial_cn_universe / initial_hk_universe / initial_us_universe / universe 任务入口 */
export async function syncInitialStockIndexUniverse(
  store: MarketDataStore,
  market: StockIndexUniverseMarket,
  job: string,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const result = await syncStockIndexUniverse(store, market, job, cfg, callbacks)
  if (result.success === 0) {
    callbacks.onLog?.(`${MARKET_LABEL[market]}名录暂无数据，已跳过`)
    return result
  }
  return result
}

/** @deprecated 使用 syncInitialStockIndexUniverse */
export const syncInitialRegionalUniverse = syncInitialStockIndexUniverse
