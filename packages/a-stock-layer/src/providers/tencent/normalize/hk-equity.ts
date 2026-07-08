import type { StockProfile, StockRealtime } from '../../../core/schema.js'
import { safeFloat } from '../../../utils/helpers.js'
import {
  normalizeHkNumericCode,
  type TencentHkProfile,
} from '../api/hk-detail-service.js'
import { tencentMarketCapYuan } from './quote.js'

export function mapTencentHkQuoteRow(code: string, parts: string[]): StockRealtime {
  const numeric = normalizeHkNumericCode(code)
  const f = (v: string | undefined) => safeFloat(v)
  const price = f(parts[3])
  const preClose = f(parts[4])
  const high = f(parts[33])
  const low = f(parts[34])
  const change = f(parts[31]) ?? (
    price != null && preClose != null ? price - preClose : null
  )
  const amplitude = preClose != null && preClose > 0 && high != null && low != null
    ? ((high - low) / preClose) * 100
    : null
  return {
    code: numeric,
    name: parts[1]?.trim() || numeric,
    price,
    preClose,
    open: f(parts[5]),
    high,
    low,
    volume: f(parts[6]),
    amount: f(parts[37]),
    change,
    changePct: f(parts[32]),
    pe: f(parts[39]),
    pb: f(parts[46]),
    turnoverRate: f(parts[38]),
    amplitude,
    marketCap: tencentMarketCapYuan(parts[44]),
    circulatingMarketCap: tencentMarketCapYuan(parts[45]),
  }
}

export function mapTencentHkProfileRow(p: TencentHkProfile): StockProfile {
  const code = normalizeHkNumericCode(p.code || p.symbol)
  return {
    code,
    name: p.chiName || code,
    orgName: p.chiName || undefined,
    orgProfile: p.business || undefined,
    website: p.website || undefined,
  }
}
