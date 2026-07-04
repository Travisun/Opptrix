import type { StockProfile } from '../../../core/schema.js'
import { normalizeUsSymbol } from '../../../utils/us-market.js'

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function fmtEpoch(v: unknown): string {
  const n = num(v)
  if (n == null) return ''
  const ms = n > 1e12 ? n : n * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

export function mapYfinanceProfile(
  json: Record<string, unknown>,
  displayCode: string,
): StockProfile | null {
  const result = ((json.quoteSummary as Record<string, unknown>)?.result as unknown[])?.[0] as Record<string, unknown> | undefined
  if (!result) return null

  const asset = (result.assetProfile ?? result.summaryProfile) as Record<string, unknown> | undefined
  const price = result.price as Record<string, unknown> | undefined
  const stats = result.defaultKeyStatistics as Record<string, unknown> | undefined
  if (!asset && !price) return null

  const code = normalizeUsSymbol(displayCode)
  const industry = str(asset?.industry ?? asset?.sector)
  return {
    code,
    name: str(price?.shortName ?? price?.longName ?? asset?.shortName ?? asset?.longName ?? code),
    orgName: str(asset?.longName ?? price?.longName),
    industry,
    industryCsrc: str(asset?.sector),
    listingDate: fmtEpoch(stats?.firstTradeDateEpoch ?? price?.firstTradeDateMilliseconds),
    mainBusiness: str(asset?.longBusinessSummary).slice(0, 500) || undefined,
    orgProfile: str(asset?.longBusinessSummary).slice(0, 800) || undefined,
    businessScope: str(asset?.industryDisp ?? asset?.sectorDisp),
    totalMarketCap: num(price?.marketCap ?? stats?.marketCap),
    employees: num(asset?.fullTimeEmployees),
    province: str(asset?.state),
    city: str(asset?.city),
    address: str(asset?.address1),
    website: str(asset?.website),
    securityType: str(price?.quoteType),
    formerName: str(price?.longName),
  }
}
