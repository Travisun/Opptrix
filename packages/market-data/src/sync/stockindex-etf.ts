/**
 * A 股 ETF 名录 — Tickflow `getExchangeInstruments`（SH/SZ/BJ，type=etf）。
 * 不经过 StandardInstrumentGateway，避免触发其他 Provider。
 */
import {
  TickflowClient,
  mapTickflowInstrumentToListItem,
  type TickflowInstrument,
} from '@opptrix/a-stock-layer'
import type { StockListItem } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import type { JobSyncConfig } from './config.js'
import type { InitialSyncCallbacks } from './initial-sync.js'
import { persistCnEtfRow } from './persist-universe.js'
import { sleep } from './pool.js'
import { yieldToEventLoop } from './event-loop.js'

const CN_ETF_EXCHANGES = ['SH', 'SZ', 'BJ'] as const

/** 拉取 A 股全部 ETF（Tickflow 分交易所） */
async function fetchAllTickflowCnEtfs(
  onPage?: (fetched: number, total: number | null) => void,
): Promise<StockListItem[] | null> {
  const client = TickflowClient.fromConfig()
  if (!client) return null
  const instruments: TickflowInstrument[] = []
  for (const ex of CN_ETF_EXCHANGES) {
    try {
      const json = await client.getExchangeInstruments(ex, 'etf')
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

/** 同步 A 股 ETF 名录到 instruments + etf_profiles */
export async function syncStockIndexCnEtf(
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
  job = 'initial_cn_etf',
): Promise<{ total: number; success: number }> {
  callbacks.onLog?.('从 Tickflow 拉取 A 股 ETF 名录…')
  callbacks.onProgress?.(0, 0, '拉取 A 股 ETF 名录…')

  const rows = await fetchAllTickflowCnEtfs((fetched, total) => {
    const denom = total && total > 0 ? total : Math.max(fetched, 1)
    callbacks.onProgress?.(fetched, denom, '拉取 A 股 ETF 名录')
  })

  if (rows === null) {
    callbacks.onLog?.('Tickflow 客户端不可用，跳过 A 股 ETF 名录同步')
    return { total: 0, success: 0 }
  }
  if (!rows.length) {
    callbacks.onLog?.('Tickflow 暂无 A 股 ETF 名录，跳过')
    return { total: 0, success: 0 }
  }

  callbacks.onProgress?.(0, rows.length, '写入 A 股 ETF 名录')
  let success = 0
  for (const [i, item] of rows.entries()) {
    const exchange = item.market === 'SH' || item.market === 'SZ' || item.market === 'BJ'
      ? item.market
      : null
    const code = persistCnEtfRow(store, item, exchange)
    if (code) {
      success++
      store.markJobProgress(job, code, '', 'done')
    }
    if (i % 25 === 0 || i === rows.length - 1) {
      callbacks.onProgress?.(i + 1, rows.length, '写入 A 股 ETF 名录')
    }
    if (i > 0 && i % 200 === 0) store.flushDuckWritesSync({ throwOnError: false })
    if (i > 0 && i % 25 === 0) await yieldToEventLoop()
    if (cfg.delayMs > 0 && i % 50 === 0) await sleep(cfg.delayMs)
  }

  store.flushDuckWritesSync()
  callbacks.onProgress?.(rows.length, rows.length, 'A 股 ETF 名录完成')
  callbacks.onLog?.(`Tickflow ETF 名录已写入 ${success} / ${rows.length} 只`)
  return { total: rows.length, success }
}

/** initial_cn_etf 任务入口 */
export async function syncInitialCnEtf(
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const result = await syncStockIndexCnEtf(store, cfg, callbacks, 'initial_cn_etf')
  if (result.success === 0) {
    callbacks.onLog?.('A 股 ETF 名录暂无数据，已跳过')
    return result
  }
  return result
}
