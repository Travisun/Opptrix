import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/** 同步进行中推迟 Duck 后台迁移，避免与 apply-batch 争用 DuckDB 文件锁 */
let marketSyncActive = false

export function setMarketSyncActive(active: boolean): void {
  marketSyncActive = active
}

export function isMarketSyncActive(): boolean {
  return marketSyncActive
}

/** @deprecated 本地衍生维护已拆除；恒为 false，保留供 store flush 门闩兼容 */
export function setDerivedMaintenanceActive(_active: boolean): void {
  /* no-op */
}

/** @deprecated 本地衍生维护已拆除；恒为 false */
export function isDerivedMaintenanceActive(): boolean {
  return false
}

/** 主进程是否应暂停 DuckDB 写入 */
export function isDuckWritePaused(): boolean {
  return marketSyncActive
}

export function isDuckFileLockHeld(duckDbPath: string): boolean {
  try {
    return fs.existsSync(lockFilePath(duckDbPath))
  } catch {
    return false
  }
}

function lockFilePath(duckDbPath: string): string {
  return `${duckDbPath}.oplock`
}

function sleepSync(ms: number): void {
  if (ms <= 0) return
  spawnSync('sleep', [String(Math.max(0.001, ms / 1000))], { stdio: 'ignore' })
}

/** 串行化同一 DuckDB 文件上的**写**子进程（import / apply-batch）。
 * 只读查询（query-json / stats / klines）**不持锁** — UI 允许略旧快照，避免与后台任务排队超时。 */
export function withDuckFileLockSync<T>(
  duckDbPath: string,
  fn: () => T,
  timeoutMs = 120_000,
): T {
  const lp = lockFilePath(duckDbPath)
  fs.mkdirSync(path.dirname(lp), { recursive: true })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lp, 'wx')
      try {
        return fn()
      } finally {
        try { fs.closeSync(fd) } catch { /* ignore */ }
        try { fs.unlinkSync(lp) } catch { /* ignore */ }
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw e
      sleepSync(50)
    }
  }
  throw new Error(`DuckDB 文件锁等待超时（${timeoutMs}ms）`)
}

export async function withDuckFileLockAsync<T>(
  duckDbPath: string,
  fn: () => Promise<T>,
  timeoutMs = 600_000,
): Promise<T> {
  const lp = lockFilePath(duckDbPath)
  fs.mkdirSync(path.dirname(lp), { recursive: true })
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lp, 'wx')
      try {
        return await fn()
      } finally {
        try { fs.closeSync(fd) } catch { /* ignore */ }
        try { fs.unlinkSync(lp) } catch { /* ignore */ }
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') throw e
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw new Error(`DuckDB 文件锁等待超时（${timeoutMs}ms）`)
}
