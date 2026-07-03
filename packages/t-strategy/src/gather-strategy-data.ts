import type { AshareEngine } from '@opptrix/a-stock-layer'
import { isCnEtfCode } from '@opptrix/a-stock-layer'
import type { InstrumentRef, StockKline, StockRealtime } from '@opptrix/shared'
import { hasApplicationCapability } from '@opptrix/shared'
import type { StrategyData } from './base.js'
import { gatherAll } from './data.js'
import { computeAll } from './indicators.js'

function toBars(klines: StockKline[]) {
  return klines.map(k => ({
    date: k.date, open: k.open, close: k.close, high: k.high, low: k.low,
    volume: k.volume ?? 0,
  }))
}

async function fetchRealtimeRow(
  engine: AshareEngine,
  ref: InstrumentRef,
): Promise<StockRealtime | null> {
  if (ref.market === 'CN') return null
  const r = await engine.queryInstrumentData(ref, 'realtime')
  return r.success ? (r.data?.[0] as StockRealtime | undefined) ?? null : null
}

async function fetchKlines(
  engine: AshareEngine,
  ref: InstrumentRef,
  count = 120,
): Promise<StockKline[]> {
  if (ref.market === 'CN') return []
  const r = await engine.queryInstrumentData(ref, 'kline', { count })
  return r.success ? ((r.data ?? []) as StockKline[]) : []
}

/** 非 CN 标的 — 价格 + 日 K + 指标，不含 A 股宏观字段 */
async function gatherCrossMarketMinimal(
  engine: AshareEngine,
  ref: InstrumentRef,
): Promise<StrategyData> {
  const data: StrategyData = { code: ref.symbol }
  const row = await fetchRealtimeRow(engine, ref)
  if (row) {
    data.price = row.price
    data.name = row.name
    data.changePct = row.changePct
    data.volumeRatio = row.volumeRatio ?? undefined
    data.turnoverRate = row.turnoverRate ?? undefined
  }
  const klines = await fetchKlines(engine, ref, 120)
  if (klines.length >= 30) {
    data.klineDaily = toBars(klines)
    data.indicators = computeAll(klines)
  }
  return data
}

/**
 * 按 InstrumentRef 加载策略上下文 — CN 走完整 gatherAll，其他市场仅技术向字段。
 */
export async function gatherStrategyData(
  engine: AshareEngine,
  ref: InstrumentRef,
): Promise<StrategyData> {
  if (ref.market === 'CN') {
    return gatherAll(engine, ref.symbol)
  }
  if (!hasApplicationCapability(ref, 'chart_daily')) {
    return { code: ref.symbol, name: ref.symbol }
  }
  return gatherCrossMarketMinimal(engine, ref)
}

/** 从裸 code 推断 CN / US — 跨市场请传 InstrumentRef */
export async function gatherStrategyDataFromCode(
  engine: AshareEngine,
  code: string,
): Promise<StrategyData> {
  if (isCnEtfCode(code) || /^\d{6}$/.test(code.trim())) {
    return gatherAll(engine, code)
  }
  return gatherCrossMarketMinimal(engine, {
    market: 'US',
    assetClass: 'EQUITY',
    symbol: code.trim().toUpperCase(),
  })
}
