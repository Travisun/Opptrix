import type { MoneyFlow } from '../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import type { SinaMinlineRow, SinaMoneyFlowSnapshot } from '../api/types.js'
import type { SinaTransRow } from '../api/market.js'

export function mapSinaMoneyFlow(
  code: string,
  snap: SinaMoneyFlowSnapshot,
): MoneyFlow | null {
  const bare = normalizeCode(code)
  const mainNet = safeFloat(snap.netamount)
  if (mainNet == null && !snap.r0_in) return null
  const r0In = safeFloat(snap.r0_in) ?? 0
  const r0Out = safeFloat(snap.r0_out) ?? 0
  const r1In = safeFloat(snap.r1_in) ?? 0
  const r1Out = safeFloat(snap.r1_out) ?? 0
  const r2In = safeFloat(snap.r2_in) ?? 0
  const r2Out = safeFloat(snap.r2_out) ?? 0
  const r3In = safeFloat(snap.r3_in) ?? 0
  const r3Out = safeFloat(snap.r3_out) ?? 0
  return {
    code: bare,
    date: String(snap.opendate ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    mainNet,
    superLargeNet: r0In - r0Out,
    largeNet: r1In - r1Out,
    mediumNet: r2In - r2Out,
    smallNet: r3In - r3Out,
    mainNetPct: safeFloat(snap.r0x_ratio),
    close: safeFloat(snap.trade),
    changePct: snap.changeratio != null
      ? Math.round(Number(snap.changeratio) * 10000) / 100
      : null,
  }
}

export function mapSinaMinlineTicks(
  code: string,
  rows: SinaMinlineRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(row => ({
    code: bare,
    time: row.m,
    price: safeFloat(row.p),
    volume: safeFloat(row.v),
    avgPrice: safeFloat(row.avg_p),
    totalVolume: safeFloat(row.tot_v),
  }))
}

export function mapSinaTransRows(
  code: string,
  rows: SinaTransRow[],
): Record<string, unknown>[] {
  const bare = normalizeCode(code)
  return rows.map(([time, volume, price, direction]) => ({
    code: bare,
    time,
    volume: safeFloat(volume),
    price: safeFloat(price),
    direction,
  }))
}
