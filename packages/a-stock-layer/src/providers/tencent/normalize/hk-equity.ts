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
  return {
    code: numeric,
    name: parts[1]?.trim() || numeric,
    price: f(parts[3]),
    preClose: f(parts[4]),
    open: f(parts[5]),
    high: f(parts[33]),
    low: f(parts[34]),
    volume: f(parts[6]),
    amount: f(parts[37]),
    changePct: f(parts[32]),
    pe: f(parts[39]),
    pb: f(parts[46]),
    turnoverRate: f(parts[38]),
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
