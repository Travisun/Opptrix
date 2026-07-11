import type { InstrumentRef, StockKline } from '@opptrix/shared'
import { normalizeInstrumentRef } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { KLINE_BOOTSTRAP_DAYS } from './config.js'
import type { InitialEquityMarket } from './instrument-gateway.js'
import { cnRefFromCode, StandardInstrumentGateway } from './instrument-gateway.js'
import { mapPool } from './pool.js'
import type { JobSyncConfig } from './config.js'

export interface KlineSyncCallbacks {
  onLog?: (message: string) => void
  onProgress?: (job: string, current: number, total: number) => void
}

function instrumentRef(store: MarketDataStore, market: InitialEquityMarket, code: string): InstrumentRef {
  if (market === 'CN') return cnRefFromCode(store, code)
  return normalizeInstrumentRef({
    market,
    assetClass: 'EQUITY',
    symbol: code,
    exchange: market === 'HK' ? 'HK' : undefined,
  })
}

function barsFromKlines(market: InitialEquityMarket, code: string, klines: StockKline[]) {
  return klines.map(bar => ({
    market,
    code,
    tradeDate: String(bar.date ?? '').slice(0, 10),
    open: bar.open ?? null,
    high: bar.high ?? null,
    low: bar.low ?? null,
    close: bar.close ?? null,
    volume: bar.volume ?? null,
    amount: bar.amount ?? null,
    changePct: bar.changePct ?? null,
  })).filter(b => b.tradeDate)
}

export function listEquityCodesForMarket(
  store: MarketDataStore,
  market: InitialEquityMarket,
  activeOnly = true,
): string[] {
  if (market === 'CN') return store.listStockCodes(activeOnly)
  if (market === 'US') return store.listUsCodes(activeOnly)
  return store.listRegionalCodes('HK', activeOnly)
}

export function listKlineBootstrapInstruments(
  store: MarketDataStore,
  markets: InitialEquityMarket[] = ['CN', 'HK', 'US'],
): Array<{ market: InitialEquityMarket; code: string }> {
  const out: Array<{ market: InitialEquityMarket; code: string }> = []
  for (const market of markets) {
    for (const code of listEquityCodesForMarket(store, market, true)) {
      out.push({ market, code })
    }
  }
  return out
}

export async function syncInstrumentKlines(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  market: InitialEquityMarket,
  code: string,
  count: number,
): Promise<number> {
  const ref = instrumentRef(store, market, code)
  const resp = await gateway.query<StockKline[]>(ref, 'kline', { count, period: 'daily' })
  if (!resp.success || !resp.data?.length) {
    throw new Error(resp.error ?? 'kline 无数据')
  }
  const bars = barsFromKlines(market, code, resp.data)
  if (!bars.length) return 0
  if (market === 'CN') {
    return store.bulkUpsertKlines(bars.map(b => ({
      tradeDate: b.tradeDate,
      code: b.code,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      amount: b.amount,
      changePct: b.changePct,
    })))
  }
  return store.bulkUpsertInstrumentBars(bars)
}

export async function syncKlineBootstrapLayer(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  cfg: JobSyncConfig,
  options: {
    markets?: InitialEquityMarket[]
    maxInstruments?: number
    pendingFilter?: (market: InitialEquityMarket, code: string) => boolean
    callbacks?: KlineSyncCallbacks
  } = {},
): Promise<{ total: number; success: number; error: number }> {
  const markets = options.markets ?? ['CN', 'HK', 'US']
  let instruments = listKlineBootstrapInstruments(store, markets)
  if (options.pendingFilter) {
    instruments = instruments.filter(i => options.pendingFilter!(i.market, i.code))
  }
  if (options.maxInstruments && options.maxInstruments > 0) {
    instruments = instruments.slice(0, options.maxInstruments)
  }

  const callbacks = options.callbacks ?? {}
  callbacks.onLog?.(`K 线层：${instruments.length} 只标的，每只 ${KLINE_BOOTSTRAP_DAYS} 根日 K`)

  let success = 0
  let error = 0

  await mapPool(instruments, cfg.concurrency, cfg.delayMs, async (item, index) => {
    callbacks.onProgress?.('kline_bootstrap', index + 1, instruments.length)
    try {
      await syncInstrumentKlines(gateway, store, item.market, item.code, KLINE_BOOTSTRAP_DAYS)
      success++
    } catch {
      error++
    }
  })

  return { total: instruments.length, success, error }
}

/** 增量日 K — 默认拉最近 5 根，覆盖各市场最新交易日 */
export async function syncKlineDailyLayer(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  cfg: JobSyncConfig,
  options: {
    markets?: InitialEquityMarket[]
    pendingFilter?: (market: InitialEquityMarket, code: string) => boolean
    callbacks?: KlineSyncCallbacks
    incrementalBars?: number
  } = {},
): Promise<{ total: number; success: number; error: number }> {
  const markets = options.markets ?? ['CN', 'HK', 'US']
  const barCount = options.incrementalBars ?? 5
  let instruments = listKlineBootstrapInstruments(store, markets)
  if (options.pendingFilter) {
    instruments = instruments.filter(i => options.pendingFilter!(i.market, i.code))
  }

  const callbacks = options.callbacks ?? {}
  callbacks.onLog?.(`日 K 增量：${instruments.length} 只 × 最近 ${barCount} 根`)

  let success = 0
  let error = 0

  await mapPool(instruments, cfg.concurrency, cfg.delayMs, async (item, index) => {
    callbacks.onProgress?.('kline_daily', index + 1, instruments.length)
    try {
      await syncInstrumentKlines(gateway, store, item.market, item.code, barCount)
      success++
    } catch {
      error++
    }
  })

  return { total: instruments.length, success, error }
}
