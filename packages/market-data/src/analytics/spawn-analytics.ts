import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { klineDuckDbPath, marketDbPath } from '../paths.js'
import type { LocalUniverseScreenQuery } from '../query/screen.js'

const CLI_PATH = fileURLToPath(new URL('../kline/duck-cli.js', import.meta.url))

export type AnalyticsSyncScope = 'dims' | 'quotes' | 'factors' | 'scores' | 'financials' | 'all'

function nodeExec(args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    maxBuffer,
    env: process.env,
  }).trim()
}

function duckReady(duckDbPath = klineDuckDbPath()): boolean {
  return fs.existsSync(duckDbPath)
}

export function syncAnalyticsViaSubprocess(
  scope: AnalyticsSyncScope = 'all',
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): Record<string, number> {
  if (!fs.existsSync(sqliteDbPath)) return {}
  try {
    return JSON.parse(nodeExec([
      'sync-analytics', '--duckdb', duckDbPath, '--sqlite', sqliteDbPath, '--scope', scope,
    ])) as Record<string, number>
  } catch {
    return {}
  }
}

export function computeScreenFactorsViaSubprocess(
  tradeDate: string,
  codes?: string[],
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): { computed: number; written: number } {
  if (!duckReady(duckDbPath)) return { computed: 0, written: 0 }
  const args = [
    'compute-factors', '--duckdb', duckDbPath, '--sqlite', sqliteDbPath, '--date', tradeDate,
  ]
  if (codes?.length) {
    const tmp = path.join(os.tmpdir(), `opptrix-factor-codes-${process.pid}.json`)
    fs.writeFileSync(tmp, JSON.stringify(codes))
    args.push('--file', tmp)
    try {
      return JSON.parse(nodeExec(args)) as { computed: number; written: number }
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    }
  }
  try {
    return JSON.parse(nodeExec(args)) as { computed: number; written: number }
  } catch {
    return { computed: 0, written: 0 }
  }
}

export function analyticsStatsViaSubprocess(duckDbPath = klineDuckDbPath()): {
  stocks: number
  instruments: number
  taxonomy: number
  quotes: number
  factors: number
  klines: number
} {
  if (!duckReady(duckDbPath)) {
    return { stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0 }
  }
  try {
    return JSON.parse(nodeExec(['analytics-stats', '--duckdb', duckDbPath])) as ReturnType<typeof analyticsStatsViaSubprocess>
  } catch {
    return { stocks: 0, instruments: 0, taxonomy: 0, quotes: 0, factors: 0, klines: 0 }
  }
}

export function hasAnalyticsDimsViaSubprocess(duckDbPath = klineDuckDbPath()): boolean {
  const stats = analyticsStatsViaSubprocess(duckDbPath)
  return stats.stocks > 0
}

export function queryIndustryStatsViaSubprocess(
  tradeDate: string,
  duckDbPath = klineDuckDbPath(),
) {
  if (!hasAnalyticsDimsViaSubprocess(duckDbPath)) return null
  try {
    return JSON.parse(nodeExec([
      'query-industry-stats', '--duckdb', duckDbPath, '--date', tradeDate,
    ]))
  } catch {
    return null
  }
}

export function queryIndustryStocksViaSubprocess(
  industry: string,
  tradeDate: string,
  limit: number,
  duckDbPath = klineDuckDbPath(),
) {
  if (!hasAnalyticsDimsViaSubprocess(duckDbPath)) return null
  try {
    return JSON.parse(nodeExec([
      'query-industry-stocks', '--duckdb', duckDbPath,
      '--industry', industry, '--date', tradeDate, '--limit', String(limit),
    ]))
  } catch {
    return null
  }
}

export function queryUniverseScreenViaSubprocess(
  query: LocalUniverseScreenQuery,
  tradeDate: string,
  duckDbPath = klineDuckDbPath(),
) {
  if (!hasAnalyticsDimsViaSubprocess(duckDbPath)) return null
  const tmp = path.join(os.tmpdir(), `opptrix-screen-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(tmp, JSON.stringify({ ...query, trade_date: tradeDate }))
  try {
    return JSON.parse(nodeExec([
      'screen-universe', '--duckdb', duckDbPath, '--file', tmp,
    ], 128 * 1024 * 1024))
  } catch {
    return null
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
}
