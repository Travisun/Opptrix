/**
 * A 股 / 港股 / 美股名录 — 仅走 StockIndex 公开 API（/api/v1/stocks）。
 * 不经过 StandardInstrumentGateway，避免触发其他 Provider。
 */
import {
  stockIndexItemToListRow,
  stockIndexListStocks,
  type StockIndexItem,
} from '@opptrix/a-stock-layer'
import type { Market } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import type { InitialEquityMarket } from './instrument-gateway.js'
import type { JobSyncConfig } from './config.js'
import type { InitialSyncCallbacks } from './initial-sync.js'
import { persistListRow } from './persist-universe.js'
import { sleep } from './pool.js'

export type StockIndexUniverseMarket = 'CN' | 'HK' | 'US'

const MARKET_LABEL: Record<StockIndexUniverseMarket, string> = {
  CN: 'A 股',
  HK: '港股',
  US: '美股',
}

function equityItems(items: StockIndexItem[], market: StockIndexUniverseMarket): StockIndexItem[] {
  return items.filter(
    i => String(i.market ?? '').toUpperCase() === market
      && (i.assetType ?? 'equity') === 'equity'
      && String(i.code ?? '').trim(),
  )
}

async function fetchAllMarketStocks(
  market: StockIndexUniverseMarket,
  onPage?: (fetched: number, total: number | null) => void,
): Promise<StockIndexItem[]> {
  const all: StockIndexItem[] = []
  let page = 1
  let knownTotal: number | null = null
  const pageSize = 100
  while (page <= 100) {
    const resp = await stockIndexListStocks({
      market: market as Market,
      page,
      pageSize,
      assetType: 'equity',
    })
    const batch = equityItems(resp.items ?? [], market)
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

/** StockIndex 专用：同步 A 股 / 港股 / 美股名录到 instruments（+ A 股 stocks 表） */
export async function syncStockIndexUniverse(
  store: MarketDataStore,
  market: StockIndexUniverseMarket,
  job: string,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const label = MARKET_LABEL[market]
  callbacks.onLog?.(`从 StockIndex API 拉取${label}名录（不经过其他 Provider）…`)
  callbacks.onProgress?.(0, 0, `拉取${label}名录…`)

  const items = await fetchAllMarketStocks(market, (fetched, total) => {
    const denom = total && total > 0 ? total : Math.max(fetched, 1)
    callbacks.onProgress?.(fetched, denom, `拉取${label}名录`)
  })
  if (!items.length) {
    if (market === 'HK' || market === 'US') {
      callbacks.onLog?.(`StockIndex 暂无${label}名录，跳过（不影响 A 股初选）`)
      return { total: 0, success: 0 }
    }
    throw new Error(`StockIndex /api/v1/stocks?market=${market} 无数据`)
  }

  callbacks.onProgress?.(0, items.length, `写入${label}名录`)
  let success = 0
  for (const [i, item] of items.entries()) {
    const row = stockIndexItemToListRow(item)
    if (!row) continue
    const code = persistListRow(store, market as InitialEquityMarket, row, {
      exchange: item.exchange,
      industryFallback: item.industryName,
    })
    if (code) {
      success++
      store.markJobProgress(job, code, '', 'done')
    }
    if (i % 25 === 0 || i === items.length - 1) {
      callbacks.onProgress?.(i + 1, items.length, `写入${label}名录`)
    }
    if (i > 0 && i % 200 === 0) store.flushDuckWritesSync()
    if (cfg.delayMs > 0 && i % 50 === 0) await sleep(cfg.delayMs)
  }

  store.flushDuckWritesSync()
  callbacks.onProgress?.(items.length, items.length, `${label}名录完成`)
  callbacks.onLog?.(`StockIndex ${label}名录已写入 ${success} / ${items.length} 只`)
  return { total: items.length, success }
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
    if (market === 'HK' || market === 'US') {
      callbacks.onLog?.(`${MARKET_LABEL[market]}名录暂无数据，已跳过`)
      return result
    }
    throw new Error(`${MARKET_LABEL[market]}名录同步失败：StockIndex 未能写入任何标的`)
  }
  return result
}

/** @deprecated 使用 syncInitialStockIndexUniverse */
export const syncInitialRegionalUniverse = syncInitialStockIndexUniverse
