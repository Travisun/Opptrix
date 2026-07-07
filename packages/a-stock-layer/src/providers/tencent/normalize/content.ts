import type { MoneyFlow, NewsItem, StockListItem, StockProfile } from '../../../core/schema.js'
import { normalizeCode, resolveMarket, safeFloat } from '../../../utils/helpers.js'
import {
  buildTencentNoticeDetailUrl,
  buildTencentReportDetailUrl,
  fromTencentSymbol,
  toTencentSymbol,
} from '../api/proxy.js'
import type {
  TencentBoardRankRow,
  TencentHyNewsRow,
  TencentJiankuangData,
  TencentNoticeRow,
  TencentResearchReportRow,
  TencentTodayFundFlow,
} from '../api/types.js'

function ymdFromDatetime(raw: unknown): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  return text.slice(0, 10)
}

/**
 * 板块排行 → {@link StockListItem}。
 */
export function mapTencentBoardRankRows(rows: TencentBoardRankRow[]): StockListItem[] {
  return rows.map(row => {
    const code = fromTencentSymbol(String(row.code ?? ''))
    const market = resolveMarket(code)
    const industry = String(row.stock_type ?? '').replace(/^GP-A-/, '') || ''
    return {
      code,
      name: String(row.name ?? code),
      industry,
      market,
    }
  }).filter(item => item.code && item.name)
}

/**
 * 研究报告列表 → {@link NewsItem}（`type=研报`，含详情 URL）。
 */
export function mapTencentResearchReportRows(
  code: string,
  rows: TencentResearchReportRow[],
): NewsItem[] {
  const bare = normalizeCode(code)
  const out: NewsItem[] = []
  for (const row of rows) {
    const id = String(row.id ?? '').trim()
    const title = String(row.title ?? '').trim()
    if (!id || !title) continue
    out.push({
      code: bare,
      title,
      date: ymdFromDatetime(row.time),
      url: buildTencentReportDetailUrl(id),
      source: '腾讯证券',
      type: '研报',
      category: row.typeStr || row.tzpj || undefined,
    })
  }
  return out
}

/**
 * 公告列表 → {@link NewsItem}（`type=公告`）。
 */
export function mapTencentNoticeRows(
  code: string,
  rows: TencentNoticeRow[],
): NewsItem[] {
  const symbol = toTencentSymbol(code)
  const bare = normalizeCode(code)
  const out: NewsItem[] = []
  for (const row of rows) {
    const id = String(row.id ?? '').trim()
    const title = String(row.title ?? '').trim()
    if (!id || !title) continue
    const external = String(row.url ?? '').trim()
    out.push({
      code: bare,
      title,
      date: ymdFromDatetime(row.time),
      url: external || buildTencentNoticeDetailUrl(symbol, id),
      source: '腾讯证券',
      type: '公告',
    })
  }
  return out
}

/**
 * 行业关联新闻 → {@link NewsItem}（`type=新闻`）。
 */
export function mapTencentHyNewsRows(
  code: string,
  rows: TencentHyNewsRow[],
): NewsItem[] {
  const bare = normalizeCode(code)
  const out: NewsItem[] = []
  for (const row of rows) {
    const title = String(row.title ?? '').trim()
    if (!title) continue
    const url = String(row.url ?? '').trim()
    out.push({
      code: bare,
      title,
      date: ymdFromDatetime(row.pub_time),
      url: url || undefined,
      source: '腾讯证券',
      type: '新闻',
    })
  }
  return out
}

/**
 * 公司简况 → {@link StockProfile}（单条）。
 */
export function mapTencentJiankuangProfile(
  code: string,
  data: TencentJiankuangData,
): StockProfile | null {
  const bare = normalizeCode(code)
  const gsjj = data.gsjj
  if (!gsjj) return null

  const plateNames = (gsjj.plate ?? [])
    .map(p => String(p.name ?? '').trim())
    .filter(Boolean)
  const conceptNames = (gsjj.concept ?? [])
    .map(c => String(c.name ?? '').trim())
    .filter(Boolean)

  const metrics = data.zyzb?.detail ?? {}

  return {
    code: bare,
    name: gsjj.gsmz ? String(gsjj.gsmz).replace(/股份有限公司$/, '') : undefined,
    orgName: gsjj.gsmz,
    industry: plateNames[0],
    concepts: conceptNames.length ? conceptNames : undefined,
    listingDate: ymdFromDatetime(gsjj.riqi) || undefined,
    mainBusiness: gsjj.yw,
    orgProfile: gsjj.yw,
    province: gsjj.dy,
    issuePrice: safeFloat(String(gsjj.jg ?? '').replace(/元$/, '')),
    totalMarketCap: null,
    circulatingMarketCap: null,
    businessScope: [
      metrics.date ? `报告期 ${metrics.date}` : '',
      metrics.mgsy ? `每股收益 ${metrics.mgsy}` : '',
      metrics.jlr ? `净利润 ${metrics.jlr}` : '',
      metrics.jlrzzl ? `净利润同比 ${metrics.jlrzzl}` : '',
      metrics.jzcsyl ? `ROE ${metrics.jzcsyl}` : '',
      metrics.zcfzl ? `资产负债率 ${metrics.zcfzl}` : '',
    ].filter(Boolean).join('；') || undefined,
  }
}

/**
 * 当日主力资金 → {@link MoneyFlow}（单日快照）。
 */
export function mapTencentTodayFundFlow(
  code: string,
  block: TencentTodayFundFlow | undefined,
  date = new Date().toISOString().slice(0, 10),
): MoneyFlow[] {
  if (!block) return []
  const bare = normalizeCode(code)
  const mainNet = safeFloat(block.mainNetIn)
  const superLarge = safeFloat(block.superFlow)
  const large = safeFloat(block.bigFlow)
  const medium = safeFloat(block.normalFlow)
  const small = safeFloat(block.smallFlow)
  if (mainNet == null && superLarge == null && large == null) return []

  return [{
    code: bare,
    date,
    mainNet,
    superLargeNet: superLarge,
    largeNet: large,
    mediumNet: medium,
    smallNet: small,
    mainNetPct: null,
  }]
}

/**
 * 归一化 `news` 的 `newsType` 入参。
 */
export function resolveTencentNewsChannel(newsType = ''): 'research' | 'notice' | 'industry' {
  const t = newsType.trim().toLowerCase()
  if (!t || t === 'all') return 'industry'
  if (['research', 'report', 'yjbg', '研报', '机构研报'].includes(t)) return 'research'
  if (['notice', 'announcement', 'gg', '公告'].includes(t)) return 'notice'
  return 'industry'
}
