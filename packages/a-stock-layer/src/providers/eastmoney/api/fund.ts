/**
 * 东方财富 / 天天基金 F10 公募基金档案接口。
 *
 * 设计原则：仅请求用户打开基金档案页时浏览器会触发的公开 URL，
 * 不伪造登录态、不绕过鉴权、不使用 push2 的 `ut` 参数（见 types.ts EM_UT）。
 *
 * 与官方前端对应关系（j5.dfcfw.com/sc/js/web/f10_min_*.js / 品种页 HTML）：
 * - fund.eastmoney.com/pingzhongdata/{code}.js — 品种页图表数据（与 /{code}.html 同载）
 * - fundf10.eastmoney.com/jbgk_{code}.html — 基本概况 HTML
 * - fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc — 持仓 Tab Ajax
 * - api.fund.eastmoney.com/f10/lsjz — 历史净值 JSONP（f10_min 内 f10/lsjz，callback=?）
 */
import { isEmptyHttpResponseBody } from '@opptrix/shared'
import { normalizeCode } from '../../../utils/helpers.js'
import { eastmoneyHttp, EastmoneyHttpError } from './http.js'
import {
  EM_FUND_API,
  EM_FUND_ARCHIVES,
  EM_FUND_F10_REFERER,
  EM_FUND_HOME_REFERER,
  EM_FUND_PINGZHONG,
} from './types.js'

export type EmFundLsjzRow = {
  FSRQ?: string
  DWJZ?: string
  LJJZ?: string
  JZZZL?: string
  SGZT?: string
  SHZT?: string
}

export type EmFundLsjzResponse = {
  Data?: {
    LSJZList?: EmFundLsjzRow[]
    TotalCount?: number
  }
  ErrCode?: number
  TotalCount?: number
}

export type EmPingzhongData = {
  fS_name?: string
  fS_code?: string
  fund_Rate?: string
  fund_sourceRate?: string
  fund_minsg?: string
  stockCodesNew?: string[]
  zqCodesNew?: string
  syl_1y?: string
  syl_3y?: string
  syl_6y?: string
  syl_1n?: string
  Data_netWorthTrend?: unknown
  Data_ACWorthTrend?: unknown
  Data_assetAllocation?: Record<string, unknown>
  Data_currentFundManager?: unknown[]
  Data_performanceEvaluation?: Record<string, unknown>
  Data_holderStructure?: Record<string, unknown>
  Data_fluctuationScale?: Record<string, unknown>
  Data_fundSharesPositions?: unknown
  swithSameType?: unknown
}

async function fetchEmFundText(
  url: string,
  referer: string,
  encoding: 'utf-8' | 'gbk' = 'utf-8',
): Promise<string> {
  const resp = await eastmoneyHttp.fetch(url, {
    headers: { Referer: referer },
  })
  if (!resp.ok) throw new EastmoneyHttpError(resp.status)
  const buf = await resp.arrayBuffer()
  const text = new TextDecoder(encoding).decode(buf)
  if (isEmptyHttpResponseBody(text)) {
    throw new EastmoneyHttpError(resp.status, 'empty body')
  }
  return text
}

function parseBalancedJson(text: string, start: number): unknown {
  const open = text[start]
  const close = open === '[' ? ']' : open === '{' ? '}' : null
  if (!close) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === open) depth++
    if (c === close) {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function extractJsStringVar(raw: string, name: string): string | undefined {
  const re = new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`)
  const m = re.exec(raw)
  return m?.[1]
}

function extractJsJsonVar(raw: string, name: string): unknown {
  const re = new RegExp(`var\\s+${name}\\s*=`)
  const m = re.exec(raw)
  if (!m) return undefined
  let i = m.index + m[0].length
  while (i < raw.length && /\s/.test(raw[i])) i++
  const ch = raw[i]
  if (ch === '"' || ch === "'") {
    const end = raw.indexOf(ch, i + 1)
    return end > i ? raw.slice(i + 1, end) : undefined
  }
  if (ch === '[' || ch === '{') return parseBalancedJson(raw, i)
  const semi = raw.indexOf(';', i)
  const slice = raw.slice(i, semi > i ? semi : i + 32).trim()
  const num = Number(slice)
  if (Number.isFinite(num) && slice === String(num)) return num
  return slice || undefined
}

/** 解析 pingzhongdata/{code}.js 中的档案与图表变量 */
export function parseEmPingzhongData(raw: string): EmPingzhongData {
  const out: EmPingzhongData = {}
  const stringKeys = ['fS_name', 'fS_code', 'fund_Rate', 'fund_sourceRate', 'fund_minsg', 'zqCodesNew', 'syl_1y', 'syl_3y', 'syl_6y', 'syl_1n']
  for (const key of stringKeys) {
    const v = extractJsStringVar(raw, key)
    if (v !== undefined) (out as Record<string, unknown>)[key] = v
  }
  const jsonKeys = [
    'stockCodesNew',
    'Data_netWorthTrend',
    'Data_ACWorthTrend',
    'Data_assetAllocation',
    'Data_currentFundManager',
    'Data_performanceEvaluation',
    'Data_holderStructure',
    'Data_fluctuationScale',
    'Data_fundSharesPositions',
    'swithSameType',
  ]
  for (const key of jsonKeys) {
    const v = extractJsJsonVar(raw, key)
    if (v !== undefined) (out as Record<string, unknown>)[key] = v
  }
  return out
}

export async function fetchEmPingzhongData(code: string): Promise<EmPingzhongData | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  const raw = await fetchEmFundText(
    `${EM_FUND_PINGZHONG}/${bare}.js`,
    EM_FUND_HOME_REFERER,
    'utf-8',
  )
  return parseEmPingzhongData(raw)
}

function stripJsonpCallback(raw: string): string {
  const t = raw.trim()
  const i = t.indexOf('(')
  const j = t.lastIndexOf(')')
  if (i >= 0 && j > i) return t.slice(i + 1, j)
  return t
}

export async function fetchEmFundNavPage(
  code: string,
  pageIndex = 1,
  pageSize = 100,
): Promise<EmFundLsjzResponse | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  const qs = new URLSearchParams({
    callback: '?',
    fundCode: bare,
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
    startDate: '',
    endDate: '_',
  })
  const raw = await fetchEmFundText(
    `${EM_FUND_API}/lsjz?${qs}`,
    EM_FUND_F10_REFERER,
    'utf-8',
  )
  try {
    return JSON.parse(stripJsonpCallback(raw)) as EmFundLsjzResponse
  } catch {
    return null
  }
}

export type EmJbgkFields = Record<string, string>

/** 解析 jbgk 基本概况页表格字段（GBK HTML） */
export function parseEmJbgkHtml(html: string): EmJbgkFields {
  const fields: EmJbgkFields = {}
  const tableMatch = html.match(/<table class="info w790"[\s\S]*?<\/table>/i)
  if (!tableMatch) return fields
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(tableMatch[0])) !== null) {
    const cells: string[] = []
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) cells.push(text)
    }
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const label = cells[i].replace(/：$/, '')
      const value = cells[i + 1]
      if (label && value) fields[label] = value
    }
  }
  return fields
}

const JBGK_SECTION_LABELS = [
  '投资目标',
  '投资理念',
  '投资范围',
  '投资策略',
  '分红政策',
  '风险收益特征',
] as const

/** 解析 jbgk 正文段落（投资目标 / 策略等） */
export function parseEmJbgkSections(html: string): Record<string, string> {
  const sections: Record<string, string> = {}
  for (const label of JBGK_SECTION_LABELS) {
    const re = new RegExp(
      `<label class="left">${label}</label>[\\s\\S]*?<p>([\\s\\S]*?)</p>`,
      'i',
    )
    const m = re.exec(html)
    if (!m) continue
    const text = m[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) sections[label] = text
  }
  return sections
}

export async function fetchEmJbgkProfile(code: string): Promise<{
  fields: EmJbgkFields
  sections: Record<string, string>
} | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  const html = await fetchEmFundText(
    `https://fundf10.eastmoney.com/jbgk_${bare}.html`,
    EM_FUND_F10_REFERER,
    'gbk',
  )
  return {
    fields: parseEmJbgkHtml(html),
    sections: parseEmJbgkSections(html),
  }
}

export type EmJjccHoldingRaw = {
  symbol: string
  name: string
  weight?: string
  shares?: string
  marketValue?: string
  reportDate?: string
}

function parseEmJjccContent(htmlFragment: string): EmJjccHoldingRaw[] {
  const rows: EmJjccHoldingRaw[] = []
  const dateMatch = htmlFragment.match(/(\d{4}-\d{2}-\d{2})/)
  const reportDate = dateMatch?.[1]
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(htmlFragment)) !== null) {
    const rowHtml = rowMatch[1]
    if (rowHtml.includes('<th')) continue
    const cells: string[] = []
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(
        cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
    }
    if (cells.length < 6) continue
    const symbolCell = rowHtml.match(/unify\/r\/[01]\.(\d{6})/)
    const symbol = symbolCell?.[1] ?? cells[1].replace(/\D/g, '').slice(-6)
    const name = cells[2] || ''
    if (!symbol && !name) continue
    rows.push({
      symbol,
      name,
      weight: cells[4],
      shares: cells[5],
      marketValue: cells[6],
      reportDate,
    })
  }
  return rows
}

export function parseEmArchivesApidata(raw: string): string | null {
  const marker = raw.indexOf('content:"')
  if (marker < 0) return null
  let i = marker + 'content:"'.length
  let out = ''
  while (i < raw.length) {
    const c = raw[i]
    if (c === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1]
      if (next === '"') {
        out += '"'
        i += 2
        continue
      }
      if (next === 'n') {
        out += '\n'
        i += 2
        continue
      }
      if (next === 'r') {
        out += '\r'
        i += 2
        continue
      }
      if (next === 't') {
        out += '\t'
        i += 2
        continue
      }
      if (next === '/') {
        out += '/'
        i += 2
        continue
      }
      out += next
      i += 2
      continue
    }
    if (c === '"') break
    out += c
    i++
  }
  return out || null
}

export function emReportPeriodToArchivesArgs(reportDate: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(reportDate.trim())
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) }
}

export async function fetchEmFundArchivesJjcc(
  code: string,
  year: number,
  month: number,
): Promise<EmJjccHoldingRaw[]> {
  const bare = normalizeCode(code)
  if (!bare) return []
  const qs = new URLSearchParams({
    type: 'jjcc',
    code: bare,
    topline: '50',
    year: String(year),
    month: String(month),
  })
  const raw = await fetchEmFundText(
    `${EM_FUND_ARCHIVES}?${qs}`,
    EM_FUND_F10_REFERER,
    'gbk',
  )
  const content = parseEmArchivesApidata(raw)
  if (!content) return []
  return parseEmJjccContent(content)
}

/** 从 pingzhongdata 资产配置报告期推断持仓，优先完整季报明细表 */
export async function fetchEmFundLatestHoldings(code: string): Promise<EmJjccHoldingRaw[]> {
  const ping = await fetchEmPingzhongData(code)
  const categories = ping?.Data_assetAllocation?.categories
  let bestWeighted: EmJjccHoldingRaw[] = []
  let jjccAttempts = 0
  const MAX_JJCC_ATTEMPTS = 3
  if (Array.isArray(categories) && categories.length) {
    for (let i = categories.length - 1; i >= 0; i--) {
      if (jjccAttempts >= MAX_JJCC_ATTEMPTS) break
      const period = emReportPeriodToArchivesArgs(String(categories[i] ?? ''))
      if (!period) continue
      jjccAttempts += 1
      const rows = await fetchEmFundArchivesJjcc(code, period.year, period.month)
      const weighted = rows.filter(r => String(r.weight ?? '').includes('%'))
      if (weighted.length >= 5 && weighted.length === rows.length) return rows
      if (weighted.length > bestWeighted.length) bestWeighted = weighted
    }
    if (bestWeighted.length) return bestWeighted
  }
  for (const month of [12, 9, 6, 3]) {
    if (jjccAttempts >= MAX_JJCC_ATTEMPTS) break
    jjccAttempts += 1
    const rows = await fetchEmFundArchivesJjcc(code, new Date().getFullYear(), month)
    const weighted = rows.filter(r => String(r.weight ?? '').includes('%'))
    if (weighted.length >= 5 && weighted.length === rows.length) return rows
    if (weighted.length > bestWeighted.length) bestWeighted = weighted
  }
  return bestWeighted
}
