import { Capability } from '../../../../core/capabilities.js'
import type { StockRealtime } from '../../../../core/schema.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  Referer: 'https://www.10jqka.com.cn/',
}

export class TonghuashunMarketHandler extends MarketHandlerShell {

  private async fetch(code: string) {
    const c = normalizeCode(code)
    const resp = await fetch(`https://d.10jqka.com.cn/v2/realhead/hs_${c}/last.js`, { headers: HEADERS })
    const text = await resp.text()
    const m = text.match(/last\((\{.+?\})\)/s)
    if (!m) return null
    const data = JSON.parse(m[1]) as { data?: { items?: Record<string, unknown>[] } }
    return data.data?.items?.[0] ?? null
  }

  async realtime(code: string) {
    const item = await this.fetch(code)
    if (!item) return null
    return [{
      code: normalizeCode(code),
      name: String(item.name ?? ''),
      price: safeFloat(item['10']),
      changePct: safeFloat(item['199112']),
      volume: safeFloat(item['13']),
      amount: safeFloat(item['19']),
      pe: null,
      pb: null,
      turnoverRate: null,
    }]
  }

  async indexRealtime(code: string) {
    const r = await this.realtime(code)
    return r ? r.map(x => ({ code: x.code, name: x.name, price: x.price, changePct: x.changePct })) : null
  }

}
