import fs from 'node:fs'
import path from 'node:path'
import { resolveAgentPrivilegesRoot, resolveAgentWorkspaceRoot } from './paths.js'
import { resolveUserDataRoot } from '@opptrix/shared'

/** 构建全局 Deny 路径列表（realpath 后比较） */
export function buildGlobalDenyPaths(): string[] {
  const userData = resolveUserDataRoot()
  const sensitiveUnderUserData = [
    'agent-privileges',
    'opptrix.db',
    'opptrix.db-wal',
    'opptrix.db-shm',
    'providers',
    'sessions',
    'session-state',
    'tushare-config.json',
    'watchlist.json',
    'portfolio.json',
    'market-data',
    'browser-screenshots',
    'runtimes',
    'news-translation-cache.json',
    'auth.key',
    'vault.key',
  ]
  return [
    resolveAgentPrivilegesRoot(),
    ...sensitiveUnderUserData.map(name => path.join(userData, name)),
  ]
}

/**
 * 相对路径或 basename 是否命中敏感文件/目录名。
 * 即使落在 grant 内，path-gate 也应拒绝。
 */
export function isSensitiveRelPath(relOrBasename: string): boolean {
  const raw = String(relOrBasename ?? '').trim().replace(/\\/g, '/')
  if (!raw) return false
  const segments = raw.split('/').filter(Boolean)
  for (const seg of segments) {
    const lower = seg.toLowerCase()
    if (lower === '.env') return true
    if (lower.startsWith('.env.')) return true
    if (lower.endsWith('.pem') || lower.endsWith('.key')) return true
    if (lower === 'id_rsa' || lower === 'credentials.json') return true
    if (lower === '.aws' || lower === '.ssh') return true
  }
  return false
}

function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p)
  try {
    return fs.realpathSync.native(resolved)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      const parent = path.dirname(resolved)
      const base = path.basename(resolved)
      try {
        return path.join(fs.realpathSync.native(parent), base)
      } catch {
        return resolved
      }
    }
    return resolved
  }
}

/** Global Deny 优先于用户 grant */
export function isPathDenied(resolvedPath: string, denyPaths: readonly string[] = buildGlobalDenyPaths()): boolean {
  const target = normalizeForCompare(resolvedPath)
  for (const deny of denyPaths) {
    const d = normalizeForCompare(deny)
    if (target === d || target.startsWith(`${d}${path.sep}`)) {
      return true
    }
  }
  return false
}

/** agent-workspace 根本身不在 Deny（Workspace 平面） */
export function isWorkspaceRootPath(p: string): boolean {
  const ws = normalizeForCompare(resolveAgentWorkspaceRoot())
  const target = normalizeForCompare(p)
  return target === ws || target.startsWith(`${ws}${path.sep}`)
}
