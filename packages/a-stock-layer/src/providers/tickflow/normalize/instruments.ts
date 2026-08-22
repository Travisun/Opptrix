import type { Market } from '@opptrix/shared'
import type { StockListItem, StockProfile } from '../../../core/schema.js'
import type { TickflowInstrument } from '../api/client.js'
import { parseTickflowSymbol } from '../api/symbols.js'

function extField(ext: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!ext || typeof ext !== 'object') return undefined
  return ext[key]
}

function strField(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  const s = String(v).trim()
  return s || undefined
}

function listingDateFromInstrument(inst: TickflowInstrument, ext: Record<string, unknown>): string | undefined {
  const fromExt = extField(ext, 'listing_date') ?? extField(ext, 'list_date')
  if (fromExt != null) {
    const text = String(fromExt).trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
    const n = Number(text)
    if (Number.isFinite(n) && n > 0) {
      const ms = n > 1e12 ? n : n * 1000
      return new Date(ms).toISOString().slice(0, 10)
    }
  }
  if (inst.list_date != null) {
    const n = Number(inst.list_date)
    if (Number.isFinite(n) && n > 0) {
      const ms = n > 1e12 ? n : n * 1000
      return new Date(ms).toISOString().slice(0, 10)
    }
  }
  return undefined
}

function industryFromInstrument(inst: TickflowInstrument, ext: Record<string, unknown>): string | undefined {
  const industry = strField(extField(ext, 'industry'))
    ?? strField(extField(ext, 'sector'))
    ?? strField(extField(ext, 'industry_name'))
    ?? strField(extField(ext, 'gics_sector'))
  if (industry) return industry
  const type = strField(inst.type ?? inst.symbol_type)
  if (type && type.toLowerCase() !== 'stock') return type
  return undefined
}

function listMarket(inst: TickflowInstrument): string {
  const region = String(inst.region ?? '').toUpperCase()
  if (region === 'US') return 'US'
  if (region === 'HK') return 'HK'
  return String(inst.exchange ?? 'CN').toUpperCase()
}

export function mapTickflowInstrumentToListItem(inst: TickflowInstrument): StockListItem {
  const { code } = parseTickflowSymbol(inst.symbol)
  const ext = (inst.ext ?? {}) as Record<string, unknown>
  return {
    code,
    name: String(inst.name ?? code),
    industry: industryFromInstrument(inst, ext) ?? String(inst.type ?? inst.symbol_type ?? ''),
    market: listMarket(inst),
  }
}

export function mapTickflowInstrumentToProfile(inst: TickflowInstrument): StockProfile {
  const { code, market } = parseTickflowSymbol(inst.symbol)
  const ext = (inst.ext ?? {}) as Record<string, unknown>
  const listingDate = listingDateFromInstrument(inst, ext)
  const totalSharesRaw = extField(ext, 'total_shares') ?? extField(ext, 'total_share')
  const floatShares = extField(ext, 'float_shares')

  const profile: StockProfile = {
    code,
    name: String(inst.name ?? code),
    listingDate,
    securityType: strField(inst.exchange)
      ?? (inst.type != null ? String(inst.type) : inst.symbol_type != null ? String(inst.symbol_type) : undefined),
    industry: industryFromInstrument(inst, ext),
    website: strField(extField(ext, 'website') ?? extField(ext, 'web_site')),
    orgProfile: strField(
      extField(ext, 'description')
      ?? extField(ext, 'long_description')
      ?? extField(ext, 'company_description'),
    ),
    mainBusiness: strField(extField(ext, 'main_business') ?? extField(ext, 'business_summary')),
    chairman: strField(extField(ext, 'chairman') ?? extField(ext, 'ceo')),
  }

  const totalShares = typeof totalSharesRaw === 'number' ? totalSharesRaw : numShares(totalSharesRaw)
  if (totalShares != null) {
    profile.totalShares = totalShares
  }

  if (market === 'CN' && typeof totalSharesRaw === 'number' && typeof floatShares === 'number') {
    profile.totalMarketCap = null
    profile.circulatingMarketCap = null
  }

  return profile
}

function numShares(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function mapTickflowInstrumentsToList(
  instruments: TickflowInstrument[],
  keyword = '',
): StockListItem[] {
  const kw = keyword.trim().toUpperCase()
  const rows = instruments.map(mapTickflowInstrumentToListItem)
  if (!kw) return rows
  return rows.filter(row =>
    row.code.toUpperCase().includes(kw)
    || row.name.toUpperCase().includes(kw)
    || row.market.toUpperCase().includes(kw),
  )
}

export function inferMarketFromBareCode(code: string): Market {
  const raw = code.trim()
  if (/\.(SH|SZ|BJ|US|HK)$/i.test(raw)) {
    return parseTickflowSymbol(raw).market
  }
  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(raw) && /[A-Z]/i.test(raw)) return 'US'
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 4 && digits.length <= 5 && /^\d+$/.test(digits)) return 'HK'
  return 'CN'
}

export const mapTickflowInstrumentListItem = mapTickflowInstrumentToListItem
export const mapTickflowInstrumentListItems = mapTickflowInstrumentsToList

export function mapTickflowInstrumentProfile(inst: TickflowInstrument): StockProfile {
  return mapTickflowInstrumentToProfile(inst)
}

export function mapTickflowInstrumentProfiles(instruments: TickflowInstrument[]): StockProfile[] {
  return instruments.map(mapTickflowInstrumentToProfile)
}
