import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import type { StockKline } from '@opptrix/shared'
import { klineDuckDbPath, marketDbPath } from '../paths.js'
import { normalizeStockCode } from '../utils.js'

const CLI_PATH = fileURLToPath(new URL('./duck-cli.js', import.meta.url))

export interface KlineDuckStats {
  rows: number
  codes: number
  maxDate: string | null
}

export interface SpawnKlineImportOptions {
  parquetPath: string
  mode: 'full' | 'incremental'
  duckDbPath?: string
  onProgress?: (message: string, percent: number) => void
}

function nodeExec(args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    maxBuffer,
    env: process.env,
  }).trim()
}

export function queryKlinesViaSubprocess(
  code: string,
  limit = 800,
  before?: string,
  duckDbPath = klineDuckDbPath(),
): StockKline[] {
  if (!fs.existsSync(duckDbPath)) return []
  const args = ['query-klines', '--duckdb', duckDbPath, '--code', normalizeStockCode(code), '--limit', String(limit)]
  if (before) args.push('--before', before.slice(0, 10))
  try {
    return JSON.parse(nodeExec(args)) as StockKline[]
  } catch {
    return []
  }
}

export function klineStatsViaSubprocess(duckDbPath = klineDuckDbPath()): KlineDuckStats {
  if (!fs.existsSync(duckDbPath)) return { rows: 0, codes: 0, maxDate: null }
  try {
    return JSON.parse(nodeExec(['stats', '--duckdb', duckDbPath])) as KlineDuckStats
  } catch {
    return { rows: 0, codes: 0, maxDate: null }
  }
}

export function migrateSqliteKlinesToDuckIfEmpty(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): number {
  if (!fs.existsSync(sqliteDbPath)) return 0
  try {
    const lines = nodeExec([
      'migrate-from-sqlite',
      '--duckdb', duckDbPath,
      '--sqlite', sqliteDbPath,
    ], 256 * 1024 * 1024).split('\n').filter(Boolean)
    const last = lines[lines.length - 1]
    if (!last) return 0
    const parsed = JSON.parse(last) as { rowsImported?: number; skipped?: boolean }
    return parsed.skipped ? 0 : (parsed.rowsImported ?? 0)
  } catch {
    return 0
  }
}

export async function spawnKlineParquetImport(opts: SpawnKlineImportOptions): Promise<{ rowsImported: number }> {
  const duckDbPath = opts.duckDbPath ?? klineDuckDbPath()
  const args = [
    'import',
    '--parquet', opts.parquetPath,
    '--mode', opts.mode,
    '--duckdb', duckDbPath,
  ]

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stderr = ''
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.stdout?.on('data', chunk => {
      for (const line of String(chunk).split('\n')) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as { type: string; message?: string; percent?: number; rowsImported?: number; error?: string }
          if (msg.type === 'progress' && msg.message != null && msg.percent != null) {
            opts.onProgress?.(msg.message, msg.percent)
          } else if (msg.type === 'done') {
            finish(() => resolve({ rowsImported: msg.rowsImported ?? 0 }))
          } else if (msg.type === 'error') {
            finish(() => reject(new Error(msg.message ?? 'DuckDB 导入失败')))
          }
        } catch {
          /* ignore non-json */
        }
      }
    })

    child.on('error', err => finish(() => reject(err)))
    child.on('exit', code => {
      if (code !== 0) {
        finish(() => reject(new Error(stderr.trim() || `DuckDB 导入子进程退出码 ${code}`)))
      }
    })
  })
}
