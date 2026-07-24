import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { DenyPathError, PathEscapeError } from './errors.js'
import { isPathDenied } from './deny.js'

function isUnderRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function sanitizeRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized === '.') return ''
  if (path.isAbsolute(relativePath)) {
    throw new PathEscapeError('不允许使用绝对路径')
  }
  const segments = normalized.split('/')
  for (const seg of segments) {
    if (seg === '..') throw new PathEscapeError('不允许使用 .. 穿越目录')
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
