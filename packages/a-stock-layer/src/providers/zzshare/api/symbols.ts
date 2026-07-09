import { isShIndexCode, normalizeCode } from '../../../utils/helpers.js'

const SUFFIX_MAP: Record<string, string> = {
  SS: 'SH',
  SH: 'SH',
  XSHG: 'SH',
  SZ: 'SZ',
  XSHE: 'SZ',
  BJ: 'BJ',
  BSE: 'BJ',
}

/**
 * 归一化为 6 位纯数字代码（去掉交易所后缀）。
 *
 * @param symbol 股票代码，如 `600519` 或 `600519.SH`
 * @returns 纯数字代码
 */
export function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim()
  return trimmed.includes('.') ? trimmed.split('.')[0]! : trimmed
}

/**
 * 转换为 Tushare 风格 `ts_code`。
 *
 * @param symbol 股票代码，支持带后缀或裸代码
 * @returns 如 `600519.SH`、`000001.SZ`
 */
export function toTsCode(symbol: string): string {
  const normalized = symbol.trim().toUpperCase()
  if (normalized.includes('.')) {
    const [code, suffix] = normalized.split('.', 2)
    return `${code}.${SUFFIX_MAP[suffix] ?? suffix}`
  }
  const bare = normalizeCode(normalized)
  if (isShIndexCode(bare)) return `${bare}.SH`
  if (bare.startsWith('399')) return `${bare}.SZ`
  if (bare.startsWith('6') || bare.startsWith('5')) return `${bare}.SH`
  if (bare.startsWith('0') || bare.startsWith('3')) return `${bare}.SZ`
  if (bare.startsWith('8') || bare.startsWith('4') || bare.startsWith('2') || bare.startsWith('9')) {
    return `${bare}.BJ`
  }
  return bare
}

/**
 * 从 `ts_code` 解析代码与交易所枚举。
 *
 * @param tsCode Tushare 风格代码
 * @returns `code` 为 6 位数字，`exchange` 为 SSE/SZSE/BSE 之一
 */
export function fromTsCode(tsCode: string): { code: string; exchange: string } {
  const code = normalizeSymbol(tsCode)
  let exchange = ''
  if (code.startsWith('6') || code.startsWith('5')) exchange = 'SSE'
  else if (code.startsWith('0') || code.startsWith('3')) exchange = 'SZSE'
  else if (code.startsWith('8') || code.startsWith('4') || code.startsWith('2') || code.startsWith('9')) exchange = 'BSE'
  return { code, exchange }
}

/**
 * 将 Tushare/通用交易所标识映射为自在量化后端交易所代码。
 *
 * @param exchange 如 SSE、SZSE、GEM、KSH
 * @returns 后端代码（SS/SZ/GEM 等），无法识别时 `null`
 */
export function toBackendExchange(exchange?: string | null): string | null {
  if (!exchange) return null
  const mapping: Record<string, string> = {
    SSE: 'SS',
    SZSE: 'SZ',
    BSE: 'BJ',
    SH: 'SS',
    SZ: 'SZ',
    BJ: 'BJ',
    GEM: 'GEM',
    KSH: 'KSH',
    STAR: 'KSH',
    SS: 'SS',
    ALL: 'ALL',
  }
  return mapping[exchange.toUpperCase()] ?? null
}
