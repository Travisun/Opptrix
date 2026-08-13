/**
 * Gateway → duck-cli 批写临时 JSON：os.tmpdir + 紧凑 stringify + 用完立即 unlink。
 * 避免 pretty JSON 残留与 Date.now 碎片文件放大。
 * 崩溃残留由 `pruneOrphanDuckTempJson`（boot / retention）按 mtime TTL 清扫，与 finally unlink 并存。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export type DuckTempJsonKind = 'batch' | 'kline-upsert' | 'query' | 'kline-batch'

const KIND_PREFIX: Record<DuckTempJsonKind, string> = {
  batch: 'opptrix-duck-batch-',
  'kline-upsert': 'opptrix-kline-upsert-',
  query: 'opptrix-duck-query-',
  'kline-batch': 'opptrix-kline-batch-',
}

/** 本进程 Duck 批写临时文件名前缀（测试清理断言用） */
export const OPPTRIX_DUCK_TEMP_PREFIXES = Object.values(KIND_PREFIX)

/** 崩溃/异常退出残留：默认超过 1h 的 mtime 视为孤儿可删 */
export const DEFAULT_DUCK_TEMP_MAX_AGE_MS = 60 * 60 * 1000

export type PruneOrphanDuckTempJsonOptions = {
  dir?: string
  maxAgeMs?: number
  /** 可注入时钟（测试） */
  nowMs?: number
}

export type PruneOrphanDuckTempJsonResult = {
  removedFiles: number
  skippedFresh: number
  scanned: number
}

function allocTempPath(kind: DuckTempJsonKind): string {
  const token = randomBytes(6).toString('hex')
  return path.join(os.tmpdir(), `${KIND_PREFIX[kind]}${process.pid}-${token}.json`)
}

function unlinkQuiet(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    /* ignore */
  }
}

/** 列出 tmpdir 中仍存在的 Opptrix Duck 临时 JSON（测试用） */
export function listOpptrixDuckTempJson(dir = os.tmpdir()): string[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter(name => OPPTRIX_DUCK_TEMP_PREFIXES.some(p => name.startsWith(p)) && name.endsWith('.json'))
    .map(name => path.join(dir, name))
}

/**
 * 扫 `OPPTRIX_DUCK_TEMP_PREFIXES`（含 opptrix-duck-* / opptrix-kline-*）下过期临时 JSON 并 unlink。
 * 不替代 withCompactTempJson* 的 finally unlink；仅清崩溃残留，跳过仍在 TTL 内的文件以免误伤热路径。
 */
export function pruneOrphanDuckTempJson(
  opts: PruneOrphanDuckTempJsonOptions = {},
): PruneOrphanDuckTempJsonResult {
  const dir = opts.dir ?? os.tmpdir()
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_DUCK_TEMP_MAX_AGE_MS
  const now = opts.nowMs ?? Date.now()
  const files = listOpptrixDuckTempJson(dir)
  let removedFiles = 0
  let skippedFresh = 0

  for (const filePath of files) {
    try {
      const st = fs.statSync(filePath)
      if (!st.isFile()) continue
      if (maxAgeMs > 0 && now - st.mtimeMs <= maxAgeMs) {
        skippedFresh += 1
        continue
      }
      unlinkQuiet(filePath)
      removedFiles += 1
    } catch {
      /* skip unreadable / raced */
    }
  }

  return { removedFiles, skippedFresh, scanned: files.length }
}

/**
 * 写入紧凑 JSON 临时文件，执行 fn 后立即 unlink（同步）。
 * Gateway 单写者语义不变：仅承载跨进程 payload。
 */
export function withCompactTempJsonSync<T>(
  kind: DuckTempJsonKind,
  data: unknown,
  fn: (filePath: string) => T,
): T {
  const tmp = allocTempPath(kind)
  fs.writeFileSync(tmp, JSON.stringify(data))
  try {
    return fn(tmp)
  } finally {
    unlinkQuiet(tmp)
  }
}

/** 同上（async） */
export async function withCompactTempJsonAsync<T>(
  kind: DuckTempJsonKind,
  data: unknown,
  fn: (filePath: string) => Promise<T>,
): Promise<T> {
  const tmp = allocTempPath(kind)
  fs.writeFileSync(tmp, JSON.stringify(data))
  try {
    return await fn(tmp)
  } finally {
    unlinkQuiet(tmp)
  }
}

/**
 * 同进程批写复用的单一 scratch 文件：覆盖写 + 整批结束后 unlink。
 * @returns scratch 路径；调用方必须在 finally 中调用 `releaseScratchTempJson`
 */
export function allocScratchTempJson(kind: DuckTempJsonKind = 'kline-batch'): string {
  return allocTempPath(kind)
}

export function writeCompactTempJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data))
}

export function releaseScratchTempJson(filePath: string): void {
  unlinkQuiet(filePath)
}
