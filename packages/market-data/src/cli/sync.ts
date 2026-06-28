#!/usr/bin/env node
import { getMarketDataService } from '../index.js'

const argMode = process.argv[2]
const mode = argMode === 'incremental' || argMode === 'resume' ? argMode : 'full'
const maxArg = process.argv.find(a => a.startsWith('--max='))
const maxStocks = maxArg ? Number(maxArg.split('=')[1]) : undefined
const force = process.argv.includes('--force')
const jobsArg = process.argv.find(a => a.startsWith('--jobs='))
const jobs = jobsArg ? jobsArg.split('=')[1]?.split(',').filter(Boolean) : undefined

const svc = getMarketDataService()
console.log(`[market-data] sync start mode=${mode} db=${svc.status().db_path}`)

svc.sync({
  mode,
  maxStocks,
  jobs,
  force,
  onProgress: p => {
    if (p.current === p.total || p.current % 50 === 0) {
      console.log(`  ${p.job}: ${p.current}/${p.total}`)
    }
  },
}).then(result => {
  console.log('[market-data] done', result)
  console.log('[market-data] status', svc.status())
}).catch(e => {
  console.error('[market-data] failed', e)
  process.exit(1)
})
