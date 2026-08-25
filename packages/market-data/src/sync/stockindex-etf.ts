/**
 * A 股 ETF 名录 — 仅走 OpptrixQuant 标的检索（/api/v1/instruments?class_token=etf）。
 * 不经过 StandardInstrumentGateway，避免触发其他 Provider。
 */
import {
  opptrixInstrumentSearch,
  opptrixInstrumentToStockIndexItem,
  stockIndexItemToListRow,
  type StockIndexItem,
} from '@opptrix/a-stock-layer'
import type { MarketDataStore } from '../store.js'
import type { JobSyncConfig } from './config.js'
import type { InitialSyncCallbacks } from './initial-sync.js'
import { persistCnEtfRow } from './persist-universe.js'
import { sleep } from './pool.js'
import { yieldToEventLoop } from './event-loop.js'

function cnEtfItems(items: StockIndexItem[]): StockIndexItem[] {
  return items.filter(
    i => String(i.market ?? 'CN').toUpperCase() === 'CN'
      && String(i.code ?? '').trim(),
  )
}

/** 拉取 A 股全部 ETF（内部 has_more 翻页，page_size ≤ 35，跨页间隔 30ms 缓解配额） */
async function fetchAllStockIndexEtfs(
  onPage?: (fetched: number, total: number | null) => void,
): Promise<StockIndexItem[]> {
  const raw = await opptrixInstrumentSearch('', {
    market: 'CN',
    classToken: 'etf',
    limit: 5000,
    delayMs: 30,
  })
  if (!raw) throw new Error('未配置 OpptrixQuant API Key，无法拉取 ETF 名录')
  const batch = cnEtfItems(raw.map(opptrixInstrumentToStockIndexItem))
  onPage?.(batch.length, null)
  return batch
}

/** OpptrixQuant 专用：同步 A 股 ETF 名录到 instruments + etf_profiles */
export async function syncStockIndexCnEtf(
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
  job = 'initial_cn_etf',
): Promise<{ total: number; success: number }> {
  callbacks.onLog?.('从 OpptrixQuant API 拉取 A 股 ETF 名录（不经过其他 Provider）…')
  callbacks.onProgress?.(0, 0, '拉取 A 股 ETF 名录…')

  const items = await fetchAllStockIndexEtfs((fetched, total) => {
    const denom = total && total > 0 ? total : Math.max(fetched, 1)
    callbacks.onProgress?.(fetched, denom, '拉取 A 股 ETF 名录')
  })
  if (!items.length) {
    throw new Error('OpptrixQuant /api/v1/instruments?class_token=etf 无数据')
  }

  callbacks.onProgress?.(0, items.length, '写入 A 股 ETF 名录')
  let success = 0
  for (const [i, item] of items.entries()) {
    const row = stockIndexItemToListRow(item)
    if (!row) continue
    const code = persistCnEtfRow(store, row, item.exchange)
    if (code) {
      success++
      store.markJobProgress(job, code, '', 'done')
    }
    if (i % 25 === 0 || i === items.length - 1) {
      callbacks.onProgress?.(i + 1, items.length, '写入 A 股 ETF 名录')
    }
    if (i > 0 && i % 200 === 0) store.flushDuckWritesSync({ throwOnError: false })
    if (i > 0 && i % 25 === 0) await yieldToEventLoop()
    if (cfg.delayMs > 0 && i % 50 === 0) await sleep(cfg.delayMs)
  }

  store.flushDuckWritesSync()
  callbacks.onProgress?.(items.length, items.length, 'A 股 ETF 名录完成')
  callbacks.onLog?.(`OpptrixQuant ETF 名录已写入 ${success} / ${items.length} 只`)
  return { total: items.length, success }
}

/** initial_cn_etf 任务入口 */
export async function syncInitialCnEtf(
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const result = await syncStockIndexCnEtf(store, cfg, callbacks, 'initial_cn_etf')
  if (result.success === 0) {
    throw new Error('A 股 ETF 名录同步失败：OpptrixQuant 未能写入任何 ETF')
  }
  return result
}
