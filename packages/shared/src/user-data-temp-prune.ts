/**
 * 用户数据根下半成品临时文件清扫：过期 `*.download` / `*.part` / 常见 `.tmp`。
 * boot / retention best-effort；限深度与删除数，避免卡死。
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from './paths.js'

/** 崩溃残留默认超过 1h 可删 */
export const DEFAULT_INCOMPLETE_TEMP_MAX_AGE_MS = 60 * 60 * 1000

/** 单轮最多 unlink */
export const DEFAULT_INCOMPLETE_TEMP_MAX_REMOVE = 200

/** 相对用户数据根最大扫描深度（含根下第一层） */
export const DEFAULT_INCOMPLETE_TEMP_MAX_DEPTH = 6

export type PruneIncompleteUserDataTempsOptions = {
  root?: string
  maxAgeMs?: number
  maxRemove?: number
  maxDepth?: number
  nowMs?: number
}

export type PruneIncompleteUserDataTempsResult = {
  removedFiles: number
  skippedFresh: number
  scanned: number
}

function unlinkQuiet(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

/** 仅认明确半成品后缀 / 前缀，避免误删业务 `.tmp` 数据文件名变体时仍保守 */
export function isIncompleteTempName(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.endsWith('.download')) return true
  if (lower.endsWith('.part')) return true
  if (lower.endsWith('.tmp')) return true
  if (lower.startsWith('.tmp-') || lower.startsWith('.tmp.')) return true
  return false
}

/**
 * 递归扫用户数据根：mtime 过期的半成品 unlink。
 * 跳过符号链接目录；单文件失败 swallow。
 */
export function pruneIncompleteUserDataTemps(
  opts: PruneIncompleteUserDataTempsOptions = {},
): PruneIncompleteUserDataTempsResult {
  const root = path.resolve(opts.root ?? resolveUserDataRoot())
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_INCOMPLETE_TEMP_MAX_AGE_MS
  const maxRemove = Math.max(1, opts.maxRemove ?? DEFAULT_INCOMPLETE_TEMP_MAX_REMOVE)
  const maxDepth = Math.max(1, opts.maxDepth ?? DEFAULT_INCOMPLETE_TEMP_MAX_DEPTH)
  const now = opts.nowMs ?? Date.now()

  let removedFiles = 0
  let skippedFresh = 0
  let scanned = 0
  let budget = maxRemove

  const walk = (dir: string, depth: number): void => {
    if (budget <= 0 || depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      if (budget <= 0) return
      const name = ent.name
      if (!name || name === '.' || name === '..') continue
      if (name.includes('\0')) continue
      const full = path.join(dir, name)
      try {
        if (ent.isSymbolicLink()) continue
        if (ent.isDirectory()) {
          walk(full, depth + 1)
          continue
        }
        if (!ent.isFile()) continue
        if (!isIncompleteTempName(name)) continue
        scanned += 1
        const st = fs.statSync(full)
        if (maxAgeMs > 0 && now - st.mtimeMs <= maxAgeMs) {
          skippedFresh += 1
          continue
        }
        if (unlinkQuiet(full)) {
          removedFiles += 1
          budget -= 1
        }
      } catch {
        /* raced / unreadable */
      }
    }
  }

  if (fs.existsSync(root)) {
    walk(root, 1)
  }

  return { removedFiles, skippedFresh, scanned }
}
