import { Capability } from '../../../../core/capabilities.js'
import type {
  Dividend, FinancialSummary, IndexKline, StockKline, StockListItem, StockProfile, StockRealtime,
} from '../../../../core/schema.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { isTushareEnabled, loadTushareConfig } from '../../config.js'
import { TushareClient, type TushareRow } from '../../api/client.js'
import { fromTsCode, indexTsCode, toTsCode } from '../../codes.js'
import {
  latestOpenTradeDate,
  mapDailyQuoteRows,
  mapDividendRows,
  mapFinancialRows,
  mapGenericRows,
  mapIndexKlineRows,
  mapKlineRows,
  mapProfileRow,
  mapStockListRows,
  todayYmd,
  ymdDaysAgo,
} from '../../normalize/index.js'
import { isBse920Code, normalizeCode } from '../../../../utils/helpers.js'

/** Tushare Pro — 2000 积分档常用接口（bulk 优先） */

export class TushareMarketHandler extends MarketHandlerShell {
  private nameCache = new Map<string, string>()
  private snapshotCache: { tradeDate: string; quotes: Map<string, StockRealtime> } | null = null

  private client(): TushareClient | null {
    if (!isTushareEnabled()) return null
    try {
      return new TushareClient()
    } catch {
      return null
    }
  }

  private async latestTradeDate(client: TushareClient): Promise<string | null> {
    const rows = await client.query(
      'trade_cal',
      { exchange: 'SSE', start_date: ymdDaysAgo(14), end_date: todayYmd() },
      'cal_date,is_open',
    )
    return latestOpenTradeDate(rows, todayYmd())
  }

  private async loadDailySnapshot(client: TushareClient): Promise<Map<string, StockRealtime>> {
    const tradeDate = await this.latestTradeDate(client)
    if (!tradeDate) return new Map()
    if (this.snapshotCache?.tradeDate === tradeDate) return this.snapshotCache.quotes

    const [daily, basic] = await Promise.all([
      client.queryAll('daily', { trade_date: tradeDate }, 'ts_code,trade_date,open,high,low,close,pre_close,vol,amount,pct_chg'),
      client.queryAll('daily_basic', { trade_date: tradeDate }, 'ts_code,turnover_rate,pe,pb,total_mv'),
    ])
    const quotes = mapDailyQuoteRows(daily, basic, this.nameCache)
    const map = new Map(quotes.map(q => [q.code, q]))
    this.snapshotCache = { tradeDate, quotes: map }
    return map
  }

  async stockList(_market = 'all'): Promise<StockListItem[] | null> {
    return this.stockBasic('', 'L')
  }

  async stockBasic(code = '', listStatus = 'L'): Promise<StockListItem[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const params: Record<string, string> = { list_status: listStatus || 'L' }
      const bare = normalizeCode(code)
      if (bare) params.ts_code = toTsCode(bare)
      const rows = await client.queryAll(
        'stock_basic',
        params,
        'ts_code,symbol,name,area,industry,market,list_date',
      )
      const items = mapStockListRows(rows)
      for (const item of items) this.nameCache.set(item.code, item.name)
      return items.length ? items : null
    } catch {
      return null
    }
  }

  async batchRealtime(codes: string[]): Promise<StockRealtime[] | null> {
    const client = this.client()
    const eligible = codes.filter(c => !isBse920Code(normalizeCode(c)))
    if (!client || !eligible.length) return null
    try {
      const snapshot = await this.loadDailySnapshot(client)
      const out: StockRealtime[] = []
      for (const code of eligible) {
        const q = snapshot.get(normalizeCode(code))
        if (q) out.push(q)
      }
      return out.length ? out : null
    } catch {
      return null
    }
  }

  async realtime(code: string): Promise<StockRealtime[] | null> {
    if (isBse920Code(normalizeCode(code))) return null
    const batch = await this.batchRealtime([code])
    return batch
  }

  async kline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<StockKline[] | null> {
    if (isBse920Code(normalizeCode(code))) return null
    if (period !== 'daily' && period !== 'weekly' && period !== 'monthly') return null
    const client = this.client()
    if (!client) return null
    try {
      const tsCode = toTsCode(code)
      const api = period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly'
      const params: Record<string, unknown> = { ts_code: tsCode }
      if (start) params.start_date = start.replace(/-/g, '')
      if (end) params.end_date = end.replace(/-/g, '')
      if (!start && !end && count) {
        params.start_date = ymdDaysAgo(Math.min(count * 2, 3650))
        params.end_date = todayYmd()
      }
      const rows = await client.queryAll(
        api,
        params,
        'ts_code,trade_date,open,high,low,close,vol,amount,pct_chg',
      )
      let mapped = mapKlineRows(code, rows)
      if (count && mapped.length > count) mapped = mapped.slice(-count)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async indexKline(
    code: string,
    period = 'daily',
    start = '',
    end = '',
    count?: number,
  ): Promise<IndexKline[] | null> {
    if (period !== 'daily') return null
    const client = this.client()
    if (!client) return null
    try {
      const tsCode = indexTsCode(code)
      const params: Record<string, unknown> = { ts_code: tsCode }
      if (start) params.start_date = start.replace(/-/g, '')
      if (end) params.end_date = end.replace(/-/g, '')
      if (!start && !end && count) {
        params.start_date = ymdDaysAgo(Math.min(count * 2, 3650))
        params.end_date = todayYmd()
      }
      const rows = await client.queryAll(
        'index_daily',
        params,
        'ts_code,trade_date,open,high,low,close,vol,amount,pct_chg',
      )
      let mapped = mapIndexKlineRows(code, rows)
      if (count && mapped.length > count) mapped = mapped.slice(-count)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async indexRealtime(code: string) {
    const batch = await this.realtime(code)
    return batch ? batch.map(x => ({
      code: x.code,
      name: x.name,
      price: x.price,
      changePct: x.changePct,
      open: x.open,
      high: x.high,
      low: x.low,
      preClose: x.preClose,
      volume: x.volume,
      amount: x.amount,
    })) : null
  }

  async profile(code: string): Promise<StockProfile[] | null> {
    if (isBse920Code(normalizeCode(code))) return null
    const client = this.client()
    if (!client) return null
    try {
      const tsCode = toTsCode(code)
      const [basic, company] = await Promise.all([
        client.query('stock_basic', { ts_code: tsCode }, 'ts_code,name,industry,list_date,market'),
        client.query('stock_company', { ts_code: tsCode }, 'ts_code,chairman,manager,reg_capital,setup_date,province,city,introduction,main_business,business_scope,employees'),
      ])
      if (!basic.length) return null
      const row = mapProfileRow(code, basic[0], company[0])
      return [row]
    } catch {
      return null
    }
  }

  async financials(code: string, _reportDate = '', reportType = 'annual'): Promise<FinancialSummary[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const tsCode = toTsCode(code)
      const quarterly = reportType === 'quarter' || reportType === 'quarterly'
      const rows = quarterly
        ? await client.queryAll(
          'income',
          { ts_code: tsCode, report_type: '2' },
          'ts_code,end_date,total_revenue,revenue,n_income,basic_eps',
        )
        : await client.queryAll(
          'fina_indicator',
          { ts_code: tsCode },
          'ts_code,end_date,eps,basic_eps,total_revenue,revenue,n_income,netprofit,profit_dedt,roe,grossprofit_margin,netprofit_margin,debt_to_assets,ocfps,bps,tr_yoy,or_yoy,netprofit_yoy,dt_netprofit_yoy',
        )
      const mapped = mapFinancialRows(code, rows, quarterly ? 'quarterly' : 'annual')
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async dividend(code: string): Promise<Dividend[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const rows = await client.queryAll(
        'dividend',
        { ts_code: toTsCode(code) },
        'ts_code,end_date,ann_date,ex_date,record_date,pay_date,cash_div,stk_div,div_proc,imp_ann_date',
      )
      const mapped = mapDividendRows(code, rows)
      return mapped.length ? mapped : null
    } catch {
      return null
    }
  }

  async shareholders(code: string, _reportDate = ''): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const tsCode = toTsCode(code)
      const [top10, float10] = await Promise.all([
        client.query('top10_holders', { ts_code: tsCode }, 'ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio'),
        client.query('top10_floatholders', { ts_code: tsCode }, 'ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio'),
      ])
      const mapHolder = (r: TushareRow, source: string) => ({
        code: normalizeCode(code),
        holder_name: r.holder_name,
        hold_amount: r.hold_amount,
        hold_ratio: r.hold_ratio,
        end_date: r.end_date,
        ann_date: r.ann_date,
        source,
      })
      const rows = [
        ...top10.map(r => mapHolder(r, 'top10_holders')),
        ...float10.map(r => mapHolder(r, 'top10_floatholders')),
      ]
      return rows.length ? rows : null
    } catch {
      return null
    }
  }

  async perfForecast(code: string): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const rows = await client.queryAll(
        'forecast',
        { ts_code: toTsCode(code) },
        'ts_code,ann_date,end_date,type,p_change_min,p_change_max,net_profit_min,net_profit_max,summary',
      )
      return mapGenericRows(code, rows)
    } catch {
      return null
    }
  }

  async instHolding(code: string): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const rows = await client.query(
        'top10_floatholders',
        { ts_code: toTsCode(code) },
        'ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio',
      )
      const inst = rows.filter(r => {
        const name = String(r.holder_name ?? '')
        return /基金|社保|保险|信托|资管|QFII|券商|银行|投资|有限|合伙/i.test(name)
      })
      return inst.length ? mapGenericRows(code, inst) : null
    } catch {
      return null
    }
  }

  async insiderTrade(code: string): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const rows = await client.queryAll(
        'stk_holdertrade',
        { ts_code: toTsCode(code) },
        'ts_code,ann_date,holder_name,holder_type,in_de,change_vol,change_ratio,after_share,after_ratio,avg_price,total_share,begin_date,close_date',
      )
      return mapGenericRows(code, rows)
    } catch {
      return null
    }
  }

  async buyback(code: string): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const rows = await client.queryAll(
        'repurchase',
        { ts_code: toTsCode(code) },
        'ts_code,ann_date,end_date,proc,exp_date,vol,amount,high_limit,low_limit',
      )
      return mapGenericRows(code, rows)
    } catch {
      return null
    }
  }

  async mainBusiness(code: string): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const rows = await client.queryAll(
        'fina_mainbz',
        { ts_code: toTsCode(code), type: 'P' },
        'ts_code,end_date,bz_item,bz_sales,bz_profit,bz_cost,curr_type',
      )
      return mapGenericRows(code, rows)
    } catch {
      return null
    }
  }

  async tradeCalendar(year?: number): Promise<Record<string, unknown>[] | null> {
    const client = this.client()
    if (!client) return null
    try {
      const y = year ?? new Date().getFullYear()
      const rows = await client.queryAll(
        'trade_cal',
        { exchange: 'SSE', start_date: `${y}0101`, end_date: `${y}1231` },
        'exchange,cal_date,is_open,pretrade_date',
      )
      return rows.map(r => ({
        date: String(r.cal_date),
        isOpen: String(r.is_open) === '1',
        exchange: r.exchange,
      }))
    } catch {
      return null
    }
  }

}
