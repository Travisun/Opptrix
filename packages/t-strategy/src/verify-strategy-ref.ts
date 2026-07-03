import type { AshareEngine } from '@opptrix/a-stock-layer'
import type { InstrumentRef, StockKline, StockRealtime } from '@opptrix/shared'
import { runStrategyVerification, type StrategyVerificationResult } from './signal-engine.js'

function queryData<T>(r: Awaited<ReturnType<AshareEngine['queryInstrumentData']>>): T[] | null {
  if (!r.success || !('data' in r) || !r.data) return null
  return r.data as T[]
}

export async function verifyStrategyForRef(
  de: AshareEngine,
  ref: InstrumentRef,
  checkpoints = 30,
  forwardDays = 5,
): Promise<StrategyVerificationResult> {
  const klines = queryData<StockKline>(await de.queryInstrumentData(ref, 'kline', { count: 400 }))
  if (!klines || klines.length < 120) {
    return runStrategyVerification(ref.symbol, ref.symbol, [], checkpoints, forwardDays)
  }

  let name = ref.symbol
  const rtRows = queryData<StockRealtime>(await de.queryInstrumentData(ref, 'realtime'))
  if (rtRows?.[0]?.name) name = rtRows[0].name

  return runStrategyVerification(ref.symbol, name, klines, checkpoints, forwardDays)
}
