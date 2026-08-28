export type ThsSectorTag = 'cn_concept' | 'industry' | 'tszs'

export interface SectorIndexQuote {
  code: string
  name: string
  price: number | null
  change_pct: number | null
  change_amt?: number | null
  index_thscode?: string
  sector_tag?: ThsSectorTag
}

export interface ThsIndexCatalogEntry {
  thscode: string
  name: string
  sector_tag: ThsSectorTag
}

function safeFloat(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function parseThsIndexCatalogRow(
  row: Record<string, unknown>,
  sectorTag: ThsSectorTag,
): ThsIndexCatalogEntry | null {
  const thscode = String(row.thscode ?? row.index_thscode ?? row.code ?? '').trim()
  if (!thscode) return null
  const name = String(row.name ?? row.index_name ?? row.sec_name ?? thscode).trim()
  if (!name) return null
  return { thscode, name, sector_tag: sectorTag }
}

export function mapThsIndexSnapshotToQuote(
  entry: ThsIndexCatalogEntry,
  snap: Record<string, unknown> | undefined,
): SectorIndexQuote {
  return {
    code: entry.thscode,
    name: entry.name,
    price: safeFloat(snap?.last_price),
    change_pct: safeFloat(snap?.price_change_ratio_pct),
    change_amt: safeFloat(snap?.price_change),
    index_thscode: entry.thscode,
    sector_tag: entry.sector_tag,
  }
}

export function dedupeThsCatalogEntries(entries: ThsIndexCatalogEntry[]): ThsIndexCatalogEntry[] {
  const byThscode = new Map<string, ThsIndexCatalogEntry>()
  for (const entry of entries) {
    if (!byThscode.has(entry.thscode)) byThscode.set(entry.thscode, entry)
  }
  return [...byThscode.values()]
}

export function rankSectorIndexQuotes(items: SectorIndexQuote[], limit: number): SectorIndexQuote[] {
  const sorted = [...items].sort((a, b) => {
    const av = a.change_pct
    const bv = b.change_pct
    if (av == null && bv == null) return a.name.localeCompare(b.name, 'zh-CN')
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av
  })
  return sorted.slice(0, limit)
}

export function indexSnapshotRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((row): row is Record<string, unknown> => row != null && typeof row === 'object')
  return []
}

/** A 股宽基指数 thscode（000300 → 000300.SH，399006 → 399006.SZ） */
export function majorCnIndexThscode(code: string): string {
  const raw = String(code ?? '').trim()
  if (!raw) return ''
  if (raw.includes('.')) return raw.toUpperCase()
  const digits = raw.replace(/\D/g, '').padStart(6, '0').slice(-6)
  if (digits.startsWith('399') || digits.startsWith('88')) {
    return `${digits}.${digits.startsWith('399') ? 'SZ' : 'TI'}`
  }
  return `${digits}.SH`
}

export function mapMajorCnIndexQuote(
  entry: { code: string; name: string },
  snap: Record<string, unknown> | undefined,
): {
  code: string
  name: string
  price: number | null
  change_pct: number | null
  change_amt: number | null
  market: string
} {
  const market = entry.code.startsWith('399') ? 'SZ' : 'SH'
  if (!snap) {
    return {
      code: entry.code,
      name: entry.name,
      price: null,
      change_pct: null,
      change_amt: null,
      market,
    }
  }
  return {
    code: entry.code,
    name: entry.name,
    price: safeFloat(snap.last_price),
    change_pct: safeFloat(snap.price_change_ratio_pct),
    change_amt: safeFloat(snap.price_change),
    market,
  }
}

/** 从指数成份行解析 A 股标的代码（6 位），供 batchRealtime 对齐 */
export function parseConstituentStockCode(row: Record<string, unknown>): string {
  const thscode = String(row.thscode ?? row.stock_code ?? '').trim()
  if (thscode.includes('.')) {
    const sym = thscode.split('.')[0]?.trim()
    if (sym && /^\d{6}$/.test(sym)) return sym
  }
  const code = String(row.code ?? row.stockCode ?? row.symbol ?? thscode).trim()
  const digits = code.replace(/\D/g, '').slice(-6)
  return /^\d{6}$/.test(digits) ? digits : ''
}

export function mergeConstituentQuoteRow(
  row: Record<string, unknown>,
  quote: {
    price: number | null
    change_pct: number | null
    change_amt?: number | null
  } | undefined,
): Record<string, unknown> {
  if (!quote) return row
  return {
    ...row,
    price: quote.price,
    change_pct: quote.change_pct,
    price_change_ratio_pct: quote.change_pct,
    change_amt: quote.change_amt ?? null,
  }
}

export function sortConstituentRowsByChangePct(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const av = safeFloat(a.change_pct ?? a.price_change_ratio_pct ?? a.changePct)
    const bv = safeFloat(b.change_pct ?? b.price_change_ratio_pct ?? b.changePct)
    if (av == null && bv == null) {
      const an = String(a.name ?? a.stock_name ?? '').trim()
      const bn = String(b.name ?? b.stock_name ?? '').trim()
      return an.localeCompare(bn, 'zh-CN')
    }
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av
  })
}
