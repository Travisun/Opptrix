import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'
import { WorkspaceError } from './errors.js'
import { ensureDirectory } from './path-gate.js'

/** Agent 工作区容器根（quota / 清理统计） */
export function resolveAgentWorkspaceRoot(): string {
  return path.join(resolveUserDataRoot(), 'agent-workspace')
}

/** 权限/Sticky 平面（Deny — 文件工具不可访问） */
export function resolveAgentPrivilegesRoot(): string {
  return path.join(resolveUserDataRoot(), 'agent-privileges')
}

export const DEFAULT_ROOT_ID = 'default'

export const SESSIONS_SUBDIR = 'sessions'
export const SHARED_SUBDIR = 'shared'
export const LEGACY_SUBDIR = '_legacy'

const SAFE_SESSION_ID = /^[a-zA-Z0-9_-]+$/

/** 校验 sessionId 可用于路径片段（拒绝 .. 与非法字符） */
export function assertSafeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim()
  if (!trimmed || trimmed.includes('..') || !SAFE_SESSION_ID.test(trimmed)) {
    throw new WorkspaceError('无效的会话标识')
  }
  return trimmed
}

/** 单会话默认读写根：agent-workspace/sessions/<sessionId>/ */
export function resolveSessionWorkspaceRoot(sessionId: string): string {
  const safe = assertSafeSessionId(sessionId)
  return path.join(resolveAgentWorkspaceRoot(), SESSIONS_SUBDIR, safe)
}

const migratedRoots = new Set<string>()

/**
 * 将旧版全局 agent-workspace 根下散落内容迁入 _legacy/（幂等）。
 * 保留 sessions/、shared/、_legacy/ 子目录不动。
 */
export async function migrateLegacyWorkspaceFiles(): Promise<void> {
  const wsRoot = resolveAgentWorkspaceRoot()
  if (migratedRoots.has(wsRoot)) return

  await ensureDirectory(wsRoot)
  const reserved = new Set([SESSIONS_SUBDIR, SHARED_SUBDIR, LEGACY_SUBDIR])
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(wsRoot, { withFileTypes: true })
  } catch {
    migratedRoots.add(wsRoot)
    return
  }
  const toMove = entries.filter(e => !reserved.has(e.name))
  if (!toMove.length) {
    migratedRoots.add(wsRoot)
    return
  }

  const legacyDir = path.join(wsRoot, LEGACY_SUBDIR)
  await ensureDirectory(legacyDir)

  for (const entry of toMove) {
    const src = path.join(wsRoot, entry.name)
    const dest = path.join(legacyDir, entry.name)
    try {
      await fs.access(dest)
      continue
    } catch { /* dest 不存在，可迁移 */ }
    try {
      await fs.rename(src, dest)
    } catch {
      // 并发或权限问题：跳过，不阻塞会话工作区
    }
  }
  migratedRoots.add(wsRoot)
}

/** 删除会话磁盘目录（幂等；失败由调用方 warn） */
export async function deleteSessionWorkspaceDirectory(sessionId: string): Promise<void> {
  const safe = assertSafeSessionId(sessionId)
  const dir = resolveSessionWorkspaceRoot(safe)
  await fs.rm(dir, { recursive: true, force: true })
}
