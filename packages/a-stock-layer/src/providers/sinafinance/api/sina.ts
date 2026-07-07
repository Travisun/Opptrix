import { normalizeCode, resolveMarket, safeFloat } from '../../../utils/helpers.js'
import type { StockListItem } from '../../../core/schema.js'
import { fetchJson, fetchText } from './http.js'
import { toSinaIndexListSymbol, toSinaKlineSymbol, toSinaListSymbol } from './symbols.js'
import { parseHqLine } from '../normalize/quote.js'
import { mapSinaKlineRows } from '../normalize/kline.js'
import { SINA_BOARD_NODE_MAP, SINA_KLINE_SCALE, SINA_REFERER } from './types.js'
import { buildSinaStockReferer } from './types.js'

const HQ_LIST_URL = 'https://hq.sinajs.cn/list='
const KLINE_URL = 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData'
const MARKET_CENTER_URL = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData'
const MARKET_COUNT_URL = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount'

export { SINA_REFERER, SINA_KLINE_SCALE, SINA_BOARD_NODE_MAP } from './types.js'

export const SINA_GLOBAL_INDEX: Record<string, string> = {
  dji: 'gb_$dji',
  spx: 'gb_$inx',
  ixic: 'gb_$ixic',
  hsi: 'rt_hkHSI',
  n225: 'gb_$n225',
}

const BATCH_CHUNK = 50

export async function fetchSinaHqList(symbols: string[]): Promise<string> {
  const joined = [...new Set(symbols.map(s => s.trim()).filter(Boolean))].join(',')
  if (!joined) return ''
  return fetchText(`${HQ_LIST_URL}${joined}`, 'gbk', SINA_REFERER)
}

export async function fetchSinaQuotesBySymbols(symbols: string[]) {
  if (!symbols.length) return []
  const chunks: string[][] = []
  for (let i = 0; i < symbols.length; i += BATCH_CHUNK) {
    chunks.push(symbols.slice(i, i + BATCH_CHUNK))
  }
  const rows = []
  for (const chunk of chunks) {
    const text = await fetchSinaHqList(chunk)
    rows.push(...text.trim().split('\n').map(parseHqLine).filter(Boolean))
  }
  return rows
}

export async function fetchSinaStockQuote(code: string) {
  return fetchSinaHqList([toSinaListSymbol(code)])
}

export async function fetchSinaIndexQuote(code: string) {
  return fetchSinaHqList([toSinaIndexListSymbol(code)])
}

export async function fetchSinaKlineRows(
  code: string,
  datalen = 1023,
  period = 'daily',
) {
  const scale = SINA_KLINE_SCALE[period] ?? SINA_KLINE_SCALE.daily ?? '240'
  const params = new URLSearchParams({
    symbol: toSinaKlineSymbol(code),
    scale,
    ma: 'no',
    datalen: String(Math.min(Math.max(datalen, 1), 1023)),
  })
  const referer = buildSinaStockReferer(toSinaKlineSymbol(code))
  const rows = await fetchJson<Array<Record<string, string>>>(`${KLINE_URL}?${params}`, referer)
  return Array.isArray(rows) ? rows : []
}

function resolveBoardNode(market: string): string {
  const key = String(market ?? 'all').trim().toLowerCase()
  return SINA_BOARD_NODE_MAP[key] ?? SINA_BOARD_NODE_MAP.all ?? 'hs_a'
}

async function fetchSinaBoardRows(node: string, maxItems = 0): Promise<StockListItem[]> {
  const all: StockListItem[] = []
  const totalRaw = await fetchJson<string | number>(
    `${MARKET_COUNT_URL}?node=${encodeURIComponent(node)}`,
    SINA_REFERER,
  )
  const total = Number(totalRaw)
  if (!total || Number.isNaN(total)) return all

  const pageSize = 100
  const maxPages = Math.min(80, Math.ceil(total / pageSize) + 1)

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      num: String(pageSize),
      sort: 'symbol',
      asc: '1',
      node,
      symbol: '',
    })
    const batch = await fetchJson<Array<Record<string, unknown>>>(
      `${MARKET_CENTER_URL}?${params}`,
      SINA_REFERER,
    )
    if (!Array.isArray(batch) || !batch.length) break
    for (const row of batch) {
      const code = normalizeCode(String(row.code ?? ''))
      if (!/^\d{6}$/.test(code)) continue
      all.push({
        code,
        name: String(row.name ?? ''),
        market: resolveMarket(code),
        industry: '',
      })
      if (maxItems > 0 && all.length >= maxItems) return all
    }
    if (batch.length < pageSize) break
  }
  return all
}

export async function fetchSinaStockList(market = 'all'): Promise<StockListItem[] | null> {
  const node = resolveBoardNode(market)
  const all = await fetchSinaBoardRows(node)
  return all.length ? all : null
}

/** 概念/行业板块成分股（`mkt/#chgn_700014` 等 node） */
export async function fetchSinaBoardStocks(
  node: string,
  page = 1,
  pageSize = 50,
): Promise<StockListItem[] | null> {
  const params = new URLSearchParams({
    page: String(page),
    num: String(Math.min(pageSize, 100)),
    sort: 'changepercent',
    asc: '0',
    node,
    symbol: '',
  })
  const batch = await fetchJson<Array<Record<string, unknown>>>(
    `${MARKET_CENTER_URL}?${params}`,
    SINA_REFERER,
  )
  if (!Array.isArray(batch) || !batch.length) return null
  const out: StockListItem[] = []
  for (const row of batch) {
    const c = normalizeCode(String(row.code ?? ''))
    if (!/^\d{6}$/.test(c)) continue
    out.push({
      code: c,
      name: String(row.name ?? ''),
      market: resolveMarket(c),
      industry: '',
    })
  }
  return out.length ? out : null
}

export async function fetchSinaMarketBreadth(date = '') {
  let up = 0
  let down = 0
  let flat = 0
  const totalRaw = await fetchJson<string | number>(
    `${MARKET_COUNT_URL}?node=${encodeURIComponent('hs_a')}`,
    SINA_REFERER,
  )
  const total = Number(totalRaw) || Number.POSITIVE_INFINITY
  const pageSize = 100
  const maxPages = Math.min(80, Math.ceil(total / pageSize) + 1)

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      num: String(pageSize),
      sort: 'symbol',
      asc: '1',
      node: 'hs_a',
      symbol: '',
    })
    const batch = await fetchJson<Array<Record<string, unknown>>>(
      `${MARKET_CENTER_URL}?${params}`,
      SINA_REFERER,
    )
    if (!Array.isArray(batch) || !batch.length) break
    for (const row of batch) {
      const pct = safeFloat(row.changepercent)
      if (pct == null) continue
      if (pct > 0) up += 1
      else if (pct < 0) down += 1
      else flat += 1
    }
    if (batch.length < pageSize) break
  }

  const counted = up + down + flat
  if (!counted) return null
  return [{
    date: date || new Date().toISOString().slice(0, 10),
    up,
    down,
    flat,
    total: counted,
  }]
}

export async function testSinaConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const text = await fetchSinaStockQuote('600519')
    if (text.includes('hq_str_') && text.includes(',')) {
      const name = text.match(/="([^,]+),/)?.[1]
      return { ok: true, message: name ? `新浪财经可访问 · ${name}` : '新浪财经可访问 · 实时行情正常' }
    }
    const rows = await fetchSinaKlineRows('600519', 5)
    if (rows.length) {
      return { ok: true, message: '新浪财经可访问 · 历史 K 线正常' }
    }
    return { ok: false, message: '新浪返回空数据，请稍后再试' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
