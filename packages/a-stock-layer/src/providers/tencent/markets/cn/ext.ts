import { normalizeCode } from '../../../../utils/helpers.js'
import type { TencentCnHandler } from './handler.js'
import {
  fetchTencentGlobalFuturesList,
} from '../../api/global-futures-service.js'
import {
  fetchTencentGlobalIndexList,
} from '../../api/global-index-service.js'
import {
  fetchTencentExchangeRateList,
} from '../../api/exchange-rate-service.js'
import {
  fetchTencentCnIndexSnapshot,
} from '../../api/cn-index-service.js'
import {
  fetchTencentHkStockList,
} from '../../api/hk-rank-service.js'
import {
  fetchTencentIndustryHeatRank,
} from '../../api/industry-heat-service.js'
import {
  fetchTencentIndustryBoardList,
  fetchTencentIndustryConstituents,
  fetchTencentIndustryRank,
  fetchTencentInvestRate,
  fetchTencentJggd,
  fetchTencentPlateTags,
  fetchTencentRelatedPlates,
  fetchTencentSmartboxSearch,
  fetchTencentTradeDetails,
} from '../../api/proxy.js'
import {
  mapTencentIndustryBoardRows,
  mapTencentIndustryConstituentRows,
  mapTencentIndustryRankRow,
  mapTencentPlateTagRows,
  mapTencentRelatedPlateRows,
  mapTencentTradeDetailRows,
} from '../../normalize/market.js'

type Handler = TencentCnHandler & Record<string, unknown>

/**
 * 腾讯证券 Provider 扩展自定义方法。
 *
 * 完整 API 文档（源 URL、入参、返回值、示例）见 {@link ../../custom-method-docs.ts}。
 * MCP 注册见 `core/custom-methods.ts` → `TENCENT_CUSTOM`。
 */
export function mixTencentExt(Driver: { prototype: TencentCnHandler }) {
  const p = Driver.prototype as Handler

  /**
   * 全球期货实时列表。
   *
   * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/rank/worldCommodities
   * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=qh_global&module=GQH&type=ALL
   */
  p.tencentGlobalFuturesList = async function tencentGlobalFuturesList(
    category = 'ALL',
    page = 1,
    pageSize = 40,
    sortType: string | number = 1,
    order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
  ) {
    const result = await fetchTencentGlobalFuturesList({
      category, page, pageSize, sortType, order,
    })
    if (!result.items.length && !result.total) return null
    return [{ ...result, source: 'tencent_world_commodities' }]
  }

  /**
   * 全球股指列表。
   *
   * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/rank/indexRankDetail2
   * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=indices&module=GIDX&type=ALL
   * @param region ALL / EU / AM / AS / OA
   * @returns `[{ region, page, pageSize, total, items[{ code, qtCode, name, price, changePct, ... }], source }]`
   * @usage `engine.invokeCustomMethod("tencent","tencentGlobalIndexList",["ALL",1,40,2,"desc"])`
   */
  p.tencentGlobalIndexList = async function tencentGlobalIndexList(
    region = 'ALL',
    page = 1,
    pageSize = 40,
    sortType: string | number = 1,
    order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
  ) {
    const result = await fetchTencentGlobalIndexList({
      region, page, pageSize, sortType, order,
    })
    if (!result.items.length && !result.total) return null
    return [{ ...result, source: 'tencent_global_index_rank' }]
  }

  /**
   * 全球外汇/汇率实时列表（mstats ER 模块）。
   *
   * @sourceUrl https://qt.gtimg.cn/?q=whUSDCNY,whEURUSD,...
   * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=exchange&module=ER&type=ALL
   * @param category ALL / BASE（基本汇率）/ CROSS（交叉汇率）
   * @param page 页码（客户端分页）
   * @param pageSize 每页条数，最大 200
   * @param sortType 0 名称 / 1 货币对 / 2 最新价 / 3 涨跌幅 / 4 涨跌额
   * @param order desc|down 降序，asc|up 升序
   * @returns `[{ category, page, pageSize, total, items[{ code, qtCode, name, price, changePct, bid, ask, ... }], source }]`
   * @usage `engine.invokeCustomMethod("tencent","tencentExchangeRateList",["ALL",1,40,3,"desc"])`
   * @remarks 与全球期货 worldCommodities 的 exchangeRate 桶不同，此为 mstats 专用 wh* 直盘/交叉盘列表
   */
  p.tencentExchangeRateList = async function tencentExchangeRateList(
    category = 'ALL',
    page = 1,
    pageSize = 40,
    sortType: string | number = 3,
    order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
  ) {
    const result = await fetchTencentExchangeRateList({
      category, page, pageSize, sortType, order,
    })
    if (!result.items.length && !result.total) return null
    return [{ ...result, source: 'tencent_wh_forex' }]
  }

  /**
   * A 股 / 首页主要指数快照（qt.gtimg.cn 批量行情）。
   *
   * @sourceUrl https://qt.gtimg.cn/q=sh000001,sz399001,...
   * @pageUrl https://stockapp.finance.qq.com/mstats/#
   * @param preset major（默认）/ mstats_home（首页滚动条）/ custom（配合 codes）
   * @param includeBoardRanks 是否附带上证/深证指数成分涨跌榜
   * @returns `[{ preset, symbols, items[{ code, qtCode, name, price, changePct, ... }], boardRanks?, source }]`
   * @usage `engine.invokeCustomMethod("tencent","tencentCnIndexSnapshot",["major",false])`
   */
  p.tencentCnIndexSnapshot = async function tencentCnIndexSnapshot(
    preset = 'major',
    includeBoardRanks = false,
    codes = '',
    boardRankPageSize = 10,
  ) {
    const result = await fetchTencentCnIndexSnapshot({
      preset,
      codes: codes || undefined,
      includeBoardRanks: Boolean(includeBoardRanks),
      boardRankPageSize,
    })
    if (!result.items.length) return null
    return [{ ...result, source: 'tencent_qt_index' }]
  }

  /**
   * 港股排行列表（mstats HK 模块）。
   *
   * @sourceUrl https://stock.gtimg.cn/data/hk_rank.php?board=main_all&metric=change_rate&...
   * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=hk_mb&module=hk&type=MB
   * @param board MB / GEM / HSI 等 mstats type，或 main_all 等上游 board 名
   * @param sortType 列序号 3 最新价 / 32 涨跌幅，或字段名 price/change_rate
   * @returns `[{ board, boardKey, page, pageSize, total, items[{ code, name, price, changePct, ... }], source }]`
   * @usage `engine.invokeCustomMethod("tencent","tencentHkStockList",["MB",1,20,32,"desc"])`
   * @remarks 盘前/非交易时段 hk_rank 可能为空，自动回退 rank/hk/getList
   */
  p.tencentHkStockList = async function tencentHkStockList(
    board = 'MB',
    page = 1,
    pageSize = 20,
    sortType: string | number = 32,
    order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
  ) {
    const result = await fetchTencentHkStockList({
      board, page, pageSize, sortType, order,
    })
    if (!result.items.length && !result.total) return null
    return [result]
  }

  /**
   * 首页行业热度排行（板块平均涨跌幅 + 领涨股）。
   *
   * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/mktHs/rank?l=10&p=1&t=averatio&o=0
   * @pageUrl https://stockapp.finance.qq.com/mstats/#
   * @param type averatio 或 01/averatio（沪深 A 股行业平均）
   * @param order desc/down 涨幅榜（o=0），asc/up 跌幅榜（o=1）
   * @returns `[{ type, page, pageSize, order, total, items[{ industryCode, industryName, changePct, leadingStock, ... }], source }]`
   * @usage `engine.invokeCustomMethod("tencent","tencentIndustryHeatRank",["averatio",1,10,"desc"])`
   */
  p.tencentIndustryHeatRank = async function tencentIndustryHeatRank(
    type = 'averatio',
    page = 1,
    pageSize = 10,
    order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
  ) {
    const result = await fetchTencentIndustryHeatRank({
      type, page, pageSize, order,
    })
    if (!result.items.length) return null
    return [{ ...result, source: 'tencent_industry_heat' }]
  }

  /**
   * 申万行业板块列表（一级/二级）。
   *
   * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank
   * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=hy_first&module=hy&type=first
   * @param level first → board_type=hy；second → hy2
   * @returns `[{ level, page, pageSize, total, items[{ industryCode, name, leadingStock, ... }], source }]`
   * @usage `engine.invokeCustomMethod("tencent","tencentShenwanIndustryList",["first",1,20,"priceRatio","desc"])`
   */
  p.tencentShenwanIndustryList = async function tencentShenwanIndustryList(
    level = 'first',
    page = 1,
    pageSize = 20,
    sortType: string | number = 'priceRatio',
    order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
  ) {
    const direct = order === 'asc' || order === 'up' ? 'up' : 'down'
    const data = await fetchTencentIndustryBoardList({
      level,
      page: Math.max(1, page),
      pageSize: Math.max(1, Math.min(pageSize, 100)),
      sortType,
      direct,
    })
    const items = mapTencentIndustryBoardRows(data.rank_list ?? [])
    if (!items.length && !data.total) return null
    return [{
      level,
      page: Math.max(1, page),
      pageSize: Math.max(1, Math.min(pageSize, 100)),
      total: data.total ?? items.length,
      items,
      source: 'tencent_industry_board',
    }]
  }

  /**
   * 申万行业成分股。
   *
   * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList
   * @pageUrl https://stockapp.finance.qq.com/mstats/#mod=list&id=pt01801780&typename=银行&sign=web
   * @param industryCode 行业代码如 pt01801780（来自行业列表 industryCode）
   * @returns `[{ industryCode, page, pageSize, total, items[{ code, name, price, changePct, ... }], source }]`
   * @usage `engine.invokeCustomMethod("tencent","tencentIndustryConstituents",["pt01801780",1,20,"priceRatio","desc"])`
   */
  p.tencentIndustryConstituents = async function tencentIndustryConstituents(
    industryCode: string,
    page = 1,
    pageSize = 20,
    sortType: string | number = 'priceRatio',
    order: 'asc' | 'desc' | 'up' | 'down' = 'desc',
  ) {
    const code = industryCode.trim()
    if (!code) return null
    const direct = order === 'asc' || order === 'up' ? 'up' : 'down'
    const data = await fetchTencentIndustryConstituents({
      industryCode: code,
      page: Math.max(1, page),
      pageSize: Math.max(1, Math.min(pageSize, 100)),
      sortType,
      direct,
    })
    const items = mapTencentIndustryConstituentRows(data.rank_list ?? [])
    if (!items.length && !data.total) return null
    return [{
      industryCode: code,
      page: Math.max(1, page),
      pageSize: Math.max(1, Math.min(pageSize, 100)),
      total: data.total ?? items.length,
      items,
      source: 'tencent_industry_constituent',
    }]
  }

  /**
   * 个股行业/概念/地域标签。
   *
   * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/stockinfo/plateNew
   * @pageUrl https://gu.qq.com/{symbol}/gp
   * @param code 6 位 A 股代码
   * @returns `[{ code, plateType, plateName, changePct, source }]`
   */
  p.tencentStockPlates = async function tencentStockPlates(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentPlateTags(bare)
    const rows = mapTencentPlateTagRows(bare, data)
    return rows.length ? rows : null
  }

  /**
   * 关联板块列表。
   *
   * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/stock/relate/data/plate
   * @param code 6 位 A 股代码
   * @returns `[{ code, peerCode, peerName, source }]`
   */
  p.tencentRelatedPlates = async function tencentRelatedPlates(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentRelatedPlates(bare)
    const rows = mapTencentRelatedPlateRows(bare, data)
    return rows.length ? rows : null
  }

  /**
   * 个股行业内估值排名。
   *
   * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/hs/hypm/get
   * @param code 6 位 A 股代码
   * @returns `[{ code, industryName, pe, peRank, marketCapRank, ... }]`
   * @remarks 与全市场行业榜 tencentShenwanIndustryList 不同
   */
  p.tencentIndustryRank = async function tencentIndustryRank(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentIndustryRank(bare)
    const rows = mapTencentIndustryRankRow(bare, data)
    return rows.length ? rows : null
  }

  /**
   * 机构评级与目标价。
   *
   * @sourceUrl getInvestRate + jggd/get（proxy.finance.qq.com/ifzqgtimg/...）
   * @pageUrl https://gu.qq.com/{symbol}/gp/yjbg
   * @returns `[{ code, ratings, recentReports, monthly, targetPrice, source }]`
   */
  p.tencentInstitutionRating = async function tencentInstitutionRating(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const [investRate, jggd] = await Promise.all([
      fetchTencentInvestRate(bare),
      fetchTencentJggd(bare),
    ])
    return [{
      code: bare,
      ratings: investRate.pjtj ?? {},
      recentReports: investRate.report?.info ?? [],
      monthly: { m1: jggd.pjtj1 ?? null, m2: jggd.pjtj2 ?? null, m3: jggd.pjtj3 ?? null },
      targetPrice: { avg: jggd.mbjj ?? null, high: jggd.zgjg ?? null, low: jggd.zdjg ?? null },
      source: 'tencent_investRate',
    }]
  }

  /**
   * 股票搜索。
   *
   * @sourceUrl https://proxy.finance.qq.com/cgi/cgi-bin/smartbox/search
   * @param query 代码或名称关键词
   * @returns TencentSmartboxStock[]
   */
  p.tencentStockSearch = async function tencentStockSearch(query: string) {
    const q = query.trim()
    if (!q) return null
    const rows = await fetchTencentSmartboxSearch(q)
    return rows.length ? rows : null
  }

  /**
   * 逐笔成交明细。
   *
   * @sourceUrl https://proxy.finance.qq.com/ifzqgtimg/appstock/app/dealinfo/getMingxiV2
   * @remarks 仅盘中有效，收盘后常为空
   */
  p.tencentTradeDetails = async function tencentTradeDetails(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentTradeDetails(bare)
    const rows = mapTencentTradeDetailRows(bare, data)
    return rows.length ? rows : null
  }
}
