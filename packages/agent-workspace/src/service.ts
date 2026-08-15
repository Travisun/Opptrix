import fs from 'node:fs/promises'
import path from 'node:path'
import {
  ConfirmationRequiredError,
  DenyPathError,
  PathEscapeError,
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
import { resolveAgentWorkspaceRoot, deleteSessionWorkspaceDirectory } from './paths.js'
import { QuotaTracker, DEFAULT_WORKSPACE_QUOTA_BYTES } from './quota.js'
import { httpFetch as doHttpFetch, type HttpFetchParams, type HttpFetchResult } from './http-fetch.js'
import { streamDownloadToFile } from './download.js'
import { ensurePythonReady } from './python/ensure-python.js'
import { toAgentPythonEnvView } from './python/agent-python-env-view.js'
import { getPythonPlatformStatus } from './python/python-platform-status.js'
import {
  ShellRunner,
  NetworkInstallStickyStore,
  SessionNetworkEgressStore,
  getSessionLanAccessStore,
  getSessionSecretAccessStore,
  type ShellInstallParams,
  type ShellPlatformStatus,
  type ShellRunParams,
  type ShellRunResult,
  type ShellBackgroundStartResult,
  type NetworkInstallPreflightResult,
  type NetworkEgressPreflightResult,
} from './shell/index.js'
import {
  decodeWorkspaceText,
  encodeWorkspaceText,
  WorkspaceTextEncodingError,
  type WorkspaceEol,
} from './workspace-text.js'
import {
  applyLineEdits,
  applyExactReplace,
  MAX_LINE_EDITS,
  splitContentLines,
  type LineEditInput,
  type ApplyLineEditsResult,
  type ExactReplaceResult,
} from './line-edit/index.js'
import {
  runCodePreflight,
  type CodePreflightParams,
  type CodePreflightResult,
  type PreflightLanguageOpt,
  type PreflightLevel,
} from './code-preflight/index.js'
import {
  clampGlobMaxResults,
  globWithinRoot,
  type WorkspaceGlobResult,
} from './workspace-glob.js'
import {
  grepWithinRoot,
  type WorkspaceGrepParams,
  type WorkspaceGrepResult,
} from './workspace-grep.js'

const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
}

function mimeFromBasename(name: string): string {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return EXT_MIME[lower.slice(dot)] ?? 'application/octet-stream'
}

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
  sessionNetworkEgress?: SessionNetworkEgressStore
  shellRunner?: ShellRunner
}

export class WorkspaceService {
  private readonly grants: GrantStore
  private readonly sticky: StickyPolicyStore
  private readonly networkSticky: NetworkInstallStickyStore
  private readonly sessionEgress: SessionNetworkEgressStore
  private readonly quota: QuotaTracker
  private readonly shell: ShellRunner

  constructor(opts: WorkspaceServiceOptions = {}) {
    this.grants = opts.grantStore ?? new GrantStore()
    this.sticky = opts.stickyStore ?? new StickyPolicyStore()
    this.networkSticky = opts.networkInstallSticky ?? new NetworkInstallStickyStore()
    this.sessionEgress = opts.sessionNetworkEgress ?? new SessionNetworkEgressStore()
    this.quota = new QuotaTracker(
      resolveAgentWorkspaceRoot(),
      opts.quotaBytes ?? DEFAULT_WORKSPACE_QUOTA_BYTES,
    )
    this.shell = opts.shellRunner ?? new ShellRunner({
      listGrants: (sessionId) => this.listGrants(sessionId),
      gatePath: (sessionId, rootId, relPath) => this.gatePath(sessionId, rootId, relPath),
      stickyNetwork: this.networkSticky,
      sessionEgress: this.sessionEgress,
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
    getSessionLanAccessStore().clearSession(sessionId)
    getSessionSecretAccessStore().clearSession(sessionId)
    void deleteSessionWorkspaceDirectory(sessionId).catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[agent-workspace] 清理会话目录失败 (${sessionId}): ${msg}`)
    })
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
    /** 目标路径尚不存在（非权限/穿越错误）时为 true，避免把裸 ENOENT 抛给 MCP */
    missing?: boolean
  }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertReadable(grant)
    let names: string[]
    try {
      names = await fs.readdir(abs)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      if (code === 'ENOENT') {
        return { entries: [], path: relPath || '.', missing: true }
      }
      throw err
    }
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

  /**
   * 在授权根内按 glob 递归找文件；返回相对 root 的路径列表。
   */
  async globFiles(
    sessionId: string,
    rootId: string,
    globPattern: string,
    opts?: { path?: string; max_results?: number },
  ): Promise<WorkspaceGlobResult> {
    const rel = opts?.path != null ? String(opts.path) : ''
    const { grant, abs } = await this.gatePath(sessionId, rootId, rel)
    assertReadable(grant)
    const maxResults = clampGlobMaxResults(opts?.max_results)
    return globWithinRoot(grant.abs_path, abs, String(globPattern ?? ''), maxResults)
  }

  /**
   * 在授权根内搜索文本（keywords AND/OR 或正则）；仅文本文件。
   */
  async grepFiles(
    sessionId: string,
    rootId: string,
    params: WorkspaceGrepParams & { path?: string },
  ): Promise<WorkspaceGrepResult> {
    const rel = params.path != null ? String(params.path) : ''
    const { grant, abs } = await this.gatePath(sessionId, rootId, rel)
    assertReadable(grant)
    return grepWithinRoot(grant.abs_path, abs, {
      keywords: params.keywords,
      matchMode: params.matchMode,
      pattern: params.pattern,
      caseInsensitive: params.caseInsensitive,
      glob: params.glob,
      maxHits: params.maxHits,
      contextLines: params.contextLines,
      maxFileBytes: params.maxFileBytes,
    })
  }

  async readFile(
    sessionId: string,
    rootId: string,
    relPath: string,
    maxBytes = 2_000_000,
    opts?: {
      start_line?: number
      end_line?: number
      numbered?: boolean
    },
  ): Promise<{
    content: string
    truncated: boolean
    size: number
    start_line?: number
    end_line?: number
    line_count?: number
  }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertReadable(grant)
    const buf = await fs.readFile(abs)
    const truncated = buf.length > maxBytes
    const slice = truncated ? buf.subarray(0, maxBytes) : buf
    let content = decodeWorkspaceText(slice).text
    const { lines } = splitContentLines(content)
    const lineCount = lines.length

    const hasRange =
      (typeof opts?.start_line === 'number' && Number.isFinite(opts.start_line))
      || (typeof opts?.end_line === 'number' && Number.isFinite(opts.end_line))
    let startLine = 1
    let endLine = lineCount
    if (hasRange) {
      startLine = typeof opts?.start_line === 'number' && Number.isFinite(opts.start_line)
        ? Math.max(1, Math.trunc(opts.start_line))
        : 1
      endLine = typeof opts?.end_line === 'number' && Number.isFinite(opts.end_line)
        ? Math.trunc(opts.end_line)
        : lineCount
      if (endLine < startLine) {
        throw new WorkspaceError('end_line 须 ≥ start_line')
      }
      if (lineCount === 0) {
        content = ''
      } else {
        const from = Math.min(startLine, lineCount)
        const to = Math.min(endLine, lineCount)
        const sliceLines = lines.slice(from - 1, to)
        if (opts?.numbered) {
          content = sliceLines
            .map((line, i) => `${String(from + i).padStart(4, '0')}|${line}`)
            .join('\n')
          if (content.length) content += '\n'
        } else {
          content = sliceLines.join('\n')
        }
        startLine = from
        endLine = to
      }
      return {
        content,
        truncated,
        size: buf.length,
        start_line: startLine,
        end_line: endLine,
        line_count: lineCount,
      }
    }

    if (opts?.numbered && lineCount > 0) {
      content = `${lines
        .map((line, i) => `${String(i + 1).padStart(4, '0')}|${line}`)
        .join('\n')}\n`
    }

    return {
      content,
      truncated,
      size: buf.length,
      ...(opts?.numbered
        ? { start_line: lineCount ? 1 : 0, end_line: lineCount, line_count: lineCount }
        : {}),
    }
  }

  /**
   * 按 1-based 闭区间行号批量替换；校验全部 edits 后原子写入。
   * 局部替换不走整文件 overwrite 确认；文件必须已存在。
   */
  async replaceLines(
    sessionId: string,
    rootId: string,
    relPath: string,
    edits: LineEditInput[],
    maxBytes = 2_000_000,
  ): Promise<ApplyLineEditsResult & { path: string }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertWritable(grant)

    let st
    try {
      st = await fs.stat(abs)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      if (code === 'ENOENT') {
        throw new WorkspaceError('文件不存在，请先用 workspace_write 创建')
      }
      throw err
    }
    if (!st.isFile()) {
      throw new WorkspaceError('路径不是文件')
    }
    if (st.size > maxBytes) {
      throw new WorkspaceError(`文件超过大小上限（约 ${Math.round(maxBytes / 1_000_000)}MB），无法按行替换`)
    }

    const buf = await fs.readFile(abs)
    if (buf.length > maxBytes) {
      throw new WorkspaceError(`文件超过大小上限（约 ${Math.round(maxBytes / 1_000_000)}MB），无法按行替换`)
    }
    const decoded = decodeWorkspaceText(buf)
    const applied = applyLineEdits(decoded.text, edits, { maxEdits: MAX_LINE_EDITS })
    if (!applied.ok || applied.content == null) {
      return { path: relPath, ...applied }
    }

    const outBuf = encodeWorkspaceText(applied.content, { relPath, eol: decoded.eol })
    await this.quota.assertCanWrite(outBuf.length)
    await fs.writeFile(abs, outBuf)

    const { content: _written, ...rest } = applied
    return { path: relPath, ...rest }
  }

  /**
   * 精确字符串替换（old_string / new_string / replace_all）；文件须已存在。
   */
  async replaceExact(
    sessionId: string,
    rootId: string,
    relPath: string,
    oldString: string,
    newString: string,
    opts?: { replace_all?: boolean; maxBytes?: number },
  ): Promise<ExactReplaceResult & { path: string }> {
    const maxBytes = opts?.maxBytes ?? 2_000_000
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertWritable(grant)

    let st
    try {
      st = await fs.stat(abs)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      if (code === 'ENOENT') {
        throw new WorkspaceError('文件不存在，请先用 workspace_write 创建')
      }
      throw err
    }
    if (!st.isFile()) {
      throw new WorkspaceError('路径不是文件')
    }
    if (st.size > maxBytes) {
      throw new WorkspaceError(`文件超过大小上限（约 ${Math.round(maxBytes / 1_000_000)}MB），无法精确替换`)
    }

    const buf = await fs.readFile(abs)
    const decoded = decodeWorkspaceText(buf)
    const applied = applyExactReplace(decoded.text, oldString, newString, {
      replace_all: opts?.replace_all,
    })
    if (!applied.ok || applied.content == null) {
      return { path: relPath, ...applied }
    }

    const outBuf = encodeWorkspaceText(applied.content, { relPath, eol: decoded.eol })
    await this.quota.assertCanWrite(outBuf.length)
    await fs.writeFile(abs, outBuf)
    return { path: relPath, ok: true, replacements: applied.replacements }
  }

  /**
   * 应用 OpenCode `*** Begin Patch`（Add/Update/Delete）；全部经 gatePath。
   * Update/Add 写入不走整文件 overwrite 确认（与 replaceLines 一致）；Delete 仍需确认。
   */
  async applyPatch(
    sessionId: string,
    rootId: string,
    patchText: string,
    confirm?: ConfirmHandler,
  ): Promise<import('./apply-patch.js').ApplyPatchResult> {
    const { applyOpenCodePatchText } = await import('./apply-patch.js')
    const eolByPath = new Map<string, WorkspaceEol>()
    return applyOpenCodePatchText(patchText, {
      fileExists: async (relPath) => {
        const { abs } = await this.gatePath(sessionId, rootId, relPath)
        try {
          const st = await fs.stat(abs)
          return st.isFile()
        } catch {
          return false
        }
      },
      readFile: async (relPath) => {
        const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
        assertReadable(grant)
        const buf = await fs.readFile(abs)
        const decoded = decodeWorkspaceText(buf)
        eolByPath.set(relPath, decoded.eol)
        return decoded.text
      },
      writeFile: async (relPath, content) => {
        const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
        assertWritable(grant)
        const eol = eolByPath.get(relPath)
        const outBuf = encodeWorkspaceText(content, { relPath, eol })
        await this.quota.assertCanWrite(outBuf.length)
        await fs.mkdir(path.dirname(abs), { recursive: true })
        await fs.writeFile(abs, outBuf)
      },
      deletePath: async (relPath) => {
        await this.deletePath(sessionId, rootId, relPath, confirm)
      },
    })
  }

  /**
   * Resolve an authorized file for HTTP streaming (read-only).
   * Does not expose absolute paths to callers beyond the return value for the server stream.
   */
  async openReadableFile(
    sessionId: string,
    rootId: string,
    relPath: string,
  ): Promise<{ abs: string; size: number; mime: string; basename: string }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertReadable(grant)
    let st
    try {
      st = await fs.stat(abs)
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      if (code === 'ENOENT') {
        throw new WorkspaceError('文件不存在')
      }
      throw err
    }
    if (!st.isFile()) {
      throw new WorkspaceError('路径不是文件')
    }
    const basename = path.basename(abs)
    return {
      abs,
      size: st.size,
      mime: mimeFromBasename(basename),
      basename,
    }
  }

  /** Check whether path is under an authorized root (no absolute path in result). */
  async probeReadablePath(
    sessionId: string,
    rootId: string,
    relPath: string,
  ): Promise<{ exists: boolean }> {
    const { grant, abs } = await this.gatePath(sessionId, rootId, relPath)
    assertReadable(grant)
    try {
      const st = await fs.stat(abs)
      return { exists: st.isFile() }
    } catch {
      return { exists: false }
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
    let exists = false
    let existingEol: WorkspaceEol | undefined
    try {
      await fs.access(abs)
      exists = true
      try {
        const prev = await fs.readFile(abs)
        existingEol = decodeWorkspaceText(prev).eol
      } catch (err) {
        // 覆盖写入：原文件非法 UTF-8 时无法保留 eol，按新建语义（LF / 脚本平台 EOL）
        if (!(err instanceof WorkspaceTextEncodingError)) throw err
      }
    } catch { /* new file */ }
    const buf = encodeWorkspaceText(content, { relPath, eol: existingEol })
    await this.quota.assertCanWrite(buf.length)
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
    return doHttpFetch(params)
  }

  shellPlatformStatus(): Promise<ShellPlatformStatus> {
    return this.shell.platformStatus()
  }

  shellRun(
    params: ShellRunParams,
    confirm?: ConfirmHandler,
  ): Promise<ShellRunResult | ShellBackgroundStartResult> {
    return this.shell.run(params, confirm)
  }

  shellInstall(
    params: ShellInstallParams,
    confirm?: ConfirmHandler,
  ): Promise<ShellRunResult> {
    return this.shell.install(params, confirm)
  }

  /** 兼容内部 API：等价于 pip/npm install → opptrix_run */
  opptrixInstall(
    params: ShellInstallParams,
    confirm?: ConfirmHandler,
  ): Promise<ShellRunResult> {
    return this.shellInstall(params, confirm)
  }

  /**
   * 写脚本后软门禁：L0 语法+平台规则；L1 仅当 ruff/biome 可用。
   * 不拦截 opptrix_run；不执行用户业务代码。
   */
  async codePreflight(params: CodePreflightParams): Promise<CodePreflightResult> {
    const relPath = String(params.path ?? '').trim()
    if (!relPath) {
      const msg = '请提供相对文件路径'
      return {
        ok: false,
        path: '',
        language: null,
        checks: [{
          id: 'l0_exists',
          level: 'l0',
          status: 'fail',
          message: msg,
        }],
        diagnostics: [{
          id: 'l0_exists',
          level: 'l0',
          severity: 'error',
          message: msg,
        }],
        errors: [msg],
        warnings: [],
        fix_hints: ['path 为授权工作区内的相对路径，如 scripts/demo.py'],
        l1_available: {},
      }
    }

    const rootId = params.rootId || 'default'
    const language: PreflightLanguageOpt = params.language ?? 'auto'
    const levels: PreflightLevel[] = params.levels?.length
      ? [...params.levels]
      : ['l0', 'l1']

    let grant: WorkspaceGrant
    let abs: string
    try {
      const gated = await this.gatePath(params.sessionId, rootId, relPath)
      grant = gated.grant
      abs = gated.abs
      assertReadable(grant)
    } catch (err) {
      const denied = err instanceof PathEscapeError || err instanceof DenyPathError
      const summary = denied
        ? '路径不在授权工作区内'
        : '文件不存在或不可读'
      return {
        ok: false,
        path: relPath,
        language: null,
        checks: [{
          id: 'l0_exists',
          level: 'l0',
          status: 'fail',
          message: summary,
        }],
        diagnostics: [{
          id: 'l0_exists',
          level: 'l0',
          severity: 'error',
          message: summary,
        }],
        errors: [summary],
        warnings: [],
        fix_hints: denied
          ? ['请确认相对路径未越出授权目录，必要时用 request_folder_access 或 list_workspace_grants']
          : ['请确认文件已写出，且 root_id 与相对路径正确'],
        l1_available: {},
      }
    }

    let buf: Buffer
    let fileOk = true
    let notFile = false
    try {
      const st = await fs.stat(abs)
      if (!st.isFile()) {
        fileOk = false
        notFile = true
        buf = Buffer.alloc(0)
      } else {
        buf = await fs.readFile(abs)
      }
    } catch {
      return runCodePreflight({
        path: relPath,
        absPath: abs,
        grantRootAbs: grant.abs_path,
        buf: Buffer.alloc(0),
        language,
        levels,
        signal: params.signal,
        fileOk: false,
        missing: true,
      })
    }

    return runCodePreflight({
      path: relPath,
      absPath: abs,
      grantRootAbs: grant.abs_path,
      buf,
      language,
      levels,
      signal: params.signal,
      fileOk,
      notFile,
    })
  }

  requestNetworkInstall(
    sessionId: string,
    confirm?: ConfirmHandler,
    reason?: string,
  ): Promise<NetworkInstallPreflightResult> {
    return this.shell.requestNetworkInstall(sessionId, confirm, reason)
  }

  requestNetworkEgress(
    sessionId: string,
    hosts: string[],
    confirm?: ConfirmHandler,
    reason?: string,
  ): Promise<NetworkEgressPreflightResult> {
    return this.shell.requestNetworkEgress(sessionId, hosts, confirm, reason)
  }

  pythonEnvStatus() {
    return getPythonPlatformStatus().then(status => toAgentPythonEnvView(status))
  }

  ensurePython(opts?: { jobId?: string }) {
    return ensurePythonReady({ jobId: opts?.jobId })
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
