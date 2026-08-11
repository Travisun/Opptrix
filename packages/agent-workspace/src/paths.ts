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
/** 跨会话公共复用区 root_id（自动 grant，clearSession 不删） */
export const SHARED_ROOT_ID = 'shared'

export const SESSIONS_SUBDIR = 'sessions'
export const SHARED_SUBDIR = 'shared'
export const LEGACY_SUBDIR = '_legacy'

/** 公共复用区根：agent-workspace/shared/ */
export function resolveSharedWorkspaceRoot(): string {
  return path.join(resolveAgentWorkspaceRoot(), SHARED_SUBDIR)
}

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

/** 私有会话状态根（与 agent-workspace 平级，Deny；非 Agent 可读平面） */
export const SESSION_STATE_SUBDIR = 'session-state'

export function resolveSessionStateRoot(): string {
  return path.join(resolveUserDataRoot(), SESSION_STATE_SUBDIR)
}

/** 单会话私有状态目录：session-state/<sessionId>/ */
export function resolveSessionStateDir(sessionId: string): string {
  const safe = assertSafeSessionId(sessionId)
  return path.join(resolveSessionStateRoot(), safe)
}

/** 删除会话私有状态目录（幂等；失败由调用方 warn） */
export async function deleteSessionStateDirectory(sessionId: string): Promise<void> {
  const safe = assertSafeSessionId(sessionId)
  const dir = resolveSessionStateDir(safe)
  await fs.rm(dir, { recursive: true, force: true })
}
