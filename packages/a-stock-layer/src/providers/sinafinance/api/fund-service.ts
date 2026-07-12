import { normalizeCode } from '../../../utils/helpers.js'
import { SINA_SOURCE } from '../types/responses.js'
import {
  SINA_ETF_HQ_NODE,
  SINA_FUND_BALANCE_SHEET_FIELDS,
  SINA_FUND_FINANCIAL_INDICATOR_FIELDS,
  SINA_FUND_INCOME_STATEMENT_FIELDS,
  buildSinaFundDetailUrl,
  fetchSinaFundAgenciesRaw,
  fetchSinaFundAnnouncementsPage,
  fetchSinaFundBalanceSheetRaw,
  fetchSinaFundDistributionRaw,
  fetchSinaFundDocumentsRaw,
  fetchSinaFundFeesRaw,
  fetchSinaFundFinancialIndicatorsRaw,
  fetchSinaFundHqPage,
  fetchSinaFundHolderStructureHistoryRaw,
  fetchSinaFundHolderStructureRaw,
  fetchSinaFundIncomeStatementRaw,
  fetchSinaFundIndustry,
  fetchSinaFundManagerRating,
  fetchSinaFundNavPage,
  fetchSinaFundProfileRaw,
  fetchSinaFundQuoteRaw,
  fetchSinaFundShareChangeRaw,
  fetchSinaFundStockStyle,
  fetchSinaFundTopHold,
  fetchSinaFundTopHoldersRaw,
  fetchSinaFundTypePerf,
  mapFundStatementPeriods,
  type SinaFundMarketNode,
} from './fund.js'

function withSource<T extends Record<string, unknown>>(code: string, row: T) {
  return { code: normalizeCode(code), ...row, source: SINA_SOURCE }
}

/** ETF 基金列表全量（自动分页） */
export async function fetchSinaEtfListAll(opts: {
  pageSize?: number
  node?: SinaFundMarketNode
} = {}): Promise<Array<{ code: string; name?: string; symbol?: string }>> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 80, 20), 200)
  const all: Array<{ code: string; name?: string; symbol?: string }> = []
  let page = 1
  for (;;) {
    const result = await fetchSinaEtfList({ ...opts, page, pageSize })
    for (const item of result.items) {
      const code = normalizeCode(String(item.code ?? ''))
      if (!code) continue
      all.push({ code, name: item.name, symbol: item.symbol })
    }
    if (!result.hasNext || result.items.length < pageSize) break
    page += 1
  }
  return all
}

/** ETF 基金列表（场内行情，默认 node=etf_hq_fund） */
export async function fetchSinaEtfList(opts: {
  page?: number
  pageSize?: number
  node?: SinaFundMarketNode
  sort?: string
  asc?: boolean
} = {}) {
  const page = await fetchSinaFundHqPage({
    node: opts.node ?? SINA_ETF_HQ_NODE,
    page: opts.page,
    pageSize: opts.pageSize,
    sort: opts.sort,
    asc: opts.asc,
  })
  return {
    node: opts.node ?? SINA_ETF_HQ_NODE,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    hasNext: page.hasNext,
    items: page.items.map(row => ({
      code: normalizeCode(String(row.code ?? '')),
      symbol: row.symbol,
      name: row.name,
      price: row.trade,
      change: row.pricechange,
      changePct: row.changepercent,
      open: row.open,
      high: row.high,
      low: row.low,
      prevClose: row.settlement,
      volume: row.volume,
      amount: row.amount,
      turnoverRatio: row.turnoverratio,
      tickTime: row.ticktime,
      detailUrl: buildSinaFundDetailUrl(String(row.code ?? '')),
      source: SINA_SOURCE,
    })),
    source: SINA_SOURCE,
  }
}

/** 基金详情页行情快照 */
export async function fetchSinaFundQuote(code: string) {
  const raw = await fetchSinaFundQuoteRaw(code)
  if (!raw) return null
  return {
    ...withSource(code, raw as unknown as Record<string, unknown>),
    detailUrl: buildSinaFundDetailUrl(code),
  }
}

/** 基金基本信息 */
export async function fetchSinaFundProfile(code: string) {
  const raw = await fetchSinaFundProfileRaw(code)
  if (!raw) return null
  return {
    ...withSource(code, raw as unknown as Record<string, unknown>),
    detailUrl: buildSinaFundDetailUrl(code),
  }
}

/** 历史净值（分页） */
export async function fetchSinaFundNav(code: string, page = 1, pageSize = 20) {
  const bare = normalizeCode(code)
  const result = await fetchSinaFundNavPage(bare, page, pageSize)
  return {
    code: bare,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    hasNext: result.hasNext,
    rows: result.rows.map(r => ({ ...r, code: bare, source: SINA_SOURCE })),
    source: SINA_SOURCE,
  }
}

/** 费率与交易规则 */
export async function fetchSinaFundFees(code: string) {
  const raw = await fetchSinaFundFeesRaw(code)
  if (!raw) return null
  return withSource(code, raw)
}

/** 历史现金分红 — `FdFundService.getJJFHAll` · `fh`（不含份额折算 `cf`） */
export async function fetchSinaFundDistributions(code: string) {
  const raw = await fetchSinaFundDistributionRaw(code)
  if (!raw) return null
  return withSource(code, raw)
}

/** 基金公告（分页） */
export async function fetchSinaFundAnnouncements(
  code: string,
  page = 1,
  type = '',
  dateFrom = '',
  dateTo = '',
) {
  const bare = normalizeCode(code)
  const result = await fetchSinaFundAnnouncementsPage(bare, { page, type, dateFrom, dateTo })
  return {
    code: bare,
    total: result.total,
    page: result.page,
    hasNext: result.hasNext,
    items: result.rows.map(r => ({ ...r, code: bare, source: SINA_SOURCE })),
    source: SINA_SOURCE,
  }
}

/** 法律文件（合同/招募说明书等） */
export async function fetchSinaFundDocuments(code: string) {
  const bare = normalizeCode(code)
  const rows = await fetchSinaFundDocumentsRaw(bare)
  if (!rows.length) return null
  return rows.map(r => ({ ...r, code: bare, source: SINA_SOURCE }))
}

/** 申购赎回份额变动 */
export async function fetchSinaFundShareChange(code: string) {
  const bare = normalizeCode(code)
  const rows = await fetchSinaFundShareChangeRaw(bare)
  if (!rows?.length) return null
  return rows.map(r => ({ ...r, code: bare, source: SINA_SOURCE }))
}

/** 销售机构 */
export async function fetchSinaFundAgencies(code: string) {
  const raw = await fetchSinaFundAgenciesRaw(code)
  if (!raw) return null
  return withSource(code, raw)
}

/**
 * 历史现金分红（仅 `fh` 数组）— `sinaFundDividends`
 * 新浪 API：`FdFundService.getJJFHAll`
 * @param code - 6 位基金代码
 * @returns 分红记录列表；无现金分红（如多数 ETF）时返回 `null`
 */
export async function fetchSinaFundDividends(code: string) {
  const raw = await fetchSinaFundDistributionRaw(code)
  const fh = raw?.fh
  if (!Array.isArray(fh) || !fh.length) return null
  const bare = normalizeCode(code)
  return {
    code: bare,
    dividends: fh.map(row => ({ ...row, code: bare, source: SINA_SOURCE })),
    source: SINA_SOURCE,
  }
}

/**
 * 十大持有人 — `sinaFundTopHolders`
 * 新浪 API：`FundPageInfoService.tabsdcyr`
 * @param code - 6 位基金代码
 * @param date - 报告期 `YYYY-MM-DD`；空字符串取最新一期
 * @returns 含 `holders`（名称/份额/占比）与 `availableDates` 可选报告期列表
 */
export async function fetchSinaFundTopHolders(code: string, date = '') {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundTopHoldersRaw(bare, date)
  if (!raw?.info?.length) return null
  const reportDate = date || raw.dates?.[0]?.PUBLISHDATE
  return {
    code: bare,
    reportDate,
    availableDates: (raw.dates ?? []).map(d => d.PUBLISHDATE).filter(Boolean),
    holders: raw.info.map(row => ({
      code: bare,
      name: String(row.cyrmc ?? ''),
      shares: row.cyfe,
      ratioPct: row.zfeb,
      source: SINA_SOURCE,
    })),
    source: SINA_SOURCE,
  }
}

const HOLDER_STRUCTURE_FIELD_MAP: Record<string, string> = {
  bdrq: 'reportDate',
  cyrhs: 'holderCount',
  cyrfe: 'totalShares',
  jgcyfe: 'institutionalShares',
  jgcybl: 'institutionalRatioPct',
  grcyfe: 'individualShares',
  grcybl: 'individualRatioPct',
  ygcyfe: 'employeeShares',
  ygcybl: 'employeeRatioPct',
  glrcyfe: 'managerShares',
  glrcybl: 'managerRatioPct',
}

/**
 * 持有人结构 — `sinaFundHolderStructure`
 * 新浪 API：`FundPageInfoService.tabcyrjg`
 * @param code - 6 位基金代码
 * @param date - 报告期 `YYYY-MM-DD`（可选）
 * @returns 机构/个人/员工/管理人份额与占比；`structure` 字段为语义化键名
 */
export async function fetchSinaFundHolderStructure(code: string, date = '') {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundHolderStructureRaw(bare, date)
  if (!raw?.CYRInfo) return null
  const structure: Record<string, string> = {}
  for (const [rawKey, label] of Object.entries(HOLDER_STRUCTURE_FIELD_MAP)) {
    const value = raw.CYRInfo[rawKey]
    if (value != null && value !== '--') structure[label] = String(value)
  }
  return {
    code: bare,
    reportDate: date || raw.CYRDate?.[0]?.REPORTDATE,
    availableDates: (raw.CYRDate ?? []).map(d => d.REPORTDATE).filter(Boolean),
    structure,
    source: SINA_SOURCE,
  }
}

/**
 * 持有人结构历史变动 — `sinaFundHolderStructureHistory`
 * 新浪 API：`FundPageInfoService.tabsdcyrbd`
 * @param code - 6 位基金代码
 * @returns 各报告期机构/个人份额与机构占比
 */
export async function fetchSinaFundHolderStructureHistory(code: string) {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundHolderStructureHistoryRaw(bare)
  if (!raw || !Object.keys(raw).length) return null
  const periods = Object.entries(raw).map(([reportDate, row]) => ({
    code: bare,
    reportDate,
    individualShares: row.grcyfe,
    institutionalShares: row.jgcyfe,
    institutionalRatioPct: row.jgcybl,
    source: SINA_SOURCE,
  }))
  return { code: bare, periods, source: SINA_SOURCE }
}

/**
 * 财务指标（多期）— `sinaFundFinancialIndicators`
 * 新浪 API：`FundPageInfoService.tabcwzb`
 * @param code - 6 位基金代码
 * @returns `periods[].metrics` 含 `periodProfit`、`periodNetIncome`、`periodEndNav` 等
 */
export async function fetchSinaFundFinancialIndicators(code: string) {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundFinancialIndicatorsRaw(bare)
  if (!raw?.length) return null
  return {
    code: bare,
    periods: mapFundStatementPeriods(raw, SINA_FUND_FINANCIAL_INDICATOR_FIELDS),
    source: SINA_SOURCE,
  }
}

/**
 * 利润表（多期）— `sinaFundIncomeStatement`
 * 新浪 API：`FundPageInfoService.tablrb`
 * @param code - 6 位基金代码
 * @returns `periods[].metrics` 含 `revenue`、`expenses`、`netProfit` 等（见 `SINA_FUND_INCOME_STATEMENT_FIELDS`）
 */
export async function fetchSinaFundIncomeStatement(code: string) {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundIncomeStatementRaw(bare)
  if (!raw?.length) return null
  return {
    code: bare,
    periods: mapFundStatementPeriods(raw, SINA_FUND_INCOME_STATEMENT_FIELDS),
    source: SINA_SOURCE,
  }
}

/**
 * 基金负债表（多期）— `sinaFundBalanceSheet`
 * 新浪 API：`FundPageInfoService.tabfzb`
 * @param code - 6 位基金代码
 * @returns `periods[].metrics` 含 `totalAssets`、`totalLiabilities`、`totalEquity` 等（见 `SINA_FUND_BALANCE_SHEET_FIELDS`）
 */
export async function fetchSinaFundBalanceSheet(code: string) {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundBalanceSheetRaw(bare)
  if (!raw?.length) return null
  return {
    code: bare,
    periods: mapFundStatementPeriods(raw, SINA_FUND_BALANCE_SHEET_FIELDS),
    source: SINA_SOURCE,
  }
}

/** 重仓股 JSONP API — `FdFundService.getTopHold` */
export async function fetchSinaFundTopHoldService(code: string) {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundTopHold(bare)
  if (!raw) return null
  return withSource(bare, raw)
}

/** 行业配置 — `CaihuiFundInfoService.getIndustry` */
export async function fetchSinaFundIndustryService(code: string) {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundIndustry(bare)
  if (!raw) return null
  return withSource(bare, raw)
}

/** 基金经理评分 — `XincaiFundInfoService.getFundManagerYJ` */
export async function fetchSinaFundManagerRatingService(managerId: string) {
  const raw = await fetchSinaFundManagerRating(managerId)
  if (!raw) return null
  return { ...raw, source: SINA_SOURCE }
}

/** 股票风格 — `XincaiFundInfoService.FundStockStyle` */
export async function fetchSinaFundStockStyleService(code: string) {
  const bare = normalizeCode(code)
  const raw = await fetchSinaFundStockStyle(bare)
  if (!raw) return null
  return withSource(bare, raw)
}

/** 基金类型历史业绩 — `XincaiFundInfoService.getFundTypeYJ` */
export async function fetchSinaFundTypePerfService(companyId: string, type2id = 'x2002') {
  const raw = await fetchSinaFundTypePerf(companyId, type2id)
  if (!raw) return null
  return { ...raw, source: SINA_SOURCE }
}
