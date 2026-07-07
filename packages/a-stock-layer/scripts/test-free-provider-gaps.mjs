/**
 * 免费三源（zzshare / baostock / tickflow）缺口能力实测。
 * Run: npm run test:free-gaps
 */
import { MarketDataEngine } from '../dist/engine.js'
import { Capability } from '../dist/core/capabilities.js'
import { getProviderConfigStore } from '../dist/providers/config-store.js'

const ETF = '510300'
const STOCK = '600519'
const STOCK_LHB = '603676'

const store = getProviderConfigStore()
const enabled = {
  zzshare: store.getRuntime('zzshare').enabled,
  baostock: store.getRuntime('baostock').enabled,
  tickflow: store.getRuntime('tickflow').enabled,
}

const engine = new MarketDataEngine(false)
const { registerAllDrivers } = await import('../dist/providers/register.js')
registerAllDrivers(engine.registry)

const rows = []

async function runProvider(providerId, method, fn) {
  const t0 = Date.now()
  try {
    const out = await fn()
    const data = out
    const ok = data?.success && Array.isArray(data.data) && data.data.length > 0
    rows.push({
      provider: providerId,
      method,
      status: ok ? 'OK' : (data?.success ? 'EMPTY' : 'FAIL'),
      detail: ok
        ? `rows=${data.data.length} source=${data.source || '?'} ${Date.now() - t0}ms`
        : String(data?.error ?? 'no data').slice(0, 80),
    })
  } catch (e) {
    rows.push({
      provider: providerId,
      method,
      status: 'ERROR',
      detail: (e instanceof Error ? e.message : String(e)).slice(0, 80),
    })
  }
}

function driver(name) {
  return engine.registry.get(name)
}

function hasCap(driverInfo, cap) {
  return (driverInfo?.bindings ?? []).some(b => b.capability === cap)
}

console.log('=== Free provider gap fill (zzshare / baostock / tickflow) ===\n')
console.log('Enabled:', enabled, '\n')

const driverInfo = new Map(engine.registry.listDriverInfo().map(i => [i.name, i]))

const METHOD_CHECKS = [
  ['etfList', d => d.etfList('CN'), Capability.ETF_LIST],
  ['etfProfile', d => d.etfProfile(ETF), Capability.ETF_PROFILE],
  ['etfNav', d => d.etfNav(ETF), Capability.ETF_NAV],
  ['etfHoldings', d => d.etfHoldings(ETF), Capability.ETF_HOLDINGS],
  ['dividend', d => d.dividend(STOCK), Capability.DIVIDEND],
  ['financials', d => d.financials(STOCK), Capability.FINANCIAL_SUMMARY],
  ['perfForecast', d => d.perfForecast(STOCK), Capability.PERF_FORECAST],
  ['shareholders', d => d.shareholders(STOCK_LHB), Capability.SHAREHOLDER],
  ['news', d => d.news(STOCK_LHB, 1, 10), Capability.NEWS],
  ['mainBusiness', d => d.mainBusiness(STOCK), Capability.MAIN_BUSINESS],
  ['instHolding', d => d.instHolding(STOCK_LHB), Capability.INST_HOLDING],
  ['moneyFlow', d => d.moneyFlow(STOCK_LHB), Capability.STOCK_MONEY_FLOW],
  ['sectorMoneyFlow', d => d.sectorMoneyFlow('14'), Capability.SECTOR_MONEY_FLOW],
  ['marketMoneyFlow', d => d.marketMoneyFlow('market'), Capability.MARKET_MONEY_FLOW],
  ['macroIndicator', d => d.macroIndicator('cpi'), Capability.MACRO_INDICATOR],
  ['globalIndex', d => d.globalIndex('dji'), Capability.GLOBAL_INDEX],
]

for (const [id, on] of Object.entries(enabled)) {
  if (!on) {
    console.log(`SKIP ${id} (disabled)`)
    continue
  }
  const d = driver(id)
  if (!d) {
    console.log(`SKIP ${id} (not registered)`)
    continue
  }
  const info = driverInfo.get(id)

  for (const [method, fn, cap] of METHOD_CHECKS) {
    if (!hasCap(info, cap)) continue
    if (typeof d[method] !== 'function') continue
    await runProvider(id, method, async () => {
      const data = await fn(d)
      return { success: !!data?.length, data: data ?? [], source: id }
    })
  }
}

console.log('\n--- Capability bindings (free extensions) ---')
const watch = [
  Capability.ETF_HOLDINGS,
  Capability.NEWS,
  Capability.MAIN_BUSINESS,
  Capability.GLOBAL_INDEX,
  Capability.SHAREHOLDER,
]
for (const info of engine.registry.listDriverInfo()) {
  if (!enabled[info.name]) continue
  const caps = info.bindings.map(b => b.capability).filter(c => watch.includes(c))
  if (caps.length) console.log(`${info.name}: ${caps.join(', ')}`)
}

console.log('\n--- Results ---')
for (const r of rows) {
  console.log(`${r.status.padEnd(6)} ${r.provider.padEnd(10)} ${r.method.padEnd(18)} ${r.detail}`)
}

const failed = rows.filter(r => r.status === 'FAIL' || r.status === 'ERROR')
const empty = rows.filter(r => r.status === 'EMPTY')
console.log(`\nSummary: OK=${rows.filter(r => r.status === 'OK').length} EMPTY=${empty.length} FAIL=${failed.length}`)
process.exit(failed.filter(r => r.status === 'ERROR').length ? 1 : 0)
