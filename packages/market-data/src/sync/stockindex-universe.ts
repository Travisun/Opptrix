/**
 * A 股 / 港股 / 美股名录 — 仅走 OpptrixQuant 标的检索（/api/v1/instruments?class_token=stock）。
 * 不经过 StandardInstrumentGateway，避免触发其他 Provider。
 */
import {
  opptrixInstrumentSearch,
  opptrixInstrumentToStockIndexItem,
  stockIndexItemToListRow,
  type StockIndexItem,
} from '@opptrix/a-stock-layer'
import type { Market } from '@opptrix/shared'
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

function equityItems(items: StockIndexItem[], market: StockIndexUniverseMarket): StockIndexItem[] {
  return items.filter(
    i => String(i.market ?? '').toUpperCase() === market
      && String(i.code ?? '').trim(),
  )
}

/** 拉取某市场全部个股（内部 has_more 翻页，page_size ≤ 35，跨页间隔 30ms 缓解配额）。未配置 Key 返回 null。 */
async function fetchAllMarketStocks(
  market: StockIndexUniverseMarket,
  onPage?: (fetched: number, total: number | null) => void,
): Promise<StockIndexItem[] | null> {
  const raw = await opptrixInstrumentSearch('', {
    market,
    classToken: 'stock',
    limit: 5000,
    delayMs: 30,
  })
  if (!raw) return null
  const eq = equityItems(raw.map(opptrixInstrumentToStockIndexItem), market)
  onPage?.(eq.length, null)
  return eq
}

/** OpptrixQuant 专用：同步 A 股 / 港股 / 美股名录到 instruments（+ A 股 stocks 表） */
export async function syncStockIndexUniverse(
  store: MarketDataStore,
  market: StockIndexUniverseMarket,
  job: string,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const label = MARKET_LABEL[market]
  callbacks.onLog?.(`从 OpptrixQuant API 拉取${label}名录（不经过其他 Provider）…`)
  callbacks.onProgress?.(0, 0, `拉取${label}名录…`)

  const items = await fetchAllMarketStocks(market, (fetched, total) => {
    const denom = total && total > 0 ? total : Math.max(fetched, 1)
    callbacks.onProgress?.(fetched, denom, `拉取${label}名录`)
  })
  if (items === null) {
    callbacks.onLog?.(`未配置 OpptrixQuant API Key，跳过${label}名录同步`)
    return { total: 0, success: 0 }
  }
  if (!items.length) {
    if (market === 'HK' || market === 'US') {
      callbacks.onLog?.(`OpptrixQuant 暂无${label}名录，跳过（不影响 A 股初选）`)
      return { total: 0, success: 0 }
    }
    throw new Error(`OpptrixQuant /api/v1/instruments?market=${market}&class_token=stock 无数据`)
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
    if (i > 0 && i % 200 === 0) store.flushDuckWritesSync({ throwOnError: false })
    if (i > 0 && i % 25 === 0) await yieldToEventLoop()
    if (cfg.delayMs > 0 && i % 50 === 0) await sleep(cfg.delayMs)
  }

  store.flushDuckWritesSync()
  callbacks.onProgress?.(items.length, items.length, `${label}名录完成`)
  callbacks.onLog?.(`OpptrixQuant ${label}名录已写入 ${success} / ${items.length} 只`)
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
    throw new Error(`${MARKET_LABEL[market]}名录同步失败：OpptrixQuant 未能写入任何标的`)
  }
  return result
}

/** @deprecated 使用 syncInitialStockIndexUniverse */
export const syncInitialRegionalUniverse = syncInitialStockIndexUniverse
