#!/usr/bin/env node
/** Quick probe: TDX intraday for SH / SZ / BJ vs EastMoney fallback path. */
import { AshareEngine } from '../dist/engine.js'
import { tdxClient } from '../dist/tdx/client.js'

const cases = [
  { code: '600519', label: '沪A 茅台' },
  { code: '000001', market: 'SZ', label: '深A 平安银行' },
  { code: '920002', market: 'BJ', label: '北交所 920002' },
  { code: '430047', market: 'BJ', label: '北交所 430047' },
]

async function main() {
  const engine = new AshareEngine()
  console.log('=== TDX direct ===')
  for (const c of cases) {
    const tdx = await tdxClient.fetchIntradaySessions(c.code, 2)
    const n = tdx?.sessions.at(-1)?.bars.length ?? 0
    const date = tdx?.sessions.at(-1)?.sessionDate ?? '-'
    const sample = tdx?.sessions.at(-1)?.bars[0]?.price
    console.log(`${c.label} (${c.code}): ${n} bars @ ${date}, first=${sample ?? '-'}`)
  }

  console.log('\n=== Engine (TDX → EastMoney) ===')
  for (const c of cases) {
    const r = await engine.fetchIntradaySessions(c.code, 2, c.market)
    const data = r.success ? r.data : null
    const n = data?.sessions.at(-1)?.bars.length ?? 0
    const date = data?.sessions.at(-1)?.sessionDate ?? '-'
    console.log(`${c.label}: source=${r.success ? r.source : 'fail'} ${n} bars @ ${date}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
