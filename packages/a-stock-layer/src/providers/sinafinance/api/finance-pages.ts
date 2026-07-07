import { normalizeCode } from '../../../utils/helpers.js'
import { fetchText } from './http.js'
import { parseHtmlTables, stripHtmlTags } from './html.js'
import type {
  SinaBulletinRow,
  SinaDividendRow,
  SinaPivotFinancialTable,
  SinaStockStructureRow,
} from './types.js'
import { buildSinaCorpReferer } from './types.js'

const CORP_BASE = 'https://vip.stock.finance.sina.com.cn/corp/go.php'

function stockId(code: string): string {
  return normalizeCode(code)
}

async function fetchFinancePage(code: string, path: string): Promise<string> {
  const id = stockId(code)
  const url = `${CORP_BASE}/${path.replaceAll('{id}', id)}`
  return fetchText(url, 'gbk', buildSinaCorpReferer(id))
}

/** 分红送配 */
export async function fetchSinaShareBonusHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vISSUE_ShareBonus/stockid/{id}.phtml')
}

export function parseSinaDividendsFromHtml(html: string): SinaDividendRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('公告日期')) && r.some(c => c.includes('除权除息'))),
  )
  if (!table) return []

  let headerIdx = -1
  for (let i = 0; i < table.length; i += 1) {
    const row = table[i]!
    if (row.some(c => c.includes('公告日期')) && row.some(c => c.includes('除权除息'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return []

  const out: SinaDividendRow[] = []
  for (const row of table.slice(headerIdx + 2)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0] ?? '')) continue
    out.push({
      announceDate: row[0]!,
      stockBonus: row[1],
      transferBonus: row[2],
      cashBonus: row[3],
      progress: row[4],
      exDate: row[5] === '--' ? undefined : row[5],
      recordDate: row[6] === '--' ? undefined : row[6],
      listingDate: row[7] === '--' ? undefined : row[7],
    })
  }
  return out
}

/** 财务指标透视表 */
export async function fetchSinaFinancialGuideHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vFD_FinancialGuideLine/stockid/{id}/displaytype/4.phtml')
}

/** 利润表 */
export async function fetchSinaProfitStatementHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vFD_ProfitStatement/stockid/{id}/ctrl/part/displaytype/4.phtml')
}

/** 资产负债表 */
export async function fetchSinaBalanceSheetHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vFD_BalanceSheet/stockid/{id}/ctrl/part/displaytype/4.phtml')
}

/** 现金流量表 */
export async function fetchSinaCashFlowHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vFD_CashFlow/stockid/{id}/ctrl/part/displaytype/4.phtml')
}

/** 股本结构 */
export async function fetchSinaStockStructureHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vCI_StockStructure/stockid/{id}.phtml')
}

/** 公司章程 */
export async function fetchSinaCorpRuleHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vCI_CorpRule/stockid/{id}.phtml')
}

/** 业绩预告 */
export async function fetchSinaAchievementNoticeHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vFD_AchievementNotice/stockid/{id}.phtml')
}

/** 杜邦分析（侧栏使用 displaytype/10） */
export async function fetchSinaDupontHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vFD_DupontAnalysis/stockid/{id}/displaytype/10.phtml')
}

export interface SinaPerfForecastRaw {
  announceDate?: string
  reportPeriod?: string
  forecastType?: string
  summary?: string
  content?: string
  priorEps?: string
}

export function parseSinaAchievementNoticeFromHtml(html: string): SinaPerfForecastRaw[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r[0] === '公告日期') && rows.some(r => r[0] === '报告期'),
  )
  if (!table) return []

  const out: SinaPerfForecastRaw[] = []
  let current: SinaPerfForecastRaw = {}

  const flush = () => {
    if (current.announceDate) out.push({ ...current })
    current = {}
  }

  for (const row of table) {
    if (row.length < 2) continue
    const [key, value] = row
    if (key === '公告日期') {
      if (current.announceDate) flush()
      current.announceDate = value
      continue
    }
    if (key === '报告期') current.reportPeriod = value
    else if (key === '类型') current.forecastType = value
    else if (key === '业绩预告摘要') current.summary = value
    else if (key === '业绩预告内容') current.content = value
    else if (key === '上年同期每股收益(元)') current.priorEps = value
  }
  flush()
  return out
}

/** 年报 / 季报公告列表 */
export async function fetchSinaBulletinHtml(
  code: string,
  pageType: 'ndbg' | 'zqbg' | 'yjdbg' | 'sjdbg' = 'ndbg',
): Promise<string> {
  return fetchFinancePage(code, `vCB_Bulletin/stockid/{id}/page_type/${pageType}.phtml`)
}

/**
 * 解析新浪 F10 财务透视表：首行 `报告日期` + 指标行。
 * 分组标题行（如「每股指标」）会被跳过。
 */
export function parseSinaPivotFinancialTable(html: string): SinaPivotFinancialTable | null {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r[0] === '报告日期' || r[0] === '报表日期'),
  )
  if (!table) return null

  const headerIdx = table.findIndex(r => r[0] === '报告日期' || r[0] === '报表日期')
  const header = table[headerIdx]
  if (!header || header.length < 2) return null

  const periods = header.slice(1).map(p => p.replace(/\s+/g, ''))
  const metrics: Record<string, string[]> = {}

  for (const row of table.slice(headerIdx + 1)) {
    if (!row[0] || row.length < 2) continue
    const name = row[0].replace(/^[・\s]+/, '').trim()
    if (!name || name === '利润表' || name === '资产负债表' || name === '现金流量表') continue
    if (row.length === 1 || (row.length === 2 && !/[\d,.-]/.test(row[1] ?? ''))) continue
    if (!/[\d,.-]/.test(row[1] ?? '') && name.length < 8) continue
    metrics[name] = row.slice(1)
  }

  return periods.length ? { periods, metrics } : null
}

export function parseSinaStockStructureFromHtml(html: string): SinaStockStructureRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('总股本'))),
  )
  if (!table) return []

  const dates = table.find(r => r[0]?.includes('变动日期'))?.slice(1) ?? []
  const announceDates = table.find(r => r[0]?.includes('公告日期'))?.slice(1) ?? []
  const reasons = table.find(r => r[0]?.includes('变动原因'))?.slice(1) ?? []
  const totals = table.find(r => r[0]?.includes('总股本'))?.slice(1) ?? []
  const floats = table.find(r => r.some(c => c.includes('流通A股')))?.slice(1) ?? []

  const out: SinaStockStructureRow[] = []
  for (let i = 0; i < dates.length; i += 1) {
    out.push({
      changeDate: dates[i],
      announceDate: announceDates[i],
      changeReason: reasons[i],
      totalShares: totals[i],
      floatShares: floats[i],
    })
  }
  return out
}

export function parseSinaBulletinListFromHtml(html: string, pageType?: string): SinaBulletinRow[] {
  const m = html.match(/class="datelist"[^>]*>([\s\S]*?)<\/div>/i)
  if (!m?.[1]) return []
  const text = stripHtmlTags(m[1]).replace(/\u00a0/g, ' ')
  const out: SinaBulletinRow[] = []
  const re = /(\d{4}-\d{2}-\d{2})\s*([\s\S]*?)(?=\d{4}-\d{2}-\d{2}|$)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const title = match[2]!.trim()
    if (!title) continue
    out.push({
      date: match[1]!,
      title,
      pageType,
    })
  }
  return out
}

export function parseSinaCorpRuleFromHtml(html: string): { title?: string; content?: string } {
  const titleMatch = html.match(/公司章程―[\s\S]*?>([^<]+)</i)
  const contentMatch = html.match(/class="blk_container"[^>]*>([\s\S]*?)<\/div>/i)
  const content = contentMatch?.[1] ? stripHtmlTags(contentMatch[1]).trim() : undefined
  return {
    title: titleMatch?.[1]?.trim(),
    content: content || undefined,
  }
}

export type SinaBulletinPageType = 'ndbg' | 'zqbg' | 'yjdbg' | 'sjdbg'

/** 新股发行（IPO）页 */
export async function fetchSinaNewStockHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vISSUE_NewStock/stockid/{id}.phtml')
}

/** 增发情况页 */
export async function fetchSinaAddStockHtml(code: string): Promise<string> {
  return fetchFinancePage(code, 'vISSUE_AddStock/stockid/{id}.phtml')
}

/**
 * 解析 F10 双栏键值表（新股发行、增发等）。
 * 在多个表格中选取 IPO 特征得分最高者，避免误匹配侧栏导航。
 */
export function parseSinaTwoColumnIssueFromHtml(html: string): Record<string, string> {
  const NAV_SKIP = /^(股市必察|每日提示|公司快报|新股上市|公司简介|股本结构|分红配股)/
  let best: Record<string, string> = {}
  let bestScore = 0

  for (const table of parseHtmlTables(html)) {
    const out: Record<string, string> = {}
    let score = 0
    for (const row of table) {
      if (row.length < 2 || !row[0] || !row[1]) continue
      const key = row[0].replace(/[：:]\s*$/, '').trim()
      if (!key || key.length > 48 || NAV_SKIP.test(key)) continue
      out[key] = row[1]!
      if (/发行价|首发前总股本|上市地|主承销商|发行方式/.test(key)) score += 3
      else if (/募集资金|承销|市盈率/.test(key)) score += 1
    }
    if (score > bestScore) {
      best = out
      bestScore = score
    }
  }
  return bestScore >= 3 ? best : {}
}

/** 增发历史表（含公告日期列时） */
export function parseSinaAddStockRowsFromHtml(html: string): Array<Record<string, string>> {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('公告日期')) && r.some(c => c.includes('价格') || c.includes('增发'))),
  )
  if (!table) return []
  const headerIdx = table.findIndex(r => r.some(c => c.includes('公告日期')))
  const headers = table[headerIdx] ?? []
  const out: Array<Record<string, string>> = []
  for (const row of table.slice(headerIdx + 1)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0] ?? '')) continue
    const item: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (h && row[i] != null) item[h] = row[i]!
    })
    out.push(item)
  }
  return out
}
