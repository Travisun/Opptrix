/**
 * Zzshare API audit — mirrors official Python client.py SHORTCUTS + custom methods.
 * Run: npm run test:zzshare
 */
import { ZzshareClient } from '../dist/providers/zzshare/api/client.js'
import { invokeZzshare } from '../dist/providers/zzshare/api/invoke.js'
import { SHORTCUTS, CUSTOM_METHOD_NAMES, SHORTCUT_ENDPOINT_COUNT } from '../dist/providers/zzshare/api/constants.js'

const STOCK = '600519'
const STOCK2 = '002851'
const OFFICIAL_SHORTCUT_COUNT = 46

function ymd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function ymdDash(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return ymd(d)
}

function hasPayload(data) {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') {
    const list = data.list
    if (Array.isArray(list)) return list.length > 0
    return Object.keys(data).length > 0
  }
  return true
}

function classify(err, data) {
  if (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('HTTP 403') || msg.includes('需要有效订阅')) return 'SUBSCRIPTION'
    if (msg.includes('HTTP 500') || msg.includes('HTTP 502')) return 'UPSTREAM'
    if (msg.includes('HTTP 422') || msg.includes('缺少路径参数')) return 'ERROR'
    return 'ERROR'
  }
  if (hasPayload(data)) return 'OK'
  return 'EMPTY'
}

/** Minimal params per shortcut — aligned with client.py path/query contracts */
function shortcutParams(name, ctx) {
  const { date1, date2, start, end } = ctx
  const map = {
    uplimit_hot: { date1 },
    uplimit_stocks: { date1 },
    market_plate_stocks: { plate_type: 14, plate_code: '881121', date1, is_real: 1, limit: 10 },
    market_plate_popular_reason: { plate_code: '881121', date2: date1 },
    market_sentiment: { date1: start, date2: end },
    market_hot_sentiment: { date1: start, date2: end },
    market_style: { date1 },
    open_sentiment_data: { date1: start, date2: end },
    sentiment_timing: { date1: start, date2: end },
    daily: { code: STOCK, date1: start, date2: end },
    plate_kline: { b_code: '883957', date1: start, date2: end },
    trade_days: { day_start: `${new Date().getFullYear()}0101`, day_end: `${new Date().getFullYear()}1231` },
    ths_hot_top: { date1, top_n: 10 },
    stock_ths_hot: { code: `${STOCK}.SH`, date1 },
    sentiment_market_hot_day: { date: date1 },
    sentiment_trend: { model: 0, date1 },
    sentiment_trend_range: { model: 0, date1: start, date2: end },
    review_uplimit_reason: { date1, group: 0, page: 1, page_size: 10 },
    review_uplimit_hot_step: { date1, board: '', limit: 10 },
    stock_uplimit_reason: { stock_code: STOCK2, date: date1 },
    stock_uplimit_reason_history: { stock_code: STOCK2, page: 1, pageSize: 10 },
    review_uplimit_reason_open: { date1 },
    stock_info: { stock_id: STOCK, info_type: 0 },
    lhb_list: { date1 },
    lhb_detail: { date1, stock_code: STOCK2 },
    lhb_stock_history: { stock_code: STOCK2, trader_name: '' },
    lhb_trader_history: { trader_name: '机构专用', trader_id: '', stock_code: '', page: 1, per_page: 10 },
    plates_list: { plate_type: 14 },
    plates_rank: { plate_type: 14, date1, limit: 10 },
    plates_trend: { plate_type: 14, plate_code: '881121', day_start: start, day_end: end },
    plates_rank_days: { plate_type: 14, date2: date1, n_days: 5, n_type: 3, limit: 10 },
    plates_rank_days_new: { plate_type: 14, date2: date1, n_days: 5, n_type: 3, limit: 10, prev_days: 3 },
    plates_stocks: { plate_type: 14, plate_code: '881121', date: date1 },
    updown_distribution: { date1 },
    uplimit_trend: { date1 },
    sentiment_hot_day: { index: 0, st: date1 },
    sentiment_bull_data: { date1: start, date2: end },
    uplimit_market_value: { date1: start, date2: end },
    movement_alerts: { date1, type: '', limit: 20, is_real: 1 },
    zdjk_get: { date1: start, date2: end },
    ai_report_list: { type: 'daily', page: 1, page_size: 5 },
    ai_report_detail: { post_id: '1' },
    topic_table_list: { page: 1, limit: 5, brief: 1 },
    topic_table_detail: { tid: '1' },
    topic_table_stocks: { tid: '1' },
    topic_kline: { tid: '1', start_date: start },
  }
  return map[name] ?? {}
}

const client = ZzshareClient.fromConfig()
const date1 = ymd()
const ctx = { date1, date2: date1, start: daysAgo(30), end: date1 }

console.log('=== Zzshare client.py alignment ===')
console.log(`SHORTCUTS registered: ${SHORTCUT_ENDPOINT_COUNT} (official active: ${OFFICIAL_SHORTCUT_COUNT})`)
const removed = ['stock_moneyflow', 'market_mf', 'sentiment_market_top_n']
for (const name of removed) {
  console.log(`${SHORTCUTS[name] ? 'FAIL' : 'OK'} removed ${name}`)
}

const results = { OK: 0, EMPTY: 0, ERROR: 0, SUBSCRIPTION: 0, UPSTREAM: 0 }
const errors = []

console.log('\n=== SHORTCUTS ===')
for (const name of Object.keys(SHORTCUTS).sort()) {
  if (CUSTOM_METHOD_NAMES.has(name)) {
    console.log(`SKIP ${name.padEnd(28)} custom method`)
    continue
  }
  const t0 = Date.now()
  let status = 'ERROR'
  let detail = ''
  try {
    const data = await invokeZzshare(client, name, shortcutParams(name, ctx))
    status = classify(null, data)
    if (status === 'EMPTY') detail = 'no payload'
    else if (Array.isArray(data)) detail = `rows=${data.length}`
    else if (data && typeof data === 'object' && Array.isArray(data.list)) detail = `list=${data.list.length}`
    else detail = typeof data
  } catch (e) {
    status = classify(e)
    detail = e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)
    if (status === 'ERROR') errors.push({ name, detail })
  }
  results[status]++
  console.log(`${status.padEnd(5)} ${name.padEnd(28)} ${Date.now() - t0}ms ${detail}`)
}

console.log('\n=== Custom methods ===')
const customTests = [
  ['daily', () => client.daily({ ts_code: STOCK, start_date: ctx.start, end_date: ctx.end, limit: 5 })],
  ['rt_k', () => client.rt_k({ ts_code: `${STOCK}.SH` })],
  ['stk_mins', () => client.stk_mins({ ts_code: STOCK, freq: '1min', count: 10 })],
  ['stock_basic', () => client.stock_basic({ ts_code: STOCK, list_status: 'L' })],
  ['plates_rank', () => client.plates_rank(14, date1, 10)],
  ['plates_rank_days', () => client.plates_rank_days(14, date1, 5, 3, 10)],
  ['plates_rank_days_new', () => client.plates_rank_days_new(14, date1, 5, 3, 10, 3)],
  ['query trade_days', () => client.query('market/trade/days', { days: 5 })],
]

for (const [name, fn] of customTests) {
  const t0 = Date.now()
  let status = 'ERROR'
  let detail = ''
  try {
    const data = await fn()
    status = classify(null, data)
    if (status === 'EMPTY') detail = 'no payload'
    else if (Array.isArray(data)) detail = `rows=${data.length}`
    else detail = typeof data
  } catch (e) {
    status = classify(e)
    detail = e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)
    if (status === 'ERROR') errors.push({ name, detail })
  }
  results[status]++
  console.log(`${status.padEnd(5)} ${name.padEnd(28)} ${Date.now() - t0}ms ${detail}`)
}

console.log('\n=== Summary ===')
console.log(`OK=${results.OK} EMPTY=${results.EMPTY} SUBSCRIPTION=${results.SUBSCRIPTION} UPSTREAM=${results.UPSTREAM} ERROR=${results.ERROR}`)
if (errors.length) {
  console.log('Implementation errors:')
  for (const e of errors) console.log(`  - ${e.name}: ${e.detail}`)
}

const countOk = SHORTCUT_ENDPOINT_COUNT === OFFICIAL_SHORTCUT_COUNT
const removedOk = removed.every(n => !SHORTCUTS[n])
const exitCode = countOk && removedOk && results.ERROR === 0 ? 0 : 1
process.exit(exitCode)
