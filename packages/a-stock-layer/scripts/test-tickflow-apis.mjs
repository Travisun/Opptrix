/**
 * TickFlow OpenAPI audit — https://api.tickflow.org/openapi.json
 * Run: npm run test:tickflow
 */
import { TickflowClient } from '../dist/providers/tickflow/api/client.js'
import { loadTickflowConfig } from '../dist/providers/tickflow/config.js'

const CN = '600519.SH'
const CN2 = '000001.SZ'
const OFFICIAL_PATH_COUNT = 19

const cfg = loadTickflowConfig()
if (!cfg.apiKey) {
  console.error('SKIP: TickFlow API Key 未配置（provider_settings 或环境变量）')
  process.exit(0)
}

const client = TickflowClient.fromConfig(cfg)
const results = { OK: 0, EMPTY: 0, ERROR: 0, SUBSCRIPTION: 0, UPSTREAM: 0 }

function hasPayload(data) {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') return Object.keys(data).length > 0
  return true
}

function classify(err, data) {
  if (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('403') || msg.includes('订阅')) return 'SUBSCRIPTION'
    if (msg.includes('500') || msg.includes('502')) return 'UPSTREAM'
    return 'ERROR'
  }
  return hasPayload(data) ? 'OK' : 'EMPTY'
}

async function run(name, fn) {
  const t0 = Date.now()
  let status = 'ERROR'
  let detail = ''
  try {
    const json = await fn()
    const data = json?.data
    status = classify(null, data)
    if (status === 'EMPTY') detail = 'no payload'
    else if (Array.isArray(data)) detail = `rows=${data.length}`
    else if (data && typeof data === 'object') detail = `keys=${Object.keys(data).length}`
    else detail = typeof data
  } catch (e) {
    status = classify(e)
    detail = e instanceof Error ? e.message.slice(0, 100) : String(e).slice(0, 100)
  }
  results[status]++
  console.log(`${status.padEnd(12)} ${name.padEnd(28)} ${Date.now() - t0}ms ${detail}`)
  return status
}

console.log('=== TickFlow OpenAPI (19 paths) ===\n')

const tests = [
  ['getExchanges', () => client.getExchanges()],
  ['getQuotes', () => client.getQuotes({ symbols: CN })],
  ['postQuotes', () => client.postQuotes({ symbols: [CN, CN2] })],
  ['getDepth', () => client.getDepth(CN)],
  ['getDepthBatch', () => client.getDepthBatch(`${CN},${CN2}`)],
  ['getKlines', () => client.getKlines({ symbol: CN, period: '1d', count: 5 })],
  ['getKlinesBatch', () => client.getKlinesBatch({ symbols: `${CN},${CN2}`, period: '1d', count: 5 })],
  ['getKlinesIntraday', () => client.getKlinesIntraday({ symbol: CN, period: '1m' })],
  ['getKlinesIntradayBatch', () => client.getKlinesIntradayBatch({ symbols: `${CN},${CN2}`, period: '1m' })],
  ['getKlinesExFactors', () => client.getKlinesExFactors({ symbols: CN })],
  ['getInstruments', () => client.getInstruments({ symbols: CN })],
  ['postInstruments', () => client.postInstruments({ symbols: [CN, CN2] })],
  ['getExchangeInstruments SH', () => client.getExchangeInstruments('SH', 'stock')],
  ['getUniverses', () => client.getUniverses()],
  ['getUniverse (first)', async () => {
    const list = await client.getUniverses()
    const first = Array.isArray(list.data) ? list.data[0] : null
    const id = first?.id ?? first?.universe_id
    if (!id) return { data: null }
    return client.getUniverse(String(id))
  }],
  ['postUniversesBatch', async () => {
    const list = await client.getUniverses()
    const ids = (Array.isArray(list.data) ? list.data : []).slice(0, 2).map(u => String(u.id ?? u.universe_id ?? '')).filter(Boolean)
    if (!ids.length) return { data: null }
    return client.postUniversesBatch({ ids })
  }],
  ['getFinancialsIncome', () => client.getFinancialsIncome({ symbols: CN, latest: true })],
  ['getFinancialsBalanceSheet', () => client.getFinancialsBalanceSheet({ symbols: CN, latest: true })],
  ['getFinancialsCashFlow', () => client.getFinancialsCashFlow({ symbols: CN, latest: true })],
  ['getFinancialsMetrics', () => client.getFinancialsMetrics({ symbols: CN, latest: true })],
  ['getFinancialsShares', () => client.getFinancialsShares({ symbols: CN, latest: true })],
]

for (const [name, fn] of tests) await run(name, fn)

console.log('\n=== Summary ===')
console.log(`tests=${tests.length} paths=${OFFICIAL_PATH_COUNT}`)
console.log(`OK=${results.OK} EMPTY=${results.EMPTY} SUBSCRIPTION=${results.SUBSCRIPTION} UPSTREAM=${results.UPSTREAM} ERROR=${results.ERROR}`)
process.exit(results.ERROR > 0 ? 1 : 0)
