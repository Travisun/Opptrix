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
  fetchSinaFundProfile,
  fetchSinaFundQuote,
  fetchSinaFundTopHoldService,
} from '../../api/fund-service.js'
import { fetchSinaFundNavPage } from '../../api/fund.js'
import { rethrowIfFreeProviderThrottleTrigger } from '../../../common/free-provider-call.js'
import type { SinafinanceCnHandler } from './handler.js'

function mapSinaTopHoldToEtfHoldings(
  bare: string,
  raw: Record<string, unknown>,
): Record<string, unknown>[] {
  const heavy = raw.heavy_stock ?? raw.heavyStock ?? raw.data
  const list = Array.isArray(heavy)
    ? heavy
    : Array.isArray((heavy as { list?: unknown } | null)?.list)
      ? ((heavy as { list: unknown[] }).list)
      : Array.isArray(raw)
        ? raw
        : []
  const rows: Record<string, unknown>[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const symbolRaw = String(row.SYMBOL ?? row.symbol ?? row.code ?? row.stockCode ?? '')
    const symbol = normalizeCode(symbolRaw.replace(/^(sh|sz|bj)/i, ''))
    const name = String(row.SKNAME ?? row.name ?? row.stockName ?? '').trim()
    if (!symbol && !name) continue
    rows.push({
      reportDate: String(row.ENDDATE ?? row.reportDate ?? row.asOfDate ?? '').slice(0, 10)
        || new Date().toISOString().slice(0, 10),
      holdingSymbol: symbol || null,
      holdingName: name || null,
      weight: safeFloat(row.NAVRTO ?? row.navPct ?? row.ratio ?? row.weight),
      shares: safeFloat(row.shares),
      marketValue: safeFloat(row.HOLDMKTCAP ?? row.marketValue),
      assetType: 'stock',
      source: 'sinafinance_top_hold',
      etfCode: bare,
    })
  }
  return rows.filter(r => r.holdingSymbol || r.holdingName)
}

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
    // 重仓股 API（FdFundService.getTopHold）；旧 HTML「基金持股」是反向持有人，不可用
    try {
      const raw = await fetchSinaFundTopHoldService(bare)
      if (raw && typeof raw === 'object') {
        const rows = mapSinaTopHoldToEtfHoldings(bare, raw as Record<string, unknown>)
        if (rows.length) return rows
      }
    } catch (e) {
      rethrowIfFreeProviderThrottleTrigger(e)
    }
    return etfHoldingsViaIndexProxy(bare)
  }
}
