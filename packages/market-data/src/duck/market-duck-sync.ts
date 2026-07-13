import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { klineDuckDbPath, marketDbPath } from '../paths.js'
import type { DuckWriteOp } from './market-writes.js'

const CLI_PATH = fileURLToPath(new URL('../kline/duck-cli.js', import.meta.url))

function nodeExec(args: string[], maxBuffer = 128 * 1024 * 1024): string {
  return execFileSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    maxBuffer,
    env: process.env,
  }).trim()
}

export function migrateMarketDataViaSubprocess(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
  force = false,
): Record<string, number> {
  if (!fs.existsSync(sqliteDbPath)) return {}
  try {
    const args = ['migrate-market-data', '--duckdb', duckDbPath, '--sqlite', sqliteDbPath]
    if (force) args.push('--force')
    return JSON.parse(nodeExec(args, 512 * 1024 * 1024)) as Record<string, number>
  } catch {
    return {}
  }
}

export function applyDuckBatchSync(
  ops: DuckWriteOp[],
  duckDbPath = klineDuckDbPath(),
): number {
  if (!ops.length) return 0
  const tmp = path.join(os.tmpdir(), `opptrix-duck-batch-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(tmp, JSON.stringify(ops))
  try {
    const out = JSON.parse(nodeExec(['apply-batch', '--duckdb', duckDbPath, '--file', tmp])) as { applied?: number }
    return out.applied ?? 0
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
}

export function duckQueryAllSync<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  duckDbPath = klineDuckDbPath(),
): T[] {
  if (!fs.existsSync(duckDbPath)) return []
  const tmp = path.join(os.tmpdir(), `opptrix-duck-q-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(tmp, JSON.stringify({ sql, params }))
  try {
    return JSON.parse(nodeExec(['query-json', '--duckdb', duckDbPath, '--file', tmp])) as T[]
  } catch {
    return []
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
}

export function duckQueryOneSync<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  duckDbPath = klineDuckDbPath(),
): T | undefined {
  return duckQueryAllSync<T>(sql, params, duckDbPath)[0]
}

export function duckMarketStatsSync(duckDbPath = klineDuckDbPath()): {
  stocks: number
  instruments: number
  taxonomy: number
  quotes: number
  factors: number
  klines: number
  kline_codes: number
  kline_codes_min60: number
  profiles: number
  etf: number
  cn_equity: number
  hk_equity: number
  us_equity: number
  announcements: number
  dividends: number
  partners: number
  segments: number
  shareholders: number
  forecasts: number
  inst_holdings: number
  insider_trades: number
  buybacks: number
} {
  const empty = {
    stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0,
    kline_codes: 0, kline_codes_min60: 0, profiles: 0, etf: 0,
    cn_equity: 0, hk_equity: 0, us_equity: 0,
    announcements: 0, dividends: 0, partners: 0, segments: 0,
    shareholders: 0, forecasts: 0, inst_holdings: 0, insider_trades: 0, buybacks: 0,
  }
  if (!fs.existsSync(duckDbPath)) return empty
  try {
    return JSON.parse(nodeExec(['market-stats', '--duckdb', duckDbPath])) as ReturnType<typeof duckMarketStatsSync>
  } catch {
    return empty
  }
}

let duckDataCache: { at: number; path: string; has: boolean } | null = null

export function hasMarketDuckData(duckDbPath = klineDuckDbPath()): boolean {
  const now = Date.now()
  if (duckDataCache && duckDataCache.path === duckDbPath && now - duckDataCache.at < 15_000) {
    return duckDataCache.has
  }
  const stats = duckMarketStatsSync(duckDbPath)
  const has = stats.stocks > 0 || stats.instruments > 0 || stats.klines > 0
  duckDataCache = { at: now, path: duckDbPath, has }
  return has
}
