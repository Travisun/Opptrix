import { normalizeCode } from '../../../../utils/helpers.js'
import type { SinafinanceCnHandler } from './handler.js'
import {
  fetchSinaConceptPlatesFromCode,
  fetchSinaCorpFullBundle,
  fetchSinaExecutives,
  fetchSinaFundHoldings,
  fetchSinaIndexMembership,
  fetchSinaMajorShareholders,
  fetchSinaRelatedSecurities,
} from '../../api/corp-service.js'
import {
  fetchSinaAnnualBulletins,
  fetchSinaAddStockHistory,
  fetchSinaAllBulletinPage,
  fetchSinaBulletinDetail,
  fetchSinaBulletins,
  fetchSinaCirculateShareholders,
  fetchSinaCorpRule,
  fetchSinaDividendList,
  fetchSinaDragonTigerForStock,
  fetchSinaFinancialPivotRaw,
  fetchSinaInsiderTrades,
  fetchSinaIpoInfo,
  fetchSinaLargeOrderTraces,
  fetchSinaMarginTradingSnapshot,
  fetchSinaPerfForecastList,
  fetchSinaPriceHistory,
  fetchSinaPriceStats,
  fetchSinaShareUnlockList,
  fetchSinaStockComment,
  fetchSinaStockStructureHistory,
} from '../../api/ext-service.js'
import {
  fetchSinaEtfList,
  fetchSinaFundAgencies,
  fetchSinaFundAnnouncements,
  fetchSinaFundBalanceSheet,
  fetchSinaFundDistributions,
  fetchSinaFundDividends,
  fetchSinaFundDocuments,
  fetchSinaFundFees,
  fetchSinaFundFinancialIndicators,
  fetchSinaFundHolderStructure,
  fetchSinaFundHolderStructureHistory,
  fetchSinaFundIncomeStatement,
  fetchSinaFundIndustryService,
  fetchSinaFundManagerRatingService,
  fetchSinaFundNav,
  fetchSinaFundProfile,
  fetchSinaFundQuote,
  fetchSinaFundShareChange,
  fetchSinaFundStockStyleService,
  fetchSinaFundTopHoldService,
  fetchSinaFundTopHolders,
  fetchSinaFundTypePerfService,
} from '../../api/fund-service.js'

type Handler = SinafinanceCnHandler & Record<string, unknown>

/**
 * 新浪 sinafinance Provider 扩展自定义方法。
 *
 * 完整 API 文档（源 URL、入参、返回值、示例）见 {@link ../../custom-method-docs.ts}。
 * MCP 注册见 `core/custom-methods.ts` → `SINA_CUSTOM`。
 */
export function mixSinafinanceExt(Driver: { prototype: SinafinanceCnHandler }) {
  const p = Driver.prototype as Handler

/**
   * 公司完整资料（简介、行业、概念等 F10 聚合）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/{code}.phtml 等多页 HTML 解析
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/{code}.phtml
   * @returns Record<string, unknown> 含 orgProfile、industry、concept 等字段
   * @usage engine.invokeCustomMethod("sinafinance", "sinaCorpInfo", ["600519"])
   * @remarks 聚合公司简介、概念、相关证券等 HTML 页。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaCorpInfo","args":["600519"]}
   */
  p.sinaCorpInfo = async function sinaCorpInfo(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaCorpFullBundle(bare)
  }

/**
   * 公司高管 / 董事会成员
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpManager/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpManager/stockid/{code}.phtml
   * @returns SinaExecutiveRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaExecutives", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaExecutives","args":["600519"]}
   */
  p.sinaExecutives = async function sinaExecutives(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaExecutives(bare)
    return rows.length ? rows : null
  }

/**
   * 主要股东持股明细
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_StockHolder/stockid/{code}/displaytype/30.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_StockHolder/stockid/{code}/displaytype/30.phtml
   * @returns SinaShareholderRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaMajorShareholders", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaMajorShareholders","args":["600519"]}
   */
  p.sinaMajorShareholders = async function sinaMajorShareholders(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaMajorShareholders(bare)
    return rows.length ? rows : null
  }

/**
   * 流通股东持股明细
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CirculateStockHolder/stockid/{code}/displaytype/30.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CirculateStockHolder/stockid/{code}/displaytype/30.phtml
   * @returns SinaShareholderRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaCirculateShareholders", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaCirculateShareholders","args":["600519"]}
   */
  p.sinaCirculateShareholders = async function sinaCirculateShareholders(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaCirculateShareholders(bare)
    return rows.length ? rows : null
  }

/**
   * 基金持股明细（含多期截止日）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_FundStockHolder/stockid/{code}/displaytype/30.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_FundStockHolder/stockid/{code}/displaytype/30.phtml
   * @returns SinaFundHoldingBlock[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundHoldings", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundHoldings","args":["600519"]}
   */
  p.sinaFundHoldings = async function sinaFundHoldings(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaFundHoldings(bare)
    return rows.length ? rows : null
  }

/**
   * 所属概念板块（含行情中心 node）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpOtherInfo/stockid/{code}/menu_num/5.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/mkt/#chgn_{node}
   * @returns SinaConceptPlateRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaConceptPlates", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaConceptPlates","args":["600519"]}
   */
  p.sinaConceptPlates = async function sinaConceptPlates(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaConceptPlatesFromCode(bare)
    return rows.length ? rows : null
  }

/**
   * 相关证券（AH/B 股等）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpXiangGuan/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpXiangGuan/stockid/{code}.phtml
   * @returns SinaRelatedSecurityRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaRelatedSecurities", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaRelatedSecurities","args":["600519"]}
   */
  p.sinaRelatedSecurities = async function sinaRelatedSecurities(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaRelatedSecurities(bare)
    return rows.length ? rows : null
  }

/**
   * 所属指数 / 系别
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpXiangGuan/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpXiangGuan/stockid/{code}.phtml
   * @returns SinaIndexMembershipRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaIndexMembership", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaIndexMembership","args":["600519"]}
   */
  p.sinaIndexMembership = async function sinaIndexMembership(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaIndexMembership(bare)
    return rows.length ? rows : null
  }

/**
   * 分红送转历史
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vISSUE_ShareBonus/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vISSUE_ShareBonus/stockid/{code}.phtml
   * @returns Dividend[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaDividends", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaDividends","args":["600519"]}
   */
  p.sinaDividends = async function sinaDividends(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaDividendList(bare)
    return rows.length ? rows : null
  }

/**
   * 财务透视表（主要指标/利润/资产负债/现金流/杜邦）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_FinanceSummary/stockid/{code}.phtml 等（sheet 切换）
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_FinanceSummary/stockid/{code}.phtml
   * @returns Record<string, unknown> 原始透视表行列
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFinancialPivot", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param sheet guide|profit|balance|cashflow|dupont（可选），默认 "guide"
   * @example {"provider":"sinafinance","method":"sinaFinancialPivot","args":["600519"]}
   */
  p.sinaFinancialPivot = async function sinaFinancialPivot(
    code: string,
    sheet: 'guide' | 'profit' | 'balance' | 'cashflow' | 'dupont' = 'guide',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFinancialPivotRaw(bare, sheet)
  }

/**
   * 股本结构历史
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_StockStructure/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_StockStructure/stockid/{code}.phtml
   * @returns 股本变动记录[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaStockStructure", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaStockStructure","args":["600519"]}
   */
  p.sinaStockStructure = async function sinaStockStructure(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaStockStructureHistory(bare)
    return rows.length ? rows : null
  }

/**
   * 公司章程
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpRule/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpRule/stockid/{code}.phtml
   * @returns { title, content }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaCorpRule", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaCorpRule","args":["600519"]}
   */
  p.sinaCorpRule = async function sinaCorpRule(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaCorpRule(bare)
  }

/**
   * 年度报告列表（旧版分类页）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_Bulletin/stockid/{code}/page_type/ndbg.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_Bulletin/stockid/{code}/page_type/ndbg.phtml
   * @returns 公告摘要行[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaAnnualBulletins", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaAnnualBulletins","args":["600519"]}
   */
  p.sinaAnnualBulletins = async function sinaAnnualBulletins(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaAnnualBulletins(bare)
    return rows.length ? rows : null
  }

/**
   * 分类公告列表（年报/中报/一季报/三季报）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_Bulletin/stockid/{code}/page_type/{pageType}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_Bulletin/stockid/{code}/page_type/ndbg.phtml
   * @returns 公告摘要行[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaBulletins", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param pageType ndbg|zqbg|yjdbg|sjdbg（可选），默认 "ndbg"
   * @example {"provider":"sinafinance","method":"sinaBulletins","args":["600519"]}
   */
  p.sinaBulletins = async function sinaBulletins(
    code: string,
    pageType: 'ndbg' | 'zqbg' | 'yjdbg' | 'sjdbg' = 'ndbg',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaBulletins(bare, pageType)
    return rows.length ? rows : null
  }

/**
   * 全部公告分页（含 total/page）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllBulletin/stockid/{code}.phtml?page={page}
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllBulletin/stockid/{code}.phtml
   * @returns { page, total, items: 公告行[] }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaAllBulletins", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param page 页码（可选），默认 1
   * @example {"provider":"sinafinance","method":"sinaAllBulletins","args":["600519"]}
   */
  p.sinaAllBulletins = async function sinaAllBulletins(code: string, page = 1) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const result = await fetchSinaAllBulletinPage(bare, page)
    return result.items.length ? result : null
  }

/**
   * 公告正文详情
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllBulletinDetail/stockid/{code}/id/{bulletinId}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllBulletinDetail/stockid/{code}/id/{bulletinId}.phtml
   * @returns { title, date, content, url }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaBulletinDetail", ["600519","1234567"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param bulletinId 公告 id（必填）
   * @example {"provider":"sinafinance","method":"sinaBulletinDetail","args":["600519","1234567"]}
   */
  p.sinaBulletinDetail = async function sinaBulletinDetail(code: string, bulletinId: string) {
    const bare = normalizeCode(code)
    if (!bare || !bulletinId) return null
    return fetchSinaBulletinDetail(bare, bulletinId)
  }

/**
   * 内部人交易 / 高管持股变动
   * @sourceUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/nbjy/index.phtml?symbol={symbol}&bdate=&edate=
   * @pageUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/nbjy/index.phtml
   * @returns 内部人交易记录[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaInsiderTrades", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param bdate 开始日期 YYYY-MM-DD（可选），默认 ""
   * @param edate 结束日期 YYYY-MM-DD（可选），默认 ""
   * @example {"provider":"sinafinance","method":"sinaInsiderTrades","args":["600519"]}
   */
  p.sinaInsiderTrades = async function sinaInsiderTrades(
    code: string,
    bdate = '',
    edate = '',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaInsiderTrades(bare, bdate, edate)
    return rows.length ? rows : null
  }

/**
   * 千股千评 / 个股点评
   * @sourceUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/stockcomment/index.phtml?symbol={symbol}
   * @pageUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/stockcomment/index.phtml
   * @returns { score, comment, ... }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaStockComment", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaStockComment","args":["600519"]}
   */
  p.sinaStockComment = async function sinaStockComment(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaStockComment(bare)
  }

/**
   * 历史价格与成交（分价表）
   * @sourceUrl http://market.finance.sina.com.cn/pricehis.php?symbol={symbol}&startdate=&enddate=
   * @pageUrl http://finance.sina.com.cn/realstock/company/sh600519/nc.shtml
   * @returns { levels: 分价统计行[] }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaPriceHistory", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param startDate YYYY-MM-DD（可选），默认 ""
   * @param endDate YYYY-MM-DD（可选），默认 ""
   * @example {"provider":"sinafinance","method":"sinaPriceHistory","args":["600519"]}
   */
  p.sinaPriceHistory = async function sinaPriceHistory(
    code: string,
    startDate = '',
    endDate = '',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const result = await fetchSinaPriceHistory(bare, startDate, endDate)
    return result.levels.length ? result : null
  }

/**
   * 新股发行 / 上市信息
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vISSUE_NewStock/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vISSUE_NewStock/stockid/{code}.phtml
   * @returns IPO 信息对象
   * @usage engine.invokeCustomMethod("sinafinance", "sinaIpoInfo", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaIpoInfo","args":["600519"]}
   */
  p.sinaIpoInfo = async function sinaIpoInfo(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaIpoInfo(bare)
  }

/**
   * 增发历史
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vISSUE_AddStock/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vISSUE_AddStock/stockid/{code}.phtml
   * @returns 增发记录[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaAddStockHistory", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaAddStockHistory","args":["600519"]}
   */
  p.sinaAddStockHistory = async function sinaAddStockHistory(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaAddStockHistory(bare)
    return rows.length ? rows : null
  }

/**
   * 限售解禁计划
   * @sourceUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/xsjj/index.phtml?symbol={symbol}
   * @pageUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/xsjj/index.phtml
   * @returns SinaShareUnlockRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaShareUnlock", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaShareUnlock","args":["600519"]}
   */
  p.sinaShareUnlock = async function sinaShareUnlock(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaShareUnlockList(bare)
    return rows.length ? rows : null
  }

/**
   * 融资融券快照（个股在全市场表中的最近记录）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/rzrq/index.phtml?symbol={symbol}
   * @pageUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/rzrq/index.phtml
   * @returns SinaMarginTradingRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaMarginTrading", ["600519"])
   * @remarks 全市场 rzrq 页体积大；仅提取目标股最近若干条。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaMarginTrading","args":["600519"]}
   */
  p.sinaMarginTrading = async function sinaMarginTrading(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaMarginTradingSnapshot(bare)
    return rows.length ? rows : null
  }

/**
   * 个股龙虎榜（指定交易日）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/lhb/index.phtml?tradedate={date}
   * @pageUrl https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind/lhb/index.phtml
   * @returns DragonTiger[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaDragonTigerStock", ["600519"])
   * @remarks 若当日未上榜返回空；建议配合 DRAGON_TIGER capability。
   * @param code 6 位 A 股/基金代码（必填）
   * @param date 交易日 YYYY-MM-DD，默认今日（可选），默认 ""
   * @example {"provider":"sinafinance","method":"sinaDragonTigerStock","args":["600519"]}
   */
  p.sinaDragonTigerStock = async function sinaDragonTigerStock(code: string, date = '') {
    const bare = normalizeCode(code)
    if (!bare) return null
    const tradeDate = date || new Date().toISOString().slice(0, 10)
    const rows = await fetchSinaDragonTigerForStock(bare, tradeDate)
    return rows.length ? rows : null
  }

/**
   * 分价统计 / 筹码分布
   * @sourceUrl https://vip.stock.finance.sina.com.cn/quotes_service/view/cn_price_list.php?symbol={symbol}
   * @pageUrl http://finance.sina.com.cn/realstock/company/sh600519/nc.shtml
   * @returns SinaPriceLevelRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaPriceDistribution", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaPriceDistribution","args":["600519"]}
   */
  p.sinaPriceDistribution = async function sinaPriceDistribution(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaPriceStats(bare)
    return rows.length ? rows : null
  }

/**
   * 大单追踪
   * @sourceUrl https://vip.stock.finance.sina.com.cn/quotes_service/view/CN_TransListV2.php?symbol={symbol}
   * @pageUrl http://finance.sina.com.cn/realstock/company/sh600519/nc.shtml
   * @returns 大单明细行[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaLargeOrders", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaLargeOrders","args":["600519"]}
   */
  p.sinaLargeOrders = async function sinaLargeOrders(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaLargeOrderTraces(bare)
    return rows.length ? rows : null
  }

/**
   * 业绩预告
   * @sourceUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_AchievementNotice/stockid/{code}.phtml
   * @pageUrl https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_AchievementNotice/stockid/{code}.phtml
   * @returns 业绩预告行[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaPerfForecast", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaPerfForecast","args":["600519"]}
   */
  p.sinaPerfForecast = async function sinaPerfForecast(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaPerfForecastList(bare)
    return rows.length ? rows : null
  }

/**
   * ETF 列表（分页）
   * @sourceUrl https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?node=etf_hq_fund&page={page}&num={pageSize}
   * @pageUrl https://vip.stock.finance.sina.com.cn/fund_center/index.html#jjhqetf
   * @returns { page, pageSize, total, items: ETF 行情行[] }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaEtfList", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param page 页码（可选），默认 1
   * @param pageSize 每页条数（可选），默认 40
   * @example {"provider":"sinafinance","method":"sinaEtfList","args":["600519"]}
   */
  p.sinaEtfList = async function sinaEtfList(page = 1, pageSize = 40) {
    const result = await fetchSinaEtfList({ page, pageSize })
    return result.items.length ? result : null
  }

/**
   * 基金/ETF 实时行情
   * @sourceUrl https://hq.sinajs.cn/list=of{code}|f_{code}|{market}{code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns SinaFundQuoteRaw
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundQuote", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundQuote","args":["600519"]}
   */
  p.sinaFundQuote = async function sinaFundQuote(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundQuote(bare)
  }

/**
   * 基金基本信息（类型、经理、成立日等）
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabjjgk?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns SinaFundProfileRaw
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundProfile", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundProfile","args":["600519"]}
   */
  p.sinaFundProfile = async function sinaFundProfile(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundProfile(bare)
  }

/**
   * 基金历史净值（分页）
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/CaihuiFundInfoService.getNav?symbol={code}&page={page}&num={n}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns { rows: 净值行[], page, total }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundNav", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param page 页码（可选），默认 1
   * @param pageSize 每页条数（可选），默认 20
   * @example {"provider":"sinafinance","method":"sinaFundNav","args":["600519"]}
   */
  p.sinaFundNav = async function sinaFundNav(code: string, page = 1, pageSize = 20) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const result = await fetchSinaFundNav(bare, page, pageSize)
    return result.rows.length ? result : null
  }

/**
   * 基金费率与交易规则
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabfl + FdFundService.getDealRule
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 费率与规则对象
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundFees", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundFees","args":["600519"]}
   */
  p.sinaFundFees = async function sinaFundFees(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundFees(bare)
  }

/**
   * 基金分红与折算
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getJJFHAll?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 分红/折算记录
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundDistributions", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundDistributions","args":["600519"]}
   */
  p.sinaFundDistributions = async function sinaFundDistributions(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundDistributions(bare)
  }

/**
   * 基金公告列表
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/CaihuiFundInfoService.getGG?symbol={code}&page={page}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns { items: 公告行[], page }
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundAnnouncements", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param page 页码（可选），默认 1
   * @param type 公告类型筛选，默认可空（可选），默认 ""
   * @example {"provider":"sinafinance","method":"sinaFundAnnouncements","args":["600519"]}
   */
  p.sinaFundAnnouncements = async function sinaFundAnnouncements(
    code: string,
    page = 1,
    type = '',
  ) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const result = await fetchSinaFundAnnouncements(bare, page, type)
    return result.items.length ? result : null
  }

/**
   * 基金法律文件（招募说明书等）
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabflwj?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns SinaFundDocumentRow[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundDocuments", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundDocuments","args":["600519"]}
   */
  p.sinaFundDocuments = async function sinaFundDocuments(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaFundDocuments(bare)
    return rows?.length ? rows : null
  }

/**
   * 申购赎回份额变动
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabsgsh?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 份额变动行[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundShareChange", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundShareChange","args":["600519"]}
   */
  p.sinaFundShareChange = async function sinaFundShareChange(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const rows = await fetchSinaFundShareChange(bare)
    return rows?.length ? rows : null
  }

/**
   * 销售机构
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabxsjg?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 销售机构列表
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundAgencies", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundAgencies","args":["600519"]}
   */
  p.sinaFundAgencies = async function sinaFundAgencies(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundAgencies(bare)
  }

/**
   * 基金分红历史（结构化）
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getJJFHAll?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 分红记录
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundDividends", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundDividends","args":["600519"]}
   */
  p.sinaFundDividends = async function sinaFundDividends(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundDividends(bare)
  }

/**
   * 基金十大持有人
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabsdcyr?symbol={code}&date={date}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 十大持有人列表
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundTopHolders", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param date 报告期 YYYY-MM-DD，默认可空（可选），默认 ""
   * @example {"provider":"sinafinance","method":"sinaFundTopHolders","args":["600519"]}
   */
  p.sinaFundTopHolders = async function sinaFundTopHolders(code: string, date = '') {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundTopHolders(bare, date)
  }

/**
   * 持有人结构（机构/个人占比）
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabcyrjg?symbol={code}&date={date}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 持有人结构对象
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundHolderStructure", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @param date 报告期（可选），默认 ""
   * @example {"provider":"sinafinance","method":"sinaFundHolderStructure","args":["600519"]}
   */
  p.sinaFundHolderStructure = async function sinaFundHolderStructure(code: string, date = '') {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundHolderStructure(bare, date)
  }

/**
   * 持有人结构历史变动
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabsdcyrbd?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 历史结构行[]
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundHolderStructureHistory", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundHolderStructureHistory","args":["600519"]}
   */
  p.sinaFundHolderStructureHistory = async function sinaFundHolderStructureHistory(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundHolderStructureHistory(bare)
  }

/**
   * 基金主要财务指标
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabcwzb?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 财务指标表
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundFinancialIndicators", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundFinancialIndicators","args":["600519"]}
   */
  p.sinaFundFinancialIndicators = async function sinaFundFinancialIndicators(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundFinancialIndicators(bare)
  }

/**
   * 基金利润表
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tablrb?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 利润表行列
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundIncomeStatement", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundIncomeStatement","args":["600519"]}
   */
  p.sinaFundIncomeStatement = async function sinaFundIncomeStatement(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundIncomeStatement(bare)
  }

/**
   * 基金资产负债表
   * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FundPageInfoService.tabfzb?symbol={code}
   * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
   * @returns 资产负债表行列
   * @usage engine.invokeCustomMethod("sinafinance", "sinaFundBalanceSheet", ["600519"])
   * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
   * @param code 6 位 A 股/基金代码（必填）
   * @example {"provider":"sinafinance","method":"sinaFundBalanceSheet","args":["600519"]}
   */
  p.sinaFundBalanceSheet = async function sinaFundBalanceSheet(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundBalanceSheet(bare)
  }

/**
 * 重仓股（JSONP API，比 HTML 解析更可靠）
 * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getTopHold?symbol={code}
 * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
 * @returns 重仓股列表
 * @usage engine.invokeCustomMethod("sinafinance", "sinaFundTopHold", ["159516"])
 * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
 * @param code 6 位基金代码（必填）
 * @example {"provider":"sinafinance","method":"sinaFundTopHold","args":["159516"]}
 */
  p.sinaFundTopHold = async function sinaFundTopHold(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundTopHoldService(bare)
  }

/**
 * 行业配置
 * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/CaihuiFundInfoService.getIndustry?symbol={code}
 * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
 * @returns 行业配置列表
 * @usage engine.invokeCustomMethod("sinafinance", "sinaFundIndustry", ["159516"])
 * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
 * @param code 6 位基金代码（必填）
 * @example {"provider":"sinafinance","method":"sinaFundIndustry","args":["159516"]}
 */
  p.sinaFundIndustry = async function sinaFundIndustry(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundIndustryService(bare)
  }

/**
 * 基金经理评分
 * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/XincaiFundInfoService.getFundManagerYJ?managerid={managerId}
 * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
 * @returns 基金经理评分对象
 * @usage engine.invokeCustomMethod("sinafinance", "sinaFundManagerRating", ["3000001"])
 * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
 * @param managerId 基金经理 ID（必填）
 * @example {"provider":"sinafinance","method":"sinaFundManagerRating","args":["3000001"]}
 */
  p.sinaFundManagerRating = async function sinaFundManagerRating(managerId: string) {
    if (!managerId) return null
    return fetchSinaFundManagerRatingService(managerId)
  }

/**
 * 股票风格
 * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/XincaiFundInfoService.FundStockStyle?symbol={code}
 * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
 * @returns 股票风格信息
 * @usage engine.invokeCustomMethod("sinafinance", "sinaFundStockStyle", ["159516"])
 * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
 * @param code 6 位基金代码（必填）
 * @example {"provider":"sinafinance","method":"sinaFundStockStyle","args":["159516"]}
 */
  p.sinaFundStockStyle = async function sinaFundStockStyle(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    return fetchSinaFundStockStyleService(bare)
  }

/**
 * 基金类型历史业绩
 * @sourceUrl https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/XincaiFundInfoService.getFundTypeYJ?companyId={companyId}&type2id={type2id}
 * @pageUrl https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml
 * @returns 类型历史业绩列表
 * @usage engine.invokeCustomMethod("sinafinance", "sinaFundTypePerf", ["800000","x2002"])
 * @remarks Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。
 * @param companyId 基金公司 ID（必填）
 * @param type2id 二级分类 ID（可选），默认 "x2002"
 * @example {"provider":"sinafinance","method":"sinaFundTypePerf","args":["800000","x2002"]}
 */
  p.sinaFundTypePerf = async function sinaFundTypePerf(companyId: string, type2id = 'x2002') {
    if (!companyId) return null
    return fetchSinaFundTypePerfService(companyId, type2id)
  }
}
