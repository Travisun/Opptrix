/**
 * agent-workspace/shared 软清理 — 仅触及 shared，永不碰 sessions/。
 * 先按 mtime TTL，再按容量从旧到新删；保护 README / 内置包模板。
 */
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { resolveSharedWorkspaceRoot } from './paths.js'
import { DEFAULT_WORKSPACE_QUOTA_BYTES } from './quota.js'

/** 默认保留 60 天（落在 30–90） */
export const DEFAULT_SHARED_WORKSPACE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

/** 默认 shared 软上限：工作区总配额的 40%（约 8GiB） */
export const DEFAULT_SHARED_WORKSPACE_MAX_BYTES = Math.floor(DEFAULT_WORKSPACE_QUOTA_BYTES * 0.4)

export type PruneSharedWorkspaceOptions = {
  sharedRoot?: string
  maxAgeMs?: number
  maxBytes?: number
  nowMs?: number
}

export type PruneSharedWorkspaceResult = {
  removedFiles: number
  freedBytes: number
  remainingFiles: number
  remainingBytes: number
}

type SharedFile = {
  path: string
  mtimeMs: number
  size: number
}

/** 相对 shared 根、永不删除的路径（POSIX 风格） */
const PROTECTED_RELATIVE = new Set([
  'README.md',
  'docs/package-readme-template.md',
])

const PROTECTED_PREFIXES = [
  'packages/cn-offline-daily-k/',
]

function toPosixRel(rel: string): string {
  return rel.split(path.sep).join('/')
}

export function isProtectedSharedRelative(relPosix: string): boolean {
  const normalized = relPosix.replace(/^\/+/, '')
  if (!normalized || normalized === '.') return true
  if (PROTECTED_RELATIVE.has(normalized)) return true
  for (const prefix of PROTECTED_PREFIXES) {
    if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) return true
  }
  return false
}

async function listSharedFiles(root: string): Promise<SharedFile[]> {
  const out: SharedFile[] = []

  async function walk(dir: string, relBase: string): Promise<void> {
    let entries: fsSync.Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      throw err
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full, rel)
        continue
      }
      if (!ent.isFile()) continue
      if (isProtectedSharedRelative(toPosixRel(rel))) continue
      try {
        const st = await fs.stat(full)
        out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size })
      } catch {
        /* skip unreadable */
      }
    }
  }

  await walk(root, '')
  return out
}

/**
 * 软清理 shared：TTL + 容量上限。不删除会话目录，不删受保护文件。
 */
export async function pruneSharedWorkspace(
  opts: PruneSharedWorkspaceOptions = {},
): Promise<PruneSharedWorkspaceResult> {
  const sharedRoot = opts.sharedRoot ?? resolveSharedWorkspaceRoot()
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_SHARED_WORKSPACE_MAX_AGE_MS
  const maxBytes = opts.maxBytes ?? DEFAULT_SHARED_WORKSPACE_MAX_BYTES
  const now = opts.nowMs ?? Date.now()

  let files = await listSharedFiles(sharedRoot)
  let removedFiles = 0
  let freedBytes = 0

  const keep: SharedFile[] = []
  for (const f of files) {
    if (maxAgeMs > 0 && now - f.mtimeMs > maxAgeMs) {
      try {
        await fs.unlink(f.path)
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
        await fs.unlink(f.path)
        removedFiles += 1
        freedBytes += f.size
        totalBytes -= f.size
      } catch {
        /* keep as remaining */
      }
    }
  }

  const remaining = await listSharedFiles(sharedRoot)
  return {
    removedFiles,
    freedBytes,
    remainingFiles: remaining.length,
    remainingBytes: remaining.reduce((sum, f) => sum + f.size, 0),
  }
}
