import { usesCnExchangeFundRealtimeRoute } from '../../../../core/instrument.js'
import type { StockListItem } from '../../../../core/schema.js'
import { normalizeCode } from '../../../../utils/helpers.js'
import { FuyaoClient } from '../../api/client.js'
import { isTonghuashunEnabled } from '../../config.js'
import { toThsCode } from '../../api/symbols.js'
import {
  computeEtfPremiumRate,
  FUYAO_EXCHANGE_FUND_TYPE,
  latestUnitNavFromNavItems,
  mapFundHoldingsToEtfRows,
  mapFundHoldersToProfileFields,
  mapFundNavRows,
  mapFundProfileToEtfProfileRow,
  mapFundTickerToListItem,
} from '../../normalize/fund.js'
import type { TonghuashunMarketHandler } from './handler.js'

type Handler = TonghuashunMarketHandler & Record<string, unknown>

async function withFuyaoClient<T>(fn: (client: FuyaoClient) => Promise<T>): Promise<T | null> {
  if (!isTonghuashunEnabled()) return null
  const client = FuyaoClient.fromConfig()
  if (!client) return null
  try {
    return await fn(client)
  } catch {
    return null
  }
}

function resolveExchangeThscode(code: string): string {
  const raw = String(code ?? '').trim()
  if (!raw) return ''
  if (raw.includes('.')) return raw
  return toThsCode(raw)
}

/** 同花顺 Fuyao 场内 ETF 标准 Capability（etfList / etfProfile / etfNav / etfHoldings） */
export function mixTonghuashunEtf(Driver: { prototype: TonghuashunMarketHandler }) {
  const p = Driver.prototype as Handler

  p.etfList = async function etfList(_market = 'CN', etfCode = ''): Promise<StockListItem[] | null> {
    const bare = etfCode.trim()
    if (bare) {
      if (!usesCnExchangeFundRealtimeRoute(bare)) return null
      return withFuyaoClient(async client => {
        const data = await client.tickersSearch(normalizeCode(bare), 5, 'fund-etf')
        const hit = (data.item ?? []).map(mapFundTickerToListItem).find(Boolean)
          ?? mapFundTickerToListItem({
            thscode: resolveExchangeThscode(bare),
            ticker: normalizeCode(bare),
            name: '',
            exchange: normalizeCode(bare).startsWith('6') ? 'SH' : 'SZ',
            asset_type: 'fund-etf',
          })
        return hit ? [hit] : null
      })
    }
    return withFuyaoClient(async client => {
      const rows = await client.tickersListAll('fund-etf')
      const items = rows.map(mapFundTickerToListItem).filter(Boolean) as StockListItem[]
      return items.length ? items : null
    })
  }

  p.etfProfile = async function etfProfile(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!usesCnExchangeFundRealtimeRoute(etfCode)) return null
    const bare = normalizeCode(etfCode)
    const thscode = resolveExchangeThscode(bare)
    return withFuyaoClient(async client => {
      const [profileData, navData, snapData, returnsData, holdersData] = await Promise.all([
        client.fundProfileDetail(FUYAO_EXCHANGE_FUND_TYPE, thscode),
        client.fundPerformanceNav(FUYAO_EXCHANGE_FUND_TYPE, thscode, { nav_type: 'unit' }),
        client.fundMarketSnapshot(thscode),
        client.fundPerformanceReturns(FUYAO_EXCHANGE_FUND_TYPE, thscode),
        client.fundHoldersDetail(FUYAO_EXCHANGE_FUND_TYPE, thscode).catch(() => ({ item: [] })),
      ])
      const profile = profileData.item?.[0]
      if (!profile) return null
      const unitNav = latestUnitNavFromNavItems(navData.item ?? [])
      const snap = snapData.item?.[0]
      const lastPrice = snap?.last_price as number | undefined
      const premiumRate = computeEtfPremiumRate(lastPrice, unitNav)
      const row = mapFundProfileToEtfProfileRow(bare, profile, {
        nav: unitNav,
        premiumRate,
        returns: returnsData.item?.[0] ?? null,
        holders: mapFundHoldersToProfileFields(holdersData.item ?? []),
      })
      return [row]
    })
  }

  p.etfNav = async function etfNav(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!usesCnExchangeFundRealtimeRoute(etfCode)) return null
    const bare = normalizeCode(etfCode)
    const thscode = resolveExchangeThscode(bare)
    return withFuyaoClient(async client => {
      const [navData, snapData] = await Promise.all([
        client.fundPerformanceNav(FUYAO_EXCHANGE_FUND_TYPE, thscode, {
          range: 'year',
          nav_type: 'unit,adj',
        }),
        client.fundMarketSnapshot(thscode).catch(() => ({ item: [] })),
      ])
      const items = navData.item ?? []
      if (!items.length) return null
      const unitNav = latestUnitNavFromNavItems(items)
      const snap = snapData.item?.[0]
      const premiumRate = computeEtfPremiumRate(snap?.last_price as number | undefined, unitNav)
      const rows = mapFundNavRows(bare, items, premiumRate)
      return rows.length ? rows : null
    })
  }

  p.etfHoldings = async function etfHoldings(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!usesCnExchangeFundRealtimeRoute(etfCode)) return null
    const thscode = resolveExchangeThscode(normalizeCode(etfCode))
    return withFuyaoClient(async client => {
      const data = await client.fundPortfolioHoldings(FUYAO_EXCHANGE_FUND_TYPE, thscode)
      const rows = mapFundHoldingsToEtfRows(etfCode, data.item ?? [])
      return rows.length ? rows : null
    })
  }
}
