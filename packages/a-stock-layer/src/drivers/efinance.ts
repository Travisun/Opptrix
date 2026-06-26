import { Capability } from '../core/capabilities.js'
import type {
  IndexKline, IndexRealtime, MoneyFlow, StockKline, StockListItem,
  StockProfile, StockRealtime,
} from '../core/schema.js'
import { ef } from '../efinance/index.js'
import { KLT_MAP } from '../efinance/config.js'
import { normalizeCode, safeFloat } from '../utils/helpers.js'
import { BaseDriver } from './base.js'

function quoteToRealtime(row: Record<string, unknown>, code: string): StockRealtime {
  const price = safeFloat(row['最新价'])
  const preClose = safeFloat(row['昨日收盘'])
  return {
    code: normalizeCode(code || String(row['代码'] ?? '')),
    name: String(row['名称'] ?? ''),
    price,
    open: safeFloat(row['今开']),
    high: safeFloat(row['最高']),
    low: safeFloat(row['最低']),
    preClose,
    volume: safeFloat(row['成交量']),
    amount: safeFloat(row['成交额']),
    change: safeFloat(row['涨跌额']),
    changePct: safeFloat(row['涨跌幅']),
    turnoverRate: safeFloat(row['换手率']),
    pe: safeFloat(row['动态市盈率']),
    pb: null,
    marketCap: safeFloat(row['总市值']),
    amplitude: safeFloat(row['振幅']),
  }
}

function klineRow(row: Record<string, unknown>, code: string): StockKline {
  return {
    code: normalizeCode(code),
    date: String(row['日期'] ?? '').slice(0, 10),
    open: safeFloat(row['开盘']) ?? 0,
    close: safeFloat(row['收盘']) ?? 0,
    high: safeFloat(row['最高']) ?? 0,
    low: safeFloat(row['最低']) ?? 0,
    volume: safeFloat(row['成交量']) ?? 0,
    amount: safeFloat(row['成交额']) ?? 0,
    changePct: safeFloat(row['涨跌幅']),
    turnoverRate: safeFloat(row['换手率']),
  }
}

/** efinance driver — pure Node, mirrors Python efinance + EastMoney HTTP */
export class EfinanceDriver extends BaseDriver {
  get name() { return 'efinance' }
  get priority() { return 80 }

  capabilities() {
    return [
      Capability.STOCK_REALTIME, Capability.STOCK_KLINE,
      Capability.INDEX_REALTIME, Capability.INDEX_KLINE,
      Capability.STOCK_MONEY_FLOW, Capability.STOCK_PROFILE, Capability.STOCK_LIST,
    ]
  }

  async realtime(code: string) {
    try {
      const rows = await ef.stock.getQuote(code)
      if (!rows.length) return null
      return [quoteToRealtime(rows[0], code)]
    } catch { return null }
  }

  async batchRealtime(codes: string[]) {
    try {
      const rows = await ef.stock.getQuote(codes)
      if (!rows.length) return null
      return rows.map((r, i) => quoteToRealtime(r, codes[i]))
    } catch { return null }
  }

  async kline(code: string, period = 'daily', start = '', end = '', count = 1000) {
    try {
      const klt = KLT_MAP[period] ?? 101
      const rows = await ef.stock.getQuoteHistory(code, {
        beg: start.replace(/-/g, '') || undefined,
        end: end.replace(/-/g, '') || undefined,
        klt,
      })
      if (!rows.length) return null
      const sliced = count ? rows.slice(-count) : rows
      return sliced.map(r => klineRow(r, code))
    } catch { return null }
  }

  async indexRealtime(code: string) {
    try {
      const rows = await ef.stock.getQuote(code)
      if (!rows.length) return null
      const r = quoteToRealtime(rows[0], code)
      return [{
        code: r.code, name: r.name, price: r.price, open: r.open, high: r.high,
        low: r.low, preClose: r.preClose, change: r.change, changePct: r.changePct,
        volume: r.volume, amount: r.amount,
      } satisfies IndexRealtime]
    } catch { return null }
  }

  async indexKline(code: string, period = 'daily', start = '', end = '', count = 1000) {
    try {
      const rows = await this.kline(code, period, start, end, count)
      if (!rows) return null
      return rows.map(k => ({
        code: k.code, date: k.date, open: k.open, close: k.close,
        high: k.high, low: k.low, volume: k.volume, amount: k.amount, changePct: k.changePct,
      } satisfies IndexKline))
    } catch { return null }
  }

  async moneyFlow(code: string) {
    try {
      const hist = await ef.stock.getHistoryBill(code)
      const rows = hist.length ? hist : await ef.stock.getTodayBill(code)
      if (!rows.length) return null
      return rows.slice(-10).map(r => ({
        code: normalizeCode(code),
        date: String(r['日期'] ?? r['时间'] ?? '').slice(0, 10),
        mainNet: safeFloat(r['主力净流入']),
        smallNet: safeFloat(r['小单净流入']),
        mediumNet: safeFloat(r['中单净流入']),
        largeNet: safeFloat(r['大单净流入']),
        superLargeNet: safeFloat(r['超大单净流入']),
        mainNetPct: safeFloat(r['主力净流入占比']),
        close: safeFloat(r['收盘价']),
        changePct: safeFloat(r['涨跌幅']),
      } satisfies MoneyFlow))
    } catch { return null }
  }

  async profile(code: string) {
    try {
      const info = await ef.stock.getBaseInfo(code)
      if (!info) return null
      return [{
        code: normalizeCode(code),
        name: String(info['名称'] ?? ''),
        industry: String(info['所处行业'] ?? ''),
        totalMarketCap: safeFloat(info['总市值']),
        circulatingMarketCap: safeFloat(info['流通市值']),
      } satisfies StockProfile]
    } catch { return null }
  }

  async stockList(_market = 'all') {
    try {
      const rows = await ef.stock.getRealtimeQuotes('stock')
      if (!rows.length) return null
      return rows.map(r => {
        const c = String(r['代码'] ?? '')
        return {
          code: c, name: String(r['名称'] ?? ''), industry: '',
          market: c.startsWith('6') || c.startsWith('9') ? 'SH' : 'SZ',
        } satisfies StockListItem
      })
    } catch { return null }
  }
}
