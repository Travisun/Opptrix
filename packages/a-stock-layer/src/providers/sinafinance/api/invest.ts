import { normalizeCode, secFullCode } from '../../../utils/helpers.js'
import { fetchText } from './http.js'
import { parseHtmlTables, stripHtmlTags } from './html.js'
import type {
  SinaBlockTradeRow,
  SinaDragonTigerRow,
  SinaMarginTradingRow,
  SinaShareUnlockRow,
} from './types.js'
import { SINA_REFERER } from './types.js'

const INVEST_BASE = 'https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind'

async function fetchInvestHtml(path: string): Promise<string> {
  return fetchText(`${INVEST_BASE}/${path}`, 'gbk', SINA_REFERER)
}

/** 限售解禁 */
export async function fetchSinaShareUnlockHtml(code: string): Promise<string> {
  const symbol = secFullCode(code)
  return fetchInvestHtml(`xsjj/index.phtml?symbol=${symbol}`)
}

export function parseSinaShareUnlockFromHtml(html: string): SinaShareUnlockRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('解禁日期'))),
  )
  if (!table) return []
  const headerIdx = table.findIndex(r => r.some(c => c.includes('解禁日期')))
  const out: SinaShareUnlockRow[] = []
  for (const row of table.slice(headerIdx + 1)) {
    if (row.length < 4 || !/^\d{6}$/.test(row[0] ?? '')) continue
    out.push({
      code: row[0]!,
      name: row[1] ?? '',
      unlockDate: row[2] ?? '',
      unlockShares: row[3],
      unlockMarketValue: row[4],
      batch: row[5],
      announceDate: row[6]?.replace(/--.*/, '').trim(),
    })
  }
  return out
}

/** 大宗交易 */
export async function fetchSinaBlockTradeHtml(
  code: string,
  bdate = '',
  edate = '',
): Promise<string> {
  const symbol = secFullCode(code)
  const end = edate || new Date().toISOString().slice(0, 10)
  const start = bdate || `${end.slice(0, 4)}-01-01`
  return fetchInvestHtml(`dzjy/index.phtml?symbol=${symbol}&bdate=${start}&edate=${end}`)
}

export function parseSinaBlockTradesFromHtml(html: string): SinaBlockTradeRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('成交价格'))),
  )
  if (!table) return []
  const headerIdx = table.findIndex(r => r.some(c => c.includes('成交价格')))
  const out: SinaBlockTradeRow[] = []
  for (const row of table.slice(headerIdx + 1)) {
    if (row.length < 5) continue
    const code = row[1]?.replace(/\D/g, '').slice(-6)
    if (!code || code.length !== 6) continue
    out.push({
      tradeDate: row[0] ?? '',
      code,
      name: row[2] ?? '',
      price: row[3],
      volume: row[4],
      amount: row[5],
      buyer: row[6],
      seller: row[7],
    })
  }
  return out
}

/** 龙虎榜（单日全市场） */
export async function fetchSinaDragonTigerHtml(tradeDate: string): Promise<string> {
  const date = tradeDate || new Date().toISOString().slice(0, 10)
  return fetchInvestHtml(`lhb/index.phtml?tradedate=${date}`)
}

export function parseSinaDragonTigerFromHtml(
  html: string,
  tradeDate: string,
): SinaDragonTigerRow[] {
  const out: SinaDragonTigerRow[] = []
  const blockRe =
    /lookup_n\.php\?q=(\d{6})[\s\S]*?>([^<]+)<\/a>[\s\S]*?>([^<]+)<\/a>[\s\S]*?([\d.]+)\s*[\s\S]*?([\d.]+)\s*[\s\S]*?([\d.]+)\s*[\s\S]*?([\d.]+)[\s\S]*?上榜原因：([^<\n\r]+)/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    const code = m[1]!
    const name = stripHtmlTags(m[3] ?? m[2] ?? '').trim()
    out.push({
      code,
      name,
      tradeDate,
      close: m[4],
      changePct: m[5],
      volume: m[6],
      amount: m[7],
      reason: stripHtmlTags(m[8] ?? '').replace(/\s+/g, ' ').trim(),
    })
  }
  return out
}

/** 融资融券个股 — 从全市场页筛选（页面较大） */
export async function fetchSinaMarginTradingHtml(): Promise<string> {
  return fetchInvestHtml('rzrq/index.phtml')
}

export function parseSinaMarginTradingForCode(
  html: string,
  code: string,
): SinaMarginTradingRow | null {
  const bare = normalizeCode(code)
  const rowRe = new RegExp(
    `<tr class="head">[\\s\\S]*?q=${bare}[\\s\\S]*?</tr>`,
    'i',
  )
  const m = html.match(rowRe)
  if (!m?.[0]) return null
  const cells: string[] = []
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let cm: RegExpExecArray | null
  while ((cm = cellRe.exec(m[0])) !== null) {
    cells.push(stripHtmlTags(cm[1]!))
  }
  if (cells.length < 6) return null
  return {
    code: bare,
    name: cells[2] ?? '',
    marginBalance: cells[3],
    marginBuy: cells[4],
    marginRepay: cells[5],
    shortBalance: cells[6],
    shortVolume: cells[7],
    shortSell: cells[8],
    shortRepay: cells[9],
  }
}

export function filterSinaDragonTigerByCode(
  rows: SinaDragonTigerRow[],
  code: string,
): SinaDragonTigerRow[] {
  const bare = normalizeCode(code)
  return rows.filter(r => normalizeCode(r.code) === bare)
}

export function buildSinaInvestStockReferer(code: string): string {
  return SINA_REFERER
}

export interface SinaInsiderTradeRow {
  code: string
  name?: string
  person?: string
  changeType?: string
  changeShares?: string
  avgPrice?: string
  changeAmount?: string
  sharesAfter?: string
  reason?: string
  changeDate?: string
  shareClass?: string
  relation?: string
  position?: string
}

export interface SinaStockCommentRow {
  code: string
  name?: string
  comment?: string
  price?: string
  change?: string
  changePct?: string
  prevClose?: string
  open?: string
}

/** 内部交易（董监高持股变动） */
export async function fetchSinaInsiderTradeHtml(
  code: string,
  bdate = '',
  edate = '',
): Promise<string> {
  const symbol = secFullCode(code)
  const end = edate || new Date().toISOString().slice(0, 10)
  const start = bdate || `${end.slice(0, 4)}-01-01`
  return fetchInvestHtml(`nbjy/index.phtml?symbol=${symbol}&bdate=${start}&edate=${end}`)
}

export function parseSinaInsiderTradesFromHtml(html: string): SinaInsiderTradeRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r[0] === '股票代码' && r.some(c => c.includes('变动人'))),
  )
  if (!table) return []

  const headerIdx = table.findIndex(r => r[0] === '股票代码')
  const headers = table[headerIdx] ?? []
  const out: SinaInsiderTradeRow[] = []

  for (const row of table.slice(headerIdx + 1)) {
    if (!/^\d{6}$/.test(row[0] ?? '')) continue
    const item: SinaInsiderTradeRow = { code: row[0]! }
    headers.forEach((h, i) => {
      const v = row[i]
      if (!h || v == null || v === '--') return
      if (h === '股票名称') item.name = v
      else if (h === '变动人') item.person = v
      else if (h === '变动类型') item.changeType = v
      else if (h === '变动股数') item.changeShares = v
      else if (h === '成交均价') item.avgPrice = v
      else if (h.includes('变动金额')) item.changeAmount = v
      else if (h.includes('变动后持股')) item.sharesAfter = v
      else if (h === '变动原因') item.reason = v
      else if (h === '变动日期') item.changeDate = v
      else if (h === '持股种类') item.shareClass = v
      else if (h.includes('董监高关系')) item.relation = v
      else if (h === '董监高职务') item.position = v
    })
    out.push(item)
  }
  return out
}

/** 千股千评 */
export async function fetchSinaStockCommentHtml(code: string): Promise<string> {
  const symbol = secFullCode(code)
  return fetchInvestHtml(`qgqp/index.phtml?symbol=${symbol}`)
}

export function parseSinaStockCommentFromHtml(html: string, code?: string): SinaStockCommentRow | null {
  const bare = code ? normalizeCode(code) : ''
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r[0] === '代码' && r.some(c => c.includes('千股千评'))),
  )
  if (!table) return null

  const headerIdx = table.findIndex(r => r[0] === '代码')
  for (const row of table.slice(headerIdx + 1)) {
    const rowCode = row[0]?.replace(/\D/g, '').slice(-6)
    if (!rowCode || rowCode.length !== 6) continue
    if (bare && rowCode !== bare) continue
    return {
      code: rowCode,
      name: row[1],
      comment: row[2],
      price: row[3],
      change: row[4],
      changePct: row[5],
      prevClose: row[6],
      open: row[7],
    }
  }
  return null
}
