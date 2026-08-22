import type { StockListItem } from '../../../../core/schema.js'
import { assertCnOtcFundCode, isCnOtcFundRef } from '../../../../core/fund-instrument.js'
import { isCnEtfCode } from '../../../../core/instrument.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'
import {
  mapSinaFundNavRows,
  mapSinaProfileToFundProfileRow,
  mapSinaQuoteToFundQuoteRow,
  mapSinaTopHoldToFundHoldings,
} from '../../../common/standard-fund.js'
import {
  fetchSinaFundProfile,
  fetchSinaFundQuote,
  fetchSinaFundTopHoldService,
  fetchSinaOtcFundList,
  fetchSinaOtcFundListAll,
} from '../../api/fund-service.js'
import { fetchSinaFundNavPage } from '../../api/fund.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../../common/free-provider-call.js'
import type { SinafinanceCnHandler } from './handler.js'

function mapOtcFundListItems(
  items: Array<{ code?: string; name?: string }>,
): StockListItem[] {
  return items
    .map(item => {
      const code = normalizeCode(String(item.code ?? ''))
      if (!code || isCnEtfCode(code)) return null
      return {
        code,
        name: String(item.name ?? ''),
        industry: 'FUND',
        market: 'OF',
      }
    })
    .filter(Boolean) as StockListItem[]
}

type Handler = SinafinanceCnHandler & Record<string, unknown>

/** 挂载 sinafinance 标准场外基金 Capability 方法 */
export function mixSinafinanceFund(Driver: { prototype: SinafinanceCnHandler }) {
  const p = Driver.prototype as Handler

  p.fundList = async function fundList(
    _market = 'CN',
    keyword = '',
    pageSize = 30,
  ): Promise<StockListItem[] | null> {
    const kw = String(keyword ?? '').trim()
    if (kw) {
      const bare = normalizeCode(kw)
      if (!bare || isCnEtfCode(bare)) return null
      const profile = await fetchSinaFundProfile(bare)
      const quote = await fetchSinaFundQuote(bare).catch((e) => {
        rethrowIfFreeProviderThrottleTrigger(e)
        return null
      })
      const profileRec = profile as Record<string, unknown> | null
      const quoteRec = quote as Record<string, unknown> | null
      const name = String(
        profileRec?.shortName ?? profileRec?.fullName ?? quoteRec?.name ?? '',
      )
      if (!name && !profile && !quote) return null
      return [{
        code: bare,
        name: name || bare,
        industry: 'FUND',
        market: 'OF',
      }]
    }
    const limit = Math.min(Math.max(Number(pageSize) || 30, 1), 200)
    const pageResult = await fetchSinaOtcFundList({ page: 1, pageSize: limit })
    const items = mapOtcFundListItems(pageResult.items)
    if (items.length) return items
    const all = await fetchSinaOtcFundListAll({ pageSize: 80 })
    const fallback = mapOtcFundListItems(all)
    return fallback.length ? fallback : null
  }

  p.fundProfile = async function fundProfile(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnOtcFundCode(fundCode)
    if (!bare) return null
    const [profile, quote] = await Promise.all([
      fetchSinaFundProfile(bare),
      fetchSinaFundQuote(bare),
    ])
    const row = mapSinaProfileToFundProfileRow(bare, profile, quote)
    return row ? [row] : null
  }

  p.fundNav = async function fundNav(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnOtcFundCode(fundCode)
    if (!bare) return null
    const allRows: Array<Record<string, unknown>> = []
    let page = 1
    const pageSize = 100
    for (;;) {
      const result = await fetchSinaFundNavPage(bare, page, pageSize)
      if (!result.rows.length) break
      allRows.push(...result.rows.map(r => ({ ...r, code: bare, source: 'sinafinance' })))
      if (!result.hasNext || allRows.length >= result.total) break
      page += 1
      if (page > 50) break
    }
    if (!allRows.length) return null
    const rows = mapSinaFundNavRows(bare, allRows)
    return rows.length ? rows : null
  }

  p.fundQuote = async function fundQuote(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnOtcFundCode(fundCode)
    if (!bare) return null
    const quote = await fetchSinaFundQuote(bare)
    const row = mapSinaQuoteToFundQuoteRow(bare, quote as Record<string, unknown> | null)
    return row ? [row] : null
  }

  p.fundHoldings = async function fundHoldings(fundCode: string): Promise<Record<string, unknown>[] | null> {
    const bare = assertCnOtcFundCode(fundCode)
    if (!bare) return null
    try {
      const raw = await fetchSinaFundTopHoldService(bare)
      if (raw && typeof raw === 'object') {
        const rows = mapSinaTopHoldToFundHoldings(bare, raw as Record<string, unknown>)
        if (rows.length) return rows
      }
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
    }
    return null
  }
}

/** Provider registry 门禁 — 仅接受 CN 场外基金 Ref */
export function sinafinanceFundGate(ref: unknown): boolean {
  if (!ref || typeof ref !== 'object') return false
  return isCnOtcFundRef(ref as import('@opptrix/shared').InstrumentRef)
}
