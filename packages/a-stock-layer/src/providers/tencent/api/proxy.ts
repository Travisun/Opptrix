/**
 * 腾讯证券 `proxy.finance.qq.com` HTTP 客户端。
 *
 * 所有请求经 {@link tencentProxyGet} 解析 `{ code, msg, data }` 信封；`code !== 0` 时抛错。
 * 基址：`https://proxy.finance.qq.com`（{@link TENCENT_PROXY_BASE}）。
 *
 * 自定义方法文档见 `providers/tencent/custom-method-docs.ts`；
 * 全球股指/期货分页见 `global-index-service.ts`、`global-futures-service.ts`。
 */
import { normalizeCode, secFullCode } from '../../../utils/helpers.js'
import { fetchJson } from './http.js'
import { fetchTencentJsonp } from './jsonp.js'
import {
  TENCENT_REFERER,
  TENCENT_BOARD_CODE_MAP,
  TENCENT_PROXY_BASE,
  TENCENT_REPORT_DETAIL_BASE,
  type TencentBigOrderData,
  type TencentBoardRankData,
  type TencentBoardSortField,
  type TencentIndustryBoardData,
  type TencentIndustryBoardType,
  type TencentIndustrySortField,
  type TencentFundFlowData,
  type TencentGlobalIndexRankData,
  type TencentGlobalIndexRegionKey,
  type TencentGlobalFuturesCategoryKey,
  type TencentWorldCommoditiesData,
  type TencentHyNewsData,
  type TencentInvestRateData,
  type TencentJggdData,
  type TencentJiankuangData,
  type TencentKlineAppData,
  type TencentNoticeListData,
  type TencentPlateNewData,
  type TencentProxyEnvelope,
  type TencentRelatedPlateRow,
  type TencentResearchReportData,
  type TencentSmartboxStock,
  type TencentTradeDetailData,
} from './types.js'

const BOARD_RANK_PATH = '/cgi/cgi-bin/rank/hs/getBoardRankList'
const INDUSTRY_BOARD_PATH = '/cgi/cgi-bin/rank/pt/getRank'
const GLOBAL_INDEX_RANK_PATH = '/ifzqgtimg/appstock/app/rank/indexRankDetail2'
const WORLD_COMMODITIES_PATH = '/ifzqgtimg/appstock/app/rank/worldCommodities'
const RESEARCH_REPORT_PATH = '/ifzqgtimg/appstock/app/investRate/getReport'
const NOTICE_LIST_PATH = '/ifzqgtimg/appstock/news/noticeList/search'
const HY_NEWS_PATH = '/ifzqgtimg/appstock/news/HyNews/getBySymbol'
const JIANKUANG_PATH = '/ifzqgtimg/appstock/app/stockinfo/jiankuang'
const PLATE_NEW_PATH = '/ifzqgtimg/appstock/app/stockinfo/plateNew'
const RELATED_PLATE_PATH = '/ifzqgtimg/stock/relate/data/plate'
const INDUSTRY_RANK_PATH = '/ifzqgtimg/appstock/hs/hypm/get'
const FUND_FLOW_PATH = '/cgi/cgi-bin/fundflow/hsfundtab'
const KLINE_APP_PATH = '/cgi/cgi-bin/stockinfoquery/kline/app/get'
const MINUTE_QUERY_PATH = '/ifzqgtimg/appstock/app/minute/query'
const JGGD_PATH = '/ifzqgtimg/appstock/hs/jggd/get'
const INVEST_RATE_PATH = '/ifzqgtimg/appstock/app/investRate/getInvestRate'
const MINGXI_PATH = '/ifzqgtimg/appstock/app/dealinfo/getMingxiV2'
const SMARTBOX_PATH = '/cgi/cgi-bin/smartbox/search'
const BIG_ORDER_URL = 'https://gu.qq.com/proxy/cgi/cgi-bin/yidong/getDadan'
const SQT_UTF8_URL = 'https://sqt.gtimg.cn/utf8/'

const DEFAULT_APPVER = '11.17.0'

/**
 * 解析板块列表请求的 `board_code`。
 *
 * @param market 引擎 `stockList` 入参，如 `cyb`、`board:cyb`、`kcb`
 * @returns 腾讯 `board_code`；无法识别时 `null`
 */
export function resolveTencentBoardCode(market: string): string | null {
  const raw = market.trim()
  if (!raw || raw === 'all') return null
  const key = raw.replace(/^board:/i, '').toLowerCase()
  const mapped = TENCENT_BOARD_CODE_MAP[key]
  if (mapped) return mapped
  if (key === 'astock') return 'aStock'
  if (key === 'cyb' || key === 'ksh') return key
  return null
}

/**
 * 拼接腾讯站内研报详情 URL（与 `gu.qq.com/.../gp/yjbg` 列表链接一致）。
 *
 * @param id 研报 id，如 `res835664472733`
 */
export function buildTencentReportDetailUrl(id: string): string {
  return `${TENCENT_REPORT_DETAIL_BASE}${encodeURIComponent(id)}&s=b`
}

/**
 * 拼接个股公告详情 URL。
 *
 * @param symbol 带市场前缀代码，如 `sz300308`
 * @param id 公告 id，如 `nos1225368701`
 */
export function buildTencentNoticeDetailUrl(symbol: string, id: string): string {
  const sym = symbol.includes('.') ? symbol : secFullCode(symbol)
  return `https://gu.qq.com/${sym}/gp/notice/${encodeURIComponent(id)}`
}

async function tencentProxyGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const qs = new URLSearchParams(params)
  const url = `${TENCENT_PROXY_BASE}${path}?${qs}`
  const body = await fetchJson<TencentProxyEnvelope<T>>(url)
  if (body.code !== 0) {
    throw new Error(body.msg?.trim() || `Tencent proxy 请求失败 (${body.code})`)
  }
  return body.data
}

/**
 * 全球期货品类 → `worldCommodities` data 键名。
 */
export function resolveTencentGlobalFuturesCategory(category: string): TencentGlobalFuturesCategoryKey {
  const key = category.trim()
  const lower = key.toLowerCase()
  const alias: Record<string, TencentGlobalFuturesCategoryKey> = {
    all: 'ALL',
    agriculture: 'agriculture',
    agri: 'agriculture',
    农产品: 'agriculture',
    basicmetal: 'basicMetal',
    metal: 'basicMetal',
    基本金属: 'basicMetal',
    energy: 'energy',
    能源: 'energy',
    exchangerate: 'exchangeRate',
    fx: 'exchangeRate',
    汇率: 'exchangeRate',
    interestrate: 'interestRate',
    rate: 'interestRate',
    利率: 'interestRate',
    preciousmetal: 'preciousMetal',
    gold: 'preciousMetal',
    贵金属: 'preciousMetal',
    stockindex: 'stockIndex',
    index: 'stockIndex',
    股指: 'stockIndex',
  }
  if (alias[lower]) return alias[lower]!
  if (alias[key]) return alias[key]!
  const camel = key as TencentGlobalFuturesCategoryKey
  const buckets: TencentGlobalFuturesCategoryKey[] = [
    'agriculture', 'basicMetal', 'energy', 'exchangeRate', 'interestRate', 'preciousMetal', 'stockIndex',
  ]
  if (buckets.includes(camel)) return camel
  return 'ALL'
}

/**
 * 全球期货实时列表 — `worldCommodities`（一次返回各品类，客户端筛选/排序/分页）。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/rank/worldCommodities
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=qh_global&module=GQH&type=ALL
 * @returns `TencentWorldCommoditiesData` — 键为 agriculture/basicMetal/energy 等品类数组
 * @remarks 无 query 参数；报价延迟约 15 分钟
 */
export async function fetchTencentWorldCommodities(): Promise<TencentWorldCommoditiesData> {
  return tencentProxyGet<TencentWorldCommoditiesData>(WORLD_COMMODITIES_PATH, {})
}

/**
 * mstats 全球股指分区 → `indexRankDetail2` data 键名。
 */
export function resolveTencentGlobalIndexRegion(region: string): TencentGlobalIndexRegionKey {
  const key = region.trim().toUpperCase()
  if (key === 'EU' || key === 'EUROPE') return 'EU'
  if (key === 'AM' || key === 'AMERICA' || key === 'US') return 'AM'
  if (key === 'AS' || key === 'ASIA') return 'AS'
  if (key === 'OA' || key === 'AF' || key === 'OTHER') return key === 'AF' ? 'AF' : 'OA'
  return 'ALL'
}

/**
 * 全球股指列表 — `indexRankDetail2`（一次返回各分区，客户端筛选/排序/分页）。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/rank/indexRankDetail2
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=indices&module=GIDX&type=ALL
 * @returns `TencentGlobalIndexRankData` — common/america/europe/asia/other 分区数组
 * @remarks 无 query 参数；ALL 合并与分页在 global-index-service 完成
 */
export async function fetchTencentGlobalIndexRankDetail(): Promise<TencentGlobalIndexRankData> {
  return tencentProxyGet<TencentGlobalIndexRankData>(GLOBAL_INDEX_RANK_PATH, {})
}

/**
 * 申万行业层级 → `rank/pt/getRank` 的 `board_type`。
 *
 * mstats 页面：`type=first` → `hy`（一级）；`type=second` → `hy2`（二级）。
 */
export function resolveTencentIndustryBoardType(level: string): TencentIndustryBoardType {
  const key = level.trim().toLowerCase()
  if (key === 'second' || key === '2' || key === 'hy2') return 'hy2'
  return 'hy'
}

/**
 * mstats 列表页 `sort` 列序号 → `rank/pt/getRank` 的 `sort_type`。
 *
 * 与页面 `listTPL.HY` 列定义一致：0 代码、1 名称、2 涨跌幅、5/6/7/8/9 为阶段涨跌幅。
 */
export function resolveTencentIndustrySortField(sort: string | number): TencentIndustrySortField {
  const fields: TencentIndustrySortField[] = [
    'code',
    'name',
    'price',
    'priceRatio',
    'priceRatio',
    'priceRatioD5',
    'priceRatioD20',
    'priceRatioD60',
    'priceRatioW52',
    'priceRatioY',
  ]
  const idx = Number(sort)
  if (Number.isFinite(idx) && idx >= 0 && idx < fields.length) {
    return fields[idx]!
  }
  const key = String(sort).trim() as TencentIndustrySortField
  if (fields.includes(key)) return key
  return 'priceRatio'
}

/**
 * 申万行业板块列表 — `rank/pt/getRank`。
 *
 * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=hy_first&module=hy&type=first
 * @param opts.level first → board_type=hy；second → hy2
 * @param opts.sortType sort_type 字段或 mstats 列序号
 * @param opts.direct up|down 排序方向
 * @param opts.page / opts.pageSize 换算为 offset + count
 * @returns `{ rank_list, total }` 原始排行
 */
export async function fetchTencentIndustryBoardList(opts: {
  level?: string
  boardType?: TencentIndustryBoardType
  sortType?: TencentIndustrySortField | string | number
  direct?: 'up' | 'down'
  page?: number
  pageSize?: number
  offset?: number
}): Promise<TencentIndustryBoardData> {
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 100))
  const page = Math.max(1, opts.page ?? 1)
  const offset = opts.offset ?? (page - 1) * pageSize
  const boardType = opts.boardType ?? resolveTencentIndustryBoardType(opts.level ?? 'first')
  const sortType = resolveTencentIndustrySortField(opts.sortType ?? 'priceRatio')

  return tencentProxyGet<TencentIndustryBoardData>(INDUSTRY_BOARD_PATH, {
    board_type: boardType,
    sort_type: sortType,
    direct: opts.direct ?? 'down',
    offset: String(Math.max(0, offset)),
    count: String(pageSize),
  })
}

/**
 * 申万行业成分股 — `getBoardRankList`，`board_code` 为行业板块代码（如 pt01801780）。
 *
 * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList
 * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=pt01801780&typename=银行&sign=web
 * @param opts.industryCode 行业 pt 代码（来自 getRank 的 code）
 * @returns `{ rank_list, total }` 成分股排行
 */
export async function fetchTencentIndustryConstituents(opts: {
  industryCode: string
  sortType?: TencentBoardSortField | string | number
  direct?: 'up' | 'down'
  page?: number
  pageSize?: number
  offset?: number
}): Promise<TencentBoardRankData> {
  const industryCode = opts.industryCode.trim()
  if (!industryCode) {
    throw new Error('行业板块代码不能为空')
  }
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 20, 100))
  const page = Math.max(1, opts.page ?? 1)
  const offset = opts.offset ?? (page - 1) * pageSize
  const sortFields: TencentBoardSortField[] = [
    'code',
    'name',
    'price',
    'priceRatio',
    'priceChange',
    'exchange',
    'netMainIn',
    'volumeRatio',
    'amplitude',
    'volume',
    'turnover',
  ]
  let sortType: TencentBoardSortField = 'priceRatio'
  const rawSort = opts.sortType
  if (rawSort != null && rawSort !== '') {
    const idx = Number(rawSort)
    if (Number.isFinite(idx) && idx >= 0 && idx < sortFields.length) {
      sortType = sortFields[idx]!
    } else if (sortFields.includes(String(rawSort) as TencentBoardSortField)) {
      sortType = String(rawSort) as TencentBoardSortField
    }
  }

  return fetchTencentBoardRankList({
    boardCode: industryCode,
    sortType,
    direct: opts.direct ?? 'down',
    offset,
    count: pageSize,
  })
}

/**
 * 板块排行列表 — `getBoardRankList`。
 *
 * @see https://stockapp.finance.qq.com/mstats/#mod=list&type=cyb
 */
export async function fetchTencentBoardRankList(opts: {
  boardCode: string
  sortType?: TencentBoardSortField
  direct?: 'up' | 'down'
  offset?: number
  count?: number
}): Promise<TencentBoardRankData> {
  return tencentProxyGet<TencentBoardRankData>(BOARD_RANK_PATH, {
    _appver: DEFAULT_APPVER,
    board_code: opts.boardCode,
    sort_type: opts.sortType ?? 'price',
    direct: opts.direct ?? 'down',
    offset: String(Math.max(0, opts.offset ?? 0)),
    count: String(Math.max(1, Math.min(opts.count ?? 20, 100))),
  })
}

/**
 * 个股研究报告列表 — `investRate/getReport`（`gp/yjbg` 页面实际数据源）。
 *
 * 列表项 `url` / `src` 常为空，请用 {@link buildTencentReportDetailUrl} 生成阅读链接。
 */
export async function fetchTencentResearchReports(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<TencentResearchReportData> {
  const symbol = secFullCode(opts.code)
  return tencentProxyGet<TencentResearchReportData>(RESEARCH_REPORT_PATH, {
    symbol,
    page: String(Math.max(1, opts.page ?? 1)),
    n: String(Math.max(1, Math.min(opts.pageSize ?? 20, 50))),
  })
}

/**
 * 个股公告列表 — `noticeList/search`。
 */
export async function fetchTencentNoticeList(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<TencentNoticeListData> {
  const symbol = secFullCode(opts.code)
  return tencentProxyGet<TencentNoticeListData>(NOTICE_LIST_PATH, {
    symbol,
    page: String(Math.max(1, opts.page ?? 1)),
    n: String(Math.max(1, Math.min(opts.pageSize ?? 20, 50))),
  })
}

/**
 * 个股关联行业新闻 — `HyNews/getBySymbol`。
 */
export async function fetchTencentHyNews(opts: {
  code: string
  page?: number
  pageSize?: number
}): Promise<TencentHyNewsData> {
  const symbol = secFullCode(opts.code)
  return tencentProxyGet<TencentHyNewsData>(HY_NEWS_PATH, {
    symbol,
    page: String(Math.max(1, opts.page ?? 1)),
    n: String(Math.max(1, Math.min(opts.pageSize ?? 20, 50))),
  })
}

/**
 * 公司简况与主要财务指标 — `stockinfo/jiankuang`。
 */
export async function fetchTencentJiankuang(code: string): Promise<TencentJiankuangData> {
  return tencentProxyGet<TencentJiankuangData>(JIANKUANG_PATH, {
    code: secFullCode(code),
  })
}

/**
 * 板块 / 概念 / 地域标签 — `stockinfo/plateNew`。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/stockinfo/plateNew?code={symbol}&app=wzq&zdf=1
 * @param code 6 位 A 股代码，自动转 sh/sz 前缀
 */
export async function fetchTencentPlateTags(code: string): Promise<TencentPlateNewData> {
  return tencentProxyGet<TencentPlateNewData>(PLATE_NEW_PATH, {
    code: secFullCode(code),
    app: 'wzq',
    zdf: '1',
  })
}

/**
 * 关联板块列表 — `stock/relate/data/plate`。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/stock/relate/data/plate?code={symbol}
 */
export async function fetchTencentRelatedPlates(code: string): Promise<TencentRelatedPlateRow[]> {
  return tencentProxyGet<TencentRelatedPlateRow[]>(RELATED_PLATE_PATH, {
    code: secFullCode(code),
  })
}

/**
 * 行业内排名与估值对比 — `hs/hypm/get`（单股行业内 PE/市值排名）。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/hs/hypm/get?code={symbol}
 */
export async function fetchTencentIndustryRank(code: string): Promise<Record<string, unknown>> {
  return tencentProxyGet<Record<string, unknown>>(INDUSTRY_RANK_PATH, {
    code: secFullCode(code),
  })
}

/**
 * 机构评级统计 — `investRate/getInvestRate`。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/investRate/getInvestRate?symbol={symbol}
 */
export async function fetchTencentInvestRate(code: string): Promise<TencentInvestRateData> {
  return tencentProxyGet<TencentInvestRateData>(INVEST_RATE_PATH, {
    symbol: secFullCode(code),
  })
}

/**
 * 机构观点（月度评级分布）— `hs/jggd/get`。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/hs/jggd/get?code={symbol}
 */
export async function fetchTencentJggd(code: string): Promise<TencentJggdData> {
  return tencentProxyGet<TencentJggdData>(JGGD_PATH, {
    code: secFullCode(code),
  })
}

/**
 * 日/周/月 K 线 — `stockinfoquery/kline/app/get`（结构化 JSON）。
 */
export async function fetchTencentKlineApp(
  code: string,
  klineType: 'day' | 'week' | 'month' = 'day',
  limit = 120,
): Promise<TencentKlineAppData> {
  return tencentProxyGet<TencentKlineAppData>(KLINE_APP_PATH, {
    code: secFullCode(code),
    'kline.type': klineType,
    limit: String(Math.max(1, Math.min(limit, 2000))),
  })
}

/**
 * 当日分时分钟序列 — `minute/query`（JSONP）。
 *
 * 返回原始字符串数组：`"HHMM 价 量 额"`。
 */
export async function fetchTencentMinuteRaw(code: string): Promise<string[]> {
  const symbol = secFullCode(code)
  const varName = 'min_data'
  const url = `${TENCENT_PROXY_BASE}${MINUTE_QUERY_PATH}?_var=${varName}&code=${symbol}`
  const body = await fetchTencentJsonp<TencentProxyEnvelope<Record<string, {
    data?: { data?: string[] }
  }>>>(url, varName)
  if (body.code !== 0) {
    throw new Error(body.msg?.trim() || `minute/query 失败 (${body.code})`)
  }
  return body.data?.[symbol]?.data?.data ?? []
}

/**
 * `sqt.gtimg.cn` UTF-8 JSON 实时行情。
 */
export async function fetchTencentSqtQuotes(
  codes: string[],
): Promise<Array<{ symbol: string; fields: string[] }>> {
  if (!codes.length) return []
  const symbols = codes.map(c => secFullCode(c))
  const url = `${SQT_UTF8_URL}?q=${symbols.join(',')}&fmt=json`
  const body = await fetchJson<Record<string, string[]>>(url)
  return symbols.map(sym => ({
    symbol: sym,
    fields: body[sym] ?? [],
  })).filter(row => row.fields.length > 0)
}

/**
 * 大单成交 — `yidong/getDadan`（`gu.qq.com/proxy`）。
 */
export async function fetchTencentBigOrders(code: string): Promise<TencentBigOrderData> {
  const qs = new URLSearchParams({
    code: secFullCode(code),
    need: '',
    start: '',
  })
  const body = await fetchJson<{ code: number; msg?: string; data?: TencentBigOrderData }>(
    `${BIG_ORDER_URL}?${qs}`,
  )
  if (body.code !== 0 || !body.data) {
    throw new Error(body.msg?.trim() || `getDadan 失败 (${body.code})`)
  }
  return body.data
}

/**
 * 逐笔成交明细 — `dealinfo/getMingxiV2`（盘中才有数据）。
 *
 * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/dealinfo/getMingxiV2?code={symbol}
 * @remarks 收盘后常返回空
 */
export async function fetchTencentTradeDetails(code: string): Promise<TencentTradeDetailData> {
  return tencentProxyGet<TencentTradeDetailData>(MINGXI_PATH, {
    code: secFullCode(code),
  })
}

/**
 * 股票搜索 — `smartbox/search`。
 *
 * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/smartbox/search?stockFlag=1&fundFlag=1&query={q}
 * @param query 代码或名称关键词
 * @returns `TencentSmartboxStock[]`
 */
export async function fetchTencentSmartboxSearch(query: string): Promise<TencentSmartboxStock[]> {
  const qs = new URLSearchParams({
    stockFlag: '1',
    fundFlag: '1',
    app: 'official_website',
    c: '1',
    query: query.trim(),
  })
  const body = await fetchJson<{ stock?: TencentSmartboxStock[] }>(
    `${TENCENT_PROXY_BASE}${SMARTBOX_PATH}?${qs}`,
  )
  return body.stock ?? []
}

/**
 * 个股资金流向 — `fundflow/hsfundtab`。
 *
 * @param types 逗号分隔块名，默认当日主力净流入
 */
export async function fetchTencentFundFlow(
  code: string,
  types = 'todayFundFlow',
  klineNeedDay = 5,
): Promise<TencentFundFlowData> {
  return tencentProxyGet<TencentFundFlowData>(FUND_FLOW_PATH, {
    code: secFullCode(code),
    type: types,
    klineNeedDay: String(klineNeedDay),
  })
}

/**
 * 将 6 位或带前缀代码转为腾讯 `symbol`（sh/sz/bj + 6 位）。
 */
export function toTencentSymbol(code: string): string {
  return secFullCode(code)
}

/**
 * 从腾讯 `symbol` 提取 6 位代码（如 sz300308 → 300308）。
 */
export function fromTencentSymbol(symbol: string): string {
  const raw = symbol.trim().toLowerCase()
  const digits = raw.replace(/^(sh|sz|bj)/, '')
  return normalizeCode(digits)
}

/**
 * 探测研报接口是否可用（用于连接测试）。
 */
export async function probeTencentResearchReport(code = '600519'): Promise<boolean> {
  const data = await fetchTencentResearchReports({ code, page: 1, pageSize: 1 })
  return Array.isArray(data.data) && data.data.length > 0
}
