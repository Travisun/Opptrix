/**
 * Grant 内 glob 匹配 — 防逃逸；跳过常见噪音目录。
 */
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { WorkspaceError } from './errors.js'

export const DEFAULT_GLOB_MAX_RESULTS = 200
export const MAX_GLOB_MAX_RESULTS = 500

const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  'dist',
  'build',
  '.next',
  'coverage',
])

export type WorkspaceGlobResult = {
  files: string[]
  count: number
  truncated?: boolean
}

function isUnderRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

async function realpathSafe(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return path.resolve(p)
    throw err
  }
}

function toPosixRel(rootAbs: string, abs: string): string {
  const rel = path.relative(rootAbs, abs)
  if (!rel || rel === '.') return ''
  return rel.split(path.sep).join('/')
}

/**
 * 将 glob（posix `/`）转为匹配相对路径的 RegExp。
 * 支持 `**`、`*`、`?`；不支持 `{a,b}` 花括号展开。
 */
export function globPatternToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!normalized) {
    throw new WorkspaceError('glob_pattern 不能为空')
  }
  let out = '^'
  let i = 0
  while (i < normalized.length) {
    const c = normalized[i]!
    if (c === '*' && normalized[i + 1] === '*') {
      if (normalized[i + 2] === '/') {
        out += '(?:.*/)?'
        i += 3
      } else {
        out += '.*'
        i += 2
      }
      continue
    }
    if (c === '*') {
      out += '[^/]*'
      i += 1
      continue
    }
    if (c === '?') {
      out += '[^/]'
      i += 1
      continue
    }
    if ('+.^${}()|[]\\'.includes(c)) {
      out += `\\${c}`
      i += 1
      continue
    }
    out += c
    i += 1
  }
  out += '$'
  return new RegExp(out)
}

export function clampGlobMaxResults(raw: number | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.trunc(raw)
    : DEFAULT_GLOB_MAX_RESULTS
  return Math.max(1, Math.min(n, MAX_GLOB_MAX_RESULTS))
}

function fileMatchesGlob(relPosix: string, basename: string, pattern: string, re: RegExp): boolean {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\/+/, '')
  const basenameOnly = !normalized.includes('/') && !normalized.includes('**')
  if (basenameOnly) return re.test(basename)
  return re.test(relPosix)
}

/**
 * 在 rootAbs 下从 startAbs 递归匹配 glob；返回相对 root 的 posix 路径。
 * startAbs 须已落在 rootAbs 内（由调用方 gate）。
 */
export async function globWithinRoot(
  rootAbs: string,
  startAbs: string,
  globPattern: string,
  maxResults: number,
): Promise<WorkspaceGlobResult> {
  const rootReal = await realpathSafe(rootAbs)
  const startReal = await realpathSafe(startAbs)
  if (!isUnderRoot(startReal, rootReal)) {
    throw new WorkspaceError('路径超出授权范围')
  }
  const re = globPatternToRegExp(globPattern)
  const files: string[] = []
  let truncated = false

  const tryPush = (abs: string): boolean => {
    const rel = toPosixRel(rootReal, abs)
    if (!rel) return false
    if (!fileMatchesGlob(rel, path.basename(abs), globPattern, re)) return false
    files.push(rel)
    if (files.length >= maxResults) {
      truncated = true
      return true
    }
    return false
  }

  async function walk(dirAbs: string): Promise<void> {
    if (truncated) return
    if (!isUnderRoot(dirAbs, rootReal)) return
    let entries: fsSync.Dirent[]
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true })
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') return
      throw err
    }
    for (const ent of entries) {
      if (truncated) return
      if (ent.name === '.' || ent.name === '..') continue
      const child = path.join(dirAbs, ent.name)
      if (!isUnderRoot(child, rootReal)) continue

      let isDir = ent.isDirectory()
      let isFile = ent.isFile()
      if (ent.isSymbolicLink()) {
        try {
          const st = await fs.stat(child)
          isDir = st.isDirectory()
          isFile = st.isFile()
          const real = await fs.realpath(child)
          if (!isUnderRoot(real, rootReal)) continue
        } catch {
          continue
        }
      }
      if (isDir) {
        if (SKIP_DIR_NAMES.has(ent.name)) continue
        await walk(child)
        continue
      }
      if (isFile && tryPush(child)) return
    }
  }

  let startStat: fsSync.Stats
  try {
    startStat = await fs.stat(startReal)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    if (code === 'ENOENT') return { files: [], count: 0 }
    throw err
  }

  if (startStat.isFile()) {
    tryPush(startReal)
    return { files, count: files.length, ...(truncated ? { truncated: true } : {}) }
  }

  await walk(startReal)
  return { files, count: files.length, ...(truncated ? { truncated: true } : {}) }
}
