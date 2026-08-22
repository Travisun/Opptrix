import { assertCnPublicFundCode, isCnPublicFundRef } from '../../../../core/fund-instrument.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../../common/free-provider-call.js'
import {
  fetchEmFundLatestHoldings,
  fetchEmFundNavPage,
  fetchEmJbgkProfile,
  fetchEmPingzhongData,
} from '../../api/fund.js'
import {
  mapEmJjccToFundHoldings,
  mapEmLsjzToFundNavRows,
  mapEmLsjzToFundQuoteRow,
  mapEmToFundProfileRow,
} from '../../normalize/fund.js'
import type { EastmoneyCnHandler } from './handler.js'

type Handler = EastmoneyCnHandler & Record<string, unknown>

/** 挂载东方财富天天基金 F10 公募基金标准能力 */
export function mixEastmoneyFund(Driver: { prototype: EastmoneyCnHandler }) {
  const p = Driver.prototype as Handler

  p.fundProfile = async function fundProfile(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    try {
      const [jbgk, ping, navPage] = await Promise.all([
        fetchEmJbgkProfile(bare),
        fetchEmPingzhongData(bare),
        fetchEmFundNavPage(bare, 1, 1),
      ])
      const latestNav = navPage?.Data?.LSJZList?.[0] ?? null
      const row = mapEmToFundProfileRow(bare, jbgk, ping, latestNav)
      return row ? [row] : null
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    }
  }

  p.fundNav = async function fundNav(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    try {
      const allRows: import('../../api/fund.js').EmFundLsjzRow[] = []
      let page = 1
      const pageSize = 20
      for (;;) {
        const resp = await fetchEmFundNavPage(bare, page, pageSize)
        const batch = resp?.Data?.LSJZList ?? []
        if (!batch.length) break
        allRows.push(...batch)
        const total = Number(resp?.Data?.TotalCount ?? resp?.TotalCount ?? 0)
        if (total > 0 && allRows.length >= total) break
        if (batch.length < pageSize) break
        page += 1
        // lsjz 单页最多 20 条；默认约 120 个交易日（与 Hub/UI 常见 limit 一致）
        if (page > 6) break
      }
      const rows = mapEmLsjzToFundNavRows(bare, allRows)
      return rows.length ? rows : null
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    }
  }

  p.fundQuote = async function fundQuote(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    try {
      const [navPage, ping] = await Promise.all([
        fetchEmFundNavPage(bare, 1, 1),
        fetchEmPingzhongData(bare),
      ])
      const latest = navPage?.Data?.LSJZList?.[0] ?? null
      const profileHint = ping?.fS_name ? { name: ping.fS_name } : undefined
      const row = mapEmLsjzToFundQuoteRow(bare, latest, profileHint)
      return row ? [row] : null
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    }
  }

  p.fundHoldings = async function fundHoldings(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnPublicFundCode(fundCode)
    if (!bare) return null
    try {
      const raw = await fetchEmFundLatestHoldings(bare)
      const rows = mapEmJjccToFundHoldings(bare, raw)
      return rows.length ? rows : null
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    }
  }
}

export function eastmoneyFundGate(ref: unknown): boolean {
  if (!ref || typeof ref !== 'object') return false
  return isCnPublicFundRef(ref as import('@opptrix/shared').InstrumentRef)
}
