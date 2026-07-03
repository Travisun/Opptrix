import { Capability } from '../../../../core/capabilities.js'
import type { IndexKline, StockKline } from '../../../../core/schema.js'
import { MarketHandlerShell } from '../../../common/driver-factory.js'
import { isBseCode, normalizeCode } from '../../../../utils/helpers.js'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  Referer: 'https://money.163.com/',
}

function neteaseCode(code: string) {
  const c = normalizeCode(code)
  if (isBseCode(c)) return `2${c}`
  if (c.startsWith('6') || (c.startsWith('9') && !isBseCode(c))) return `0${c}`
  return `1${c}`
}

function parseCsv(text: string, code: string) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return null
  const headers = lines[0].split(',')
  const idx = (name: string) => headers.findIndex(h => h.includes(name))
  const results: StockKline[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const close = Number(cols[idx('收盘价')] ?? cols[3])
    if (!close || close <= 0) continue
    results.push({
      code: normalizeCode(code),
      date: (cols[idx('日期')] ?? cols[0]).slice(0, 10),
      open: Number(cols[idx('开盘价')] ?? cols[1]) || close,
      close,
      high: Number(cols[idx('最高价')] ?? cols[4]) || close,
      low: Number(cols[idx('最低价')] ?? cols[5]) || close,
      volume: Number(cols[idx('成交量')] ?? cols[8]) || 0,
      amount: Number(cols[idx('成交金额')] ?? cols[9]) || 0,
      changePct: Number(cols[idx('涨跌幅')] ?? '') || null,
      turnoverRate: null,
    })
  }
  return results.length ? results : null
}

export class NeteaseMarketHandler extends MarketHandlerShell {

  private async fetchKline(code: string, start = '', end = '') {
    const params = new URLSearchParams({ code: neteaseCode(code) })
    if (start) params.set('start', start.replace(/-/g, ''))
    if (end) params.set('end', end.replace(/-/g, ''))
    const resp = await fetch(`https://quotes.money.163.com/service/chddata.html?${params}`, { headers: HEADERS })
    const buf = await resp.arrayBuffer()
    return new TextDecoder('gbk').decode(buf)
  }

  async kline(code: string, period = 'daily', start = '', end = '') {
    if (period !== 'daily') return null
    const text = await this.fetchKline(code, start, end)
    if (!text?.includes('日期')) return null
    return parseCsv(text, code)
  }

  async indexKline(code: string, period = 'daily', start = '', end = '') {
    const rows = await this.kline(code, period, start, end)
    return rows as IndexKline[] | null
  }

}
