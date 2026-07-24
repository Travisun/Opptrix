import path from 'node:path'
import {
  ConfirmationRequiredError,
  NetworkInstallConfirmationRequiredError,
  ShellRunConfirmationRequiredError,
  getWorkspaceService,
  type ConfirmHandler,
  type WorkspaceGrant,
} from '@opptrix/agent-workspace'
import { resolveUserDataRoot } from '@opptrix/shared'
import { TOOL_META } from '../tool-meta.js'

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
}

let bridge: WorkspaceToolBridge | null = null

export function bindWorkspaceToolBridge(next: WorkspaceToolBridge | null) {
  bridge = next
}

const S = (properties: JsonSchema['properties'], required?: string[]): JsonSchema =>
  ({ type: 'object', properties, required })

function toolError(err: unknown): { error: string } {
  const message = err instanceof Error ? err.message : String(err)
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

function handleShellError(err: unknown): unknown {
  if (err instanceof ShellRunConfirmationRequiredError) {
    return formatShellRunConfirmation(err)
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

function requireBridge(): WorkspaceToolBridge {
  if (!bridge) {
    throw new Error('workspace 工具需在聊天会话中调用')
  }
  return bridge
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

/** Agent 可见 grant 摘要 — 默认工作区不暴露 ~/.opptrix 绝对路径 */
function formatGrantForAgent(grant: WorkspaceGrant): Record<string, unknown> {
  const label = grant.label ?? (grant.is_default ? '本对话工作区' : '授权文件夹')
  const base = {
    root_id: grant.root_id,
    label,
    display_name: grant.is_default ? '本对话工作区（default）' : (grant.label ?? path.basename(grant.abs_path)),
    mode: grant.mode,
    is_default: Boolean(grant.is_default),
  }
  if (grant.is_default) {
    return {
      ...base,
      path_hint: '本对话专属读写目录；使用 root_id=default 调用 workspace_* 工具',
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
    abs_path: grant.abs_path,
    path_hint: path.basename(grant.abs_path),
  }
}

function summarizeWorkspaceGrants(grants: WorkspaceGrant[]): Record<string, unknown> {
  const extra = grants.filter(g => !g.is_default)
  const summary = extra.length === 0
    ? '当前对话可访问：本对话工作区（default，读写）'
    : `当前对话可访问：本对话工作区 + ${extra.length} 个额外授权目录`
  return {
    summary,
    grants: grants.map(formatGrantForAgent),
    note: '使用 root_id 调用 workspace_list/read/write 等；需要更多目录请 request_folder_access 或请用户在界面授权',
  }
}

export function buildWorkspaceTools(): WorkspaceToolDef[] {
  const ws = getWorkspaceService()
  const tools: WorkspaceToolDef[] = [
    {
      name: 'workspace_list',
      category: '工作区',
      description: '列出授权工作区目录下的文件与子目录',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        path: { type: 'string', description: '相对路径，默认根目录' },
      }),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.listDir(
            b.sessionId,
            String(args.root_id ?? 'default'),
            args.path != null ? String(args.path) : '',
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_read',
      category: '工作区',
      description: '读取授权工作区内的文本文件（大文件自动截断）',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id' },
        path: { type: 'string', description: '相对文件路径' },
        max_bytes: { type: 'number', description: '最大读取字节，默认 2000000' },
      }, ['path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.readFile(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.path ?? ''),
            typeof args.max_bytes === 'number' ? args.max_bytes : undefined,
          )
        } catch (err) {
          return toolError(err)
        }
      },
    },
    {
      name: 'workspace_write',
      category: '工作区',
      description: '写入或覆盖授权工作区内的文本文件；覆盖前需用户确认（可设 sticky）',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id' },
        path: { type: 'string', description: '相对文件路径' },
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
      name: 'workspace_mkdir',
      category: '工作区',
      description: '在授权工作区内创建目录（含中间目录）',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id' },
        path: { type: 'string', description: '相对目录路径' },
      }, ['path']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          return await ws.mkdir(
            b.sessionId,
            String(args.root_id ?? 'default'),
            String(args.path ?? ''),
          )
        } catch (err) {
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
        path: { type: 'string', description: '相对路径' },
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
        path: { type: 'string', description: '保存相对路径' },
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
      description: '列出当前对话已授权的工作区（本对话工作区 + 额外授权）；用户问可访问哪些目录时首选',
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
    {
      name: 'shell_run',
      category: '工作区',
      description: '在系统隔离环境中运行 python/node/npm/pip 命令；只能访问已授权工作区，包须装进工作区',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id，默认 default' },
        cwd: { type: 'string', description: '相对工作目录，默认根目录' },
        argv: {
          type: 'array',
          description: '命令参数数组，如 ["python3","-c","print(1)"]；禁止 shell 管道与 sudo',
          items: { type: 'string' },
        },
        timeout_ms: { type: 'number', description: '超时毫秒，默认 120000' },
        network_intent: { type: 'string', description: 'none | install；pip/npm 安装时填 install' },
      }, ['argv']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const argv = parseArgv(args.argv)
          const intentRaw = String(args.network_intent ?? 'none')
          const networkIntent = intentRaw === 'install' ? 'install' as const : 'none' as const
          return await ws.shellRun({
            sessionId: b.sessionId,
            rootId: String(args.root_id ?? 'default'),
            cwdRel: args.cwd != null ? String(args.cwd) : '',
            argv,
            timeoutMs: typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined,
            networkIntent,
            signal: b.signal,
          }, b.confirm)
        } catch (err) {
          return handleShellError(err)
        }
      },
    },
    {
      name: 'shell_install',
      category: '工作区',
      description: '在授权工作区内安装 Python 或 Node 依赖（联网需用户确认；包装进工作区子目录）',
      parameters: S({
        root_id: { type: 'string', description: '工作区 root_id' },
        cwd: { type: 'string', description: '相对工作目录' },
        manager: { type: 'string', description: 'pip 或 npm' },
        packages: {
          type: 'array',
          description: '包名列表；npm 可留空表示按 package.json 安装',
          items: { type: 'string' },
        },
      }, ['manager']),
      handler: async (args) => {
        try {
          const b = requireBridge()
          const managerRaw = String(args.manager ?? '').toLowerCase()
          const manager = managerRaw === 'npm' ? 'npm' as const : managerRaw === 'pip' ? 'pip' as const : null
          if (!manager) {
            return { error: 'manager 须为 pip 或 npm' }
          }
          const packages = parseArgv(args.packages)
          return await ws.shellInstall({
            sessionId: b.sessionId,
            rootId: String(args.root_id ?? 'default'),
            cwdRel: args.cwd != null ? String(args.cwd) : '',
            manager,
            packages,
            signal: b.signal,
          }, b.confirm)
        } catch (err) {
          return handleShellError(err)
        }
      },
    },
  ]

  return tools.map(t => ({ ...t, meta: TOOL_META[t.name] }))
}
