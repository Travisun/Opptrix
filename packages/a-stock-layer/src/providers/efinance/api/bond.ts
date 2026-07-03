import { FS_DICT } from './config.js'
import type { EfRow } from './common.js'
import {
  getDealDetail, getHistoryBill, getQuoteHistory, getRealtimeQuotesByFs, getTodayBill,
} from './common.js'
import { httpGet } from '../../../utils/http.js'
import { num, normDate } from './utils.js'

/** ef.bond — mirrors efinance.bond */
export const bond = {
  /** All convertible bonds realtime — ef.bond.get_realtime_quotes */
  async getRealtimeQuotes(): Promise<EfRow[]> {
    return getRealtimeQuotesByFs(FS_DICT.bond)
  },

  getQuoteHistory: getQuoteHistory,
  getTodayBill,
  getHistoryBill,
  getDealDetail,

  /** Bond profile — ef.bond.get_base_info */
  async getBaseInfo(bondCode: string): Promise<EfRow | null> {
    const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
      reportName: 'RPT_BOND_CB_LIST', columns: 'ALL', source: 'WEB', client: 'WEB',
      filter: `(SECURITY_CODE="${bondCode}")`, pageNumber: '1', pageSize: '1',
    })
    const item = (json?.result as { data?: Record<string, unknown>[] })?.data?.[0]
    if (!item) return null
    return {
      债券代码: String(item.SECURITY_CODE ?? bondCode),
      债券名称: String(item.SECURITY_NAME_ABBR ?? item.SECURITY_NAME ?? ''),
      正股代码: String(item.CONVERT_STOCK_CODE ?? ''),
      转股价: num(item.TRANSFER_PRICE),
      到期日: normDate(String(item.EXPIRE_DATE ?? '')),
    }
  },
}

export type BondModule = typeof bond
