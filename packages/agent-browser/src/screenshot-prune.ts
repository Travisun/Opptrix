/**
 * browser-screenshots 产品级 GC：TTL + 容量硬顶，按 mtime 从旧到新删。
 * 会话 / browser close 不强制删（保留证据）；失败由调用方 swallow。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

/** 默认保留 7 天 */
export const DEFAULT_BROWSER_SCREENSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** 默认容量硬顶 512 MiB（落在 500MB–1GB） */
export const DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES = 512 * 1024 * 1024

const MAX_AGE_ENV = 'OPPTRIX_BROWSER_SCREENSHOT_MAX_AGE_MS'
const MAX_BYTES_ENV = 'OPPTRIX_BROWSER_SCREENSHOT_MAX_BYTES'

export type PruneBrowserScreenshotsOptions = {
  screenshotDir?: string
  maxAgeMs?: number
  maxBytes?: number
  /** 可注入时钟（测试） */
  nowMs?: number
  env?: NodeJS.ProcessEnv
}

export type PruneBrowserScreenshotsResult = {
  removedFiles: number
  freedBytes: number
  remainingFiles: number
  remainingBytes: number
}

type ScreenshotFile = {
  path: string
  mtimeMs: number
  size: number
}

export function resolveScreenshotDir(root = resolveUserDataRoot()): string {
  const dir = path.join(root, 'browser-screenshots')
  fs.mkdirSync(dir, { recursive: true })
  return dir
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

/** 解析 TTL；`0` 关闭该维度。opts 优先于 env。 */
export function resolveBrowserScreenshotMaxAgeMs(
  opts?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (opts !== undefined) return opts >= 0 && Number.isFinite(opts) ? Math.floor(opts) : DEFAULT_BROWSER_SCREENSHOT_MAX_AGE_MS
  const fromEnv = asNonNegInt(env[MAX_AGE_ENV])
  if (fromEnv != null) return fromEnv
  return DEFAULT_BROWSER_SCREENSHOT_MAX_AGE_MS
}

/** 解析容量硬顶；`0` 关闭该维度。opts 优先于 env。 */
export function resolveBrowserScreenshotMaxBytes(
  opts?: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  if (opts !== undefined) return opts >= 0 && Number.isFinite(opts) ? Math.floor(opts) : DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES
  const fromEnv = asNonNegInt(env[MAX_BYTES_ENV])
  if (fromEnv != null) return fromEnv
  return DEFAULT_BROWSER_SCREENSHOT_MAX_BYTES
}

async function listScreenshotFiles(dir: string): Promise<ScreenshotFile[]> {
  let names: string[]
  try {
    names = await fs.promises.readdir(dir)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    if (code === 'ENOENT') return []
    throw err
  }

  const out: ScreenshotFile[] = []
  for (const name of names) {
    if (name.startsWith('.')) continue
    const full = path.join(dir, name)
    try {
      const st = await fs.promises.stat(full)
      if (!st.isFile()) continue
      out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size })
    } catch {
      /* skip unreadable */
    }
  }
  return out
}

/**
 * 清理 browser-screenshots：先按 TTL 删过期，再按容量从旧到新删直到 ≤ 上限。
 * maxAgeMs / maxBytes 为 `0` 时关闭对应维度。
 */
export async function pruneBrowserScreenshots(
  opts: PruneBrowserScreenshotsOptions = {},
): Promise<PruneBrowserScreenshotsResult> {
  const env = opts.env ?? process.env
  const screenshotDir = opts.screenshotDir ?? resolveScreenshotDir()
  const maxAgeMs = resolveBrowserScreenshotMaxAgeMs(opts.maxAgeMs, env)
  const maxBytes = resolveBrowserScreenshotMaxBytes(opts.maxBytes, env)
  const now = opts.nowMs ?? Date.now()

  let files = await listScreenshotFiles(screenshotDir)
  let removedFiles = 0
  let freedBytes = 0

  const keep: ScreenshotFile[] = []
  for (const f of files) {
    if (maxAgeMs > 0 && now - f.mtimeMs > maxAgeMs) {
      try {
        await fs.promises.unlink(f.path)
        removedFiles += 1
        freedBytes += f.size
      } catch {
        keep.push(f)
      }
    } else {
      keep.push(f)
    }
  }
  files = keep

  let totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  if (maxBytes > 0 && totalBytes > maxBytes) {
    files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path))
    for (const f of files) {
      if (totalBytes <= maxBytes) break
      try {
        await fs.promises.unlink(f.path)
        removedFiles += 1
        freedBytes += f.size
        totalBytes -= f.size
      } catch {
        /* keep counting as remaining */
      }
    }
  }

  const remaining = await listScreenshotFiles(screenshotDir)
  return {
    removedFiles,
    freedBytes,
    remainingFiles: remaining.length,
    remainingBytes: remaining.reduce((sum, f) => sum + f.size, 0),
  }
}
