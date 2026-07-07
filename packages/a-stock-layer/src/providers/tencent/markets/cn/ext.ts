import { normalizeCode } from '../../../../utils/helpers.js'
import type { TencentCnHandler } from './handler.js'
import {
  fetchTencentIndustryRank,
  fetchTencentInvestRate,
  fetchTencentJggd,
  fetchTencentPlateTags,
  fetchTencentRelatedPlates,
  fetchTencentSmartboxSearch,
  fetchTencentTradeDetails,
} from '../../api/proxy.js'
import {
  mapTencentIndustryRankRow,
  mapTencentPlateTagRows,
  mapTencentRelatedPlateRows,
  mapTencentTradeDetailRows,
} from '../../normalize/market.js'

type Handler = TencentCnHandler & Record<string, unknown>

/**
 * 为 Tencent Provider 挂载扩展自定义方法。
 */
export function mixTencentExt(Driver: { prototype: TencentCnHandler }) {
  const p = Driver.prototype as Handler

  /** 个股行业/概念/地域标签 — `plateNew`。 */
  p.tencentStockPlates = async function tencentStockPlates(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentPlateTags(bare)
    const rows = mapTencentPlateTagRows(bare, data)
    return rows.length ? rows : null
  }

  /** 关联板块列表 — `relate/data/plate`。 */
  p.tencentRelatedPlates = async function tencentRelatedPlates(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentRelatedPlates(bare)
    const rows = mapTencentRelatedPlateRows(bare, data)
    return rows.length ? rows : null
  }

  /** 行业内估值排名 — `hypm/get`。 */
  p.tencentIndustryRank = async function tencentIndustryRank(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentIndustryRank(bare)
    const rows = mapTencentIndustryRankRow(bare, data)
    return rows.length ? rows : null
  }

  /** 机构评级汇总 — `getInvestRate` + `jggd/get`。 */
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
      monthly: {
        m1: jggd.pjtj1 ?? null,
        m2: jggd.pjtj2 ?? null,
        m3: jggd.pjtj3 ?? null,
      },
      targetPrice: {
        avg: jggd.mbjj ?? null,
        high: jggd.zgjg ?? null,
        low: jggd.zdjg ?? null,
      },
      source: 'tencent_investRate',
    }]
  }

  /** 股票搜索 — `smartbox/search`。 */
  p.tencentStockSearch = async function tencentStockSearch(query: string) {
    const q = query.trim()
    if (!q) return null
    const rows = await fetchTencentSmartboxSearch(q)
    return rows.length ? rows : null
  }

  /** 逐笔成交明细 — `getMingxiV2`（盘中才有数据）。 */
  p.tencentTradeDetails = async function tencentTradeDetails(code: string) {
    const bare = normalizeCode(code)
    if (!bare) return null
    const data = await fetchTencentTradeDetails(bare)
    const rows = mapTencentTradeDetailRows(bare, data)
    return rows.length ? rows : null
  }
}
