import type { AshareEngine } from '@ni-k/a-stock-layer'
import type { StockKline } from '@ni-k/shared'
import type { StrategyData } from './base.js'
import { computeAll } from './indicators.js'

function toBars(klines: StockKline[]) {
  return klines.map(k => ({
    date: k.date, open: k.open, close: k.close, high: k.high, low: k.low,
    volume: k.volume ?? 0,
  }))
}

export async function gatherAll(engine: AshareEngine, code: string): Promise<StrategyData> {
  const data: StrategyData = { code }

  const rt = await engine.realtime(code)
  if (rt.success && rt.data?.[0]) {
    const r = rt.data[0]
    data.price = r.price
    data.name = r.name
    data.changePct = r.changePct
    data.volumeRatio = r.volumeRatio ?? undefined
    data.turnoverRate = r.turnoverRate ?? undefined
  }

  const kl = await engine.kline(code, 120)
  if (kl.success && kl.data && kl.data.length >= 30) {
    data.klineDaily = toBars(kl.data)
    data.indicators = computeAll(kl.data)
  }

  const pf = await engine.profile(code)
  if (pf.success && pf.data?.[0]) {
    data.industry = pf.data[0].industry
    data.name = data.name ?? pf.data[0].name
  }

  const sf = await engine.sectorMoneyFlow('industry')
  if (sf.success && sf.data?.length && data.industry) {
    const hit = sf.data.find(s => s.sectorName === data.industry || data.industry?.includes(s.sectorName ?? ''))
    if (hit) data.sectorMoneyFlow = hit as unknown as Record<string, unknown>
  }

  const mb = await engine.marketBreadth()
  if (mb.success && mb.data?.[0]) {
    data.marketBreadth = mb.data[0] as unknown as Record<string, unknown>
  }

  const idx = await engine.indexRealtime('000001')
  if (idx.success && idx.data?.[0]?.price != null) {
    data.shIndex = idx.data[0].price
  }

  const mf = await engine.moneyFlow(code)
  if (mf.success && mf.data) {
    data.moneyFlow = mf.data as unknown as Record<string, unknown>[]
  }

  return data
}

export function gatherFromKline(code: string, klines: StockKline[], sliceEnd: number): StrategyData {
  const slice = klines.slice(0, sliceEnd + 1)
  const last = slice[slice.length - 1]
  return {
    code,
    price: last?.close,
    changePct: slice.length >= 2
      ? ((last.close - slice[slice.length - 2].close) / slice[slice.length - 2].close) * 100
      : 0,
    klineDaily: toBars(slice),
    indicators: computeAll(slice),
  }
}
