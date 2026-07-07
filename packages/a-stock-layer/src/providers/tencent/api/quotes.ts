import { secFullCode } from '../../../utils/helpers.js'
import { fetchText, tencentHttp } from './http.js'
import { parseTencentLine, mapTencentRealtime } from '../normalize/quote.js'
import { mapTencentKlineRows } from '../normalize/kline.js'
import type { StockKline } from '../../../core/schema.js'

const RT_URL = 'https://qt.gtimg.cn/q='
const KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'
const SQT_UTF8_URL = 'https://sqt.gtimg.cn/utf8/'

const PERIOD_MAP: Record<string, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
}

export const TENCENT_GLOBAL_INDEX: Record<string, string> = {
  dji: 'usDJI',
  djia: 'usDJI',
  dow: 'usDJI',
  spx: 'usINX',
  spy: 'usINX',
  ixic: 'usIXIC',
  nasdaq: 'usIXIC',
  qqq: 'usIXIC',
  hsi: 'hkHSI',
  n225: 'jpN225',
  nikkei: 'jpN225',
}

export const TENCENT_FX: Record<string, string> = {
  USDCNY: 'fxUSDCNY',
  EURCNY: 'fxEURCNY',
  HKDCNY: 'fxHKDCNY',
}

export async function fetchTencentQuotes(
  codes: string[],
  opts?: { rawSymbols?: boolean },
): Promise<Array<{ code: string; parts: string[] }>> {
  if (!codes.length) return []
  const symbols = opts?.rawSymbols ? codes : codes.map(c => secFullCode(c))
  const text = await fetchText(`${RT_URL}${symbols.join(',')}`, 'gbk')
  const lines = text.trim().split('\n')
  const out: Array<{ code: string; parts: string[] }> = []
  for (let i = 0; i < lines.length; i += 1) {
    const parts = parseTencentLine(lines[i]!)
    if (!parts) continue
    out.push({ code: codes[i] ?? symbols[i] ?? '', parts })
  }
  return out
}

export { fetchTencentSqtQuotes } from './proxy.js'
export { mapTencentRealtime }

export async function fetchTencentKline(
  code: string,
  period = 'daily',
  count = 320,
): Promise<StockKline[] | null> {
  if (!PERIOD_MAP[period]) return null
  const sym = secFullCode(code)
  const p = PERIOD_MAP[period] ?? 'day'
  const qs = new URLSearchParams({ param: `${sym},${p},,,${count},qfq` })
  const parsed = await tencentHttp.get<Record<string, unknown>>(`${KLINE_URL}?${qs}`)
  const data = parsed.data as Record<string, Record<string, string[][]>> | undefined
  const rows = data?.[sym]?.[`qfq${p}`] ?? data?.[sym]?.[p] ?? []
  return mapTencentKlineRows(code, rows)
}

export async function testTencentQuotesConnection(code = '600519'): Promise<{ ok: boolean; message: string }> {
  try {
    const rows = await fetchTencentQuotes([code])
    if (rows.length && rows[0]?.parts[1]) {
      return { ok: true, message: `腾讯行情可访问 · ${rows[0].parts[1]}` }
    }
    return { ok: false, message: '腾讯行情返回空数据' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
