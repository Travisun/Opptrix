import type { StockProfile, StockRealtime } from '../../../core/schema.js'
import type { TencentUsProfile, TencentUsQuote } from '../api/us-detail-service.js'
import { normalizeUsTicker } from '../api/us-detail-service.js'
import {
  resolveUsQuoteSession,
  usQuoteSessionLabel,
} from '../../../utils/us-market.js'

export function mapTencentUsQuoteRow(q: TencentUsQuote): StockRealtime {
  const session = resolveUsQuoteSession()
  const amplitude = q.preClose != null && q.preClose > 0 && q.high != null && q.low != null
    ? ((q.high - q.low) / q.preClose) * 100
    : null
  return {
    code: normalizeUsTicker(q.symbol || q.code),
    name: q.name || normalizeUsTicker(q.symbol || q.code),
    price: q.price,
    changePct: q.changePct,
    change: q.changeAmt ?? (
      q.price != null && q.preClose != null ? q.price - q.preClose : null
    ),
    pe: q.pe,
    pb: q.pb,
    turnoverRate: q.turnoverRate,
    marketCap: q.marketCap,
    open: q.open,
    high: q.high,
    low: q.low,
    preClose: q.preClose,
    volume: q.volume,
    amount: q.amount,
    amplitude,
    quoteSession: session,
    sessionLabel: usQuoteSessionLabel(session),
  }
}

export function mapTencentUsProfileRow(p: TencentUsProfile): StockProfile {
  const code = normalizeUsTicker(p.code || p.symbol)
  return {
    code,
    name: p.companyName || code,
    orgName: p.companyName,
    industry: p.industry?.name,
    listingDate: p.listingDate || undefined,
    orgProfile: p.description || undefined,
    website: p.website || undefined,
    mainBusiness: p.revenueBreakdown?.[0]?.segments?.map(s => s.label).filter(Boolean).join('、') || undefined,
  }
}
