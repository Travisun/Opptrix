import { normalizeCode, safeFloat } from '../../../utils/helpers.js'
import { filterCnEtfListItems } from '../../common/standard-etf.js'
import type { StockListItem } from '../../../core/schema.js'
import { fetchTencentBoardRankList } from './proxy.js'
import { mapTencentBoardRankRows } from '../normalize/content.js'
import { fetchText } from './http.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../common/free-provider-call.js';

/** 沪深京 A 股板块排行全量拉取（用于筛 ETF） */
export async function fetchTencentAStockListAll(maxItems = 6000): Promise<StockListItem[]> {
  const all: StockListItem[] = []
  const pageSize = 100
  let offset = 0

  for (;;) {
    const data = await fetchTencentBoardRankList({
      boardCode: 'aStock',
      offset,
      count: pageSize,
    })
    const batch = mapTencentBoardRankRows(data.rank_list ?? [])
    if (!batch.length) break
    all.push(...batch)
    if (all.length >= maxItems || batch.length < pageSize) break
    offset += pageSize
  }

  return all.slice(0, maxItems)
}

/** ETF 列表 — 从 aStock 排行筛代码段 + 带来源标记 */
export async function fetchTencentEtfListItems(): Promise<StockListItem[]> {
  const all = await fetchTencentAStockListAll()
  return filterCnEtfListItems(all).map(item => ({
    ...item,
    industry: item.industry || 'ETF',
  }))
}

/** 单只 ETF 基础信息（profile / 行情兜底） */
export async function fetchTencentEtfBasicItem(code: string): Promise<StockListItem | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  return {
    code: bare,
    name: bare,
    industry: 'ETF',
    market: bare.startsWith('6') ? 'SH' : 'SZ',
  }
}

/** 从代码推断腾讯 market 前缀（6 开头 → sh，其余 → sz） */
function tencentMarketPrefix(code: string): string {
  const bare = normalizeCode(code)
  return bare.startsWith('6') ? 'sh' : 'sz'
}

/**
 * 解析腾讯 JSONP 响应为对象。
 *
 * @param text JSONP 原始文本，格式 `jQuery随机数({...})`
 * @returns 解析后的对象，失败返回 null
 */
function parseJsonp<T>(text: string): T | null {
  try {
    const first = text.indexOf('(')
    const last = text.lastIndexOf(')')
    if (first < 0 || last <= first) return null
    return JSON.parse(text.slice(first + 1, last)) as T
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * 解析腾讯 JS var 赋值响应为对象。
 *
 * @param text JS 文本，格式 `varName={...}`
 * @returns 解析后的对象，失败返回 null
 */
function parseJsVar<T>(text: string): T | null {
  try {
    const eq = text.indexOf('=')
    if (eq < 0) return null
    return JSON.parse(text.slice(eq + 1)) as T
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * ETF 基金概况（基金档案信息）。
 *
 * @sourceUrl https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getPriceZone?symbol={market}{code}
 * @param code 6 位 ETF 代码
 * @returns 基金概况对象，失败返回 null
 * @usage `fetchTencentFundProfile('510300')`
 * @remarks 返回 JSONP 格式，解析 jQuery 回调包裹的 JSON。包含基金名称、类型、管理人、托管人等基本信息。
 * @example
 * ```ts
 * const profile = await fetchTencentFundProfile('510300')
 * // { data: { name: '沪深300ETF', ... } }
 * ```
 */
export async function fetchTencentFundProfile(code: string): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const sym = `${tencentMarketPrefix(bare)}${bare}`
    const url = `https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getPriceZone?symbol=${sym}`
    const text = await fetchText(url)
    const json = parseJsonp<Record<string, unknown>>(text)
    return json ?? null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * ETF 基金资产配置（股票持仓 + 行业分布）。
 *
 * @sourceUrl https://zxg.txfund.com/ifzqgtimg/appstock/fund/baseInfo/asset?code={market}{code}
 * @param code 6 位 ETF 代码
 * @returns `{ selector, report_time, total_money, asset[], industry[], stock[] }`，失败返回 null
 * @usage `fetchTencentFundAsset('510300')`
 * @remarks 返回 JSONP 格式。stock[] 包含个股持仓明细（代码、名称、占比），asset[] 为大类资产配置，industry[] 为行业分布。
 * @example
 * ```ts
 * const asset = await fetchTencentFundAsset('510300')
 * // { selector: '...', report_time: '2024-12-31', total_money: '...', stock: [...], industry: [...], asset: [...] }
 * ```
 */
export async function fetchTencentFundAsset(code: string): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const sym = `${tencentMarketPrefix(bare)}${bare}`
    const url = `https://zxg.txfund.com/ifzqgtimg/appstock/fund/baseInfo/asset?code=${sym}`
    const text = await fetchText(url)
    const json = parseJsonp<Record<string, unknown>>(text)
    return json ?? null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * ETF 基金业绩排名信息。
 *
 * @sourceUrl https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getRankInfo?symbol={market}{code}
 * @param code 6 位 ETF 代码
 * @returns `{ zxrq, total, jzzf, avg_hbl }`，失败返回 null
 * @usage `fetchTencentFundRankInfo('510300')`
 * @remarks JSONP 格式。zxrq 为净值日期，total 为排名总数，jzzf 为净值增幅，avg_hbl 为平均回报率。
 * @example
 * ```ts
 * const rank = await fetchTencentFundRankInfo('510300')
 * // { zxrq: '2024-12-31', total: 100, jzzf: 12.5, avg_hbl: 8.3 }
 * ```
 */
export async function fetchTencentFundRankInfo(code: string): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const sym = `${tencentMarketPrefix(bare)}${bare}`
    const url = `https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getRankInfo?symbol=${sym}`
    const text = await fetchText(url)
    const json = parseJsonp<Record<string, unknown>>(text)
    return json ?? null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * ETF 历史净值全量数据。
 *
 * @sourceUrl https://stockjs.finance.qq.com/fundUnitNavAll/data/year_all/{code}.js
 * @param code 6 位 ETF 代码
 * @returns `{ code, data: [[date, nav, accNav], ...] }`，失败返回 null
 * @usage `fetchTencentFundNavHistory('510300')`
 * @remarks 返回 JS var 赋值格式 `fundNavAllYearData={...}`，提取 `=` 后 JSON 解析。data 数组每项为 [日期, 单位净值, 累计净值]。
 * @example
 * ```ts
 * const nav = await fetchTencentFundNavHistory('510300')
 * // { code: '510300', data: [['2024-12-31', 4.123, 4.123], ...] }
 * ```
 */
export async function fetchTencentFundNavHistory(code: string): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const url = `https://stockjs.finance.qq.com/fundUnitNavAll/data/year_all/${bare}.js`
    const text = await fetchText(url)
    const json = parseJsVar<Record<string, unknown>>(text)
    if (!json) return null
    return { code: bare, data: json.data ?? json }
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * ETF K 线行情（proxy.finance.qq.com 接口）。
 *
 * @sourceUrl https://proxy.finance.qq.com/kline/app/get?code={market}{code}&period={period}&...
 * @param code 6 位 ETF 代码
 * @param period K 线周期：day / week / month
 * @param limit 返回条数限制，0 表示不限制
 * @returns K 线数据对象，失败返回 null
 * @usage `fetchTencentEtfKline('510300', 'day', 100)`
 * @remarks 纯 JSON 格式返回。与 fetchTencentKlineApp 不同，此接口直接返回标准 K 线数组。
 * @example
 * ```ts
 * const kline = await fetchTencentEtfKline('510300', 'day', 30)
 * // { data: { sh510300: { day: [[date, open, close, high, low, volume], ...] } } }
 * ```
 */
export async function fetchTencentEtfKline(
  code: string,
  period = 'day',
  limit = 0,
): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const sym = `${tencentMarketPrefix(bare)}${bare}`
    const params = new URLSearchParams({
      _var: `kline_${period}`,
      param: `${sym},${period},${limit}`,
      r: String(Date.now()),
    })
    const url = `https://proxy.finance.qq.com/kline/app/get?code=${sym}&period=${period}&${params.toString()}`
    const text = await fetchText(url)
    const json = parseJsonp<Record<string, unknown>>(text)
    return (json?.data ?? json ?? null) as Record<string, unknown> | null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * ETF 基金公告列表。
 *
 * @sourceUrl https://web.ifzq.gtimg.cn/fund/newfund/fundNotice/getNotice?symbol={market}{code}&page={page}&limit={limit}
 * @param code 6 位 ETF 代码
 * @param page 页码，从 1 开始
 * @param limit 每页条数，默认 20
 * @returns `{ total, data: [{ id, title, date }] }`，失败返回 null
 * @usage `fetchTencentFundNotice('510300', 1, 20)`
 * @remarks JSONP 格式。公告列表包含 id、标题和发布日期。
 * @example
 * ```ts
 * const notices = await fetchTencentFundNotice('510300')
 * // { total: 50, data: [{ id: '...', title: '...', date: '2024-12-31' }, ...] }
 * ```
 */
export async function fetchTencentFundNotice(
  code: string,
  page = 1,
  limit = 20,
): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const sym = `${tencentMarketPrefix(bare)}${bare}`
    const url = `https://web.ifzq.gtimg.cn/fund/newfund/fundNotice/getNotice?symbol=${sym}&page=${page}&limit=${limit}`
    const text = await fetchText(url)
    const json = parseJsonp<Record<string, unknown>>(text)
    return json ?? null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * 同类型 ETF 基金列表（同类基金对比）。
 *
 * @sourceUrl https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getSameLxFundList?type=1&symbol={market}{code}
 * @param code 6 位 ETF 代码
 * @returns `{ list: [...] }`，失败返回 null
 * @usage `fetchTencentSameTypeFunds('510300')`
 * @remarks JSONP 格式。type=1 表示同类型基金。列表包含同类基金的基本信息和业绩对比。
 * @example
 * ```ts
 * const peers = await fetchTencentSameTypeFunds('510300')
 * // { list: [{ code: '...', name: '...', ... }, ...] }
 * ```
 */
export async function fetchTencentSameTypeFunds(code: string): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const sym = `${tencentMarketPrefix(bare)}${bare}`
    const url = `https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getSameLxFundList?type=1&symbol=${sym}`
    const text = await fetchText(url)
    const json = parseJsonp<Record<string, unknown>>(text)
    return json ?? null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}

/**
 * 同系列 ETF 基金列表。
 *
 * @sourceUrl https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getSameLxFundList?type=2&symbol={market}{code}
 * @param code 6 位 ETF 代码
 * @returns `{ list: [...] }`，失败返回 null
 * @usage `fetchTencentSameSeriesFunds('510300')`
 * @remarks JSONP 格式。type=2 表示同系列基金。列出同一基金管理人旗下相同跟踪标的的系列产品。
 * @example
 * ```ts
 * const series = await fetchTencentSameSeriesFunds('510300')
 * // { list: [{ code: '...', name: '...', ... }, ...] }
 * ```
 */
export async function fetchTencentSameSeriesFunds(code: string): Promise<Record<string, unknown> | null> {
  const bare = normalizeCode(code)
  if (!bare) return null
  try {
    const sym = `${tencentMarketPrefix(bare)}${bare}`
    const url = `https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getSameLxFundList?type=2&symbol=${sym}`
    const text = await fetchText(url)
    const json = parseJsonp<Record<string, unknown>>(text)
    return json ?? null
  } catch (e) {
    rethrowIfFreeProviderThrottleTrigger(e)
    return null
  }
}
