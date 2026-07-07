import {
  fetchSinaCirculateStockHolderHtml,
  parseSinaShareholdersFromHtml,
} from './corp.js'
import {
  fetchSinaAchievementNoticeHtml,
  fetchSinaAddStockHtml,
  fetchSinaBalanceSheetHtml,
  fetchSinaBulletinHtml,
  fetchSinaCashFlowHtml,
  fetchSinaCorpRuleHtml,
  fetchSinaDupontHtml,
  fetchSinaFinancialGuideHtml,
  fetchSinaNewStockHtml,
  fetchSinaProfitStatementHtml,
  fetchSinaShareBonusHtml,
  fetchSinaStockStructureHtml,
  parseSinaAchievementNoticeFromHtml,
  parseSinaAddStockRowsFromHtml,
  parseSinaBulletinListFromHtml,
  parseSinaCorpRuleFromHtml,
  parseSinaDividendsFromHtml,
  parseSinaPivotFinancialTable,
  parseSinaStockStructureFromHtml,
  parseSinaTwoColumnIssueFromHtml,
  type SinaBulletinPageType,
} from './finance-pages.js'
import {
  fetchSinaBlockTradeHtml,
  fetchSinaDragonTigerHtml,
  fetchSinaInsiderTradeHtml,
  fetchSinaMarginTradingHtml,
  fetchSinaShareUnlockHtml,
  fetchSinaStockCommentHtml,
  filterSinaDragonTigerByCode,
  parseSinaBlockTradesFromHtml,
  parseSinaDragonTigerFromHtml,
  parseSinaInsiderTradesFromHtml,
  parseSinaMarginTradingForCode,
  parseSinaShareUnlockFromHtml,
  parseSinaStockCommentFromHtml,
} from './invest.js'
import {
  fetchSinaAllBulletinListHtml,
  fetchSinaBulletinDetailContent,
  parseSinaAllBulletinListFromHtml,
} from './bulletins.js'
import { fetchSinaBillDetails, fetchSinaPriceDistribution, fetchSinaPriceHistoryHtml, parseSinaPriceHistoryFromHtml } from './market.js'
import {
  mapSinaBillDetails,
  mapSinaBlockTrades,
  mapSinaBulletins,
  mapSinaCirculateShareholders,
  mapSinaDividends,
  mapSinaDragonTigerRows,
  mapSinaFinancialPivot,
  mapSinaFinancialPivotToStatements,
  mapSinaIpoInfo,
  mapSinaMarginTrading,
  mapSinaPerfForecast,
  mapSinaPriceDistribution,
  mapSinaShareUnlock,
  mapSinaStockStructure,
} from '../normalize/finance-ext.js'
import { mapSinaShareholders } from '../normalize/corp.js'
import type { Dividend, DragonTiger, FinancialSummary } from '../../../core/schema.js'
import { normalizeCode } from '../../../utils/helpers.js'
import { fetchSinaMajorShareholders } from './corp-service.js'
import { SINA_SOURCE } from '../types/responses.js'

export async function fetchSinaCirculateShareholders(code: string) {
  const html = await fetchSinaCirculateStockHolderHtml(code)
  const { meta, rows } = parseSinaShareholdersFromHtml(html)
  return mapSinaCirculateShareholders(code, meta, rows)
}

export async function fetchSinaAllShareholders(code: string) {
  const [major, float] = await Promise.all([
    fetchSinaMajorShareholders(code),
    fetchSinaCirculateShareholders(code),
  ])
  const tagMajor = (major ?? []).map(r =>
    r.type === 'holder' ? { ...r, holderCategory: 'major' } : r,
  )
  const tagFloat = (float ?? []).filter(r => r.type === 'holder')
  const merged = [...tagMajor, ...tagFloat]
  return merged.length ? merged : null
}

export async function fetchSinaDividendList(code: string): Promise<Dividend[]> {
  const html = await fetchSinaShareBonusHtml(code)
  return mapSinaDividends(code, parseSinaDividendsFromHtml(html))
}

export async function fetchSinaFinancialSummary(code: string): Promise<FinancialSummary[]> {
  const [guideHtml, profitHtml] = await Promise.all([
    fetchSinaFinancialGuideHtml(code),
    fetchSinaProfitStatementHtml(code),
  ])
  const guide = parseSinaPivotFinancialTable(guideHtml)
  const profit = parseSinaPivotFinancialTable(profitHtml)
  return mapSinaFinancialPivot(code, guide, profit)
}

export async function fetchSinaFinancialPivotRaw(
  code: string,
  sheet: 'guide' | 'profit' | 'balance' | 'cashflow' | 'dupont',
) {
  const fetchers = {
    guide: fetchSinaFinancialGuideHtml,
    profit: fetchSinaProfitStatementHtml,
    balance: fetchSinaBalanceSheetHtml,
    cashflow: fetchSinaCashFlowHtml,
    dupont: fetchSinaDupontHtml,
  }
  const html = await fetchers[sheet](code)
  const pivot = parseSinaPivotFinancialTable(html)
  return pivot ? { ...pivot, source: SINA_SOURCE } : null
}

export async function fetchSinaDragonTigerByDate(date: string): Promise<DragonTiger[]> {
  const html = await fetchSinaDragonTigerHtml(date)
  return mapSinaDragonTigerRows(parseSinaDragonTigerFromHtml(html, date))
}

export async function fetchSinaDragonTigerForStock(
  code: string,
  date: string,
): Promise<DragonTiger[]> {
  const html = await fetchSinaDragonTigerHtml(date)
  const rows = filterSinaDragonTigerByCode(parseSinaDragonTigerFromHtml(html, date), code)
  return mapSinaDragonTigerRows(rows)
}

export async function fetchSinaBlockTradeList(code: string, bdate = '', edate = '') {
  const html = await fetchSinaBlockTradeHtml(code, bdate, edate)
  return mapSinaBlockTrades(code, parseSinaBlockTradesFromHtml(html))
}

export async function fetchSinaShareUnlockList(code: string) {
  const html = await fetchSinaShareUnlockHtml(code)
  return mapSinaShareUnlock(code, parseSinaShareUnlockFromHtml(html))
}

export async function fetchSinaMarginTradingSnapshot(code: string) {
  const html = await fetchSinaMarginTradingHtml()
  return mapSinaMarginTrading(parseSinaMarginTradingForCode(html, code))
}

export async function fetchSinaPriceStats(code: string) {
  const rows = await fetchSinaPriceDistribution(code)
  return mapSinaPriceDistribution(code, rows)
}

export async function fetchSinaLargeOrderTraces(code: string) {
  const rows = await fetchSinaBillDetails(code)
  return mapSinaBillDetails(code, rows)
}

export async function fetchSinaStockStructureHistory(code: string) {
  const html = await fetchSinaStockStructureHtml(code)
  return mapSinaStockStructure(code, parseSinaStockStructureFromHtml(html))
}

export async function fetchSinaCorpRule(code: string) {
  const html = await fetchSinaCorpRuleHtml(code)
  return { code, ...parseSinaCorpRuleFromHtml(html), source: SINA_SOURCE }
}

export async function fetchSinaAnnualBulletins(code: string) {
  return fetchSinaBulletins(code, 'ndbg')
}

/** 定期报告公告列表 — `ndbg|zqbg|yjdbg|sjdbg` */
export async function fetchSinaBulletins(code: string, pageType: SinaBulletinPageType = 'ndbg') {
  const html = await fetchSinaBulletinHtml(code, pageType)
  return mapSinaBulletins(code, parseSinaBulletinListFromHtml(html, pageType))
}

/** 新股发行（IPO）— `vISSUE_NewStock` */
export async function fetchSinaIpoInfo(code: string) {
  const html = await fetchSinaNewStockHtml(code)
  const fields = parseSinaTwoColumnIssueFromHtml(html)
  if (!Object.keys(fields).length) return null
  return mapSinaIpoInfo(code, fields)
}

/** 增发历史 — `vISSUE_AddStock` */
export async function fetchSinaAddStockHistory(code: string) {
  const html = await fetchSinaAddStockHtml(code)
  const rows = parseSinaAddStockRowsFromHtml(html)
  const bare = normalizeCode(code)
  if (rows.length) {
    return rows.map(r => ({ code: bare, ...r, source: SINA_SOURCE }))
  }
  const fields = parseSinaTwoColumnIssueFromHtml(html)
  if (!Object.keys(fields).length) return []
  return [{ code: bare, fields, source: SINA_SOURCE }]
}

/** 业绩预告 — `vFD_AchievementNotice` */
export async function fetchSinaPerfForecastList(code: string) {
  const html = await fetchSinaAchievementNoticeHtml(code)
  return mapSinaPerfForecast(code, parseSinaAchievementNoticeFromHtml(html))
}

export async function fetchSinaIncomeStatement(code: string) {
  const html = await fetchSinaProfitStatementHtml(code)
  const pivot = parseSinaPivotFinancialTable(html)
  return mapSinaFinancialPivotToStatements(code, pivot, 'income')
}

export async function fetchSinaBalanceSheet(code: string) {
  const html = await fetchSinaBalanceSheetHtml(code)
  const pivot = parseSinaPivotFinancialTable(html)
  return mapSinaFinancialPivotToStatements(code, pivot, 'balance')
}

export async function fetchSinaCashFlowStatement(code: string) {
  const html = await fetchSinaCashFlowHtml(code)
  const pivot = parseSinaPivotFinancialTable(html)
  return mapSinaFinancialPivotToStatements(code, pivot, 'cashflow')
}

/** 公司公告全量列表（分页）— `vCB_AllBulletin.php` */
export async function fetchSinaAllBulletinPage(code: string, page = 1) {
  const html = await fetchSinaAllBulletinListHtml(code, page)
  const parsed = parseSinaAllBulletinListFromHtml(html, page)
  const bare = normalizeCode(code)
  return {
    code: bare,
    page: parsed.page,
    hasNext: parsed.hasNext,
    items: parsed.items.map(item => ({
      code: bare,
      date: item.date,
      title: item.title,
      link: item.link,
      id: item.id,
      source: SINA_SOURCE,
    })),
    source: SINA_SOURCE,
  }
}

/** 公告详情正文 — PDF 优先，否则 HTML `#content` */
export async function fetchSinaBulletinDetail(code: string, bulletinId: string) {
  const bare = normalizeCode(code)
  const bid = String(bulletinId ?? '').replace(/\D/g, '')
  if (!bare || !bid) return null
  const detail = await fetchSinaBulletinDetailContent(bare, bid)
  return {
    code: bare,
    id: bid,
    title: detail.title,
    link: detail.link,
    contentType: detail.contentType,
    pdfUrl: detail.pdfUrl,
    text: detail.text,
    source: SINA_SOURCE,
  }
}

/** 内部交易（董监高持股变动） */
export async function fetchSinaInsiderTrades(code: string, bdate = '', edate = '') {
  const html = await fetchSinaInsiderTradeHtml(code, bdate, edate)
  const bare = normalizeCode(code)
  return parseSinaInsiderTradesFromHtml(html).map(row => ({
    ...row,
    code: bare,
    source: SINA_SOURCE,
  }))
}

/** 千股千评 */
export async function fetchSinaStockComment(code: string) {
  const html = await fetchSinaStockCommentHtml(code)
  const row = parseSinaStockCommentFromHtml(html, code)
  if (!row) return null
  return { ...row, code: normalizeCode(code), source: SINA_SOURCE }
}

/** 持仓分析 / 历史分价分布 */
export async function fetchSinaPriceHistory(code: string, startDate = '', endDate = '') {
  const html = await fetchSinaPriceHistoryHtml(code, startDate, endDate)
  const bare = normalizeCode(code)
  const rows = parseSinaPriceHistoryFromHtml(html)
  return {
    code: bare,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    levels: rows.map(r => ({ ...r, code: bare, source: SINA_SOURCE })),
    source: SINA_SOURCE,
  }
}
