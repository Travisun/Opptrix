import fs from 'node:fs/promises'
import path from 'node:path'
import {
  ConfirmationRequiredError,
  QuotaExceededError,
  WorkspaceError,
} from './errors.js'
import { resolveSafePath, ensureDirectory } from './path-gate.js'
import {
  GrantStore,
  assertReadable,
  assertWritable,
  type WorkspaceGrant,
} from './grants.js'
import {
  StickyPolicyStore,
  CONFIRM_OPTIONS,
  parseConfirmChoice,
  type StickyOperation,
} from './ask-policy.js'
import { resolveAgentWorkspaceRoot } from './paths.js'
import { QuotaTracker, DEFAULT_WORKSPACE_QUOTA_BYTES } from './quota.js'
import { httpFetch, type HttpFetchParams, type HttpFetchResult } from './http-fetch.js'
import { streamDownloadToFile } from './download.js'
import {
  ShellRunner,
  NetworkInstallStickyStore,
  type ShellInstallParams,
  type ShellPlatformStatus,
  type ShellRunParams,
  type ShellRunResult,
} from './shell/index.js'

export interface ConfirmHandler {
  (payload: {
    title: string
    prompt: string
    options: Array<{ id: string; label: string }>
    operation: StickyOperation
    root_id: string
    path: string
  }): Promise<{ selected_ids: string[] }>
}

export interface WorkspaceServiceOptions {
  quotaBytes?: number
  grantStore?: GrantStore
  stickyStore?: StickyPolicyStore
  networkInstallSticky?: NetworkInstallStickyStore
  shellRunner?: ShellRunner
}

export class WorkspaceService {
  private readonly grants: GrantStore
  private readonly sticky: StickyPolicyStore
  private readonly networkSticky: NetworkInstallStickyStore
  private readonly quota: QuotaTracker
  private readonly shell: ShellRunner

  constructor(opts: WorkspaceServiceOptions = {}) {
    this.grants = opts.grantStore ?? new GrantStore()
    this.sticky = opts.stickyStore ?? new StickyPolicyStore()
    this.networkSticky = opts.networkInstallSticky ?? new NetworkInstallStickyStore()
    this.quota = new QuotaTracker(
      resolveAgentWorkspaceRoot(),
      opts.quotaBytes ?? DEFAULT_WORKSPACE_QUOTA_BYTES,
    )
    this.shell = opts.shellRunner ?? new ShellRunner({
      listGrants: (sessionId) => this.listGrants(sessionId),
      gatePath: (sessionId, rootId, relPath) => this.gatePath(sessionId, rootId, relPath),
      stickyNetwork: this.networkSticky,
    })
  }

  getGrantStore(): GrantStore {
    return this.grants
  }

  getStickyStore(): StickyPolicyStore {
    return this.sticky
  }

  clearSession(sessionId: string): void {
    this.grants.clearSession(sessionId)
    this.sticky.clearSession(sessionId)
    this.shell.clearSession(sessionId)
  }

  async ensureDefaultRoot(sessionId: string): Promise<WorkspaceGrant> {
    return this.grants.ensureDefaultRoot(sessionId)
  }

  async listGrants(sessionId: string): Promise<WorkspaceGrant[]> {
    await this.grants.ensureDefaultRoot(sessionId)
    return this.grants.listGrants(sessionId)
  }

  addGrant(
    sessionId: string,
    absPath: string,
    mode: 'ro' | 'rw',
    label?: string,
  ): WorkspaceGrant {
    return this.grants.addGrant(sessionId, absPath, mode, label)
  }

  removeGrant(sessionId: string, grantId: string): boolean {
    return this.grants.removeGrant(sessionId, grantId)
  }

  private resolveGrant(sessionId: string, rootId: string): WorkspaceGrant {
    const grant = this.grants.getGrant(sessionId, rootId)
    if (!grant) throw new WorkspaceError(`未知 root_id: ${rootId}`)
    return grant
  }

  private async gatePath(sessionId: string, rootId: string, relPath: string): Promise<{
    grant: WorkspaceGrant
    abs: string
  }> {
    await this.grants.ensureDefaultRoot(sessionId)
    const grant = this.resolveGrant(sessionId, rootId)
    const abs = await resolveSafePath(grant.abs_path, relPath)
    return { grant, abs }
  }

  private async requireConfirmation(
    sessionId: string,
    rootId: string,
    relPath: string,
    operation: StickyOperation,
    confirm?: ConfirmHandler,
  ): Promise<void> {
    if (this.sticky.has(sessionId, rootId, operation)) return
    const options = CONFIRM_OPTIONS[operation]
    const payload = {
      kind: operation,
      root_id: rootId,
      path: relPath,
      title: operation === 'delete' ? '确认删除' : '确认覆盖',
      prompt: operation === 'delete'
        ? `确定要删除「${relPath || '/'}」吗？删除后无法恢复。`
        : `文件「${relPath}」已存在，确定覆盖吗？`,
      options: [...options],
    }
    if (!confirm) {
      throw new ConfirmationRequiredError(payload)
    }
    const answer = await confirm({
      title: payload.title,
      prompt: payload.prompt,
      options: payload.options,
      operation,
      root_id: rootId,
      path: relPath,
    })
    const choice = parseConfirmChoice(answer.selected_ids)
    if (choice === 'cancel') throw new WorkspaceError('用户已取消操作')
    if (choice === 'sticky') this.sticky.grant(sessionId, rootId, operation)
  }

  async listDir(sessionId: string, rootId: string, relPath = ''): Promise<{
    entries: Array<{ name: string; type: 'file' | 'directory'; size?: number }>
    path: string
  }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertReadable(grant)
    const names = await fs.readdir(abs)
    const entries = await Promise.all(names.map(async name => {
      const full = path.join(abs, name)
      const st = await fs.stat(full)
      return {
        name,
        type: st.isDirectory() ? 'directory' as const : 'file' as const,
        size: st.isFile() ? st.size : undefined,
      }
    }))
    return { entries, path: relPath || '.' }
  }

  async readFile(sessionId: string, rootId: string, relPath: string, maxBytes = 2_000_000): Promise<{
    content: string
    truncated: boolean
    size: number
  }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertReadable(grant)
    const buf = await fs.readFile(abs)
    const truncated = buf.length > maxBytes
    const slice = truncated ? buf.subarray(0, maxBytes) : buf
    return {
      content: slice.toString('utf8'),
      truncated,
      size: buf.length,
    }
  }

  async writeFile(
    sessionId: string,
    rootId: string,
    relPath: string,
    content: string,
    confirm?: ConfirmHandler,
  ): Promise<{ path: string; bytes: number }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertWritable(grant)
    const buf = Buffer.from(content, 'utf8')
    await this.quota.assertCanWrite(buf.length)
    let exists = false
    try {
      await fs.access(abs)
      exists = true
    } catch { /* new file */ }
    if (exists) {
      await this.requireConfirmation(sessionId, rootId, relPath, 'overwrite', confirm)
    }
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, buf)
    return { path: relPath, bytes: buf.length }
  }

  async mkdir(sessionId: string, rootId: string, relPath: string): Promise<{ path: string }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertWritable(grant)
    await ensureDirectory(abs)
    return { path: relPath }
  }

  async deletePath(
    sessionId: string,
    rootId: string,
    relPath: string,
    confirm?: ConfirmHandler,
  ): Promise<{ deleted: string }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertWritable(grant)
    await this.requireConfirmation(sessionId, rootId, relPath, 'delete', confirm)
    await fs.rm(abs, { recursive: true, force: true })
    return { deleted: relPath }
  }

  async downloadFile(
    sessionId: string,
    rootId: string,
    relPath: string,
    url: string,
    opts?: {
      method?: string
      headers?: Record<string, string>
      timeout_ms?: number
      signal?: AbortSignal
      confirm?: ConfirmHandler
    },
  ): Promise<{ path: string; bytes_written: number; content_type?: string }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertWritable(grant)
    let exists = false
    try {
      await fs.access(abs)
      exists = true
    } catch { /* new */ }
    if (exists) {
      await this.requireConfirmation(sessionId, rootId, relPath, 'overwrite', opts?.confirm)
    }
    const usageBefore = await this.quota.currentUsage()
    await this.quota.assertCanWrite(1)
    const result = await streamDownloadToFile({
      url,
      destPath: abs,
      method: opts?.method,
      headers: opts?.headers,
      timeout_ms: opts?.timeout_ms,
      signal: opts?.signal,
      onProgress: bytes => {
        if (usageBefore + bytes > this.quota.limitBytes) {
          throw new QuotaExceededError()
        }
      },
    })
    await this.quota.assertCanWrite(result.bytes_written)
    return {
      path: relPath,
      bytes_written: result.bytes_written,
      content_type: result.content_type,
    }
  }

  httpFetch(params: HttpFetchParams): Promise<HttpFetchResult> {
    return httpFetch(params)
  }

  shellPlatformStatus(): Promise<ShellPlatformStatus> {
    return this.shell.platformStatus()
  }

  shellRun(
    params: ShellRunParams,
    confirm?: ConfirmHandler,
  ): Promise<ShellRunResult> {
    return this.shell.run(params, confirm)
  }

  shellInstall(
    params: ShellInstallParams,
    confirm?: ConfirmHandler,
  ): Promise<ShellRunResult> {
    return this.shell.install(params, confirm)
  }
}

let defaultService: WorkspaceService | null = null

export function getWorkspaceService(): WorkspaceService {
  if (!defaultService) defaultService = new WorkspaceService()
  return defaultService
}

export function resetWorkspaceService(): void {
  defaultService = null
}
