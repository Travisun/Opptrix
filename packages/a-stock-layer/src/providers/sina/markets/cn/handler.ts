import { Capability } from '../../../../core/capabilities.js'
import type { StockRealtime } from '../../../../core/schema.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { normalizeCode, safeFloat } from '../../../../utils/helpers.js'

const URL = 'https://hq.sinajs.cn/list='
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  Referer: 'https://finance.sina.com.cn',
}

function parseLine(line: string) {
  const m = line.match(/hq_str_[a-z]+(\d+)="(.+)"/)
  if (!m) return null
  const values = m[2].split(',')
  if (values.length < 10) return null
  return { name: values[0], code: m[1], values }
}

export class SinaMarketHandler extends MarketHandlerShell {

  private async query(codes: string[]) {
    const resp = await fetch(`${URL}${codes.join(',')}`, { headers: HEADERS })
    const buf = await resp.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buf)
    return text.trim().split('\n').map(parseLine).filter(Boolean)
  }

  private toRt(code: string, row: NonNullable<ReturnType<typeof parseLine>>): StockRealtime {
    const v = row.values
    const price = safeFloat(v[3])
    const preClose = safeFloat(v[2])
    return {
      code: normalizeCode(code),
      name: v[0],
      price,
      open: safeFloat(v[1]),
      high: safeFloat(v[4]),
      low: safeFloat(v[5]),
      preClose,
      volume: safeFloat(v[8]),
      amount: safeFloat(v[9]),
      changePct: price != null && preClose ? Math.round(((price - preClose) / preClose) * 10000) / 100 : null,
      pe: null,
      pb: null,
      turnoverRate: null,
    }
  }

  async realtime(code: string) {
    const rows = await this.query([this.secFullCode(code)])
    if (!rows.length || !rows[0]) return null
    return [this.toRt(code, rows[0])]
  }

  async batchRealtime(codes: string[]) {
    const rows = await this.query(codes.map(c => this.secFullCode(c)))
    return rows.map((r, i) => this.toRt(codes[i], r!))
  }

  async indexRealtime(code: string) {
    const r = await this.realtime(code)
    return r ? r.map(x => ({ code: x.code, name: x.name, price: x.price, changePct: x.changePct })) : null
  }

  async globalIndex(code = '') {
    const map: Record<string, string> = {
      dji: 'gb_$dji', spx: 'gb_$inx', ixic: 'gb_$ixic', hsi: 'rt_hkHSI', n225: 'gb_$n225',
    }
    const keys = code ? [code] : Object.keys(map)
    const results = []
    for (const k of keys) {
      const sym = map[k]
      if (!sym) continue
      const rows = await this.query([sym])
      if (rows[0]) {
        const price = safeFloat(rows[0].values[1])
        const pre = safeFloat(rows[0].values[2])
        results.push({
          code: k, name: k, price,
          changePct: price != null && pre ? ((price - pre) / pre) * 100 : null,
          market: 'global',
        })
      }
    }
    return results.length ? results : null
  }

}
