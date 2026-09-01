import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { SandboxManager, type Platform, type SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'

type SandboxAskCallback = (params: { host: string; port: number | undefined }) => Promise<boolean>
import {
  NetworkEgressConfirmationRequiredError,
  NetworkInstallConfirmationRequiredError,
  ShellRunConfirmationRequiredError,
  WorkspaceError,
} from '../errors.js'
import { assertReadable, type WorkspaceGrant } from '../grants.js'
import type { ConfirmHandler } from '../service.js'
import { buildSandboxConfigFromGrants } from './config-from-grants.js'
import { applyBundledCaCertEnv, clearBundledCaCertEnv, materializeBundledCaCert } from './bundled-cacert.js'
import { resolveShellArgv } from './resolve-shell-argv.js'
import { usesElectronAsNodeArgv } from '../node/resolve-node.js'
import { getPythonSettings } from '../python-settings-store.js'
import { resolvePythonRuntime } from '../python/resolve-python.js'
import {
  getPreferredPipIndexUrlSync,
  invalidatePipMirrorCache,
  isPipMirrorNetworkFailure,
  resolvePreferredPipIndexUrl,
  rotatePreferredPipMirror,
} from '../python/pip-mirrors.js'
import {
  assertEgressHostGrantable,
  buildNeedsNetworkEgressPayload,
  detectNetworkEgressBlocked,
  isEgressHostPreAuthorized,
} from './egress-runtime.js'
import { ensureLinuxSandboxReady } from './ensure-linux-sandbox.js'
import { ensureWindowsSandboxReady } from './ensure-windows-sandbox.js'
import { getShellPlatformStatus } from './platform.js'
import { getSandboxSettings } from '../sandbox-settings-store.js'
import {
  collectSandboxFailureText,
  isRefreshableWindowsCredError,
} from './windows-elevated-retry.js'
import {
  assertUnelevatedRejectsFullNetworkIsolation,
  spawnUnelevatedRestricted,
} from './windows-unelevated/index.js'
import {
  argvToCommandString,
  assertPackageInstallPolicy,
  buildNpmInstallArgv,
  buildPipInstallArgv,
  injectPipCertArgv,
  isNetworkDiagnosticCommand,
  parseDiagnosticTargetHost,
  syncCommandStringFromManagedArgv,
} from './package-policy.js'
import {
  commandNeedsRealShell,
  resolveShellCommandInput,
  shellWrapArgv,
} from './parse-command.js'
import { resolvePosixShellPath, SPAWN_ENOENT_HINT } from './resolve-shell-bin.js'
import {
  getSessionShellRuntime,
  type SessionShellRuntime,
  type ShellIsolation,
} from './session-runtime.js'
import {
  SessionNetworkEgressStore,
  NETWORK_EGRESS_CONFIRM_OPTIONS,
  hostFromNetworkInput,
  normalizeEgressHost,
  parseNetworkEgressChoice,
} from './session-network-egress.js'
import {
  formatNetworkInstallConfirmPrompt,
  hostPatternsFromHttpsUrls,
  networkDomainsForInstallAllowed,
} from './network-policy.js'
import { getSessionSecretAccessStore } from './session-secret-access.js'
import { redactSecretsInText } from './secret-redact.js'
import {
  NetworkInstallStickyStore,
  NETWORK_INSTALL_CONFIRM_OPTIONS,
  parseNetworkInstallChoice,
} from './sticky-network.js'
import {
  summarizeShellArgv,
} from './sticky-shell-run.js'
import type {
  ShellBackgroundStartResult,
  ShellInstallParams,
  ShellPlatformStatus,
  ShellPythonRuntimeInfo,
  ShellRunParams,
  ShellRunResult,
  ShellSecretRef,
} from './types.js'
import {
  clampShellBgTimeoutMs,
  clearSessionShellCommandJobs,
  isShellBgEnabled,
  shellCommandJobAsyncHint,
  startShellCommandJob,
} from './shell-command-job.js'
import { getUserDataStore } from '@opptrix/user-store'
import { resolveShellIsolationMode } from './isolation-mode.js'
import {
  resolveAgentSandboxMode,
  resolveDockerAgentDropIds,
  resolveDockerAgentIdentity,
} from '../env/docker-env.js'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_STREAM_BYTES = 200_000

const UNSANDBOXED_CONFIRM_OPTIONS = [
  { id: 'allow_once', label: '仅此一次' },
  { id: 'cancel', label: '取消' },
] as const

const SENSITIVE_ENV_KEYS = [
  /^OPPTRIX_/i,
  /^TUSHARE_/i,
  /^OPENAI_/i,
  /^ANTHROPIC_/i,
  /^AWS_/i,
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /API_KEY/i,
]

function truncateStream(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, 'utf8')
  if (buf.length <= maxBytes) return { text, truncated: false }
  return { text: buf.subarray(0, maxBytes).toString('utf8'), truncated: true }
}

function isPipShellCommand(argv: readonly string[]): boolean {
  return argv.some(token => {
    const base = path.basename(String(token)).toLowerCase()
    return base === 'pip' || base === 'pip3' || /^pip3\.\d+$/.test(base)
  }) || argv.some((token, i) => {
    const t = String(token).toLowerCase()
    return t === '-m' && String(argv[i + 1] ?? '').toLowerCase() === 'pip'
  })
}

function shouldInvalidatePipMirrorCache(
  argv: readonly string[],
  exitCode: number | null,
  stderr: string,
): boolean {
  if (exitCode === 0) return false
  if (!isPipShellCommand(argv)) return false
  return isPipMirrorNetworkFailure(stderr)
}

/**
 * 将 active Python bin 目录前置到 PATH，并把 PIP_TARGET 注入 PYTHONPATH。
 * 导出供单测；生产路径由 sanitizeChildEnv 调用。
 */
export function applyPythonRuntimeToChildEnv(
  env: NodeJS.ProcessEnv,
  opts: { activePath: string | null; pipTarget: string },
): void {
  if (!opts.activePath) return
  const binDir = path.dirname(opts.activePath)
  const existingPath = env.PATH ?? env.Path ?? ''
  env.PATH = existingPath
    ? `${binDir}${path.delimiter}${existingPath}`
    : binDir
  if (process.platform === 'win32') {
    env.Path = env.PATH
  }
  const existingPythonPath = env.PYTHONPATH ?? ''
  env.PYTHONPATH = existingPythonPath
    ? `${opts.pipTarget}${path.delimiter}${existingPythonPath}`
    : opts.pipTarget
  env.PYTHONNOUSERSITE = '1'
}

/**
 * 强制子进程 UTF-8 相关环境（Python + 合理 LANG 兜底）。
 * 导出供单测；不削弱 SRT / 不改沙盒策略。
 */
export function applyUtf8ChildEnv(env: NodeJS.ProcessEnv): void {
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUTF8 = '1'
  const lang = env.LANG ?? ''
  const lcAll = env.LC_ALL ?? ''
  const hasUtf8 = /utf-?8/i.test(lang) || /utf-?8/i.test(lcAll)
  if (!hasUtf8) {
    if (!lcAll) env.LC_ALL = 'C.UTF-8'
    if (!lang) env.LANG = 'C.UTF-8'
  }
}

function chunkToUtf8(chunk: Buffer | string): string {
  if (typeof chunk === 'string') return chunk
  return Buffer.isBuffer(chunk) ? chunk.toString('utf8') : Buffer.from(chunk).toString('utf8')
}

/** spawn 前确认 cwd 为已存在目录；结构化错误，避免裸 ENOENT */
function assertCwdDirectoryExists(cwdAbs: string, cwdRel: string): void {
  const label = cwdRel.trim() || '.'
  let st: fs.Stats
  try {
    st = fs.statSync(cwdAbs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw new WorkspaceError(
        `工作目录不存在（cwd=${label}）。请先相对 root 创建目录（如 mkdir -p …），或改用已有相对路径；勿使用绝对路径或 ~。`,
      )
    }
    throw err
  }
  if (!st.isDirectory()) {
    throw new WorkspaceError(
      `工作目录不是目录（cwd=${label}）。请指向相对 root 的已有目录，或先 mkdir 创建。`,
    )
  }
}

const SHELL_PATH_NOTE =
  'HOME=grant 根；cwd=cwdRel（相对 root）；~ ≠ cwd；脚本勿用 ~/ 当相对 cwd。'

const WORKSPACE_PATH_NOTE =
  '命令在已授权工作区内运行（容器 + 工作区边界）；HOME=grant 根；仅限已授权工作区路径。'

const SYSTEM_FREE_PATH_NOTE =
  '命令在容器内以受限用户运行（shell/node/npm/python 可用）；无法读写 private 库与 system 槽位；'
  + '持久化请写入 workspace / mounts（或旧版 /data/mounts）。'

async function sanitizeChildEnv(
  base: NodeJS.ProcessEnv,
  cwdAbs: string,
  grantRootAbs: string,
  electronRunAsNode: boolean,
  systemFree = false,
): Promise<NodeJS.ProcessEnv> {
  const out: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (value == null) continue
    if (SENSITIVE_ENV_KEYS.some(re => re.test(key))) continue
    out[key] = value
  }
  out.PWD = cwdAbs
  const agentDrop = resolveDockerAgentDropIds() != null
  const agentIdentity = resolveDockerAgentIdentity()
  if (systemFree) {
    // 自由编程：保留系统 PATH；有 DAC 降权时 HOME 仍落在 grant，避免写到 root home
    if (base.PATH) out.PATH = base.PATH
    if (agentDrop) {
      out.HOME = grantRootAbs
      out.USERPROFILE = grantRootAbs
    } else {
      if (base.HOME) out.HOME = base.HOME
      if (base.USERPROFILE) out.USERPROFILE = base.USERPROFILE
    }
  } else {
    out.HOME = grantRootAbs
    out.USERPROFILE = grantRootAbs
  }
  if (agentIdentity && agentDrop) {
    out.USER = agentIdentity.user
    out.LOGNAME = agentIdentity.user
  }
  const pipTarget = path.join(cwdAbs, '.opptrix-packages')
  out.PIP_TARGET = pipTarget
  out.PIP_USER = '0'
  out.PIP_NO_USER = '1'
  out.npm_config_prefix = cwdAbs
  out.npm_config_global = 'false'
  out.NPM_CONFIG_GLOBAL = 'false'
  const pipUrls = getPythonSettings().pip_index_urls
  const pipMirror = getPreferredPipIndexUrlSync(pipUrls)
  if (pipMirror) {
    out.PIP_INDEX_URL = pipMirror
  }
  if (electronRunAsNode) {
    out.ELECTRON_RUN_AS_NODE = '1'
  }
  applyUtf8ChildEnv(out)
  try {
    const runtime = await resolvePythonRuntime()
    if (runtime.ready && runtime.active_path) {
      applyPythonRuntimeToChildEnv(out, {
        activePath: runtime.active_path,
        pipTarget,
      })
    }
  } catch {
    /* Python 未就绪时仍允许非 python 命令 */
  }
  const materialized = materializeBundledCaCert(grantRootAbs)
  if (materialized) {
    applyBundledCaCertEnv(out, materialized)
  } else {
    // 禁止回退包内路径（常在 denyRead(homedir) 外）→ CERTIFICATE_VERIFY_FAILED
    clearBundledCaCertEnv(out)
    applyBundledCaCertEnv(out, null)
  }
  return out
}

interface EgressRunGrants {
  onceHosts: string[]
  runWithDeniedNetwork: boolean
}

async function requireNetworkInstallConfirmation(
  sessionId: string,
  sticky: NetworkInstallStickyStore,
  egress: SessionNetworkEgressStore,
  confirm?: ConfirmHandler,
): Promise<void> {
  if (sticky.has(sessionId)) return
  if (sticky.consumePreflight(sessionId)) return
  const pipIndexUrls = getPythonSettings().pip_index_urls
  const preferredHosts = hostPatternsFromHttpsUrls(pipIndexUrls)
  const installDomains = networkDomainsForInstallAllowed(pipIndexUrls)
  const prompt = formatNetworkInstallConfirmPrompt(installDomains, 8, preferredHosts)
  const payload = {
    kind: 'network_install' as const,
    title: '允许联网安装',
    prompt,
    options: [...NETWORK_INSTALL_CONFIRM_OPTIONS],
  }
  if (!confirm) {
    throw new NetworkInstallConfirmationRequiredError(payload)
  }
  const answer = await confirm({
    title: payload.title,
    prompt: payload.prompt,
    options: payload.options,
    operation: 'overwrite',
    root_id: 'default',
    path: '',
  })
  const choice = parseNetworkInstallChoice(answer.selected_ids)
  if (choice === 'cancel') throw new WorkspaceError('用户已取消联网安装')
  if (choice === 'sticky') sticky.grant(sessionId)
}

export type NetworkInstallPreflightResult = {
  ok: boolean
  already_granted?: boolean
  sticky?: boolean
  once_confirmed?: boolean
  domains?: string[]
  message: string
}

export type NetworkEgressPreflightResult = {
  ok: boolean
  granted_hosts: string[]
  once_hosts?: string[]
  message: string
}

async function confirmNetworkInstallPreflight(
  sessionId: string,
  sticky: NetworkInstallStickyStore,
  _confirm?: ConfirmHandler,
  _reason?: string,
): Promise<NetworkInstallPreflightResult> {
  const pipIndexUrls = getPythonSettings().pip_index_urls
  const installDomains = networkDomainsForInstallAllowed(pipIndexUrls)
  // 决策 2/C：包源默认已进会话 allowlist → 零确认（兼容 sticky 仍可写）
  if (!sticky.has(sessionId)) sticky.grant(sessionId)
  return {
    ok: true,
    already_granted: true,
    sticky: true,
    domains: installDomains,
    message: '包源已默认放行，无需确认联网安装',
  }
}

async function confirmNetworkEgressPreflight(
  sessionId: string,
  hosts: readonly string[],
  egress: SessionNetworkEgressStore,
  confirm?: ConfirmHandler,
  reason?: string,
): Promise<NetworkEgressPreflightResult> {
  if (!hosts.length) {
    throw new WorkspaceError('intent=egress 时须提供至少一个 hosts')
  }
  const normalized: string[] = []
  for (const raw of hosts) {
    const host = hostFromNetworkInput(String(raw ?? ''))
    if (!host) throw new WorkspaceError(`无效主机：${String(raw)}`)
    normalized.push(await assertEgressHostGrantable(host, sessionId))
  }
  const unique = [...new Set(normalized)]
  const pending = unique.filter(
    h => !isEgressHostPreAuthorized(sessionId, h, egress) && !egress.hasPreflightHost(sessionId, h),
  )
  if (!pending.length) {
    return {
      ok: true,
      granted_hosts: unique.filter(h => egress.hasHost(sessionId, h)),
      once_hosts: unique.filter(h => egress.hasPreflightHost(sessionId, h)),
      message: '所列目标已授权或已有预授权，无需再次确认',
    }
  }
  const hostList = pending.join('、')
  const prompt = [
    reason?.trim() || '命令可能需要访问以下外部目标。是否允许？',
    '',
    `目标：${hostList}`,
  ].join('\n')
  const payload = {
    kind: 'network_egress' as const,
    title: '允许访问外部目标',
    prompt,
    target_host: pending[0],
    options: [...NETWORK_EGRESS_CONFIRM_OPTIONS],
  }
  if (!confirm) {
    throw new NetworkEgressConfirmationRequiredError(payload)
  }
  const answer = await confirm({
    title: payload.title,
    prompt: payload.prompt,
    options: payload.options,
    operation: 'overwrite',
    root_id: 'default',
    path: '',
  })
  const choice = parseNetworkEgressChoice(answer.selected_ids)
  if (choice === 'cancel') throw new WorkspaceError('用户已取消外网访问')
  if (choice === 'allow_host_session') {
    for (const h of pending) egress.grantHost(sessionId, h)
    return {
      ok: true,
      granted_hosts: pending,
      message: `本对话已允许访问：${hostList}`,
    }
  }
  for (const h of pending) egress.grantPreflightHost(sessionId, h)
  return {
    ok: true,
    granted_hosts: [],
    once_hosts: pending,
    message: `已预授权一次访问：${hostList}；随后 opptrix_run 将跳过这些目标的出站确认`,
  }
}

async function assertDiagnosticTargetAllowed(host: string, sessionId: string): Promise<string> {
  return assertEgressHostGrantable(host, sessionId)
}

function appendDiagnosticFallbackHint(
  argv: readonly string[],
  exitCode: number | null,
  stdout: string,
  stderr: string,
): string {
  if (!isNetworkDiagnosticCommand([...argv]) || exitCode === 0) return stderr
  const combined = `${stdout}\n${stderr}`.toLowerCase()
  const icmpBlocked = /operation not permitted|permission denied|network is unreachable|unknown host|name or service not known|socket: operation not permitted|无法访问|不允许/.test(combined)
  if (!icmpBlocked && exitCode === 1) return stderr
  const hint = '\n\n提示：ICMP 探测可能受隔离环境限制。测网站连通性或 HTTP 延迟请改用 http_fetch 访问 https://目标主机'
  return stderr.includes('http_fetch') ? stderr : `${stderr}${hint}`
}

async function requireUnsandboxedConfirmation(
  argv: readonly string[],
  confirm?: ConfirmHandler,
): Promise<void> {
  const commandSummary = summarizeShellArgv(argv)
  const payload = {
    kind: 'unsandboxed' as const,
    title: '允许在隔离外运行',
    prompt: [
      '将在隔离环境之外运行命令（保护较弱）：',
      commandSummary,
      '',
      '仅限你已授权的文件夹；每次都需要确认，不会对本对话一律放行。',
    ].join('\n'),
    command_summary: commandSummary,
    options: [...UNSANDBOXED_CONFIRM_OPTIONS],
  }
  if (!confirm) {
    throw new ShellRunConfirmationRequiredError(payload)
  }
  const answer = await confirm({
    title: payload.title,
    prompt: payload.prompt,
    options: payload.options,
    operation: 'overwrite',
    root_id: 'default',
    path: '',
  })
  const id = answer.selected_ids[0] ?? 'cancel'
  if (id !== 'allow_once') {
    throw new WorkspaceError('用户已取消在隔离外运行')
  }
}

async function requireDiagnosticMergedConfirmation(
  sessionId: string,
  argv: readonly string[],
  targetHost: string,
  egress: SessionNetworkEgressStore,
  confirm?: ConfirmHandler,
): Promise<EgressRunGrants> {
  const normalizedTarget = await assertEgressHostGrantable(targetHost, sessionId)
  if (
    isEgressHostPreAuthorized(sessionId, normalizedTarget, egress)
    || egress.hasPreflightHost(sessionId, normalizedTarget)
  ) {
    return { onceHosts: [], runWithDeniedNetwork: false }
  }

  const commandSummary = summarizeShellArgv(argv)
  const payload = {
    kind: 'network_egress' as const,
    title: '允许访问外部目标',
    prompt: [
      '将在隔离环境中运行（仅限已授权文件夹）：',
      commandSummary,
      '',
      `测连通性需要访问外部网络（目标：${normalizedTarget}）。是否允许？`,
    ].join('\n'),
    command_summary: commandSummary,
    target_host: normalizedTarget,
    options: [...NETWORK_EGRESS_CONFIRM_OPTIONS],
  }
  if (!confirm) {
    throw new NetworkEgressConfirmationRequiredError(payload)
  }
  const answer = await confirm({
    title: payload.title,
    prompt: payload.prompt,
    options: payload.options,
    operation: 'overwrite',
    root_id: 'default',
    path: '',
  })
  return applyEgressChoice(sessionId, normalizedTarget, answer.selected_ids, egress)
}

  function applyEgressChoice(
    sessionId: string,
    targetHost: string | undefined,
    selectedIds: readonly string[],
    egress?: SessionNetworkEgressStore,
  ): EgressRunGrants {
    const choice = parseNetworkEgressChoice(selectedIds)
    if (choice === 'cancel') throw new WorkspaceError('用户已取消外网访问')
    if (!targetHost) {
      throw new WorkspaceError('未指定访问目标，无法仅允许该目标')
    }
    if (choice === 'allow_host_session') {
      egress?.grantHost(sessionId, targetHost)
      return { onceHosts: [], runWithDeniedNetwork: false }
    }
    if (choice === 'allow_host_once') {
      return { onceHosts: [targetHost], runWithDeniedNetwork: false }
    }
    throw new WorkspaceError('用户已取消外网访问')
  }

  function detectPlatformLabel(): Platform {
  if (!SandboxManager.isSupportedPlatform()) return 'unknown'
  const p = process.platform
  if (p === 'darwin') return 'macos'
  if (p === 'linux') return 'linux'
  if (p === 'win32') return 'windows'
  return 'unknown'
}

interface ResolvedSecretInjection {
  envName: string
  plainValue: string
  injectHosts: string[]
}

interface SandboxExecContext {
  sessionId: string
  /** 交给 SRT wrap 的命令字符串（可含管道等真 shell 语义） */
  commandString: string
  /** 解析/增强后的 argv（供策略与 unelevated spawn） */
  normalizedArgv: string[]
  cwdRel: string
  cwdAbs: string
  grantRootAbs: string
  config: SandboxRuntimeConfig
  timeoutMs: number
  signal?: AbortSignal
  sandboxAskCallback?: SandboxAskCallback
  secretInjections?: ResolvedSecretInjection[]
  /**
   * 仅 elevated 可开的「完整网络隔离」围栏。
   * unelevated 下若为 true → 硬拒绝（用户向文案）。
   */
  requireFullNetworkIsolation?: boolean
  sessionRuntime: SessionShellRuntime
  /** 是否用 shell 包装 argv（元字符 / 未增强路径） */
  useShellWrap: boolean
  /** 运行中 stdout/stderr 增量（后台 job 用） */
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
}

/**
 * 解析 secret_refs：校验 vault + 会话授权 + inject_hosts；返回注入计划。
 * 明文仅留在本函数返回值，供 host 注册 sentinel，勿打日志。
 */
function resolveSecretInjections(
  sessionId: string,
  refs: readonly ShellSecretRef[] | undefined,
): ResolvedSecretInjection[] {
  if (!refs?.length) return []
  const vault = getUserDataStore().agentVault
  const access = getSessionSecretAccessStore()
  const out: ResolvedSecretInjection[] = []

  for (const ref of refs) {
    const name = String(ref.name ?? '').trim()
    if (!name) {
      throw new WorkspaceError('secret_refs 中 name 不能为空')
    }
    if (!vault.has(name)) {
      throw new WorkspaceError(
        `保险箱中没有「${name}」。请先 request_secret 写入，或 list_vault_secrets 核对名称。`,
      )
    }
    if (!access.has(sessionId, name)) {
      throw new WorkspaceError(
        `本对话尚未授权使用「${name}」。请先 grant_session_secret，或重新 request_secret。`,
      )
    }
    const plain = vault.getPlain(name)
    if (plain == null || plain === '') {
      throw new WorkspaceError(`无法读取保险箱条目「${name}」`)
    }
    const meta = vault.getMeta(name)
    const fromParam = (ref.inject_hosts ?? []).map(h => String(h).trim()).filter(Boolean)
    const fromMeta = meta?.injectHosts ?? []
    const injectHosts = fromParam.length ? fromParam : fromMeta
    if (!injectHosts.length) {
      throw new WorkspaceError(
        `「${name}」缺少 inject_hosts。请在 secret_refs 中提供，或 request_secret 时指定可注入的目标域名。`,
      )
    }
    const envName = String(ref.env ?? name).trim() || name
    out.push({ envName, plainValue: plain, injectHosts })
  }
  return out
}

function createSandboxAskCallback(opts: {
  sessionId: string
  confirm?: ConfirmHandler
  sessionEgress: SessionNetworkEgressStore
  signal?: AbortSignal
  runOnceHosts: Set<string>
}): SandboxAskCallback {
  return async ({ host }) => {
    if (opts.signal?.aborted) return false
    let normalized: string
    try {
      normalized = await assertEgressHostGrantable(host, opts.sessionId)
    } catch {
      return false
    }
    if (isEgressHostPreAuthorized(opts.sessionId, normalized, opts.sessionEgress)) {
      return true
    }
    if (opts.sessionEgress.hasPreflightHost(opts.sessionId, normalized)) {
      // 本 run 已合并 preflight 到 runOnceHosts；兜底再认一次
      opts.runOnceHosts.add(normalized)
      return true
    }
    if (opts.runOnceHosts.has(normalized)) return true
    if (!opts.confirm) return false

    const payload = {
      kind: 'network_egress' as const,
      title: '允许访问外部目标',
      prompt: `命令需要访问 ${normalized}。是否允许？`,
      target_host: normalized,
      options: [...NETWORK_EGRESS_CONFIRM_OPTIONS],
    }
    try {
      const answer = await opts.confirm({
        title: payload.title,
        prompt: payload.prompt,
        options: payload.options,
        operation: 'overwrite',
        root_id: 'default',
        path: '',
      })
      if (opts.signal?.aborted) return false
      const grants = applyEgressChoice(
        opts.sessionId,
        normalized,
        answer.selected_ids,
        opts.sessionEgress,
      )
      if (grants.onceHosts.length > 0) {
        opts.runOnceHosts.add(normalized)
      }
      return true
    } catch {
      return false
    }
  }
}

/**
 * elevated：会话级 SRT 复用 + wrap（SRT LogonW 路径）。不在此 reset。
 */
async function executeSandboxOnceElevated(ctx: SandboxExecContext): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
  isolation: ShellIsolation
}> {
  await ctx.sessionRuntime.acquireFullSrt(
    ctx.sessionId,
    ctx.config,
    ctx.sandboxAskCallback,
  )

  // Prefer getSentinelRegistry().register over credentials.envVars：
  // 明文不进 process.env / child env，仅 registry + sentinel 字符串。
  const sentinelEnv: Record<string, string> = {}
  for (const inj of ctx.secretInjections ?? []) {
    const sentinel = SandboxManager.getSentinelRegistry().register(
      inj.envName,
      inj.plainValue,
      inj.injectHosts,
    )
    sentinelEnv[inj.envName] = sentinel
  }

  const posixShell =
    process.platform === 'win32' ? undefined : resolvePosixShellPath()
  const wrapped = await SandboxManager.wrapWithSandboxArgv(
    ctx.commandString,
    posixShell,
    undefined,
    ctx.signal,
    ctx.cwdAbs,
  )
  const childEnv = await sanitizeChildEnv(
    { ...process.env, ...wrapped.env },
    ctx.cwdAbs,
    ctx.grantRootAbs,
    usesElectronAsNodeArgv(ctx.normalizedArgv),
  )
  // 在 sanitize 之后写入 sentinel（SENSITIVE_ENV_KEYS 会剥真实密钥名，此处只放 fake）
  for (const [envName, sentinel] of Object.entries(sentinelEnv)) {
    childEnv[envName] = sentinel
  }
  const result = await spawnSandboxed(
    wrapped.argv,
    childEnv,
    ctx.cwdAbs,
    ctx.timeoutMs,
    ctx.signal,
    ctx.onOutput,
  )
  return { ...result, isolation: 'full' }
}

/**
 * unelevated：不初始化 SandboxManager / SRT WFP；RestrictedToken spawn + 软出站策略。
 */
async function executeSandboxOnceUnelevated(ctx: SandboxExecContext): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
  isolation: ShellIsolation
}> {
  // 硬拒绝「完整网络隔离」围栏路径（与 elevated 同等的 SRT 网络围栏）
  assertUnelevatedRejectsFullNetworkIsolation(ctx.requireFullNetworkIsolation === true)

  const childEnv = await sanitizeChildEnv(
    { ...process.env },
    ctx.cwdAbs,
    ctx.grantRootAbs,
    usesElectronAsNodeArgv(ctx.normalizedArgv),
  )
  // secrets：unelevated 无 sentinel 代理，拒绝注入明文到子进程
  if (ctx.secretInjections?.length) {
    throw new WorkspaceError('基础隔离暂不支持密钥注入，请改用完整隔离')
  }

  const spawnArgv = ctx.useShellWrap
    ? shellWrapArgv(ctx.commandString)
    : ctx.normalizedArgv

  const result = await spawnUnelevatedRestricted({
    argv: spawnArgv,
    env: childEnv,
    cwd: ctx.cwdAbs,
    timeoutMs: ctx.timeoutMs,
    signal: ctx.signal,
  })
  return { ...result, isolation: 'basic' }
}

async function refreshElevatedWindowsCredentials(): Promise<void> {
  await SandboxManager.reset()
  const ensured = await ensureWindowsSandboxReady({
    allowAutoInstall: true,
    forceRetry: true,
    isolationMode: 'elevated',
  })
  if (!ensured.ready) {
    throw new WorkspaceError(ensured.message ?? '命令隔离环境尚未就绪')
  }
}

/** elevated：凭据 1326/1312 最多 force install/rotate 一次再执行 */
async function executeSandboxOnceElevatedWithCredRetry(
  ctx: SandboxExecContext,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; isolation: ShellIsolation }> {
  let refreshed = false
  const refreshOnce = async (): Promise<boolean> => {
    if (refreshed) return false
    refreshed = true
    await refreshElevatedWindowsCredentials()
    // 凭据刷新会 reset SRT；清会话 runtime 全局态后由下次 acquire 重建
    await ctx.sessionRuntime.disposeAll()
    return true
  }

  let first: { exitCode: number | null; stdout: string; stderr: string; isolation: ShellIsolation }
  try {
    first = await executeSandboxOnceElevated(ctx)
  } catch (err) {
    if (isRefreshableWindowsCredError(err, ctx.normalizedArgv) && await refreshOnce()) {
      return executeSandboxOnceElevated(ctx)
    }
    throw err
  }

  if (first.exitCode != null && first.exitCode !== 0) {
    const text = collectSandboxFailureText(first)
    if (isRefreshableWindowsCredError(text, ctx.normalizedArgv) && await refreshOnce()) {
      return executeSandboxOnceElevated(ctx)
    }
  }
  return first
}

async function executeSandboxOnce(ctx: SandboxExecContext): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
  isolation: ShellIsolation
}> {
  const winMode = process.platform === 'win32'
    ? getSandboxSettings().windows_isolation_mode
    : 'elevated'

  if (winMode === 'unelevated') {
    return executeSandboxOnceUnelevated(ctx)
  }

  if (process.platform !== 'win32') {
    return executeSandboxOnceElevated(ctx)
  }

  return executeSandboxOnceElevatedWithCredRetry(ctx)
}

async function executeUnsandboxedOnce(ctx: {
  commandString: string
  normalizedArgv: string[]
  useShellWrap: boolean
  cwdAbs: string
  grantRootAbs: string
  timeoutMs: number
  signal?: AbortSignal
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
  /** 默认 basic（出围栏）；workspace 模式传 'workspace' */
  isolation?: ShellIsolation
  /** Docker 自托管系统级：保留容器 HOME/PATH */
  systemFree?: boolean
}): Promise<{ exitCode: number | null; stdout: string; stderr: string; isolation: ShellIsolation }> {
  const childEnv = await sanitizeChildEnv(
    { ...process.env },
    ctx.cwdAbs,
    ctx.grantRootAbs,
    usesElectronAsNodeArgv(ctx.normalizedArgv),
    ctx.systemFree === true,
  )
  const spawnArgv = ctx.useShellWrap
    ? shellWrapArgv(ctx.commandString)
    : ctx.normalizedArgv
  const result = await spawnSandboxed(
    spawnArgv,
    childEnv,
    ctx.cwdAbs,
    ctx.timeoutMs,
    ctx.signal,
    ctx.onOutput,
  )
  return { ...result, isolation: ctx.isolation ?? 'basic' }
}

export interface ShellRunnerDeps {
  listGrants: (sessionId: string) => Promise<WorkspaceGrant[]>
  gatePath: (sessionId: string, rootId: string, relPath: string) => Promise<{
    grant: WorkspaceGrant
    abs: string
  }>
  stickyNetwork: NetworkInstallStickyStore
  sessionEgress: SessionNetworkEgressStore
}

export class ShellRunner {
  private readonly sessionRuntime: SessionShellRuntime

  constructor(private readonly deps: ShellRunnerDeps) {
    this.sessionRuntime = getSessionShellRuntime()
  }

  async platformStatus(): Promise<ShellPlatformStatus> {
    return getShellPlatformStatus()
  }

  private async assertShellReady(allowAutoInstall: boolean): Promise<void> {
    if (allowAutoInstall) {
      if (process.platform === 'win32') {
        const ensured = await ensureWindowsSandboxReady({ allowAutoInstall: true })
        if (ensured.cancelled) {
          throw new WorkspaceError(ensured.message ?? '命令隔离环境尚未就绪')
        }
      } else if (process.platform === 'linux') {
        const ensured = await ensureLinuxSandboxReady({ allowAutoInstall: true })
        if (ensured.cancelled) {
          throw new WorkspaceError(ensured.message ?? '命令隔离环境尚未就绪')
        }
      }
    }
    const status = await getShellPlatformStatus()
    if (!status.ready) {
      throw new WorkspaceError(status.message)
    }
  }

  async run(
    params: ShellRunParams,
    confirm?: ConfirmHandler,
  ): Promise<ShellRunResult | ShellBackgroundStartResult> {
    const wantBackground = params.background === true
    if (wantBackground && !isShellBgEnabled()) {
      throw new WorkspaceError('后台命令已关闭。请去掉 background，或改用同步 opptrix_run。')
    }

    const resolvedInput = resolveShellCommandInput({
      command: params.command,
      argv: params.argv,
    })
    if (resolvedInput.fromLegacyArgv) {
      console.warn(
        '[agent-workspace] opptrix_run: argv 已弃用，请改用 command；本期已自动拼接兼容',
      )
    }

    const needsRealShell = commandNeedsRealShell(resolvedInput.command)
    let workingArgv = resolvedInput.argv
    const useShellWrap = needsRealShell
    let pythonRewritten = false

    // python / node / npm 能力增强（非白名单门槛）
    // 真 shell 亦须改写 argv，并最终同步到 commandString（shellWrap 执行的是字符串）
    {
      const resolved = await resolveShellArgv(workingArgv)
      workingArgv = resolved.argv
      pythonRewritten = resolved.python_rewritten
    }

    let pythonRuntimeInfo: ShellPythonRuntimeInfo | undefined
    try {
      const py = await resolvePythonRuntime()
      pythonRuntimeInfo = {
        source: py.active_source,
        version: py.active_version,
        rewritten: pythonRewritten,
      }
    } catch {
      pythonRuntimeInfo = {
        source: 'none',
        version: null,
        rewritten: pythonRewritten,
      }
    }

    const cwdRel = params.cwdRel ?? ''
    const { grant, abs: cwdAbs } = await this.deps.gatePath(
      params.sessionId,
      params.rootId,
      cwdRel,
    )
    assertReadable(grant)
    assertCwdDirectoryExists(cwdAbs, cwdRel)

    const normalizedArgv = assertPackageInstallPolicy(workingArgv, cwdAbs, grant.abs_path)

    const diagnostic = isNetworkDiagnosticCommand(normalizedArgv)
    let diagnosticTargetHost: string | undefined
    if (diagnostic) {
      const rawHost = parseDiagnosticTargetHost(normalizedArgv)
      if (!rawHost) throw new WorkspaceError('未能从命令中识别探测目标主机')
      diagnosticTargetHost = await assertDiagnosticTargetAllowed(rawHost, params.sessionId)
    }

    const escalate = params.escalate === 'unsandboxed' ? 'unsandboxed' as const : 'none' as const
    const agentSandbox = resolveAgentSandboxMode()
    const useSystemFree = agentSandbox === 'off' && escalate !== 'unsandboxed'
    if (escalate === 'unsandboxed') {
      await requireUnsandboxedConfirmation(normalizedArgv, confirm)
    }

    // workspace 默认：外网直通，不做出站授权；仅遗留 SRT 路径保留域名确认
    const isolationMode = resolveShellIsolationMode()
    const useWorkspaceIsolation = !useSystemFree
      && isolationMode === 'workspace'
      && escalate !== 'unsandboxed'

    let egressGrants: EgressRunGrants = { onceHosts: [], runWithDeniedNetwork: false }

    if (
      !useWorkspaceIsolation
      && escalate !== 'unsandboxed'
      && diagnostic
      && diagnosticTargetHost
    ) {
      egressGrants = await requireDiagnosticMergedConfirmation(
        params.sessionId,
        normalizedArgv,
        diagnosticTargetHost,
        this.deps.sessionEgress,
        confirm,
      )
    }
    // 围栏内：无「首次运行命令」总确认；workspace 外网默认放行；SRT 包源默认已含

    const timeoutMs = wantBackground
      ? clampShellBgTimeoutMs(params.timeoutMs)
      : (params.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    const started = Date.now()

    const secretInjections = escalate === 'unsandboxed'
      ? []
      : resolveSecretInjections(params.sessionId, params.secret_refs)
    if (escalate === 'unsandboxed' && params.secret_refs?.length) {
      throw new WorkspaceError('隔离外运行不支持密钥注入，请在隔离环境中使用 secret_refs')
    }
    const secretInjectHosts = [
      ...new Set(secretInjections.flatMap(s => s.injectHosts.map(h => normalizeEgressHost(h)).filter(Boolean))),
    ]
    const plainSecretsForRedact = secretInjections.map(s => s.plainValue)

    await resolvePreferredPipIndexUrl(getPythonSettings().pip_index_urls)

    // workspace / system-free 默认路径：跳过 SRT / assertShellReady；仅 srt 逃生舱走完整隔离
    if (escalate !== 'unsandboxed' && !useWorkspaceIsolation && !useSystemFree) {
      await this.assertShellReady(true)
    }

    // 决策 2：SRT 会话默认即含安装源；其它 host 仍审批。workspace 不建 SRT config
    const allowNetworkInstall = !egressGrants.runWithDeniedNetwork
    const diagnosticTargetHosts = diagnosticTargetHost && !egressGrants.runWithDeniedNetwork
      ? [diagnosticTargetHost]
      : undefined
    const sessionEgress = egressGrants.runWithDeniedNetwork
      ? undefined
      : this.deps.sessionEgress.snapshot(params.sessionId)
    const preflightEgress = egressGrants.runWithDeniedNetwork
      ? []
      : this.deps.sessionEgress.consumeAllPreflight(params.sessionId)
    const onceEgressHosts = egressGrants.runWithDeniedNetwork
      ? undefined
      : [...egressGrants.onceHosts, ...secretInjectHosts, ...preflightEgress]

    const config = useWorkspaceIsolation
      ? undefined
      : await buildSandboxConfigFromGrants({
        grants: await this.deps.listGrants(params.sessionId),
        allowNetworkInstall,
        diagnosticTargetHosts,
        sessionEgress,
        onceEgressHosts,
        sessionId: params.sessionId,
        pipIndexUrls: getPythonSettings().pip_index_urls,
      })

    const materializedCert = materializeBundledCaCert(grant.abs_path)
    // 有物化证书时始终注入 argv --cert（真 shell 亦然；env 由 sanitizeChildEnv 指向 grant 内路径）
    const execArgv = materializedCert
      ? injectPipCertArgv(normalizedArgv, materializedCert)
      : normalizedArgv
    // 真 shell 与 argv spawn：托管 python / --target / --cert 等策略改写必须反映到实际 commandString
    const execCommandString = syncCommandStringFromManagedArgv(execArgv)

    const runOnceHosts = new Set<string>(
      [...egressGrants.onceHosts, ...secretInjectHosts, ...preflightEgress]
        .map(h => normalizeEgressHost(h))
        .filter(Boolean),
    )

    const commandSummary = summarizeShellArgv(execArgv)
    const resultSandbox = escalate !== 'unsandboxed' && !useWorkspaceIsolation && !useSystemFree
    const bgIsolation: ShellIsolation = escalate === 'unsandboxed'
      ? 'basic'
      : useSystemFree
        ? 'basic'
        : useWorkspaceIsolation
          ? 'workspace'
          : 'full'
    const pathNote = useSystemFree
      ? SYSTEM_FREE_PATH_NOTE
      : useWorkspaceIsolation
        ? WORKSPACE_PATH_NOTE
        : SHELL_PATH_NOTE

    if (wantBackground) {
      const jobTitleRaw = typeof params.title === 'string'
        ? params.title.trim()
        : typeof params.name === 'string'
          ? params.name.trim()
          : ''
      const snap = startShellCommandJob({
        sessionId: params.sessionId,
        commandSummary,
        title: jobTitleRaw || undefined,
        timeoutMs,
        run: async (jobSignal, reportOutput) => {
          const linked = new AbortController()
          const onParentAbort = () => linked.abort()
          const onJobAbort = () => linked.abort()
          if (params.signal?.aborted || jobSignal.aborted) linked.abort()
          else {
            params.signal?.addEventListener('abort', onParentAbort, { once: true })
            jobSignal.addEventListener('abort', onJobAbort, { once: true })
          }
          const onOutput = (stream: 'stdout' | 'stderr', chunk: string) => {
            reportOutput(stream, redactSecretsInText(chunk, plainSecretsForRedact))
          }
          try {
            const sandboxAskCallback = useWorkspaceIsolation
              || useSystemFree
              || egressGrants.runWithDeniedNetwork
              || escalate === 'unsandboxed'
              ? undefined
              : createSandboxAskCallback({
                sessionId: params.sessionId,
                confirm,
                sessionEgress: this.deps.sessionEgress,
                signal: linked.signal,
                runOnceHosts,
              })
            let result: {
              exitCode: number | null
              stdout: string
              stderr: string
              isolation: ShellIsolation
            }
            if (escalate === 'unsandboxed') {
              result = await executeUnsandboxedOnce({
                commandString: execCommandString,
                normalizedArgv: execArgv,
                useShellWrap,
                cwdAbs,
                grantRootAbs: grant.abs_path,
                timeoutMs,
                signal: linked.signal,
                onOutput,
              })
            } else if (useSystemFree) {
              result = await executeUnsandboxedOnce({
                commandString: execCommandString,
                normalizedArgv: execArgv,
                useShellWrap,
                cwdAbs,
                grantRootAbs: grant.abs_path,
                timeoutMs,
                signal: linked.signal,
                onOutput,
                isolation: 'basic',
                systemFree: true,
              })
            } else if (useWorkspaceIsolation) {
              result = await executeUnsandboxedOnce({
                commandString: execCommandString,
                normalizedArgv: execArgv,
                useShellWrap,
                cwdAbs,
                grantRootAbs: grant.abs_path,
                timeoutMs,
                signal: linked.signal,
                onOutput,
                isolation: 'workspace',
              })
            } else {
              if (!config) {
                throw new WorkspaceError('内部错误：沙箱配置未就绪')
              }
              result = await executeSandboxOnce({
                sessionId: params.sessionId,
                commandString: execCommandString,
                normalizedArgv: execArgv,
                cwdRel,
                cwdAbs,
                grantRootAbs: grant.abs_path,
                config,
                timeoutMs,
                signal: linked.signal,
                sandboxAskCallback,
                secretInjections,
                requireFullNetworkIsolation: false,
                sessionRuntime: this.sessionRuntime,
                useShellWrap,
                onOutput,
              })
            }
            return {
              exitCode: result.exitCode,
              stdout: redactSecretsInText(result.stdout, plainSecretsForRedact),
              stderr: redactSecretsInText(result.stderr, plainSecretsForRedact),
            }
          } finally {
            params.signal?.removeEventListener('abort', onParentAbort)
            jobSignal.removeEventListener('abort', onJobAbort)
          }
        },
      })

      const eta = snap.eta_seconds ?? undefined
      const suggested = snap.suggested_wake_seconds ?? undefined
      return {
        ok: true,
        status: 'running',
        job_id: snap.job_id,
        kind: 'shell-command',
        message: snap.message,
        command_summary: snap.command_summary,
        eta_seconds: eta ?? undefined,
        suggested_wake_seconds: suggested ?? undefined,
        async_hint: shellCommandJobAsyncHint(),
        poll_hint:
          `命令后台执行中（约 ${suggested ?? eta ?? 60}s）。系统通常已自动挂起，结束后通知续跑。勿 poll/sleep 查进度。`,
        isolation: bgIsolation,
        sandbox: resultSandbox,
      }
    }

    const sandboxAskCallback = useWorkspaceIsolation
      || useSystemFree
      || egressGrants.runWithDeniedNetwork
      || escalate === 'unsandboxed'
      ? undefined
      : createSandboxAskCallback({
        sessionId: params.sessionId,
        confirm,
        sessionEgress: this.deps.sessionEgress,
        signal: params.signal,
        runOnceHosts,
      })

    let result: {
      exitCode: number | null
      stdout: string
      stderr: string
      isolation: ShellIsolation
    }

    if (escalate === 'unsandboxed') {
      result = await executeUnsandboxedOnce({
        commandString: execCommandString,
        normalizedArgv: execArgv,
        useShellWrap,
        cwdAbs,
        grantRootAbs: grant.abs_path,
        timeoutMs,
        signal: params.signal,
      })
    } else if (useSystemFree) {
      result = await executeUnsandboxedOnce({
        commandString: execCommandString,
        normalizedArgv: execArgv,
        useShellWrap,
        cwdAbs,
        grantRootAbs: grant.abs_path,
        timeoutMs,
        signal: params.signal,
        isolation: 'basic',
        systemFree: true,
      })
    } else if (useWorkspaceIsolation) {
      result = await executeUnsandboxedOnce({
        commandString: execCommandString,
        normalizedArgv: execArgv,
        useShellWrap,
        cwdAbs,
        grantRootAbs: grant.abs_path,
        timeoutMs,
        signal: params.signal,
        isolation: 'workspace',
      })
    } else {
      if (!config) {
        throw new WorkspaceError('内部错误：沙箱配置未就绪')
      }
      // spawn 不进全局大锁；仅 acquireFullSrt 内 initialize/reset 串行
      result = await executeSandboxOnce({
        sessionId: params.sessionId,
        commandString: execCommandString,
        normalizedArgv: execArgv,
        cwdRel,
        cwdAbs,
        grantRootAbs: grant.abs_path,
        config,
        timeoutMs,
        signal: params.signal,
        sandboxAskCallback,
        secretInjections,
        requireFullNetworkIsolation: false,
        sessionRuntime: this.sessionRuntime,
        useShellWrap,
      })
    }

    const stdoutRaw = redactSecretsInText(result.stdout, plainSecretsForRedact)
    const stderrRaw = redactSecretsInText(result.stderr, plainSecretsForRedact)
    const stdout = truncateStream(stdoutRaw, MAX_STREAM_BYTES)
    let stderr = truncateStream(stderrRaw, MAX_STREAM_BYTES)
    stderr = {
      ...stderr,
      text: appendDiagnosticFallbackHint(execArgv, result.exitCode, stdout.text, stderr.text),
    }

    const egressBlocked = detectNetworkEgressBlocked(result.exitCode, stdout.text, stderr.text)
    const shellResult: ShellRunResult = {
      ok: result.exitCode === 0,
      exit_code: result.exitCode,
      stdout: stdout.text,
      stderr: stderr.text,
      stdout_truncated: stdout.truncated,
      stderr_truncated: stderr.truncated,
      cwd: cwdRel || '.',
      command: execArgv,
      command_string: execCommandString,
      home_is_grant_root: useSystemFree ? undefined : true,
      path_note: pathNote,
      isolation: result.isolation,
      escalated: escalate === 'unsandboxed' || undefined,
      sandbox: resultSandbox,
      platform: detectPlatformLabel(),
      duration_ms: Date.now() - started,
      python_runtime: pythonRuntimeInfo,
    }

    if (egressBlocked.blocked) {
      const suggested = egressBlocked.suggestedHost ?? diagnosticTargetHost
      shellResult.needs_network_egress = buildNeedsNetworkEgressPayload(suggested)
      shellResult.suggested_escalate = 'network'
      shellResult.blocked_by = suggested
        ? `network:${suggested}`
        : 'network'
    }

    if (shouldInvalidatePipMirrorCache(execArgv, result.exitCode, stderr.text)) {
      invalidatePipMirrorCache()
      const pipUrls = getPythonSettings().pip_index_urls
      if (pipUrls.length > 1) {
        rotatePreferredPipMirror(pipUrls)
      }
    }

    return shellResult
  }

  async install(
    params: ShellInstallParams,
    confirm?: ConfirmHandler,
  ): Promise<ShellRunResult> {
    const argv = params.manager === 'pip'
      ? buildPipInstallArgv(params.packages)
      : buildNpmInstallArgv(params.packages)
    return this.run({
      sessionId: params.sessionId,
      rootId: params.rootId,
      cwdRel: params.cwdRel,
      command: argvToCommandString(argv),
      argv,
      networkIntent: 'install',
      signal: params.signal,
      background: false,
    }, confirm) as Promise<ShellRunResult>
  }

  /** 按预需提前唤起联网安装授权（兼容；默认已含包源，确认后写 sticky） */
  requestNetworkInstall(
    sessionId: string,
    confirm?: ConfirmHandler,
    reason?: string,
  ): Promise<NetworkInstallPreflightResult> {
    return confirmNetworkInstallPreflight(sessionId, this.deps.stickyNetwork, confirm, reason)
  }

  /** 按预需提前唤起指定域名出站授权 */
  requestNetworkEgress(
    sessionId: string,
    hosts: string[],
    confirm?: ConfirmHandler,
    reason?: string,
  ): Promise<NetworkEgressPreflightResult> {
    return confirmNetworkEgressPreflight(
      sessionId,
      hosts,
      this.deps.sessionEgress,
      confirm,
      reason,
    )
  }

  clearSession(sessionId: string): void {
    this.deps.stickyNetwork.clearSession(sessionId)
    this.deps.sessionEgress.clearSession(sessionId)
    clearSessionShellCommandJobs(sessionId)
    void this.sessionRuntime.disposeSession(sessionId).catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[agent-workspace] dispose session SRT failed (${sessionId}): ${msg}`)
    })
  }
}

function spawnSandboxed(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    if (!argv.length) {
      reject(new WorkspaceError('沙箱命令为空'))
      return
    }
    const drop = resolveDockerAgentDropIds()
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(drop ? { uid: drop.uid, gid: drop.gid } : {}),
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)

    const onAbort = () => {
      child.kill('SIGTERM')
    }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout.on('data', chunk => {
      const text = chunkToUtf8(chunk)
      stdout += text
      onOutput?.('stdout', text)
    })
    child.stderr.on('data', chunk => {
      const text = chunkToUtf8(chunk)
      stderr += text
      onOutput?.('stderr', text)
    })
    child.on('error', err => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        const bin = argv[0] ?? ''
        reject(
          new WorkspaceError(
            `无法启动命令「${bin}」：找不到可执行文件。${SPAWN_ENOENT_HINT}`,
          ),
        )
        return
      }
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve({ stdout, stderr, exitCode: code })
    })
  })
}
