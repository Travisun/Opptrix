/**
 * CN 场外开放式基金标准行 — Engine / market-data / Hub / UI 统一消费。
 */
import { normalizeCode, safeFloat } from '../../utils/helpers.js'
import { isCnEtfCode } from '../../core/instrument.js'

export type StandardFundProfileRow = Record<string, unknown> & {
  code: string
  name?: string
  fullName?: string
  fundType?: string
  manager?: string
  company?: string
  custodian?: string
  expenseRatio?: number | null
  scale?: number | null
  totalShares?: number | null
  unitNav?: number | null
  accNav?: number | null
  navDate?: string
  changePct?: number | null
  benchmark?: string
  investTarget?: string
  investScope?: string
  establishDate?: string
  riskLevel?: string
  source?: string
}

export type StandardFundNavRow = Record<string, unknown> & {
  code: string
  date: string
  nav?: number | null
  accNav?: number | null
  changePct?: number | null
  source?: string
}

export type StandardFundHoldingRow = Record<string, unknown> & {
  reportDate: string
  holdingSymbol: string
  holdingName?: string | null
  weight?: number | null
  shares?: number | null
  marketValue?: number | null
  assetType?: string
  source?: string
}

export type StandardFundQuoteRow = Record<string, unknown> & {
  code: string
  name?: string
  unitNav?: number | null
  accNav?: number | null
  prevNav?: number | null
  changePct?: number | null
  navDate?: string
  source?: string
}

export function mapSinaProfileToFundProfileRow(
  code: string,
  profile: Record<string, unknown> | null,
  quote?: Record<string, unknown> | null,
): StandardFundProfileRow | null {
  if (!profile && !quote) return null
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) return null
  const fields = (profile?.fields ?? {}) as Record<string, string>
  const fundType = [
    profile?.type1,
    profile?.type2,
    profile?.type3,
    fields.jjlx,
    fields.ejfl,
  ].map(v => String(v ?? '').trim()).filter(Boolean).join(' / ') || '开放式基金'

  const scaleRaw = profile?.fundScale ?? fields.jjgm
  const sharesRaw = profile?.fundShares ?? fields.jjfe

  return {
    code: c,
    name: String(profile?.shortName ?? profile?.fullName ?? quote?.name ?? '').trim() || undefined,
    fullName: profile?.fullName != null ? String(profile.fullName) : undefined,
    fundType,
    manager: String(profile?.manager ?? fields.jjjl ?? '').trim() || undefined,
    company: profile?.company != null ? String(profile.company) : undefined,
    custodian: profile?.custodian != null ? String(profile.custodian) : undefined,
    benchmark: profile?.benchmark != null ? String(profile.benchmark) : undefined,
    investTarget: profile?.investTarget != null ? String(profile.investTarget) : undefined,
    investScope: profile?.investScope != null ? String(profile.investScope) : undefined,
    establishDate: String(profile?.establishDate ?? profile?.listDate ?? '').slice(0, 10) || undefined,
    scale: parseScaleYi(scaleRaw),
    totalShares: safeFloat(sharesRaw),
    unitNav: safeFloat(quote?.unitNav),
    accNav: safeFloat(quote?.accNav),
    navDate: String(quote?.navDate ?? '').slice(0, 10) || undefined,
    changePct: safeFloat(quote?.changePct),
    expenseRatio: safeFloat(fields.glf),
    riskLevel: fields.fxjb ? String(fields.fxjb) : undefined,
    source: String(profile?.source ?? quote?.source ?? 'sinafinance'),
  }
}

export function mapSinaFundNavRows(
  code: string,
  rows: Array<Record<string, unknown>>,
): StandardFundNavRow[] {
  const c = normalizeCode(code)
  return rows.map(row => ({
    code: c,
    date: String(row.date ?? '').slice(0, 10),
    nav: safeFloat(row.unitNav ?? row.nav),
    accNav: safeFloat(row.accNav),
    changePct: safeFloat(row.dailyReturn ?? row.changePct),
    source: String(row.source ?? 'sinafinance'),
  })).filter(r => r.date)
}

export function mapSinaQuoteToFundQuoteRow(
  code: string,
  quote: Record<string, unknown> | null,
): StandardFundQuoteRow | null {
  if (!quote) return null
  const c = normalizeCode(code)
  if (isCnEtfCode(c)) return null
  return {
    code: c,
    name: quote.name != null ? String(quote.name) : undefined,
    unitNav: safeFloat(quote.unitNav),
    accNav: safeFloat(quote.accNav),
    prevNav: safeFloat(quote.prevNav),
    changePct: safeFloat(quote.changePct),
    navDate: String(quote.navDate ?? '').slice(0, 10) || undefined,
    source: String(quote.source ?? 'sinafinance'),
  }
}

export function mapSinaTopHoldToFundHoldings(
  fundCode: string,
  raw: Record<string, unknown>,
): StandardFundHoldingRow[] {
  const bare = normalizeCode(fundCode)
  const heavy = raw.heavy_stock ?? raw.heavyStock ?? raw.data
  const list = Array.isArray(heavy)
    ? heavy
    : Array.isArray((heavy as { list?: unknown } | null)?.list)
      ? ((heavy as { list: unknown[] }).list)
      : Array.isArray(raw)
        ? raw
        : []
  const rows: StandardFundHoldingRow[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const symbolRaw = String(row.SYMBOL ?? row.symbol ?? row.code ?? row.stockCode ?? '')
    const symbol = normalizeCode(symbolRaw.replace(/^(sh|sz|bj)/i, ''))
    const name = String(row.SKNAME ?? row.name ?? row.stockName ?? '').trim()
    if (!symbol && !name) continue
    rows.push({
      reportDate: String(row.ENDDATE ?? row.reportDate ?? row.asOfDate ?? '').slice(0, 10)
        || new Date().toISOString().slice(0, 10),
      holdingSymbol: symbol || '',
      holdingName: name || null,
      weight: safeFloat(row.NAVRTO ?? row.navPct ?? row.ratio ?? row.weight),
      shares: safeFloat(row.shares),
      marketValue: safeFloat(row.HOLDMKTCAP ?? row.marketValue),
      assetType: 'stock',
      source: 'sinafinance_top_hold',
    })
  }
  return rows.filter(r => r.holdingSymbol || r.holdingName)
}

function parseScaleYi(raw: unknown): number | null {
  const text = String(raw ?? '').trim()
  if (!text || text === '--') return null
  const n = safeFloat(text.replace(/[,，]/g, ''))
  if (n == null) return null
  if (text.includes('亿')) return n
  if (text.includes('万')) return n / 10000
  if (n > 1e8) return n / 1e8
  return n
}
