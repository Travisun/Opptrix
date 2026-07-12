import { isCnEtfCode } from '../../../../core/instrument.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'
import {
  fetchTencentFundProfile,
  fetchTencentFundAsset,
  fetchTencentFundRankInfo,
  fetchTencentFundNavHistory,
} from '../../api/etf-service.js'
import type { TencentCnHandler } from './handler.js'

type Handler = TencentCnHandler & Record<string, unknown>

/**
 * 挂载 Tencent 增强型 ETF Fund Profile 方法。
 *
 * 与 mixTencentEtf 共存，覆盖 etfProfile / etfNav / etfHoldings，
 * 使用腾讯基金净值页专用接口替代通用行情接口。
 */
export function mixTencentFundProfile(Driver: { prototype: TencentCnHandler }) {
  const p = Driver.prototype as Handler

  /**
   * ETF 增强型基金概况（合并基金档案 + 资产配置 + 业绩排名）。
   *
   * @sourceUrl https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getPriceZone?symbol={market}{code}
   * @sourceUrl https://zxg.txfund.com/ifzqgtimg/appstock/fund/baseInfo/asset?code={market}{code}
   * @sourceUrl https://web.ifzq.gtimg.cn/fund/newfund/fundBase/getRankInfo?symbol={market}{code}
   * @param etfCode 6 位 ETF 代码
   * @returns 包含基金档案、资产配置、排名信息的综合行数组，失败返回 null
   * @usage `engine.queryInstrumentData(ref, { capability: "etfProfile" })`
   * @remarks 并行拉取 fundProfile / fundAsset / fundRankInfo，合并为一行。
   *   字段兼容 StandardEtfProfileRow（code, name, fundType, manager, scale, nav, premiumRate），
   *   并扩展 assetAllocation / industryAllocation / topHoldings / performance 等。
   * @example
   * ```ts
   * const handler = new TencentCnHandler()
   * const rows = await handler.etfProfile('159971')
   * // [{ code: '159971', name: '富国创业板ETF', manager: '曹溥迪', ... }]
   * ```
   */
  p.etfProfile = async function etfProfile(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const bare = normalizeCode(etfCode)

    const [profileResp, assetResp, rankResp] = await Promise.all([
      fetchTencentFundProfile(bare),
      fetchTencentFundAsset(bare),
      fetchTencentFundRankInfo(bare),
    ])

    if (!profileResp && !assetResp && !rankResp) return null

    // getPriceZone 结构: { code, data: { info: {...}, data: {...}, profit: {...} } }
    const profileData = (profileResp?.data ?? {}) as Record<string, unknown>
    const info = (profileData.info ?? {}) as Record<string, unknown>
    const priceData = (profileData.data ?? {}) as Record<string, unknown>
    const profit = (profileData.profit ?? {}) as Record<string, unknown>

    // baseInfo/asset 结构: { code, data: { selector, report_time, stock[], industry[], asset[], ... } }
    const assetData = (assetResp?.data ?? {}) as Record<string, unknown>

    // getRankInfo 结构: { code, data: { zxrq, total, jzzf: {...}, avg_hbl: {...} } }
    const rankData = (rankResp?.data ?? {}) as Record<string, unknown>
    const jzzf = (rankData.jzzf ?? {}) as Record<string, unknown>
    const avgHbl = (rankData.avg_hbl ?? {}) as Record<string, unknown>

    const row: Record<string, unknown> = {
      code: bare,
      name: String(info.jjjc ?? info.jjqc ?? '').trim() || undefined,
      fullName: String(info.jjqc ?? '').trim() || undefined,
      fundType: String(info.txjjlx ?? info.jjlx ?? 'ETF').trim(),
      manager: String(info.jjjl ?? '').trim() || undefined,
      company: String(info.glrmc ?? '').trim() || undefined,
      custodian: String(info.tgrmc ?? '').trim() || undefined,
      listingDate: String(info.fxrq ?? '').slice(0, 10) || undefined,
      establishDate: String(info.clrq ?? '').slice(0, 10) || undefined,
      totalShares: safeFloat(info.clgm),
      scale: safeFloat(info.zxgm),
      nav: safeFloat(info.dwjz),
      accNav: safeFloat(info.ljjz),
      navDate: String(info.jzrq ?? '').trim() || undefined,
      latestPrice: safeFloat(priceData.zxjg),
      open: safeFloat(priceData.jtkp),
      high: safeFloat(priceData.zgj),
      low: safeFloat(priceData.zdj),
      premiumRate: safeFloat(priceData.zyjl),
      changePct: safeFloat(priceData.jgzffd),
      changeAmt: safeFloat(priceData.jgzf),
      volume: safeFloat(priceData.cjl),
      amount: safeFloat(priceData.cj_total_amount),
      totalDividends: safeFloat(profit.ljfh),
      dividendCount: safeFloat(profit.ljfhcs),
      source: 'tencent_fund',
    }

    // 资产配置
    if (assetData.asset || assetData.industry || assetData.stock) {
      row.assetAllocation = assetData.asset ?? []
      row.industryAllocation = assetData.industry ?? []
      row.topHoldings = Array.isArray(assetData.stock) ? (assetData.stock as unknown[]).slice(0, 10) : []
      row.bondHoldings = assetData.bond ?? []
      row.fundHoldings = assetData.fund ?? []
      row.commodityHoldings = assetData.commodity ?? []
      row.productHoldings = assetData.product ?? []
      row.totalStock = safeFloat(assetData.total_stock)
      row.totalBond = safeFloat(assetData.total_bond)
      row.totalFund = safeFloat(assetData.total_fund)
      row.totalCommodity = safeFloat(assetData.total_commodity)
      row.totalProduct = safeFloat(assetData.total_product)
      row.reportDate = String(assetData.report_time ?? '').slice(0, 10) || undefined
      row.totalAUM = String(assetData.total_money ?? '').trim() || undefined
      row.reportPeriods = assetData.selector ?? []
    }

    // 业绩排名
    if (rankData.zxrq || jzzf.w1 !== undefined) {
      row.performance = {
        w1: safeFloat(jzzf.w1),
        w4: safeFloat(jzzf.w4),
        w13: safeFloat(jzzf.w13),
        w26: safeFloat(jzzf.w26),
        w52: safeFloat(jzzf.w52),
        year: safeFloat(jzzf.year),
        total: safeFloat(jzzf.total),
        year3: safeFloat(jzzf.year3),
      }
      row.avgPerformance = {
        w1: safeFloat(avgHbl.w1),
        w4: safeFloat(avgHbl.w4),
        w13: safeFloat(avgHbl.w13),
        w26: safeFloat(avgHbl.w26),
        w52: safeFloat(avgHbl.w52),
        year: safeFloat(avgHbl.year),
        total: safeFloat(avgHbl.total),
        year3: safeFloat(avgHbl.year3),
      }
      row.rankTotal = safeFloat(rankData.total)
    }

    return [row]
  }

  /**
   * ETF 历史净值（使用腾讯基金全量净值接口）。
   *
   * @sourceUrl https://stockjs.finance.qq.com/fundUnitNavAll/data/year_all/{code}.js
   * @param etfCode 6 位 ETF 代码
   * @returns 标准 etfNav 行数组（code, date, nav, accNav, changePct, premiumRate, source），失败返回 null
   * @usage `engine.queryInstrumentData(ref, { capability: "etfNav" })`
   * @remarks 使用 year_all 接口获取从成立日至今的完整历史净值。响应为 JS 变量赋值格式，
   *   data 数组每项为 [日期, 单位净值, 累计净值]。
   * @example
   * ```ts
   * const handler = new TencentCnHandler()
   * const navs = await handler.etfNav('159971')
   * // [{ code: '159971', date: '2019-06-11', nav: 1.0, accNav: 1.0, ... }, ...]
   * ```
   */
  p.etfNav = async function etfNav(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const bare = normalizeCode(etfCode)

    const result = await fetchTencentFundNavHistory(bare)
    if (!result) return null

    const raw = result.data as unknown[] | undefined
    if (!Array.isArray(raw)) return null

    const rows: Record<string, unknown>[] = []
    for (const item of raw) {
      if (!Array.isArray(item) || item.length < 3) continue
      const date = String(item[0] ?? '').slice(0, 10)
      if (!date) continue
      rows.push({
        code: bare,
        date,
        nav: safeFloat(item[1]),
        accNav: safeFloat(item[2]),
        changePct: null,
        premiumRate: null,
        source: 'tencent_fund_nav',
      })
    }

    return rows.length ? rows : null
  }

  /**
   * ETF 持仓明细（使用腾讯基金资产配置接口）。
   *
   * @sourceUrl https://zxg.txfund.com/ifzqgtimg/appstock/fund/baseInfo/asset?code={market}{code}
   * @param etfCode 6 位 ETF 代码
   * @returns 标准 etfHoldings 行数组（reportDate, holdingSymbol, holdingName, weight, assetType, source），失败返回 null
   * @usage `engine.queryInstrumentData(ref, { capability: "etfHoldings" })`
   * @remarks 使用 fundAsset 接口，合并 stock[] / bond[] / fund[] / commodity[] / product[] 为统一持仓行。
   *   每行附带 assetType 标识资产类别（stock / bond / fund / commodity / product）。
   * @example
   * ```ts
   * const handler = new TencentCnHandler()
   * const holdings = await handler.etfHoldings('159971')
   * // [{ reportDate: '2026-03-31', holdingSymbol: '300750', holdingName: '宁德时代', weight: 19.65, assetType: 'stock', ... }, ...]
   * ```
   */
  p.etfHoldings = async function etfHoldings(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const bare = normalizeCode(etfCode)

    const result = await fetchTencentFundAsset(bare)
    if (!result) return null

    const assetData = (result.data ?? result) as Record<string, unknown>
    const reportDate = String(assetData.report_time ?? '').slice(0, 10)

    const rows: Record<string, unknown>[] = []

    // 股票持仓
    const stocks = assetData.stock as unknown[] | undefined
    if (Array.isArray(stocks)) {
      for (const s of stocks) {
        const item = s as Record<string, unknown>
        const symbol = normalizeCode(String(item.code ?? item.symbol ?? ''))
        if (!symbol) continue
        rows.push({
          reportDate,
          holdingSymbol: symbol,
          holdingName: String(item.name ?? '').trim() || null,
          weight: safeFloat(item.ratio ?? item.weight),
          changePct: safeFloat(item.rate),
          assetType: 'stock',
          shares: null,
          marketValue: null,
          source: 'tencent_fund_asset',
        })
      }
    }

    // 债券持仓
    const bonds = assetData.bond as unknown[] | undefined
    if (Array.isArray(bonds)) {
      for (const b of bonds) {
        const item = b as Record<string, unknown>
        const name = String(item.name ?? item.bondName ?? '').trim()
        if (!name) continue
        rows.push({
          reportDate,
          holdingSymbol: String(item.code ?? item.symbol ?? '').trim() || null,
          holdingName: name,
          weight: safeFloat(item.ratio ?? item.weight),
          assetType: 'bond',
          shares: null,
          marketValue: null,
          source: 'tencent_fund_asset',
        })
      }
    }

    // 基金持仓（FOF 等）
    const funds = assetData.fund as unknown[] | undefined
    if (Array.isArray(funds)) {
      for (const f of funds) {
        const item = f as Record<string, unknown>
        const name = String(item.name ?? item.fundName ?? '').trim()
        if (!name) continue
        rows.push({
          reportDate,
          holdingSymbol: String(item.code ?? item.symbol ?? '').trim() || null,
          holdingName: name,
          weight: safeFloat(item.ratio ?? item.weight),
          assetType: 'fund',
          shares: null,
          marketValue: null,
          source: 'tencent_fund_asset',
        })
      }
    }

    // 商品持仓
    const commodities = assetData.commodity as unknown[] | undefined
    if (Array.isArray(commodities)) {
      for (const c of commodities) {
        const item = c as Record<string, unknown>
        const name = String(item.name ?? '').trim()
        if (!name) continue
        rows.push({
          reportDate,
          holdingSymbol: null,
          holdingName: name,
          weight: safeFloat(item.ratio ?? item.weight),
          assetType: 'commodity',
          shares: null,
          marketValue: null,
          source: 'tencent_fund_asset',
        })
      }
    }

    // 产品持仓（其他）
    const products = assetData.product as unknown[] | undefined
    if (Array.isArray(products)) {
      for (const pr of products) {
        const item = pr as Record<string, unknown>
        const name = String(item.name ?? '').trim()
        if (!name) continue
        rows.push({
          reportDate,
          holdingSymbol: null,
          holdingName: name,
          weight: safeFloat(item.ratio ?? item.weight),
          assetType: 'product',
          shares: null,
          marketValue: null,
          source: 'tencent_fund_asset',
        })
      }
    }

    return rows.length ? rows : null
  }
}
