import { isCnEtfCode } from '../../../../core/instrument.js'
import type { StockKline, StockListItem } from '../../../../core/schema.js'
import { normalizeCode } from '../../../../utils/helpers.js'
import { etfHoldingsViaIndexProxy } from '../../../common/etf-holdings-proxy.js'
import {
  mapKlinesToEtfNavRows,
  mapProfilesToEtfProfileRows,
} from '../../../common/standard-etf.js'
import {
  fetchTencentEtfBasicItem,
  fetchTencentEtfListItems,
} from '../../api/etf-service.js'
import type { TencentCnHandler } from './handler.js'

type Handler = TencentCnHandler & Record<string, unknown>

/** 挂载 Tencent 标准 ETF Capability 方法 */
export function mixTencentEtf(Driver: { prototype: TencentCnHandler }) {
  const p = Driver.prototype as Handler

  p.etfList = async function etfList(_market = 'CN', etfCode = ''): Promise<StockListItem[] | null> {
    const bare = etfCode.trim()
    if (bare) {
      if (!isCnEtfCode(bare)) return null
      const profile = await this.profile(bare)
      const name = profile?.[0]?.name
      if (name) {
        return [{
          code: normalizeCode(bare),
          name,
          industry: 'ETF',
          market: normalizeCode(bare).startsWith('6') ? 'SH' : 'SZ',
        }]
      }
      const basic = await fetchTencentEtfBasicItem(bare)
      return basic ? [basic] : null
    }
    const items = await fetchTencentEtfListItems()
    return items.length ? items : null
  }

  p.etfProfile = async function etfProfile(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const profiles = await this.profile(etfCode)
    if (!profiles) return null
    const mapped = mapProfilesToEtfProfileRows(profiles).map(row => ({
      ...row,
      source: 'tencent',
    }))
    return mapped.length ? mapped : null
  }

  p.etfNav = async function etfNav(etfCode: string): Promise<Record<string, unknown>[] | null> {
    if (!isCnEtfCode(etfCode)) return null
    const rows = await this.kline(etfCode, 'daily', '', '', 30) as StockKline[] | null
    if (!rows?.length) return null
    const mapped = mapKlinesToEtfNavRows(etfCode, rows).map(row => ({
      ...row,
      source: 'tencent_kline_proxy',
    }))
    return mapped.length ? mapped : null
  }

  p.etfHoldings = async function etfHoldings(etfCode: string): Promise<Record<string, unknown>[] | null> {
    return etfHoldingsViaIndexProxy(etfCode)
  }
}
