import path from 'node:path'
import {
  ConfirmationRequiredError,
  NetworkInstallConfirmationRequiredError,
  NetworkEgressConfirmationRequiredError,
  ShellRunConfirmationRequiredError,
  PathEscapeError,
  SHARED_ROOT_ID,
  SESSION_LAN_ASK_OPTIONS,
  applySessionLanAskChoice,
  SESSION_SECRET_GRANT_ASK_OPTIONS,
  applySessionSecretGrantChoice,
  getSessionSecretAccessStore,
  getWorkspaceService,
  sharedDumpsDir,
  tryRecordOfflineKDumpSuccess,
  RELATIVE_PATH_CONTRACT_HINT,
  FILE_ENOENT_HINT,
  resolveEnoentToolHint,
  appendRelativePathNudge,
  WORKSPACE_TEXT_ENCODING_HINT,
  WorkspaceTextEncodingError,
  type ConfirmHandler,
  type WorkspaceGrant,
  type ShellSecretRef,
} from '@opptrix/agent-workspace'
import { prepareFuyaoDumpForAgentAsync, type FuyaoDumpKind, type FuyaoDumpMode, type FuyaoDumpJobResult } from '@opptrix/market-data-store'
import {
  buildOpptrixWsUri,
  hintOpptrixWsKind,
  isValidOpptrixWsRootId,
  normalizeOpptrixWsRelPath,
  resolveUserDataRoot,
} from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import { TOOL_META } from '../tool-meta.js'
import { getLocalDataCatalog, listLocalDataApis } from '../local-data-catalog.js'
import type { UserPromptAnswer, UserPromptOption } from '../user-prompt.js'
import { normalizeVaultSecretName } from '../user-prompt.js'
import { currentToolSessionId } from './tool-session-context.js'

type JsonSchema = {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    items?: unknown
    default?: unknown
  }>
  required?: string[]
}

export interface WorkspaceToolDef {
  name: string
  description: string
  category: string
  parameters: JsonSchema
  handler: (args: Record<string, unknown>) => Promise<unknown>
  meta?: (typeof TOOL_META)[string]
}

export interface WorkspaceToolBridge {
  sessionId: string
  signal?: AbortSignal
  confirm: ConfirmHandler
  /** 会话内问答（供 request_session_lan_access 等） */
  askUser?: (payload: {
    title?: string
    prompt: string
    options: UserPromptOption[]
    allowMultiple?: boolean
  }) => Promise<UserPromptAnswer>
  /** 保险箱安全录入 — 推送 kind=secret，明文永不回传给工具结果 */
  askSecret?: (payload: {
    title?: string
    prompt: string
    name: string
    inject_hosts?: string[]
  }) => Promise<UserPromptAnswer>
}

type BoundWorkspaceBridge = {
  bridge: WorkspaceToolBridge
  gen: number
}

let bridgeGenSeq = 0
const bridgesBySession = new Map<string, BoundWorkspaceBridge>()

/**
 * 绑定会话级 workspace bridge，返回 generation。
 * 解绑须带同一 gen，避免同会话打断重发时旧 chat finally 清掉新 bridge。
 */
export function bindWorkspaceToolBridge(next: WorkspaceToolBridge): number {
  const gen = ++bridgeGenSeq
  bridgesBySession.set(next.sessionId, { bridge: next, gen })
  return gen
}

export function unbindWorkspaceToolBridge(sessionId: string, gen: number): void {
  const cur = bridgesBySession.get(sessionId)
  if (cur && cur.gen === gen) {
    bridgesBySession.delete(sessionId)
  }
}

/** @deprecated 仅兼容旧调用；请改用 unbindWorkspaceToolBridge(sessionId, gen) */
export function clearWorkspaceToolBridge(): void {
  bridgesBySession.clear()
}

const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
  ({ type: 'object', properties, required })

/** path / cwd 参数说明 — 强制相对 root_id */
const PATH_REL_PARAM_DESC =
  '相对当前 root_id 的路径（例 packages/foo/x.py）。禁止绝对路径、~、file://、把 abs_path/系统 cwd 填入；正例配合 root_id'

function toolError(err: unknown): { error: string; hint?: string } {
  const message = err instanceof Error ? err.message : String(err)
  if (err instanceof PathEscapeError || message.includes('不允许使用绝对路径')) {
    return {
      error: message,
      hint: RELATIVE_PATH_CONTRACT_HINT,
    }
  }
  if (
    err instanceof WorkspaceTextEncodingError
    || /不是合法 UTF-8|非法.*utf-?8|UTF-8 无 BOM/i.test(message)
  ) {
    return {
      error: message,
      hint: err instanceof WorkspaceTextEncodingError
        ? err.hint
        : WORKSPACE_TEXT_ENCODING_HINT,
    }
  }
  const errno =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : ''
  const enoentHint = resolveEnoentToolHint(message, errno || undefined)
  if (enoentHint) {
    const error =
      enoentHint === FILE_ENOENT_HINT
        ? appendRelativePathNudge(message)
        : message
    return { error, hint: enoentHint }
  }
  return { error: message }
}

function formatConfirmationResult(err: ConfirmationRequiredError): {
  needs_confirmation: true
  confirmation: ConfirmationRequiredError['confirmation']
} {
  return {
    needs_confirmation: true,
    confirmation: err.confirmation,
  }
}

async function formatReadyFuyaoDumpResult(result: FuyaoDumpJobResult): Promise<Record<string, unknown>> {
  if (result.url) {
    return {
      ok: true,
      status: 'ready',
      dump_kind: result.dump_kind,
      mode: 'presigned_url',
      url: result.url,
      url_expires_hint: result.url_expires_hint,
      sandbox_hint: result.sandbox_hint,
    }
  }
  const fileName = path.basename(result.path ?? '')
  const base: Record<string, unknown> = {
    ok: true,
    status: 'ready',
    dump_kind: result.dump_kind,
    mode: 'local_path',
    root_id: SHARED_ROOT_ID,
    relative_path: fileName ? `data/dumps/${fileName}` : 'data/dumps',
    bytes: result.bytes,
    from_cache: result.from_cache,
    sandbox_hint: result.sandbox_hint,
    note: '用 workspace_glob / workspace_read 或 opptrix_run，root_id=shared + relative_path；勿注入 API Key',
  }
  const metaResult = await tryRecordOfflineKDumpSuccess({
    dumpKind: result.dump_kind,
    mode: 'local_path',
    ok: true,
    bytes: result.bytes,
  })
  if (metaResult.meta_written) {
    return {
      ...base,
      meta_written: true,
      meta_path: metaResult.meta_path,
    }
  }
  if (metaResult.meta_warning) {
    return {
      ...base,
      meta_written: false,
      meta_warning: metaResult.meta_warning,
    }
  }
  return base
}

function formatNetworkInstallConfirmation(err: NetworkInstallConfirmationRequiredError): {
  needs_confirmation: true
  confirmation: NetworkInstallConfirmationRequiredError['confirmation']
} {
  return {
    needs_confirmation: true,
    confirmation: err.confirmation,
  }
}

function formatShellRunConfirmation(err: ShellRunConfirmationRequiredError): {
  needs_confirmation: true
  confirmation: ShellRunConfirmationRequiredError['confirmation']
} {
  return {
    needs_confirmation: true,
    confirmation: err.confirmation,
  }
}

function formatNetworkEgressConfirmation(err: NetworkEgressConfirmationRequiredError): {
  needs_confirmation: true
  confirmation: NetworkEgressConfirmationRequiredError['confirmation']
} {
  return {
    needs_confirmation: true,
    confirmation: err.confirmation,
  }
}

function handleShellError(err: unknown): unknown {
  if (err instanceof ShellRunConfirmationRequiredError) {
    return formatShellRunConfirmation(err)
  }
  if (err instanceof NetworkEgressConfirmationRequiredError) {
    return formatNetworkEgressConfirmation(err)
  }
  if (err instanceof NetworkInstallConfirmationRequiredError) {
    return formatNetworkInstallConfirmation(err)
  }
  if (err instanceof ConfirmationRequiredError) {
    return formatConfirmationResult(err)
  }
  return toolError(err)
}

function parseArgv(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(v => String(v ?? '')).filter(v => v.length > 0)
}

function parseSecretRefs(raw: unknown): ShellSecretRef[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined
  const out: ShellSecretRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name ?? '').trim()
    if (!name) continue
    const env = row.env != null ? String(row.env).trim() : undefined
    const injectHosts = Array.isArray(row.inject_hosts)
      ? row.inject_hosts.map(h => String(h ?? '').trim()).filter(Boolean)
      : undefined
    out.push({
      name,
      env: env || undefined,
      inject_hosts: injectHosts?.length ? injectHosts : undefined,
    })
  }
  return out.length ? out : undefined
}

function parseInjectHostsArg(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const hosts = raw.map(h => String(h ?? '').trim()).filter(Boolean)
  return hosts.length ? hosts : undefined
}

function requireBridge(): WorkspaceToolBridge {
  const sessionId = currentToolSessionId()
  if (!sessionId) {
    throw new Error('workspace 工具需在聊天会话中调用')
  }
  const bound = bridgesBySession.get(sessionId)
  if (!bound) {
    throw new Error('workspace 工具需在聊天会话中调用')
  }
  return bound.bridge
}

function parseHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v != null) out[k] = String(v)
  }
  return Object.keys(out).length ? out : undefined
}

function parseQuery(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    } else {
      out[k] = String(v)
    }
  }
  return Object.keys(out).length ? out : undefined
}

function isUnderUserDataRoot(absPath: string): boolean {
  const userData = path.resolve(resolveUserDataRoot())
  const target = path.resolve(absPath)
  return target === userData || target.startsWith(`${userData}${path.sep}`)
}

  /** Agent 可见 grant 摘要 — 默认工作区不暴露 ~/.opptrix 绝对路径；abs_path 不可抄进工具 path */
function formatGrantForAgent(grant: WorkspaceGrant): Record<string, unknown> {
  const label = grant.label ?? (grant.is_default ? '本对话工作区' : '授权文件夹')
  const base = {
    root_id: grant.root_id,
    label,
    display_name: grant.is_default
      ? '本对话工作区（default）'
      : grant.root_id === SHARED_ROOT_ID
        ? '公共复用区（shared）'
        : (grant.label ?? path.basename(grant.abs_path)),
    mode: grant.mode,
    is_default: Boolean(grant.is_default),
  }
  if (grant.is_default) {
    return {
      ...base,
      path_hint: '本对话专属读写目录；使用 root_id=default + 相对 path 调用 workspace_* / opptrix_run',
    }
  }
  if (grant.root_id === SHARED_ROOT_ID) {
    return {
      ...base,
      path_hint:
        '跨对话公共区（packages/data/docs）；使用 root_id=shared + 相对 path；会话结束不清理；dumps 经 prepare_fuyao_dump',
    }
  }
  if (isUnderUserDataRoot(grant.abs_path)) {
    return {
      ...base,
      path_hint: `${path.basename(grant.abs_path)}（应用内部路径，已脱敏）`,
    }
  }
  return {
    ...base,
    // 仅供识别授权文件夹；禁止抄进 workspace_* / opptrix_run 的 path 或 cwd
    abs_path: grant.abs_path,
    do_not_use_as_tool_path: true,
    path_hint: path.basename(grant.abs_path),
    note: 'abs_path 不可填入 path/cwd；须用本条 root_id + 相对路径（例 packages/foo/x.py）',
  }
}

function summarizeWorkspaceGrants(grants: WorkspaceGrant[]): Record<string, unknown> {
  const hasShared = grants.some(g => g.root_id === SHARED_ROOT_ID)
  const extra = grants.filter(g => !g.is_default && g.root_id !== SHARED_ROOT_ID)
  const parts = ['本对话工作区（default，读写）']
  if (hasShared) parts.push('公共复用区（shared，读写）')
  if (extra.length) parts.push(`${extra.length} 个额外授权目录`)
  return {
    summary: `当前对话可访问：${parts.join(' + ')}`,
    grants: grants.map(formatGrantForAgent),
    note:
      '使用 root_id + 相对 path/cwd 调用 workspace_glob/read/write、opptrix_run；禁止把 abs_path 当工具路径；'
      + '成功后勿反复 list 同一授权集；公共包/dump 用 shared；需要更多目录请 request_folder_access 或请用户在界面授权',
  }
}

export function buildWorkspaceTools(): WorkspaceToolDef[] {
  const ws = getWorkspaceService()
  const tools: WorkspaceToolDef[] = [
    {
      name: 'workspace_glob',
      category: '工作区',
      description:
        '找文件/看树首选（优先于 shell ls/find）：在已授权文件夹内按文件名模式递归查找（如 **/*.py）；返回相对路径列表，再 read / replace_lines',
      parameters: S({
        glob_pattern: { type: 'string', description: '文件名模式，如 **/*.ts 或 *.py' },
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC + '；可选起点目录或文件' },
        max_results: { type: 'number', description: '最多返回条数，默认 200，上限 500' },
      }, ['glob_pattern']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.globFiles(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.glob_pattern ?? ''),
            {
              path: args.path != null ? String(args.path) : undefined,
              max_results: typeof args.max_results === 'number' ? args.max_results : undefined,
            },
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_grep',
      category: '工作区',
      description:
        '搜文本首选（优先于 shell rg/grep）：keywords 空格分词 + match_mode(and|or，默认 and)，或 pattern 正则；返回行号与摘录，再 read(numbered) / replace_lines',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC + '；可选文件或目录起点' },
        keywords: { type: 'string', description: '空格分词关键词（与 pattern 二选一）' },
        match_mode: { type: 'string', description: 'and | or，默认 and（仅 keywords）' },
        pattern: { type: 'string', description: '正则（与 keywords 二选一）' },
        case_insensitive: { type: 'boolean', description: '正则/关键词是否忽略大小写，默认 false' },
        glob: { type: 'string', description: '可选：限制文件名模式，如 **/*.ts' },
        max_hits: { type: 'number', description: '最多命中条数，默认 50，上限 100' },
        context_lines: { type: 'number', description: '上下文章节行数 0–2，默认 0' },
      }),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const matchModeRaw = String(args.match_mode ?? 'and').toLowerCase()
          const matchMode = matchModeRaw === 'or' ? 'or' as const : 'and' as const
          return await ws.grepFiles(
            b.sessionId,
            String(args.root_id ?? 'default'),
            {
              path: args.path != null ? String(args.path) : undefined,
              keywords: args.keywords != null ? String(args.keywords) : undefined,
              matchMode,
              pattern: args.pattern != null ? String(args.pattern) : undefined,
              caseInsensitive: args.case_insensitive === true || args.case_insensitive === 'true',
              glob: args.glob != null ? String(args.glob) : undefined,
              maxHits: typeof args.max_hits === 'number' ? args.max_hits : undefined,
              contextLines: typeof args.context_lines === 'number' ? args.context_lines : undefined,
            },
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_read',
      category: '工作区',
      description:
        '读文件内容首选（优先于 cat/head/tail）：读取授权工作区内文本；可选 start_line/end_line 只读区间，numbered=true 时内容带 NNNN| 行号前缀',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC },
        max_bytes: { type: 'number', description: '最大读取字节，默认 2000000' },
        start_line: { type: 'number', description: '可选：1-based 起始行（含）' },
        end_line: { type: 'number', description: '可选：1-based 结束行（含）' },
        numbered: { type: 'boolean', description: '为 true 时每行前缀 NNNN| 行号；默认 false（整文件无前缀）' },
      }, ['path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const numbered = args.numbered === true || args.numbered === 'true'
          const startLine = typeof args.start_line === 'number' ? args.start_line : undefined
          const endLine = typeof args.end_line === 'number' ? args.end_line : undefined
          return await ws.readFile(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.path ?? ''),
            typeof args.max_bytes === 'number' ? args.max_bytes : undefined,
            {
              numbered: numbered || undefined,
              start_line: startLine,
              end_line: endLine,
            },
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_write',
      category: '工作区',
      description: '新建/覆盖文本首选（优先于 shell 重定向/heredoc）；覆盖前需用户确认（可设 sticky）；小改动请用 workspace_replace_lines',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC },
        content: { type: 'string', description: 'UTF-8 文本内容' },
      }, ['path', 'content']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.writeFile(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.path ?? ''),
            String(args.content ?? ''),
            b.confirm,
          )
        } catch (err) {
          if (err instanceof ConfirmationRequiredError) return formatConfirmationResult(err)
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_replace_lines',
      category: '工作区',
      description:
        '改已有文件首选（优先于 sed/awk）：① 按 1-based 行号批量替换（edits，对接 code_preflight L 行号）；② 或精确字符串替换（old_string/new_string/replace_all）。二者择一；校验通过后原子写入；禁止整文件 workspace_write，禁止用 shell 改文件',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC + '；文件须已存在' },
        edits: {
          type: 'array',
          description:
            '行号替换列表（≤40）：start_line 必填；end_line 含尾默认=start_line；new_text 替换内容（"" 删除）；expect_text 可选防漂移。与 old_string 二选一',
          items: {
            type: 'object',
            properties: {
              start_line: { type: 'number', description: '1-based 起始行' },
              end_line: { type: 'number', description: '1-based 结束行（含），默认=start_line' },
              new_text: { type: 'string', description: '替换文本；空串删除该行段' },
              expect_text: { type: 'string', description: '可选：当前行段原文，不一致则整批失败' },
            },
            required: ['start_line', 'new_text'],
          },
        },
        old_string: {
          type: 'string',
          description: '精确替换：在文件中定位的原文片段（须唯一，除非 replace_all=true）',
        },
        new_string: {
          type: 'string',
          description: '精确替换：替换为的新文本（可与 old_string 同用；缺省视为空串）',
        },
        replace_all: {
          type: 'boolean',
          description: '精确替换：为 true 时替换全部匹配；默认 false 且要求恰好一处',
          default: false,
        },
      }, ['path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const rootId = String(args.root_id ?? 'default')
          const relPath = String(args.path ?? '')
          const oldString = args.old_string == null ? undefined : String(args.old_string)
          if (oldString != null && oldString.length > 0) {
            return await ws.replaceExact(
              b.sessionId,
              rootId,
              relPath,
              oldString,
              args.new_string == null ? '' : String(args.new_string),
              {
                replace_all: args.replace_all === true || args.replace_all === 'true',
              },
            )
          }
          const rawEdits = Array.isArray(args.edits) ? args.edits : []
          if (!rawEdits.length) {
            return {
              error: '请提供 edits（行号替换）或 old_string（精确替换）',
            }
          }
          const edits = rawEdits.map((item) => {
            const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
            return {
              start_line: typeof row.start_line === 'number' ? row.start_line : Number(row.start_line),
              end_line: row.end_line == null
                ? undefined
                : (typeof row.end_line === 'number' ? row.end_line : Number(row.end_line)),
              new_text: row.new_text == null ? '' : String(row.new_text),
              expect_text: row.expect_text == null ? undefined : String(row.expect_text),
            }
          })
          return await ws.replaceLines(
            b.sessionId,
            rootId,
            relPath,
            edits,
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_apply_patch',
      category: '工作区',
      description:
        '多文件补丁首选（优先于 shell 批量改文件）：应用 OpenCode 风格统一补丁（*** Begin Patch … *** End Patch）；支持 Add/Update/Delete；路径须在授权 root 内；Update 按上下文 hunk 匹配',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        patch: {
          type: 'string',
          description:
            '补丁全文，含 *** Begin Patch / *** Add File:|*** Update File:|*** Delete File: / *** End Patch',
        },
      }, ['patch']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.applyPatch(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.patch ?? ''),
            b.confirm,
          )
        } catch (err) {
          if (err instanceof ConfirmationRequiredError) return formatConfirmationResult(err)
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_delete',
      category: '工作区',
      description: '删除授权工作区内的文件或目录；删除前需用户确认（可设 sticky）',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC },
      }, ['path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.deletePath(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.path ?? ''),
            b.confirm,
          )
        } catch (err) {
          if (err instanceof ConfirmationRequiredError) return formatConfirmationResult(err)
          return toolError(err)
        }
      },
    },
    {
      name: 'download_file',
      category: '工作区',
      description: '从 http(s) URL 流式下载大文件到授权工作区；覆盖已有文件需确认',
      parameters: S({
        url: { type: 'string', description: 'http 或 https URL' },
        root_id: { type: 'string', description: '目标工作区 root_id' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC + '；保存位置' },
        method: { type: 'string', description: 'HTTP 方法，默认 GET' },
        headers: { type: 'object', description: '可选请求头' },
        timeout_ms: { type: 'number', description: '超时毫秒，默认 120000' },
      }, ['url', 'path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.downloadFile(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.path ?? ''),
            String(args.url ?? ''),
            {
              method: args.method != null ? String(args.method) : undefined,
              headers: parseHeaders(args.headers),
              timeout_ms: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
              signal: b.signal,
              confirm: b.confirm,
            },
          )
        } catch (err) {
          if (err instanceof ConfirmationRequiredError) return formatConfirmationResult(err)
          return toolError(err)
        }
      },
    },
    {
      name: 'http_fetch',
      category: '工作区',
      description: '受控 HTTP 请求（http/https）；响应进入上下文时自动截断；禁止内网/本地地址',
      parameters: S({
        method: { type: 'string', description: 'HTTP 方法，默认 GET' },
        url: { type: 'string', description: '目标 URL' },
        headers: { type: 'object', description: '请求头' },
        query: { type: 'object', description: '查询参数' },
        body: { type: 'string', description: '请求体' },
        body_encoding: { type: 'string', description: 'utf8 | base64' },
        timeout_ms: { type: 'number', description: '超时毫秒' },
        follow_redirects: { type: 'boolean', description: '是否跟随重定向，默认 true' },
        max_redirects: { type: 'number', description: '最大重定向次数' },
        response_type: { type: 'string', description: 'text | json | bytes_meta' },
        max_response_bytes: { type: 'number', description: '响应截断上限，默认约 1.5MB' },
      }, ['url']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const enc = String(args.body_encoding ?? 'utf8')
          const bodyEncoding = enc === 'base64' ? 'base64' as const : 'utf8' as const
          const rt = String(args.response_type ?? 'text')
          const responseType = rt === 'json' ? 'json' as const
            : rt === 'bytes_meta' ? 'bytes_meta' as const
              : 'text' as const
          return await ws.httpFetch({
            method: args.method != null ? String(args.method) : undefined,
            url: String(args.url ?? ''),
            headers: parseHeaders(args.headers),
            query: parseQuery(args.query),
            body: args.body != null ? String(args.body) : undefined,
            body_encoding: bodyEncoding,
            timeout_ms: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
            follow_redirects: args.follow_redirects !== false,
            max_redirects: typeof args.max_redirects === 'number' ? args.max_redirects : undefined,
            response_type: responseType,
            max_response_bytes: typeof args.max_response_bytes === 'number'
              ? args.max_response_bytes
              : undefined,
            signal: b.signal,
            sessionId: b.sessionId,
          })
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'request_folder_access',
      category: '工作区',
      description: '请求用户授权额外文件夹（只读或读写）；实际授权由用户在界面完成，调用后提示用户操作',
      parameters: S({
        mode: { type: 'string', description: 'ro 只读 | rw 读写，默认 ro' },
        hint: { type: 'string', description: '向用户说明为何需要访问' },
      }),
      handler: async (args) => {
        try {
          requireBridge()
          const mode = String(args.mode ?? 'ro') === 'rw' ? 'rw' : 'ro'
          return {
            ok: false,
            awaiting_user_grant: true,
            mode,
            hint: String(args.hint ?? '请在聊天侧点击「授权文件夹」并选择目录'),
            message: '请用户在界面中选择要授权的文件夹；授权完成后可调用 list_workspace_grants 查看 root_id',
          }
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'list_workspace_grants',
      category: '工作区',
      description:
        '列出当前对话已授权的工作区（本对话工作区 + 额外授权）；用户问可访问哪些目录时首选。成功后勿反复调用；用返回的 root_id + 相对 path（勿抄 abs_path）',
      parameters: S({}),
      handler: async () => {
        try {
          const b = requireBridge()
          const grants = await ws.listGrants(b.sessionId)
          return summarizeWorkspaceGrants(grants)
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'resolve_workspace_path_uri',
      category: '工作区',
      description:
        '将已授权工作区内的相对路径解析为消息可用的 opptrix-ws:// URI（图片/视频/音频/文件引用）；不返回本机绝对路径',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id（default / shared / grant_*）' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC },
      }, ['root_id', 'path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const rootId = String(args.root_id ?? '').trim()
          const relRaw = String(args.path ?? '').trim()
          if (!isValidOpptrixWsRootId(rootId)) {
            return {
              ok: false,
              error: 'root_id 无效（仅允许 default、shared 或 grant_*）',
            }
          }
          const norm = normalizeOpptrixWsRelPath(relRaw)
          if (!norm.ok) {
            return { ok: false, error: norm.reason }
          }
          await ws.ensureDefaultRoot(b.sessionId)
          const grants = await ws.listGrants(b.sessionId)
          if (!grants.some(g => g.root_id === rootId)) {
            return {
              ok: false,
              error: '未授权访问该工作区',
              root_id: rootId,
              path: norm.path,
            }
          }
          const uri = buildOpptrixWsUri(rootId, norm.path)
          const { exists } = await ws.probeReadablePath(b.sessionId, rootId, norm.path)
          return {
            ok: true,
            uri,
            root_id: rootId,
            path: norm.path,
            exists,
            kind_hint: hintOpptrixWsKind(norm.path),
            note: exists
              ? '可在消息中直接使用该 uri 引用文件'
              : '路径已授权且合法，但当前尚无该文件；写出后再引用即可',
          }
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'shell_platform_status',
      category: '工作区',
      description: '检查系统隔离环境是否可用（运行 python/node 命令前可先调用）',
      parameters: S({}),
      handler: async () => {
        try {
          requireBridge()
          return await ws.shellPlatformStatus()
        } catch (err) {
          return toolError(err)
        }
      },
    },
    ...(() => {
      const opptrixRunParams = S({
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        cwd: {
          type: 'string',
          description:
            PATH_REL_PARAM_DESC
            + '；工作目录，默认该 root 根目录（勿填 abs_path）。'
            + '注意：子进程 HOME=grant 根，cwd=本字段；~ ≠ cwd，脚本勿用 ~/ 当相对 cwd',
        },
        command: {
          type: 'string',
          description:
            '要运行的命令字符串（真 shell）；在隔离环境中执行，仅限已授权文件夹。'
            + '路径相对 cwd/grant；禁硬编码宿主绝对路径。python/node/npm/pip 会自动改写到当前运行时（含管道/&&）',
        },
        argv: {
          type: 'array',
          description: '已弃用：无 command 时自动拼接为 command；请改用 command',
          items: { type: 'string' },
        },
        timeout_ms: {
          type: 'number',
          description: '超时毫秒；同步默认 120000；background 时为墙钟上限（默认/最大约 30 分钟）',
        },
        background: {
          type: 'boolean',
          description:
            'true：后台执行并立即返回 job_id（不堵对话）；长命令推荐；系统自动挂起并结束后续跑',
        },
        network_intent: { type: 'string', description: 'none | install（可选提示）；包源网络默认已放行' },
        escalate: {
          type: 'string',
          description: 'none | unsandboxed；出隔离环境运行须每次确认，不会对本对话一律放行',
        },
        secret_refs: {
          type: 'array',
          description:
            '引用保险箱密钥（仅名字）：[{name, env?, inject_hosts?}]；子进程读到 sentinel，出站由代理替换；须先 request_secret / grant_session_secret',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              env: { type: 'string' },
              inject_hosts: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      }, [])
      const opptrixRunHandler = async (args: Record<string, unknown>) => {
        try {
          const b = requireBridge()
          const commandRaw = args.command != null ? String(args.command) : ''
          const argv = parseArgv(args.argv)
          if (!commandRaw.trim() && !argv.length) {
            return { error: '请提供 command（推荐），或兼容传入 argv' }
          }
          const intentRaw = String(args.network_intent ?? 'none')
          const networkIntent = intentRaw === 'install' ? 'install' as const : 'none' as const
          const escalateRaw = String(args.escalate ?? 'none').toLowerCase()
          const escalate = escalateRaw === 'unsandboxed' ? 'unsandboxed' as const : 'none' as const
          const background = args.background === true || args.background === 'true'
          return await ws.shellRun({
            sessionId: b.sessionId,
            rootId: String(args.root_id ?? 'default'),
            cwdRel: args.cwd != null ? String(args.cwd) : '',
            command: commandRaw.trim() || undefined,
            argv: argv.length ? argv : undefined,
            timeoutMs: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
            networkIntent,
            escalate,
            background,
            signal: b.signal,
            secret_refs: parseSecretRefs(args.secret_refs),
          }, b.confirm)
        } catch (err) {
          return handleShellError(err)
        }
      }
      // 主路径仅暴露 opptrix_run；shell_run / opptrix_install / request_shell_network 不再进入聊天 tools
      return [
        {
          name: 'opptrix_run',
          category: '工作区',
          description:
            '在隔离环境中运行任意命令（command 字符串；仅限已授权文件夹；会话级隔离复用）。'
            + 'HOME=grant 根、cwd=cwdRel；路径相对 cwd/grant，禁宿主绝对路径与用 ~/ 当相对 cwd。'
            + '包源默认已放行；其它域名运行时确认或看 suggested_escalate。短命令直接调用；长命令传 background=true 立即返回 job_id。'
            + '硬禁：勿用 cat/head/tail/sed/awk/echo>/heredoc 读或改文件内容（改用 workspace_*）；找搜优先 workspace_glob/grep。测网站延迟优先 http_fetch',
          parameters: opptrixRunParams,
          handler: opptrixRunHandler,
        },
      ]
    })(),
    {
      name: 'code_preflight',
      category: '工作区',
      description:
        '检查授权工作区内脚本并一次返回全部 findings（diagnostics，尽量带 line；errors/warnings 前缀 L{line}:）：默认 L0+L1。写自定义脚本后先调用；按行号用 workspace_replace_lines 定点修，再 preflight，通过后 opptrix_run',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        path: { type: 'string', description: PATH_REL_PARAM_DESC + '（必填）' },
        language: {
          type: 'string',
          description: 'auto | python | javascript | typescript，默认 auto',
        },
        levels: {
          type: 'array',
          description: '检查级别：默认 ["l0","l1"]；可显式 ["l0"] 仅跑 L0',
          items: { type: 'string' },
        },
      }, ['path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const levelsRaw = Array.isArray(args.levels) ? args.levels.map(v => String(v)) : []
          const levels = !levelsRaw.length
            ? (['l0', 'l1'] as const)
            : levelsRaw.includes('l1')
              ? (['l0', 'l1'] as const)
              : (['l0'] as const)
          const langRaw = String(args.language ?? 'auto').toLowerCase()
          const language = langRaw === 'python' || langRaw === 'javascript' || langRaw === 'typescript'
            ? langRaw
            : 'auto' as const
          return await ws.codePreflight({
            sessionId: b.sessionId,
            rootId: String(args.root_id ?? 'default'),
            path: String(args.path ?? ''),
            language,
            levels: [...levels],
            signal: b.signal,
          })
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'python_env_status',
      category: '工作区',
      description:
        '查看当前优先 Python（系统或 Opptrix 托管之一）是否就绪；opptrix_run 的 command 请用 python/pip 字面量，勿手写绝对路径',
      parameters: S({}),
      handler: async () => {
        try {
          requireBridge()
          return await ws.pythonEnvStatus()
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'ensure_python',
      category: '工作区',
      description:
        '失败/装修兜底：仅当用户明确要装/修 Python，或 opptrix_run(python/pip) 因未就绪失败时再调用；禁止作为编程第一步。未就绪立即 preparing/installing+job_id（通常自动挂起并终态续跑）；已就绪同步返回 ready',
      parameters: S({
        job_id: {
          type: 'string',
          description: '轮询用：上次返回 status=preparing|installing 时的 job_id',
        },
      }),
      handler: async (args) => {
        try {
          requireBridge()
          const jobId = String(args.job_id ?? '').trim()
          return await ws.ensurePython(jobId ? { jobId } : undefined)
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'list_local_data_apis',
      category: '工作区',
      description: '列出本地/标准层数据 API 索引（按分类）；详情用 get_local_data_catalog',
      parameters: S({
        category: {
          type: 'string',
          description:
            '可选：instrument_standard | agent_tools | hub_features | shared_packages | fuyao_dump | workspace_fs',
        },
      }),
      handler: async (args) => {
        try {
          requireBridge()
          return listLocalDataApis({
            category: args.category != null ? String(args.category) : undefined,
          })
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'get_local_data_catalog',
      category: '工作区',
      description: '按 api_id 获取本地数据 API 的调用方式、参数与示例',
      parameters: S({
        api_id: { type: 'string', description: '来自 list_local_data_apis 的 api_id' },
        include_examples: { type: 'boolean', description: '是否含示例，默认 true' },
      }, ['api_id']),
      handler: async (args) => {
        try {
          requireBridge()
          return getLocalDataCatalog({
            api_id: String(args.api_id ?? ''),
            include_examples: args.include_examples !== false,
          })
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'prepare_fuyao_dump',
      category: '工作区',
      description:
        '服务端鉴权下载扶摇 Parquet 到公共区 shared/data/dumps，或返回短时效 URL；冷下载立即返回 preparing+job_id，系统通常自动挂起并终态续跑；无 job 事件时才 schedule_turn_wake（禁止传 job_id）；禁止把密钥注入沙盒，勿引导 sync/dailyDump',
      parameters: S({
        dump_kind: {
          type: 'string',
          description: 'full | incremental | adjustment_factors（轮询时可选，若提供须与 job 一致）',
        },
        mode: {
          type: 'string',
          description: 'local_path（默认，落盘 shared）| presigned_url',
        },
        force_refresh: { type: 'boolean', description: '忽略缓存强制重下' },
        job_id: {
          type: 'string',
          description: '轮询用：上次返回 status=preparing 时的 job_id',
        },
      }),
      handler: async (args) => {
        try {
          requireBridge()
          const jobIdRaw = String(args.job_id ?? '').trim()
          if (jobIdRaw) {
            const polled = await prepareFuyaoDumpForAgentAsync({
              dumpKind: 'incremental',
              destDir: sharedDumpsDir(),
              jobId: jobIdRaw,
            })
            if (polled.status === 'preparing') {
              return {
                ok: true,
                status: 'preparing',
                job_id: polled.job_id,
                dump_kind: polled.dump_kind,
                percent: polled.percent,
                message: polled.message,
                eta_seconds: polled.eta_seconds,
                suggested_wake_seconds: polled.suggested_wake_seconds,
                async_hint: polled.async_hint,
                poll_hint: polled.poll_hint,
                sandbox_hint: polled.sandbox_hint,
              }
            }
            if (!polled.ok || polled.status === 'failed') {
              return {
                ok: false,
                status: 'failed',
                job_id: polled.job_id,
                dump_kind: polled.dump_kind,
                error: polled.error,
                sandbox_hint: polled.sandbox_hint,
              }
            }
            return formatReadyFuyaoDumpResult(polled)
          }

          const kindRaw = String(args.dump_kind ?? '').trim()
          const kind: FuyaoDumpKind | null =
            kindRaw === 'full' || kindRaw === 'incremental' || kindRaw === 'adjustment_factors'
              ? kindRaw
              : null
          if (!kind) {
            return { error: 'dump_kind 须为 full | incremental | adjustment_factors（或提供 job_id 轮询）' }
          }
          const modeRaw = String(args.mode ?? 'local_path').trim()
          const mode: FuyaoDumpMode =
            modeRaw === 'presigned_url' ? 'presigned_url' : 'local_path'
          const result = await prepareFuyaoDumpForAgentAsync({
            dumpKind: kind,
            mode,
            forceRefresh: Boolean(args.force_refresh),
            destDir: sharedDumpsDir(),
          })
          if (result.status === 'preparing') {
            return {
              ok: true,
              status: 'preparing',
              job_id: result.job_id,
              dump_kind: result.dump_kind,
              percent: result.percent,
              message: result.message,
              eta_seconds: result.eta_seconds,
              suggested_wake_seconds: result.suggested_wake_seconds,
              async_hint: result.async_hint,
              poll_hint: result.poll_hint,
              sandbox_hint: result.sandbox_hint,
            }
          }
          if (!result.ok || result.status === 'failed') {
            return {
              ok: false,
              status: 'failed',
              dump_kind: result.dump_kind,
              error: result.error,
              sandbox_hint: result.sandbox_hint,
            }
          }
          return formatReadyFuyaoDumpResult(result)
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'request_session_lan_access',
      category: '工作区',
      description: '本对话申请局域网访问（内部 ask_user）；可覆盖全局关闭局域网',
      parameters: S({
        reason: { type: 'string', description: '向用户说明为何需要局域网（可选）' },
      }),
      handler: async (args) => {
        try {
          const b = requireBridge()
          if (!b.askUser) {
            return {
              needs_ask_user: true,
              ask_user_args: {
                title: '局域网访问',
                prompt: String(args.reason ?? '').trim()
                  || '本对话需要访问局域网地址（如 NAS、内网 API）。是否允许？仅对本对话生效。',
                options: SESSION_LAN_ASK_OPTIONS.map(o => ({ id: o.id, label: o.label })),
              },
              message: '请调用 ask_user 使用上方选项；选择 allow_lan_session 后本对话可访问局域网。',
            }
          }
          const answer = await b.askUser({
            title: '局域网访问',
            prompt: String(args.reason ?? '').trim()
              || '本对话需要访问局域网地址（如 NAS、内网 API）。是否允许？仅对本对话生效。',
            options: SESSION_LAN_ASK_OPTIONS.map(o => ({ id: o.id, label: o.label })),
          })
          const lan = applySessionLanAskChoice(b.sessionId, answer.selected_ids)
          return {
            ok: true,
            ...answer,
            lan_granted: lan.granted,
            message: lan.granted
              ? '本对话已允许局域网；具体域名访问仍可能需出站确认'
              : '用户未允许本对话局域网访问',
          }
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'request_secret',
      category: '工作区',
      description:
        '安全录入第三方密钥到用户保险箱（密码框）；明文永不进对话/模型。编程需密钥时必须用此工具，禁止 ask_user/聊天粘贴',
      parameters: S({
        name: {
          type: 'string',
          description: '保险箱条目名，建议大写蛇形如 OPENAI_API_KEY、WEBHOOK_SECRET',
        },
        reason: {
          type: 'string',
          description: '面向用户的说明：为何需要、将用于何处',
        },
        inject_hosts: {
          type: 'array',
          description: '出站时可替换 sentinel 的目标域名，如 ["api.openai.com"]',
          items: { type: 'string' },
        },
        overwrite: {
          type: 'boolean',
          description: '同名已存在时是否覆盖；默认 false，需用户确认后再以 overwrite=true 重试',
        },
      }, ['name', 'reason']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const name = normalizeVaultSecretName(args.name)
          if (!name) return { error: 'name 不能为空' }
          const reason = String(args.reason ?? '').trim()
          if (!reason) return { error: 'reason 不能为空' }
          const injectHosts = parseInjectHostsArg(args.inject_hosts)
          const overwrite = args.overwrite === true
          const vault = getUserDataStore().agentVault

          if (vault.has(name) && !overwrite) {
            return {
              exists: true,
              need_overwrite: true,
              name,
              message: `保险箱已有「${name}」。若用户确认覆盖，请以 overwrite=true 重试；或用 grant_session_secret 授权本对话使用已有条目。`,
            }
          }

          if (!b.askSecret) {
            return {
              error: '当前会话不支持安全录入面板，请升级客户端后重试',
            }
          }

          const answer = await b.askSecret({
            title: '存入密钥保险箱',
            prompt: reason,
            name,
            inject_hosts: injectHosts,
          })

          if (answer.cancelled || answer.selected_ids.includes('cancel')) {
            return { ok: false, cancelled: true, name, message: '用户已取消录入' }
          }

          // 服务端已写 vault + grant；工具结果永不含明文
          return {
            ok: true,
            name: answer.name ?? name,
            saved: answer.saved === true,
            session_granted: answer.session_granted === true,
          }
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'list_vault_secrets',
      category: '工作区',
      description: '列出保险箱密钥名称与末位提示（无明文）；编程前先查是否已有条目',
      parameters: S({}),
      handler: async () => {
        try {
          requireBridge()
          const secrets = getUserDataStore().agentVault.listSecrets().map(s => ({
            name: s.name,
            hint: s.hint,
            updated_at: s.updatedAt,
            inject_hosts: s.injectHosts,
          }))
          return { ok: true, secrets, count: secrets.length }
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'grant_session_secret',
      category: '工作区',
      description: '对本对话授权使用保险箱中已有密钥（需用户确认）；不重新录入明文',
      parameters: S({
        name: { type: 'string', description: '保险箱条目名' },
        reason: { type: 'string', description: '向用户说明本对话为何需要使用该密钥（可选）' },
      }, ['name']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const name = normalizeVaultSecretName(args.name)
          if (!name) return { error: 'name 不能为空' }
          const vault = getUserDataStore().agentVault
          if (!vault.has(name)) {
            return {
              error: `保险箱中没有「${name}」。请先 request_secret 写入。`,
              missing: true,
            }
          }
          if (getSessionSecretAccessStore().has(b.sessionId, name)) {
            return { ok: true, name, session_granted: true, already: true }
          }
          if (!b.askUser) {
            return {
              needs_ask_user: true,
              ask_user_args: {
                title: '授权使用密钥',
                prompt: String(args.reason ?? '').trim()
                  || `是否允许本对话使用保险箱中的「${name}」？仅对本对话生效，不会展示密钥内容。`,
                options: SESSION_SECRET_GRANT_ASK_OPTIONS.map(o => ({ id: o.id, label: o.label })),
              },
            }
          }
          const answer = await b.askUser({
            title: '授权使用密钥',
            prompt: String(args.reason ?? '').trim()
              || `是否允许本对话使用保险箱中的「${name}」？仅对本对话生效，不会展示密钥内容。`,
            options: SESSION_SECRET_GRANT_ASK_OPTIONS.map(o => ({ id: o.id, label: o.label })),
          })
          const granted = applySessionSecretGrantChoice(b.sessionId, name, answer.selected_ids)
          return {
            ok: true,
            name,
            session_granted: granted.granted,
            message: granted.granted
              ? `本对话已可使用「${name}」；opptrix_run 请用 secret_refs 引用名称`
              : '用户未授权本对话使用该密钥',
          }
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'revoke_session_secret',
      category: '工作区',
      description: '撤销本对话对某保险箱密钥的使用授权（不删除保险箱条目）',
      parameters: S({
        name: { type: 'string', description: '保险箱条目名' },
      }, ['name']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const name = normalizeVaultSecretName(args.name)
          if (!name) return { error: 'name 不能为空' }
          const revoked = getSessionSecretAccessStore().revoke(b.sessionId, name)
          return { ok: true, name, revoked }
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'delete_vault_secret',
      category: '工作区',
      description: '删除保险箱中的密钥条目（须用户确认；不可恢复）',
      parameters: S({
        name: { type: 'string', description: '保险箱条目名' },
      }, ['name']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const name = normalizeVaultSecretName(args.name)
          if (!name) return { error: 'name 不能为空' }
          const vault = getUserDataStore().agentVault
          if (!vault.has(name)) {
            return { ok: true, name, deleted: false, missing: true }
          }
          if (!b.askUser) {
            return {
              needs_ask_user: true,
              ask_user_args: {
                title: '删除保险箱密钥',
                prompt: `确定删除保险箱中的「${name}」吗？删除后无法恢复。`,
                options: [
                  { id: 'confirm_delete', label: '删除密钥' },
                  { id: 'cancel', label: '取消' },
                ],
              },
            }
          }
          const answer = await b.askUser({
            title: '删除保险箱密钥',
            prompt: `确定删除保险箱中的「${name}」吗？删除后无法恢复。`,
            options: [
              { id: 'confirm_delete', label: '删除密钥' },
              { id: 'cancel', label: '取消' },
            ],
          })
          if (!answer.selected_ids.includes('confirm_delete')) {
            return { ok: false, cancelled: true, name }
          }
          const deleted = vault.delete(name)
          getSessionSecretAccessStore().revoke(b.sessionId, name)
          return { ok: true, name, deleted }
        } catch (err) {
          return toolError(err)
        }
      },
    },
  ]

  return tools.map(t => ({ ...t, meta: TOOL_META[t.name] }))
}
