import { Capability } from '../../../../core/capabilities.js'
import type { MoneyFlow, StockRealtime } from '../../../../core/schema.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { normalizeCode, isBseCode, resolveMarket, secXueqiuSymbol } from '../../../../utils/helpers.js'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  Referer: 'https://xueqiu.com/',
  Accept: 'application/json',
}

export class XueqiuMarketHandler extends MarketHandlerShell {
  private cookies = ''

  private async ensureCookies() {
    if (this.cookies) return
    const resp = await fetch('https://xueqiu.com/', { headers: HEADERS })
    this.cookies = resp.headers.getSetCookie?.().join('; ') ?? ''
  }

  private async getJson(url: string, params: Record<string, string>) {
    await this.ensureCookies()
    const qs = new URLSearchParams(params)
    const resp = await fetch(`${url}?${qs}`, {
      headers: { ...HEADERS, Cookie: this.cookies },
    })
    return resp.json() as Promise<Record<string, unknown>>
  }

  private symbol(code: string) {
    return secXueqiuSymbol(code)
  }

  async realtime(code: string) {
    try {
      const data = await this.getJson('https://stock.xueqiu.com/v5/stock/quote.json', {
        symbol: this.symbol(code), extend: 'detail',
      })
      const item = (data.data as { quote?: Record<string, unknown> })?.quote
      if (!item) return null
      return [{
        code: normalizeCode(code),
        name: String(item.name ?? ''),
        price: item.current as number | null,
        open: item.open as number | null,
        high: item.high as number | null,
        low: item.low as number | null,
        changePct: item.percent as number | null,
        pe: item.pe_ttm as number | null,
        pb: item.pb as number | null,
        turnoverRate: item.turnover_rate as number | null,
        marketCap: item.market_capital as number | null,
      }]
    } catch { return null }
  }

  async indexRealtime(code: string) {
    const r = await this.realtime(code)
    return r ? r.map(x => ({ code: x.code, name: x.name, price: x.price, changePct: x.changePct })) : null
  }

  async moneyFlow(code: string) {
    try {
      const data = await this.getJson('https://stock.xueqiu.com/v5/stock/capital/flow.json', {
        symbol: this.symbol(code), count: '5',
      })
      const items = (data.data as { items?: Record<string, unknown>[] })?.items ?? []
      if (!items.length) return null
      return items.slice(0, 5).map(it => ({
        code: normalizeCode(code),
        date: String(it.timestamp ?? '').slice(0, 10),
        mainNet: it.main_net_inflow as number | null,
        changePct: it.percent as number | null,
      } satisfies MoneyFlow))
    } catch { return null }
  }

}
