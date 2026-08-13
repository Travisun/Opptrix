/**
 * Gateway → duck-cli 批写临时 JSON：os.tmpdir + 紧凑 stringify + 用完立即 unlink。
 * 避免 pretty JSON 残留与 Date.now 碎片文件放大。
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
