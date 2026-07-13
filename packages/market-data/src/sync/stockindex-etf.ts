/**
 * A 股 ETF 名录 — 仅走 StockIndex 公开 API（/api/v1/etfs）。
 * 不经过 StandardInstrumentGateway，避免触发其他 Provider。
 */
import {
  stockIndexItemToListRow,
  stockIndexListEtfs,
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
      && (i.assetType ?? 'etf') === 'etf'
      && String(i.code ?? '').trim(),
  )
}

async function fetchAllStockIndexEtfs(
  onPage?: (fetched: number, total: number | null) => void,
): Promise<StockIndexItem[]> {
  const all: StockIndexItem[] = []
  let page = 1
  let knownTotal: number | null = null
  const pageSize = 100
  while (page <= 50) {
    const resp = await stockIndexListEtfs({ page, pageSize })
    const batch = cnEtfItems(resp.items ?? [])
    if (!batch.length) break
    all.push(...batch)
    const total = resp.total ?? 0
    if (total > 0) knownTotal = total
    onPage?.(all.length, knownTotal)
    if (total > 0 && all.length >= total) break
    if (batch.length < pageSize) break
    page++
  }
  return all
}

/** StockIndex 专用：同步 A 股 ETF 名录到 instruments + etf_profiles */
export async function syncStockIndexCnEtf(
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
  job = 'initial_cn_etf',
): Promise<{ total: number; success: number }> {
  callbacks.onLog?.('从 StockIndex API 拉取 A 股 ETF 名录（不经过其他 Provider）…')
  callbacks.onProgress?.(0, 0, '拉取 A 股 ETF 名录…')

  const items = await fetchAllStockIndexEtfs((fetched, total) => {
    const denom = total && total > 0 ? total : Math.max(fetched, 1)
    callbacks.onProgress?.(fetched, denom, '拉取 A 股 ETF 名录')
  })
  if (!items.length) {
    throw new Error('StockIndex /api/v1/etfs 无数据')
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
  callbacks.onLog?.(`StockIndex ETF 名录已写入 ${success} / ${items.length} 只`)
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
    throw new Error('A 股 ETF 名录同步失败：StockIndex 未能写入任何 ETF')
  }
  return result
}
