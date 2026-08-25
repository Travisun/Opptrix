import { assertCnPublicFundCode } from '../../../../core/fund-instrument.js'
import { FuyaoClient, FuyaoApiError } from '../../api/client.js'
import { resolveFuyaoFundRoute } from '../../api/fund-symbols.js'
import { FuyaoFundNotFoundError } from '../../errors.js'
import { isTonghuashunEnabled } from '../../config.js'
import {
  computeEtfPremiumRate,
  mapFundMarketSnapshotToStockRealtime,
  mapFundHoldersToProfileFields,
  mapFundHoldingsToFundRows,
  mapFundNavRowsForFund,
  mapFundProfileToFundProfileRow,
} from '../../normalize/fund.js'
import type { TonghuashunMarketHandler } from './handler.js'

type Handler = TonghuashunMarketHandler & Record<string, unknown>

/**
 * 扶摇 GET /api/fund/performance/nav 查询选项。
 * - 不传 `range` → 最多最新 1 条；传 week|month|…|fyear → 区间序列
 * - `nav_type`: unit / adj / unit,adj；`adj_nav` 为复权净值（≠累计净值）
 */
export const FUYAO_FUND_NAV_SERIES_OPTS = {
  range: 'fyear',
  nav_type: 'unit,adj',
} as const

/** profile / quote：取近月序列以便 latest+prev 算 changePct（侧边栏涨跌） */
export const FUYAO_FUND_NAV_RECENT_OPTS = {
  range: 'month',
  nav_type: 'unit,adj',
} as const

async function withFuyaoClient<T>(fn: (client: FuyaoClient) => Promise<T>): Promise<T | null> {
  if (!isTonghuashunEnabled()) return null
  const client = FuyaoClient.fromConfig()
  if (!client) return null
  try {
    return await fn(client)
  } catch (e) {
    // 上游明确未收录（如 Fund not found: 000001.OF）—— 抛专用错误交由编排层归类
    // not_found，而不是当瞬时故障吞成 null。其余错误保持 failover（返回 null）。
    if (e instanceof FuyaoApiError && (e.code === 3001 || /not found/i.test(e.message))) {
      throw new FuyaoFundNotFoundError(e.rawMessage ?? e.message)
    }
    return null
  }
}

function msToYmd(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 场内基金：合并交易所快照价与单位净值 */
function mergeListedFundQuoteRow(
  bare: string,
  navRow: Record<string, unknown>,
  snap: Record<string, unknown>,
  profileName?: string,
): Record<string, unknown> {
  const exchange = mapFundMarketSnapshotToStockRealtime(snap, profileName ?? '')
  const unitNav = navRow.unitNav as number | null | undefined
  const premiumPct = computeEtfPremiumRate(exchange.price, unitNav ?? null)
  return {
    ...navRow,
    code: bare,
    name: navRow.name ?? exchange.name,
    price: exchange.price ?? unitNav ?? navRow.price,
    exchangePrice: exchange.price,
    preClose: exchange.preClose ?? navRow.prevNav,
    changePct: exchange.changePct ?? navRow.changePct,
    change: exchange.change,
    open: exchange.open,
    high: exchange.high,
    low: exchange.low,
    volume: exchange.volume,
    amount: exchange.amount,
    exchangeVolume: exchange.volume,
    exchangeAmount: exchange.amount,
    exchangeOpen: exchange.open,
    exchangeHigh: exchange.high,
    exchangeLow: exchange.low,
    premiumPct,
    premiumRate: premiumPct,
    source: 'tonghuashun',
  }
}

function listedFundQuoteFromSnapshot(
  bare: string,
  snap: Record<string, unknown>,
  profileName?: string,
): Record<string, unknown> {
  const exchange = mapFundMarketSnapshotToStockRealtime(snap, profileName ?? '')
  return {
    code: bare,
    name: exchange.name,
    price: exchange.price,
    exchangePrice: exchange.price,
    changePct: exchange.changePct,
    change: exchange.change,
    open: exchange.open,
    high: exchange.high,
    low: exchange.low,
    preClose: exchange.preClose,
    volume: exchange.volume,
    amount: exchange.amount,
    exchangeVolume: exchange.volume,
    exchangeAmount: exchange.amount,
    source: 'tonghuashun',
  }
}

/** 同花顺 Fuyao 公募基金标准 Capability（fundProfile / fundNav / fundHoldings / fundQuote） */
export function mixTonghuashunFund(Driver: { prototype: TonghuashunMarketHandler }) {
  const p = Driver.prototype as Handler

  p.fundProfile = async function fundProfile(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const route = resolveFuyaoFundRoute(bare)
    if (!route) return null
    return withFuyaoClient(async client => {
      const { fundType, thscode } = route
      const [profileData, navData, returnsData, holdersData] = await Promise.all([
        client.fundProfileDetail(fundType, thscode),
        // range=month：保证至少两日净值，便于 map 层算 changePct
        client.fundPerformanceNav(fundType, thscode, { ...FUYAO_FUND_NAV_RECENT_OPTS }),
        client.fundPerformanceReturns(fundType, thscode),
        client.fundHoldersDetail(fundType, thscode).catch(() => ({ item: [] })),
      ])
      const profile = profileData.item?.[0]
      if (!profile) return null
      const row = mapFundProfileToFundProfileRow(bare, profile, {
        navItems: navData.item ?? [],
        returns: returnsData.item?.[0] ?? null,
        holders: mapFundHoldersToProfileFields(holdersData.item ?? []),
      })
      return [row]
    })
  }

  p.fundNav = async function fundNav(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const route = resolveFuyaoFundRoute(bare)
    if (!route) return null
    return withFuyaoClient(async client => {
      const { fundType, thscode } = route
      // range=fyear：侧边栏历史净值走势；不传 range 时扶摇最多返回 1 条
      const navData = await client.fundPerformanceNav(fundType, thscode, {
        ...FUYAO_FUND_NAV_SERIES_OPTS,
      })
      const rows = mapFundNavRowsForFund(bare, navData.item ?? [])
      return rows.length ? rows : null
    })
  }

  p.fundQuote = async function fundQuote(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const route = resolveFuyaoFundRoute(bare)
    if (!route) return null
    return withFuyaoClient(async client => {
      const { fundType, thscode } = route
      const isListed = fundType === 'exchange'
      const [navData, profileData, snapData] = await Promise.all([
        // range=month：取最近两日算涨跌；最新报价取排序后第一条
        client.fundPerformanceNav(fundType, thscode, { ...FUYAO_FUND_NAV_RECENT_OPTS }),
        client.fundProfileDetail(fundType, thscode).catch(() => ({ item: [] })),
        isListed
          ? client.fundMarketSnapshot(thscode).catch(() => ({ item: [] }))
          : Promise.resolve({ item: [] }),
      ])
      const items = navData.item ?? []
      const snap = snapData.item?.[0]
      const profile = profileData.item?.[0]
      const profileName = String(profile?.fund_name ?? '').trim()

      if (!items.length) {
        if (!isListed || !snap) return null
        return [listedFundQuoteFromSnapshot(bare, snap, profileName)]
      }

      const sorted = [...items].sort((a, b) => Number(b.nav_date) - Number(a.nav_date))
      const latest = sorted[0]
      const prev = sorted[1]
      const unitNav = Number(latest.unit_nav)
      const prevNav = prev ? Number(prev.unit_nav) : null
      const changePct = Number.isFinite(unitNav) && prevNav != null && prevNav > 0
        ? ((unitNav - prevNav) / prevNav) * 100
        : null
      const navRow: Record<string, unknown> = {
        code: bare,
        name: profileName || undefined,
        unitNav: Number.isFinite(unitNav) ? unitNav : null,
        // adj_nav = 复权净值（≠累计净值）；字段名 accNav 为历史兼容保留
        accNav: Number(latest.adj_nav) || null,
        prevNav: prevNav != null && Number.isFinite(prevNav) ? prevNav : null,
        changePct,
        navDate: msToYmd(latest.nav_date),
        source: 'tonghuashun',
      }
      if (isListed && snap) {
        return [mergeListedFundQuoteRow(bare, navRow, snap, profileName)]
      }
      return [navRow]
    })
  }

  p.fundHoldings = async function fundHoldings(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    const route = resolveFuyaoFundRoute(bare)
    if (!route) return null
    return withFuyaoClient(async client => {
      const { fundType, thscode } = route
      const data = await client.fundPortfolioHoldings(fundType, thscode)
      const rows = mapFundHoldingsToFundRows(bare, data.item ?? [])
      return rows.length ? rows : null
    })
  }
}
