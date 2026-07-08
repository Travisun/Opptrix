import { isCnEtfCode } from '../../../../core/instrument.js'
import type { StockListItem } from '../../../../core/schema.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'
import { etfHoldingsViaIndexProxy } from '../../../common/etf-holdings-proxy.js'
import {
  mapSinaEtfListItems,
  mapSinaFundNavRows,
  mapSinaFundToEtfProfileRow,
} from '../../../common/standard-etf.js'
import {
  fetchSinaEtfListAll,
  fetchSinaFundNav,
  fetchSinaFundProfile,
  fetchSinaFundQuote,
} from '../../api/fund-service.js'
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
    const [navPage, quote] = await Promise.all([
      fetchSinaFundNav(bare, 1, 60),
      fetchSinaFundQuote(bare).catch(() => null),
    ])
    const premium = safeFloat((quote as Record<string, unknown> | null)?.premiumPct)
    const rows = mapSinaFundNavRows(bare, navPage.rows, premium)
    return rows.length ? rows : null
  }

  p.etfHoldings = async function etfHoldings(etfCode: string): Promise<Record<string, unknown>[] | null> {
    return etfHoldingsViaIndexProxy(etfCode)
  }
}
