import { httpGet } from '../utils/http.js'
import { EF_HEADERS, HISTORY_BILL_KEYS, KLINE_FIELD_KEYS, QUOTE_FIELDS } from './config.js'
import { fmtBegEnd, getQuoteId, normDate, num } from './utils.js'

export type EfRow = Record<string, string | number | null>

async function emGet(url: string, params: Record<string, string>) {
  return httpGet(url, params)
}

function mapQuoteRow(raw: Record<string, unknown>): EfRow {
  const row: EfRow = {}
  for (const [k, label] of Object.entries(QUOTE_FIELDS)) {
    row[label] = num(raw[k]) ?? (raw[k] != null ? String(raw[k]) : null)
  }
  const mkt = String(raw.f13 ?? '')
  row['市场类型'] = mkt
  row['行情ID'] = `${mkt}.${raw.f12 ?? ''}`
  return row
}

function parseKlines(klines: string[], name: string, code: string): EfRow[] {
  const cols = ['日期', '开盘', '收盘', '最高', '最低', '成交量', '成交额', '振幅', '涨跌幅', '涨跌额', '换手率']
  return klines.map(line => {
    const p = line.split(',')
    const row: EfRow = { 名称: name, 代码: code }
    cols.forEach((c, i) => { row[c] = num(p[i]) ?? p[i] ?? null })
    row['日期'] = normDate(String(row['日期'] ?? ''))
    return row
  })
}

/** Latest quote for one or more secids — ef.stock.get_quote */
export async function getLatestQuote(secids: string[]): Promise<EfRow[]> {
  const fields = Object.keys(QUOTE_FIELDS).join(',')
  const json = await emGet('https://push2.eastmoney.com/api/qt/ulist.np/get', {
    OSVersion: '14.3', appVersion: '6.3.8', fields, fltt: '2', plat: 'Iphone',
    product: 'EFund', secids: secids.join(','), serverVersion: '6.3.6', version: '6.3.8',
  })
  const diff = (json?.data as { diff?: Record<string, unknown>[] })?.diff ?? []
  return diff.map(mapQuoteRow)
}

/** K-line history — ef.stock/bond/futures.get_quote_history */
export async function getQuoteHistory(
  code: string,
  opts: { beg?: string; end?: string; klt?: number; fqt?: number } = {},
) {
  const secid = await getQuoteId(code)
  const { beg = '19000101', end = '20500101', klt = 101, fqt = 1 } = opts
  const json = await emGet('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
    fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
    fields2: KLINE_FIELD_KEYS,
    beg: fmtBegEnd(beg) || '19000101',
    end: fmtBegEnd(end) || '20500101',
    rtntype: '6',
    secid,
    klt: String(klt),
    fqt: String(fqt),
  })
  const data = json?.data as { name?: string; klines?: string[] } | undefined
  const klines = data?.klines ?? []
  if (!klines.length) return []
  const c = secid.split('.').pop() ?? code
  return parseKlines(klines, data?.name ?? '', c)
}

/** Realtime quotes by FS filter — ef.stock.get_realtime_quotes */
export async function getRealtimeQuotesByFs(fs: string, pageSize = 200): Promise<EfRow[]> {
  const fields = Object.keys(QUOTE_FIELDS).join(',')
  const json = await emGet('https://push2.eastmoney.com/api/qt/clist/get', {
    pn: '1', pz: String(pageSize), po: '1', np: '1', fltt: '2', invt: '2',
    fid: 'f12', fs, fields,
  })
  const raw = (json?.data as { diff?: Record<string, unknown>[] | Record<string, unknown> })?.diff
  const diff = raw ? (Array.isArray(raw) ? raw : Object.values(raw)) : []
  return (diff as Record<string, unknown>[]).map(mapQuoteRow)
}

/** Base info — ef.stock.get_base_info */
export async function getBaseInfo(code: string): Promise<EfRow | null> {
  const secid = await getQuoteId(code)
  const fields = Object.keys({
    f57: 1, f58: 1, f162: 1, f167: 1, f127: 1, f116: 1, f117: 1,
    f173: 1, f187: 1, f105: 1, f186: 1,
  }).join(',')
  const json = await emGet('https://push2.eastmoney.com/api/qt/stock/get', {
    ut: 'fa5fd1943c7b386f172d6893dbfba10b', invt: '2', fltt: '2', fields, secid,
  })
  const data = json?.data as Record<string, unknown> | undefined
  if (!data) return null
  const labels: Record<string, string> = {
    f57: '代码', f58: '名称', f162: '市盈率(动)', f167: '市净率', f127: '所处行业',
    f116: '总市值', f117: '流通市值', f173: 'ROE', f187: '净利率', f105: '净利润', f186: '毛利率',
  }
  const row: EfRow = {}
  for (const [k, label] of Object.entries(labels)) {
    row[label] = num(data[k]) ?? (data[k] != null ? String(data[k]) : null)
  }
  return row
}

/** Historical money flow — ef.stock.get_history_bill */
export async function getHistoryBill(code: string): Promise<EfRow[]> {
  const secid = await getQuoteId(code)
  const json = await emGet('https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get', {
    lmt: '100000', klt: '101', secid, fields1: 'f1,f2,f3,f7', fields2: HISTORY_BILL_KEYS,
  })
  const data = json?.data as { name?: string; klines?: string[] } | undefined
  const klines = data?.klines ?? []
  const cols = [
    '日期', '主力净流入', '小单净流入', '中单净流入', '大单净流入', '超大单净流入',
    '主力净流入占比', '小单流入净占比', '中单流入净占比', '大单流入净占比', '超大单流入净占比',
    '收盘价', '涨跌幅',
  ]
  const c = secid.split('.').pop() ?? code
  return klines.map(line => {
    const p = line.split(',')
    const row: EfRow = { 名称: data?.name ?? '', 代码: c }
    cols.forEach((col, i) => { row[col] = num(p[i]) ?? p[i] ?? null })
    row['日期'] = normDate(String(row['日期'] ?? ''))
    return row
  })
}

/** Intraday money flow — ef.stock.get_today_bill */
export async function getTodayBill(code: string): Promise<EfRow[]> {
  const secid = await getQuoteId(code)
  const json = await emGet('https://push2.eastmoney.com/api/qt/stock/fflow/kline/get', {
    lmt: '0', klt: '1', secid, fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
  })
  const data = json?.data as { name?: string; klines?: string[] } | undefined
  const klines = data?.klines ?? []
  const cols = ['时间', '主力净流入', '小单净流入', '中单净流入', '大单净流入', '超大单净流入']
  const c = secid.split('.').pop() ?? code
  return klines.map(line => {
    const p = line.split(',')
    const row: EfRow = { 名称: data?.name ?? '', 代码: c }
    cols.forEach((col, i) => { row[col] = num(p[i]) ?? p[i] ?? null })
    return row
  })
}

/** Tick-by-tick deal detail — ef.stock.get_deal_detail */
export async function getDealDetail(code: string, maxCount = 1000): Promise<EfRow[]> {
  const secid = await getQuoteId(code)
  const base = await getBaseInfo(code)
  const json = await emGet('https://push2.eastmoney.com/api/qt/stock/details/get', {
    secid, fields1: 'f1,f2,f3,f4,f5', fields2: 'f51,f52,f53,f54,f55', pos: `-${maxCount}`,
  })
  const data = json?.data as { details?: string[]; prePrice?: number } | undefined
  const lines = data?.details ?? []
  const name = String(base?.['名称'] ?? '')
  const c = String(base?.['代码'] ?? code)
  return lines.map(line => {
    const p = line.split(',')
    return {
      名称: name, 代码: c, 时间: p[0] ?? '', 昨收: num(data?.prePrice),
      成交价: num(p[1]), 成交量: num(p[2]), 单数: num(p[3]),
    }
  })
}
