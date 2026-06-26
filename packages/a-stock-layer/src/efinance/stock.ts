import { httpGet } from '../utils/http.js'
import { FS_DICT, KLT_MAP } from './config.js'
import type { EfRow } from './common.js'
import {
  getBaseInfo, getDealDetail, getHistoryBill, getLatestQuote,
  getQuoteHistory, getRealtimeQuotesByFs, getTodayBill,
} from './common.js'
import { getQuoteId } from './utils.js'

async function codesToSecids(codes: string | string[]) {
  const list = Array.isArray(codes) ? codes : [codes]
  return Promise.all(list.map(c => getQuoteId(c)))
}

/** ef.stock — mirrors efinance.stock */
export const stock = {
  /** Latest quote(s) — ef.stock.get_quote */
  async getQuote(codes: string | string[]): Promise<EfRow[]> {
    const secids = await codesToSecids(codes)
    return getLatestQuote(secids)
  },

  /** K-line — ef.stock.get_quote_history */
  async getQuoteHistory(
    code: string,
    opts: { beg?: string; end?: string; klt?: number | string; fqt?: number } = {},
  ): Promise<EfRow[]> {
    const klt = typeof opts.klt === 'string'
      ? (KLT_MAP[opts.klt] ?? (parseInt(opts.klt, 10) || 101))
      : (opts.klt ?? 101)
    return getQuoteHistory(code, { ...opts, klt })
  },

  /** All A-share realtime — ef.stock.get_realtime_quotes */
  async getRealtimeQuotes(fs: keyof typeof FS_DICT | string = 'stock'): Promise<EfRow[]> {
    const filter = FS_DICT[fs] ?? fs
    return getRealtimeQuotesByFs(filter)
  },

  getBaseInfo,
  getTodayBill,
  getHistoryBill,
  getDealDetail,

  /** Daily billboard — uses datacenter API */
  async getDailyBillboard(date = '') {
    const d = date || new Date().toISOString().slice(0, 10)
    const json = await httpGet('https://datacenter-web.eastmoney.com/api/data/v1/get', {
      reportName: 'RPT_DAILYBILLBOARD_DETAILS',
      columns: 'ALL', filter: `(TRADE_DATE='${d}')`,
      pageNumber: '1', pageSize: '50', sortTypes: '-1', sortColumns: 'BILLBOARD_NET_AMT',
    })
    return (json?.result as { data?: Record<string, unknown>[] })?.data ?? []
  },
}

export type StockModule = typeof stock
