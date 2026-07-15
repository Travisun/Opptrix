import { isCnEtfCode } from '../../../../core/instrument.js'
import type { StockListItem } from '../../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'
import {
  mapSinaEtfListItems,
  mapSinaFundNavRows,
  mapSinaFundToEtfProfileRow,
} from '../../../common/standard-etf.js'
import {
  fetchSinaEtfListAll,
  fetchSinaFundProfile,
  fetchSinaFundQuote,
} from '../../api/fund-service.js'
import { fetchSinaFundNavPage } from '../../api/fund.js'
import { fetchSinaFundHoldings } from '../../api/corp-service.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../../common/free-provider-call.js'
import type { SinafinanceCnHandler } from './handler.js'

type Handler = SinafinanceCnHandler & Record<string, unknown>

/** 挂载 sinafinance 标准 ETF Capability 方法（etfList / etfProfile / etfNav / etfHoldings） */
export function mixSinafinanceEtf(Driver: { prototype: SinafinanceCnHandler }) {
  const p = Driver.prototype as Handler

  p.etfList = async function etfList(_market = 'CN', etfCode = ''): Promise<StockListItem[] | null> {
    const bare = etfCode.trim()
    if (bare) {
      if (!isCnEtfCode(bare)) return null
      const quote = await fetchSinaFundQuote(bare) as Record<string, unknown> | null
      const name = String(quote?.name ?? '')
      if (!name && !quote) return null
      return [{
        code: normalizeCode(bare),
        name: name || bare,
        industry: 'ETF',
        market: normalizeCode(bare).startsWith('6') ? 'SH' : 'SZ',
      }]
    }
    const all = await fetchSinaEtfListAll()
    const items = mapSinaEtfListItems(all)
    return items.length ? items : null
  }

  p.etfProfile = async function etfProfile(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const bare = normalizeCode(etfCode)
    const [profile, quote] = await Promise.all([
      fetchSinaFundProfile(bare),
      fetchSinaFundQuote(bare),
    ])
    const row = mapSinaFundToEtfProfileRow(bare, profile, quote)
    return row ? [row] : null
  }

  p.etfNav = async function etfNav(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const bare = normalizeCode(etfCode)

    // 分页拉取全量净值（API 单页最大 100 条）
    const allRows: Array<Record<string, unknown>> = []
    let page = 1
    const pageSize = 100
    for (;;) {
      const result = await fetchSinaFundNavPage(bare, page, pageSize)
      if (!result.rows.length) break
      allRows.push(...result.rows.map(r => ({ ...r, code: bare, source: 'sinafinance' })))
      if (!result.hasNext || allRows.length >= result.total) break
      page++
      if (page > 50) break // 安全上限
    }

    if (!allRows.length) return null

    // 取最新溢价率
    const quote = await fetchSinaFundQuote(bare).catch((e) => {
      rethrowIfFreeProviderThrottleTrigger(e)
      return null
    })
    const premium = safeFloat((quote as Record<string, unknown> | null)?.premiumPct)
    const rows = mapSinaFundNavRows(bare, allRows, premium)
    return rows.length ? rows : null
  }

  p.etfHoldings = async function etfHoldings(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const bare = normalizeCode(etfCode)
    const blocks = await fetchSinaFundHoldings(bare)
    if (!blocks?.length) return null
    const rows = blocks.map((row: Record<string, unknown>) => ({
      reportDate: String(row.asOfDate ?? '').slice(0, 10),
      holdingSymbol: normalizeCode(String(row.fundCode ?? '')),
      holdingName: String(row.fundName ?? '').trim() || null,
      weight: safeFloat(row.navPct ?? row.floatPct),
      shares: safeFloat(row.shares),
      marketValue: safeFloat(row.marketValue),
      source: 'sinafinance',
    }))
    return rows.filter((r: Record<string, unknown>) => r.holdingSymbol).length ? rows : null
  }
}
