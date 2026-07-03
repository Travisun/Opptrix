import type { Market } from '@opptrix/shared'
import type { StockListItem, StockProfile } from '../../../core/schema.js'
import type { TickflowInstrument } from '../api/client.js'
import { parseTickflowSymbol } from '../api/symbols.js'

function extField(ext: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!ext || typeof ext !== 'object') return undefined
  return ext[key]
}

function listMarket(inst: TickflowInstrument): string {
  const region = String(inst.region ?? '').toUpperCase()
  if (region === 'US') return 'US'
  if (region === 'HK') return 'HK'
  return String(inst.exchange ?? 'CN').toUpperCase()
}

export function mapTickflowInstrumentToListItem(inst: TickflowInstrument): StockListItem {
  const { code } = parseTickflowSymbol(inst.symbol)
  return {
    code,
    name: String(inst.name ?? code),
    industry: String(inst.type ?? inst.symbol_type ?? ''),
    market: listMarket(inst),
  }
}

export function mapTickflowInstrumentToProfile(inst: TickflowInstrument): StockProfile {
  const { code, market } = parseTickflowSymbol(inst.symbol)
  const ext = (inst.ext ?? {}) as Record<string, unknown>
  const listingDate = extField(ext, 'listing_date')
  const totalShares = extField(ext, 'total_shares')
  const floatShares = extField(ext, 'float_shares')

  const profile: StockProfile = {
    code,
    name: String(inst.name ?? code),
    listingDate: listingDate != null ? String(listingDate).slice(0, 10) : undefined,
    securityType: inst.type != null ? String(inst.type) : inst.symbol_type != null ? String(inst.symbol_type) : undefined,
  }

  if (market === 'CN' && typeof totalShares === 'number' && typeof floatShares === 'number') {
    profile.totalMarketCap = null
    profile.circulatingMarketCap = null
  }

  return profile
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
