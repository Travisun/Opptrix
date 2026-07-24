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
    'tushare-config.json',
    'watchlist.json',
    'portfolio.json',
    'market-data',
    'browser-screenshots',
    'runtimes',
  ]
  return [
    resolveAgentPrivilegesRoot(),
    ...sensitiveUnderUserData.map(name => path.join(userData, name)),
  ]
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
