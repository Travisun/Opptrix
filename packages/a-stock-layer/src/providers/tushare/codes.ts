import { isBseCode, normalizeCode, parseStockMarket, resolveStockMarketCode } from '../../utils/helpers.js'

export function toTsCode(code: string, exchange?: string | null): string {
  const dotted = /^(\d{6})\.(SH|SZ|BJ)$/i.exec(String(code).trim())
  if (dotted) return `${dotted[1]}.${dotted[2]!.toUpperCase()}`
  const c = normalizeCode(code)
  const ex = parseStockMarket(exchange)
  if (ex) return `${c}.${ex}`
  if (isBseCode(c)) return `${c}.BJ`
  if (c.startsWith('399') || c.startsWith('159') || c.startsWith('16')) return `${c}.SZ`
  if (resolveStockMarketCode(c) === 'SH') return `${c}.SH`
  return `${c}.SZ`
}

export function fromTsCode(tsCode: string): string {
  return normalizeCode(tsCode.split('.')[0] ?? tsCode)
}

export function indexTsCode(code: string): string {
  const c = normalizeCode(code)
  if (c.startsWith('399')) return `${c}.SZ`
  if (c.startsWith('000') && c.length === 6) return `${c}.SH`
  return toTsCode(c)
}

const FUND_TS_SUFFIX = /^(\d{6})\.(OF|SH|SZ|BJ)$/i

export function isListedFundCodePattern(bare: string): boolean {
  const head2 = bare.slice(0, 2)
  if (head2 === '51' || head2 === '52' || head2 === '56' || head2 === '58') return true
  if (bare.startsWith('159') || bare.startsWith('16')) return true
  return false
}

/** Tushare 基金 ts_code：场外 `.OF`，场内 `.SH/.SZ`；裸码自动识别 */
export function fundTsCode(code: string, exchange?: string | null): string {
  const trimmed = String(code ?? '').trim().toUpperCase()
  const dotted = FUND_TS_SUFFIX.exec(trimmed)
  if (dotted) return `${dotted[1]}.${dotted[2]!}`
  const bare = normalizeCode(trimmed)
  if (!bare) return ''
  const exUp = String(exchange ?? '').toUpperCase()
  if (exUp === 'OF') return `${bare}.OF`
  if (exUp === 'SH' || exUp === 'SZ' || exUp === 'BJ') return `${bare}.${exUp}`
  if (isListedFundCodePattern(bare)) return toTsCode(bare)
  return `${bare}.OF`
}

export function fundTsCodeCandidates(bare: string): string[] {
  const code = normalizeCode(bare)
  if (!code) return []
  const primary = fundTsCode(code)
  const otc = `${code}.OF`
  const listed = toTsCode(code)
  const seen = new Set<string>()
  const out: string[] = []
  for (const ts of [primary, otc, listed]) {
    if (!seen.has(ts)) {
      seen.add(ts)
      out.push(ts)
    }
  }
  return out
}

export function fromFundTsCode(tsCode: string): string {
  return normalizeCode(String(tsCode ?? '').split('.')[0] ?? tsCode)
}

export function fundMarketFromTsCode(tsCode: string): 'E' | 'O' | null {
  const m = /\.(OF|SH|SZ|BJ)$/i.exec(String(tsCode ?? '').trim())
  if (!m) return null
  return m[1].toUpperCase() === 'OF' ? 'O' : 'E'
}

/** StockListItem.market：场外 PF，场内 SH/SZ */
export function fundListMarketFromTsCode(tsCode: string): string {
  const m = fundMarketFromTsCode(tsCode)
  if (m === 'O') return 'PF'
  const suffix = String(tsCode ?? '').split('.')[1]?.toUpperCase()
  if (suffix === 'SH' || suffix === 'SZ' || suffix === 'BJ') return suffix
  return 'PF'
}
