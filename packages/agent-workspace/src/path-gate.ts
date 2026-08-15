import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { DenyPathError, PathEscapeError } from './errors.js'
import { isPathDenied } from './deny.js'

function isUnderRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** 拒绝绝对路径 / ~ / file:// 时的可执行提示（给 Agent 改参重试） */
export const RELATIVE_PATH_CONTRACT_HINT =
  'path/cwd 必须相对当前 root_id（例 packages/foo/x.py）。禁止 /Users、C:\\\\、~、file:// 与 abs_path；改相对路径后用同一 root_id 重试，勿换 root 反复 list'

function looksLikeForbiddenAbsOrUri(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (path.isAbsolute(s)) return true
  if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('//')) return true
  if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) return true
  if (/^file:/i.test(s)) return true
  return false
}

function sanitizeRelativePath(relativePath: string): string {
  const raw = String(relativePath ?? '')
  if (looksLikeForbiddenAbsOrUri(raw)) {
    throw new PathEscapeError(`不允许使用绝对路径。${RELATIVE_PATH_CONTRACT_HINT}`)
  }
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized === '.') return ''
  // 再检一次 slash-normalize 后的形态（如误传 //Users/... 被剥前导斜杠前已拦）
  if (looksLikeForbiddenAbsOrUri(normalized) || normalized.startsWith('/')) {
    throw new PathEscapeError(`不允许使用绝对路径。${RELATIVE_PATH_CONTRACT_HINT}`)
  }
  const segments = normalized.split('/')
  for (const seg of segments) {
    if (seg === '..') throw new PathEscapeError('不允许使用 .. 穿越目录')
    if (seg === '~') {
      throw new PathEscapeError(`不允许使用绝对路径。${RELATIVE_PATH_CONTRACT_HINT}`)
    }
  }
  return segments.filter(Boolean).join(path.sep)
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

/**
 * 在授权根目录内安全解析相对路径；防 .. / symlink 逃逸 / Deny 命中。
 */
export async function resolveSafePath(
  rootAbs: string,
  relativePath: string,
  denyPaths?: readonly string[],
): Promise<string> {
  const rootReal = await realpathSafe(rootAbs)
  const clean = sanitizeRelativePath(relativePath)
  let current = rootReal

  if (clean) {
    for (const seg of clean.split(path.sep)) {
      current = path.join(current, seg)
      let st: fsSync.Stats
      try {
        st = await fs.lstat(current)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') break
        throw err
      }
      if (st.isSymbolicLink()) {
        const linkReal = await fs.realpath(current)
        if (!isUnderRoot(linkReal, rootReal)) {
          throw new PathEscapeError('符号链接指向授权目录外')
        }
        current = linkReal
      }
    }
  }

  const resolved = await realpathSafe(current)
  if (!isUnderRoot(resolved, rootReal)) {
    throw new PathEscapeError('路径超出授权范围')
  }
  if (isPathDenied(resolved, denyPaths)) {
    throw new DenyPathError()
  }
  return resolved
}

export async function ensureDirectory(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}
