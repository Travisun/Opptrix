import { AshareEngine } from '../dist/engine.js'
import { ResearchHub } from '../../research-hub/dist/hub.js'

const CODE = '600519'

const engineTests = [
  ['realtime', e => e.realtime(CODE)],
  ['batchRealtime', e => e.batchRealtime([CODE, '000001'])],
  ['profile', e => e.profile(CODE)],
  ['shareholders', e => e.shareholders(CODE)],
  ['financials', e => e.financials(CODE)],
  ['financials all', e => e.financials(CODE, '', 'all')],
  ['dividend', e => e.dividend(CODE)],
  ['news', e => e.news(CODE, 1, 5)],
  ['moneyFlow', e => e.moneyFlow(CODE)],
  ['cashFlow', e => e.cashFlow(CODE)],
  ['balanceSheet', e => e.balanceSheet(CODE)],
  ['incomeStatement', e => e.incomeStatement(CODE)],
  ['dragonTiger', e => e.dragonTiger()],
  ['tradeCalendar', e => e.tradeCalendar(2026)],
  ['marketMoneyFlow', e => e.marketMoneyFlow('north')],
  ['sectorMoneyFlow', e => e.sectorMoneyFlow()],
  ['limitUpdown', e => e.limitUpdown()],
  ['indexRealtime', e => e.indexRealtime('000001')],
  ['kline daily', e => e.kline(CODE, 'daily', '', '', 20)],
  ['minuteKline 1m', e => e.minuteKline(CODE, '1m', 30)],
  ['intradayTick', e => e.intradayTick(CODE)],
  ['mainBusiness', e => e.mainBusiness(CODE)],
  ['actualController', e => e.actualController(CODE)],
  ['globalIndex', e => e.globalIndex()],
  ['chipDistribution', e => e.chipDistribution(CODE)],
]

const hubTests = [
  ['search_stocks', h => h.dispatch('search_stocks', { keyword: '600519' })],
  ['stock_quotes', h => h.dispatch('stock_quotes', { codes: [CODE] })],
  ['stock_kline', h => h.dispatch('stock_kline', { code: CODE, count: 30 })],
  ['stock_chart daily', h => h.dispatch('stock_chart', { code: CODE, period: 'daily', count: 60 })],
  ['stock_chart intraday', h => h.dispatch('stock_chart', { code: CODE, period: 'intraday' })],
  ['stock_cyq', h => h.dispatch('stock_cyq', { code: CODE })],
  ['stock_detail', h => h.dispatch('stock_detail', { code: CODE })],
]

const de = new AshareEngine()
console.log('=== Engine API audit ===')
const engineFails = []
for (const [name, fn] of engineTests) {
  const t0 = Date.now()
  const r = await fn(de)
  const ok = r.success && (r.data?.length ?? 0) > 0
  console.log(`${ok ? 'OK' : 'FAIL'} ${name.padEnd(22)} ${Date.now() - t0}ms n=${r.data?.length ?? 0} ${r.error ?? ''}`)
  if (!ok) engineFails.push(name)
}

console.log('\n=== Hub API audit ===')
const hub = new ResearchHub()
const hubFails = []
for (const [name, fn] of hubTests) {
  const t0 = Date.now()
  const r = await fn(hub)
  const ok = r.success
  const extra = name === 'stock_detail'
    ? ` fin=${r.data?.financialHistory?.length} div=${r.data?.dividends?.length}`
    : name === 'stock_chart daily'
      ? ` bars=${r.data?.bars?.length} cyq=${r.data?.cyqLatest?.date ?? '-'}`
      : name === 'stock_cyq'
        ? ` n=${r.data?.rows?.length ?? 0}`
        : ''
  console.log(`${ok ? 'OK' : 'FAIL'} ${name.padEnd(22)} ${Date.now() - t0}ms ${extra}`)
  if (!ok) hubFails.push(name)
}

console.log('\nEngine fails:', engineFails.join(', ') || 'none')
console.log('Hub fails:', hubFails.join(', ') || 'none')
process.exit(engineFails.length + hubFails.length > 0 ? 1 : 0)
