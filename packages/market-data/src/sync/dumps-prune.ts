/**
 * market dumps 目录 GC：半成品 `.tmp`/`.download`/`.part` + 可选 TTL/容量硬顶。
 * 仅扫 `marketDataDir()/dumps`，不触碰 package-exports；与 user-data-temp-prune 并存（后者扫整棵用户根）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { isIncompleteTempName } from '@opptrix/shared'
import { marketDataDir } from '../paths.js'

/** 半成品默认超过 1h 可删 */
export const DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS = 60 * 60 * 1000

/** 完整 parquet 默认保留 14 天（可 env 关） */
export const DEFAULT_DUMPS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

/** dumps 目录容量硬顶 1 GiB（可 env 关） */
export const DEFAULT_DUMPS_MAX_BYTES = 1024 * 1024 * 1024

const MAX_AGE_ENV = 'OPPTRIX_DUMPS_MAX_AGE_MS'
const MAX_BYTES_ENV = 'OPPTRIX_DUMPS_MAX_BYTES'
const INCOMPLETE_MAX_AGE_ENV = 'OPPTRIX_DUMPS_INCOMPLETE_MAX_AGE_MS'

export type PruneMarketDumpsOptions = {
  dumpsDir?: string
  /** 完整文件 TTL；`0` 关闭 */
  maxAgeMs?: number
  /** 容量硬顶；`0` 关闭 */
  maxBytes?: number
  /** 半成品 TTL；`0` 关闭（仍可被容量顶删） */
  incompleteMaxAgeMs?: number
  nowMs?: number
  env?: NodeJS.ProcessEnv
}

export type PruneMarketDumpsResult = {
  removedFiles: number
  freedBytes: number
  remainingFiles: number
  remainingBytes: number
  removedIncomplete: number
}

type DumpFile = {
  path: string
  name: string
  mtimeMs: number
  size: number
  incomplete: boolean
}

function asNonNegInt(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw)
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return null
}

export function resolveMarketDumpsDir(root = marketDataDir()): string {
  return path.join(root, 'dumps')
}

/** 完整文件 TTL；`0` 关闭。opts 优先于 env。 */
export function resolveDumpsMaxAgeMs(
  opts?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (opts !== undefined) {
    return opts >= 0 && Number.isFinite(opts) ? Math.floor(opts) : DEFAULT_DUMPS_MAX_AGE_MS
  }
  const fromEnv = asNonNegInt(env[MAX_AGE_ENV])
  if (fromEnv != null) return fromEnv
  return DEFAULT_DUMPS_MAX_AGE_MS
}

/** 容量硬顶；`0` 关闭。opts 优先于 env。 */
export function resolveDumpsMaxBytes(
  opts?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (opts !== undefined) {
    return opts >= 0 && Number.isFinite(opts) ? Math.floor(opts) : DEFAULT_DUMPS_MAX_BYTES
  }
  const fromEnv = asNonNegInt(env[MAX_BYTES_ENV])
  if (fromEnv != null) return fromEnv
  return DEFAULT_DUMPS_MAX_BYTES
}

/** 半成品 TTL；`0` 关闭。opts 优先于 env。 */
export function resolveDumpsIncompleteMaxAgeMs(
  opts?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (opts !== undefined) {
    return opts >= 0 && Number.isFinite(opts)
      ? Math.floor(opts)
      : DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS
  }
  const fromEnv = asNonNegInt(env[INCOMPLETE_MAX_AGE_ENV])
  if (fromEnv != null) return fromEnv
  return DEFAULT_DUMPS_INCOMPLETE_MAX_AGE_MS
}

function listDumpFiles(dir: string): DumpFile[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err
      ? (err as { code?: string }).code
      : undefined
    if (code === 'ENOENT') return []
    return []
  }

  const out: DumpFile[] = []
  for (const name of names) {
    if (!name || name === '.' || name === '..') continue
    if (name.startsWith('.')) continue
    const full = path.join(dir, name)
    try {
      const st = fs.statSync(full)
      if (!st.isFile()) continue
      out.push({
        path: full,
        name,
        mtimeMs: st.mtimeMs,
        size: st.size,
        incomplete: isIncompleteTempName(name),
      })
    } catch {
      /* skip */
    }
  }
  return out
}

function unlinkQuiet(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * 清理 dumps：先删过期半成品，再按 TTL 删过期完整包，最后按容量从旧到新删。
 * maxAgeMs / maxBytes / incompleteMaxAgeMs 为 `0` 时关闭对应维度。
 */
export function pruneMarketDumps(
  opts: PruneMarketDumpsOptions = {},
): PruneMarketDumpsResult {
  const env = opts.env ?? process.env
  const dumpsDir = opts.dumpsDir ?? resolveMarketDumpsDir()
  const maxAgeMs = resolveDumpsMaxAgeMs(opts.maxAgeMs, env)
  const maxBytes = resolveDumpsMaxBytes(opts.maxBytes, env)
  const incompleteMaxAgeMs = resolveDumpsIncompleteMaxAgeMs(opts.incompleteMaxAgeMs, env)
  const now = opts.nowMs ?? Date.now()

  let files = listDumpFiles(dumpsDir)
  let removedFiles = 0
  let freedBytes = 0
  let removedIncomplete = 0

  const keep: DumpFile[] = []
  for (const f of files) {
    if (f.incomplete) {
      if (incompleteMaxAgeMs > 0 && now - f.mtimeMs > incompleteMaxAgeMs) {
        if (unlinkQuiet(f.path)) {
          removedFiles += 1
          removedIncomplete += 1
          freedBytes += f.size
          continue
        }
      }
      keep.push(f)
      continue
    }
    if (maxAgeMs > 0 && now - f.mtimeMs > maxAgeMs) {
      if (unlinkQuiet(f.path)) {
        removedFiles += 1
        freedBytes += f.size
        continue
      }
    }
    keep.push(f)
  }
  files = keep

  // 半成品优先于完整文件从容量顶挤出（更旧优先）
  let totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  if (maxBytes > 0 && totalBytes > maxBytes) {
    files.sort((a, b) => {
      if (a.incomplete !== b.incomplete) return a.incomplete ? -1 : 1
      return a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path)
    })
    for (const f of files) {
      if (totalBytes <= maxBytes) break
      if (unlinkQuiet(f.path)) {
        removedFiles += 1
        if (f.incomplete) removedIncomplete += 1
        freedBytes += f.size
        totalBytes -= f.size
      }
    }
  }

  const remaining = listDumpFiles(dumpsDir)
  return {
    removedFiles,
    freedBytes,
    remainingFiles: remaining.length,
    remainingBytes: remaining.reduce((sum, f) => sum + f.size, 0),
    removedIncomplete,
  }
}
