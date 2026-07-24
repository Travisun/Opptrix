import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  DEFAULT_ROOT_ID,
  migrateLegacyWorkspaceFiles,
  resolveAgentWorkspaceRoot,
  resolveSessionWorkspaceRoot,
} from './paths.js'
import { ensureDirectory } from './path-gate.js'
import { isPathDenied } from './deny.js'
import { DenyPathError, WorkspaceError } from './errors.js'

export type GrantMode = 'ro' | 'rw'

export interface WorkspaceGrant {
  id: string
  root_id: string
  abs_path: string
  mode: GrantMode
  label?: string
  is_default?: boolean
}

interface SessionGrants {
  byRootId: Map<string, WorkspaceGrant>
}

function normalizeGrantPath(absPath: string): string {
  const resolved = path.resolve(absPath)
  if (isPathDenied(resolved)) {
    throw new DenyPathError('无法授权该目录（受保护路径）')
  }
  return resolved
}

export class GrantStore {
  private readonly sessions = new Map<string, SessionGrants>()

  private session(sessionId: string): SessionGrants {
    let s = this.sessions.get(sessionId)
    if (!s) {
      s = { byRootId: new Map() }
      this.sessions.set(sessionId, s)
    }
    return s
  }

  async ensureDefaultRoot(sessionId: string): Promise<WorkspaceGrant> {
    await migrateLegacyWorkspaceFiles()
    await ensureDirectory(resolveAgentWorkspaceRoot())
    const sessionRoot = resolveSessionWorkspaceRoot(sessionId)
    await ensureDirectory(sessionRoot)
    const existing = this.session(sessionId).byRootId.get(DEFAULT_ROOT_ID)
    if (existing) return existing
    const grant: WorkspaceGrant = {
      id: randomUUID(),
      root_id: DEFAULT_ROOT_ID,
      abs_path: sessionRoot,
      mode: 'rw',
      label: '本对话工作区',
      is_default: true,
    }
    this.session(sessionId).byRootId.set(DEFAULT_ROOT_ID, grant)
    return grant
  }

  addGrant(
    sessionId: string,
    absPath: string,
    mode: GrantMode,
    label?: string,
  ): WorkspaceGrant {
    const normalized = normalizeGrantPath(absPath)
    const rootId = `grant_${randomUUID().slice(0, 8)}`
    const grant: WorkspaceGrant = {
      id: randomUUID(),
      root_id: rootId,
      abs_path: normalized,
      mode,
      label: label?.trim() || path.basename(normalized) || '授权文件夹',
    }
    this.session(sessionId).byRootId.set(rootId, grant)
    return grant
  }

  getGrant(sessionId: string, rootId: string): WorkspaceGrant | null {
    return this.session(sessionId).byRootId.get(rootId) ?? null
  }

  listGrants(sessionId: string): WorkspaceGrant[] {
    const grants = [...this.session(sessionId).byRootId.values()]
    return grants.sort((a, b) => {
      if (a.is_default) return -1
      if (b.is_default) return 1
      return a.root_id.localeCompare(b.root_id)
    })
  }

  removeGrant(sessionId: string, grantId: string): boolean {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    for (const [rootId, grant] of s.byRootId) {
      if (grant.id === grantId) {
        if (grant.is_default) return false
        s.byRootId.delete(rootId)
        return true
      }
    }
    return false
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

export function assertWritable(grant: WorkspaceGrant): void {
  if (grant.mode !== 'rw') {
    throw new WorkspaceError('该目录为只读授权')
  }
}

export function assertReadable(_grant: WorkspaceGrant): void {
  // ro and rw both readable
}
