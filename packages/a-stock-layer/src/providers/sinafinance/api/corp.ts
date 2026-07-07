import { normalizeCode } from '../../../utils/helpers.js'
import { fetchText } from './http.js'
import type {
  SinaConceptPlateRow,
  SinaCorpInfoRaw,
  SinaExecutiveRow,
  SinaFundHoldingBlock,
  SinaIndexMembershipRow,
  SinaRelatedSecurityRow,
  SinaShareholderMeta,
  SinaShareholderRow,
} from './types.js'
import {
  extractMarketNodes,
  parseHtmlTables,
  parseLabelValuePairs,
  stripHtmlTags,
} from './html.js'
import { buildSinaCorpReferer } from './types.js'

const CORP_BASE = 'https://vip.stock.finance.sina.com.cn/corp/go.php'

function stockId(code: string): string {
  return normalizeCode(code)
}

async function fetchCorpPage(code: string, path: string): Promise<string> {
  const id = stockId(code)
  const url = `${CORP_BASE}/${path.replaceAll('{id}', id)}`
  return fetchText(url, 'gbk', buildSinaCorpReferer(id))
}

const CORP_LABELS = [
  '公司名称：',
  '公司英文名称：',
  '上市市场：',
  '上市日期：',
  '发行价格：',
  '主承销商：',
  '成立日期：',
  '注册资本：',
  '组织形式：',
  '董事会秘书：',
  '公司电话：',
  '公司传真：',
  '公司电子邮箱：',
  '公司网址：',
  '注册地址：',
  '办公地址：',
  '主营业务：',
]

/** 公司简介页 HTML */
export async function fetchSinaCorpInfoHtml(code: string): Promise<string> {
  return fetchCorpPage(code, 'vCI_CorpInfo/stockid/{id}.phtml')
}

/** 公司高管页 HTML */
export async function fetchSinaCorpManagerHtml(code: string): Promise<string> {
  return fetchCorpPage(code, 'vCI_CorpManager/stockid/{id}.phtml')
}

/** 主要股东页 HTML */
export async function fetchSinaStockHolderHtml(code: string): Promise<string> {
  return fetchCorpPage(code, 'vCI_StockHolder/stockid/{id}/displaytype/30.phtml')
}

/** 流通股东页 HTML */
export async function fetchSinaCirculateStockHolderHtml(code: string): Promise<string> {
  return fetchCorpPage(code, 'vCI_CirculateStockHolder/stockid/{id}/displaytype/30.phtml')
}

/** 基金持股页 HTML */
export async function fetchSinaFundHolderHtml(code: string): Promise<string> {
  return fetchCorpPage(code, 'vCI_FundStockHolder/stockid/{id}/displaytype/30.phtml')
}

/** 所属行业 menu_num=2 / 概念 menu_num=5 */
export async function fetchSinaCorpOtherInfoHtml(
  code: string,
  menuNum: 2 | 5,
): Promise<string> {
  return fetchCorpPage(code, `vCI_CorpOtherInfo/stockid/{id}/menu_num/${menuNum}.phtml`)
}

/** 相关证券 / 指数 / 系别 */
export async function fetchSinaCorpRelatedHtml(code: string): Promise<string> {
  return fetchCorpPage(code, 'vCI_CorpXiangGuan/stockid/{id}.phtml')
}

export function parseSinaCorpInfoFromHtml(html: string): SinaCorpInfoRaw {
  const pairs = parseLabelValuePairs(html, CORP_LABELS)
  const profileMatch = html.match(/公司简介：\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
  const orgProfile = profileMatch?.[1]
    ? stripHtmlTags(profileMatch[1]).replace(/\s+/g, ' ').trim()
    : undefined
  return { ...pairs, orgProfile }
}

export function parseSinaExecutivesFromHtml(html: string): SinaExecutiveRow[] {
  for (const table of parseHtmlTables(html)) {
    const headerIdx = table.findIndex(r => r[0] === '姓 名' || r[0] === '姓名')
    if (headerIdx < 0) continue
    const out: SinaExecutiveRow[] = []
    for (const row of table.slice(headerIdx + 1)) {
      if (row.length < 4) continue
      const [name, title, startDate, endDate] = row
      if (!name || !/[\u4e00-\u9fa5]/.test(name)) continue
      if (name.includes('董事会') && name.includes('起始日期')) continue
      out.push({ name, title, startDate, endDate })
    }
    if (out.length) return out
  }
  return []
}

export function parseSinaShareholdersFromHtml(html: string): {
  meta: SinaShareholderMeta
  rows: SinaShareholderRow[]
} {
  const meta: SinaShareholderMeta = {}
  const asOf = html.match(/截至日期[\s\S]*?<td[^>]*>(\d{4}-\d{2}-\d{2})/i)
    ?? html.match(/截止日期[\s\S]*?<td[^>]*>(\d{4}-\d{2}-\d{2})/i)
  const announced = html.match(/公告日期[\s\S]*?<td[^>]*>(\d{4}-\d{2}-\d{2})/i)
  const total = html.match(/股东总数[\s\S]*?<td[^>]*>([^<]+)/i)
  if (asOf?.[1]) meta.asOfDate = asOf[1]
  if (announced?.[1]) meta.announceDate = announced[1]
  if (total?.[1]) meta.holderCount = stripHtmlTags(total[1])

  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('股东名称'))
      && r.some(c => c.includes('持股数量') || c.includes('占流通股'))),
  )
  const rows: SinaShareholderRow[] = []
  if (!table) return { meta, rows }

  const headerIdx = table.findIndex(r => r.some(c => c.includes('股东名称')))
  for (const row of table.slice(headerIdx + 1)) {
    if (!/^\d+$/.test(row[0] ?? '')) continue
    const [rank, name, shares, ratio, shareType] = row
    if (!name) continue
    rows.push({
      rank: Number(rank),
      name: name.replace(/[↑↓]/g, ''),
      shares: (shares ?? '').replace(/[↑↓]/g, ''),
      ratio: (ratio ?? '').replace(/[↑↓]/g, ''),
      shareType,
    })
  }
  return { meta, rows }
}

export function parseSinaFundHoldingsFromHtml(html: string): SinaFundHoldingBlock[] {
  const tables = parseHtmlTables(html)
  const blocks: SinaFundHoldingBlock[] = []
  let currentDate = ''

  for (const table of tables) {
    for (const row of table) {
      if (row[0] === '截止日期' && row[1]) {
        currentDate = row[1]
        continue
      }
      if (row[0] === '基金名称' || row.includes('基金代码')) continue
      if (row.length >= 5 && row[1] && /^\d{6}$/.test(row[1])) {
        blocks.push({
          asOfDate: currentDate,
          fundName: row[0]!,
          fundCode: row[1]!,
          shares: row[2],
          floatPct: row[3],
          marketValue: row[4],
          navPct: row[5],
        })
      }
    }
  }
  return blocks
}

export function parseSinaConceptPlatesFromHtml(html: string): SinaConceptPlateRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('概念板块'))),
  )
  const nodes = extractMarketNodes(html)
  const out: SinaConceptPlateRow[] = []
  if (!table) return out

  let nodeIdx = 0
  for (const row of table) {
    if (row.length < 2) continue
    if (row[0] === '概念板块' || row[0] === '所属概念板块') continue
    if (row[1] === '同概念个股' || row[1] === '点击查看') {
      const name = row[0]!
      out.push({
        name,
        node: nodes[nodeIdx],
        marketUrl: nodes[nodeIdx]
          ? `https://vip.stock.finance.sina.com.cn/mkt/#${nodes[nodeIdx]}`
          : undefined,
      })
      nodeIdx += 1
    }
  }
  return out
}

export function parseSinaIndustryFromHtml(html: string): string | undefined {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('所属行业板块'))),
  )
  if (!table) return undefined
  for (const row of table) {
    if (row.length >= 2 && row[1] === '点击查看' && row[0] !== '所属行业板块' && !row[0].includes('备注')) {
      return row[0]
    }
  }
  return undefined
}

export function parseSinaRelatedSecuritiesFromHtml(html: string): SinaRelatedSecurityRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r.some(c => c.includes('品种代码'))),
  )
  const out: SinaRelatedSecurityRow[] = []
  if (!table) return out
  const headerIdx = table.findIndex(r => r.some(c => c.includes('品种代码')))
  for (const row of table.slice(headerIdx + 1)) {
    if (row.length < 2) continue
    if (row[0] === '相关证券') continue
    out.push({ code: row[0]!, name: row[1]!, type: 'related' })
  }
  return out
}

export function parseSinaIndexMembershipFromHtml(html: string): SinaIndexMembershipRow[] {
  const table = parseHtmlTables(html).find(rows =>
    rows.some(r => r[0] === '指数名称' || r.includes('指数名称')),
  )
  const out: SinaIndexMembershipRow[] = []
  if (!table) return out
  const headerIdx = table.findIndex(r => r[0] === '指数名称' || r.includes('指数名称'))
  for (const row of table.slice(headerIdx + 1)) {
    if (row.length < 3) continue
    if (row[0] === '所属指数') continue
    out.push({
      indexName: row[0]!,
      indexCode: row[1],
      enterDate: row[2],
      exitDate: row[3],
    })
  }
  return out
}
