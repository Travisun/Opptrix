import { secFullCode } from '../../../utils/helpers.js'
import { fetchJson, fetchText } from './http.js'
import { parseHtmlTables } from './html.js'
import type { SinaMinlineEnvelope, SinaMoneyFlowSnapshot, SinaBillDetailRow, SinaPriceLevelRow } from './types.js'
import { buildSinaStockReferer } from './types.js'
import { parseJsNewArray } from './js-array.js'

export interface SinaPriceHistoryRow {
  price: string
  volume: string
  ratio: string
}

const MONEY_FLOW_URL =
  'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssi_ssfx_flzjtj'
const MINLINE_URL = 'https://cn.finance.sina.com.cn/minline/getMinlineData'
const TRANS_LIST_URL =
  'https://vip.stock.finance.sina.com.cn/quotes_service/view/CN_TransListV2.php'

/** 当日资金流向快照 */
export async function fetchSinaMoneyFlow(code: string): Promise<SinaMoneyFlowSnapshot> {
  const symbol = secFullCode(code)
  const params = new URLSearchParams({ daima: symbol })
  return fetchJson<SinaMoneyFlowSnapshot>(
    `${MONEY_FLOW_URL}?${params}`,
    buildSinaStockReferer(symbol),
  )
}

/** 当日分时（分钟） */
export async function fetchSinaMinline(code: string): Promise<SinaMinlineEnvelope> {
  const symbol = secFullCode(code)
  const params = new URLSearchParams({
    symbol,
    version: '7.11.0',
    dpc: '1',
  })
  return fetchJson<SinaMinlineEnvelope>(
    `${MINLINE_URL}?${params}`,
    buildSinaStockReferer(symbol),
  )
}

export type SinaTransRow = [string, string, string, string]

/** 逐笔成交（盘中；收盘后条数减少） */
export async function fetchSinaTransList(
  code: string,
  num = 20,
): Promise<{ rows: SinaTransRow[]; innerVol?: number; outerVol?: number }> {
  const symbol = secFullCode(code)
  const params = new URLSearchParams({
    symbol,
    num: String(Math.max(1, Math.min(num, 50))),
    rn: String(Date.now()),
  })
  const text = await fetchText(
    `${TRANS_LIST_URL}?${params}`,
    'utf-8',
    buildSinaStockReferer(symbol),
  )
  const rows: SinaTransRow[] = []
  const rowRe = /new Array\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'\)/g
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(text)) !== null) {
    rows.push([m[1]!, m[2]!, m[3]!, m[4]!])
  }
  const volMatch = text.match(/trade_INVOL_OUTVOL=\[(\d+),(\d+)\]/)
  return {
    rows,
    innerVol: volMatch ? Number(volMatch[1]) : undefined,
    outerVol: volMatch ? Number(volMatch[2]) : undefined,
  }
}

/** 扩展行情 `hq_str_{symbol}_i` 原始文本行 */
export async function fetchSinaExtendedQuoteLine(code: string): Promise<string> {
  const symbol = secFullCode(code)
  const text = await fetchText(
    `https://hq.sinajs.cn/list=${symbol}_i`,
    'gbk',
    buildSinaStockReferer(symbol),
  )
  const m = text.match(/="([^"]*)"/)
  return m?.[1] ?? ''
}

/** 页面 jsvar（股本、EPS 等） */
export async function fetchSinaJsVar(code: string): Promise<string> {
  const symbol = secFullCode(code)
  return fetchText(
    `https://finance.sina.com.cn/realstock/company/${symbol}/jsvar.js`,
    'gbk',
    buildSinaStockReferer(symbol),
  )
}

const PRICE_LIST_URL =
  'https://vip.stock.finance.sina.com.cn/quotes_service/view/cn_price_list.php'
const BILL_LIST_URL =
  'https://vip.stock.finance.sina.com.cn/quotes_service/view/CN_BillList.php'
const PRICE_HISTORY_URL = 'http://market.finance.sina.com.cn/pricehis.php'

/** 分价统计（当日价位成交分布） */
export async function fetchSinaPriceDistribution(code: string): Promise<SinaPriceLevelRow[]> {
  const symbol = secFullCode(code)
  const text = await fetchText(`${PRICE_LIST_URL}?symbol=${symbol}`, 'utf-8', buildSinaStockReferer(symbol))
  return parseJsNewArray(text, 'price_statist_list').map(([price, volume, ratio]) => ({
    price: price ?? '',
    volume: volume ?? '',
    ratio: ratio ?? '',
  }))
}

/** 大单成交明细（盘中；收盘后条数减少） */
export async function fetchSinaBillDetails(code: string): Promise<SinaBillDetailRow[]> {
  const symbol = secFullCode(code)
  const text = await fetchText(`${BILL_LIST_URL}?symbol=${symbol}`, 'utf-8', buildSinaStockReferer(symbol))
  return parseJsNewArray(text, 'bill_detail_list').map(([time, volume, price, direction]) => ({
    time: time ?? '',
    volume: volume ?? '',
    price: price ?? '',
    direction: direction ?? '',
  }))
}

function defaultPriceHistoryRange(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 7)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

/** 持仓分析 / 历史分价（`cn_price_history` → `pricehis.php`） */
export async function fetchSinaPriceHistoryHtml(
  code: string,
  startDate = '',
  endDate = '',
): Promise<string> {
  const symbol = secFullCode(code)
  const range = defaultPriceHistoryRange()
  const start = startDate || range.start
  const end = endDate || range.end
  const params = new URLSearchParams({ symbol, startdate: start, enddate: end })
  return fetchText(`${PRICE_HISTORY_URL}?${params}`, 'gbk', buildSinaStockReferer(symbol))
}

export function parseSinaPriceHistoryFromHtml(html: string): SinaPriceHistoryRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r[0]?.includes('成交价') && r.some(c => c.includes('占比'))),
  )
  if (!table) return []

  const headerIdx = table.findIndex(r => r[0]?.includes('成交价'))
  const out: SinaPriceHistoryRow[] = []
  for (const row of table.slice(headerIdx + 1)) {
    if (row.length < 3 || !/^[\d.]+$/.test(row[0] ?? '')) continue
    out.push({
      price: row[0]!,
      volume: row[1] ?? '',
      ratio: row[2] ?? '',
    })
  }
  return out
}
