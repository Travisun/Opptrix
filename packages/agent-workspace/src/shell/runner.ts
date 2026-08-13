import { spawn } from 'node:child_process'
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
import { applyBundledCaCertEnv, materializeBundledCaCert } from './bundled-cacert.js'
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
  assertAllowedShellArgv,
  assertPackageInstallPolicy,
  buildNpmInstallArgv,
  buildPipInstallArgv,
  commandNeedsNetwork,
  injectPipCertArgv,
  isNetworkDiagnosticCommand,
  parseDiagnosticTargetHost,
} from './package-policy.js'
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
  ShellRunStickyStore,
  SHELL_RUN_CONFIRM_OPTIONS,
  parseShellRunConfirmChoice,
  summarizeShellArgv,
} from './sticky-shell-run.js'
import type {
  ShellInstallParams,
  ShellPlatformStatus,
  ShellPythonRuntimeInfo,
  ShellRunParams,
  ShellRunResult,
  ShellSecretRef,
} from './types.js'
import { getUserDataStore } from '@opptrix/user-store'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_STREAM_BYTES = 200_000

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

let sandboxChain: Promise<unknown> = Promise.resolve()

function withSandboxMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = sandboxChain.then(fn, fn)
  sandboxChain = run.then(() => undefined, () => undefined)
  return run
}

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

async function sanitizeChildEnv(
  base: NodeJS.ProcessEnv,
  cwdAbs: string,
  grantRootAbs: string,
  electronRunAsNode: boolean,
): Promise<NodeJS.ProcessEnv> {
  const out: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (value == null) continue
    if (SENSITIVE_ENV_KEYS.some(re => re.test(key))) continue
    out[key] = value
  }
  out.PWD = cwdAbs
  out.HOME = grantRootAbs
  out.USERPROFILE = grantRootAbs
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
  applyBundledCaCertEnv(out, materialized)
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
  confirm?: ConfirmHandler,
  reason?: string,
): Promise<NetworkInstallPreflightResult> {
  const pipIndexUrls = getPythonSettings().pip_index_urls
  const preferredHosts = hostPatternsFromHttpsUrls(pipIndexUrls)
  const installDomains = networkDomainsForInstallAllowed(pipIndexUrls)
  if (sticky.has(sessionId)) {
    return {
      ok: true,
      already_granted: true,
      sticky: true,
      domains: installDomains,
      message: '本对话已允许联网安装，无需再次确认',
    }
  }
  if (sticky.hasPreflight(sessionId)) {
    return {
      ok: true,
      already_granted: true,
      once_confirmed: true,
      domains: installDomains,
      message: '本对话已有一次联网安装预授权，随后 shell_install 将跳过重复确认',
    }
  }
  const basePrompt = formatNetworkInstallConfirmPrompt(installDomains, 8, preferredHosts)
  const prompt = reason?.trim()
    ? `${reason.trim()}\n\n${basePrompt}`
    : basePrompt
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
  if (choice === 'sticky') {
    sticky.grant(sessionId)
    return {
      ok: true,
      sticky: true,
      domains: installDomains,
      message: '本对话已一律允许联网安装；随后 shell_install 将跳过联网确认',
    }
  }
  sticky.grantPreflight(sessionId)
  return {
    ok: true,
    once_confirmed: true,
    domains: installDomains,
    message: '已预授权一次联网安装；紧接着的 shell_install 将跳过联网确认',
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

async function requireShellRunConfirmation(
  sessionId: string,
  argv: readonly string[],
  sticky: ShellRunStickyStore,
  confirm?: ConfirmHandler,
): Promise<void> {
  if (sticky.has(sessionId)) return
  const commandSummary = summarizeShellArgv(argv)
  const payload = {
    kind: 'opptrix_run' as const,
    title: '允许运行命令',
    prompt: `将在隔离环境中运行：\n${commandSummary}\n\n仅限本对话工作区与已授权目录；系统隔离执行。`,
    command_summary: commandSummary,
    options: [...SHELL_RUN_CONFIRM_OPTIONS],
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
  const choice = parseShellRunConfirmChoice(answer.selected_ids)
  if (choice === 'cancel') throw new WorkspaceError('用户已取消运行命令')
  if (choice === 'allow_session') sticky.grant(sessionId)
}

async function requireDiagnosticMergedConfirmation(
  sessionId: string,
  argv: readonly string[],
  targetHost: string,
  shellSticky: ShellRunStickyStore,
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
    title: '允许运行命令',
    prompt: [
      `将在隔离环境中运行：`,
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
  return applyEgressChoice(sessionId, normalizedTarget, answer.selected_ids, shellSticky, egress)
}

function applyEgressChoice(
  sessionId: string,
  targetHost: string | undefined,
  selectedIds: readonly string[],
  shellSticky?: ShellRunStickyStore,
  egress?: SessionNetworkEgressStore,
): EgressRunGrants {
  const choice = parseNetworkEgressChoice(selectedIds)
  if (choice === 'cancel') throw new WorkspaceError('用户已取消外网访问')
  if (!targetHost) {
    throw new WorkspaceError('未指定访问目标，无法仅允许该目标')
  }
  if (choice === 'allow_host_session') {
    egress?.grantHost(sessionId, targetHost)
    shellSticky?.grant(sessionId)
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
  shellSticky: ShellRunStickyStore
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
        opts.shellSticky,
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
 * elevated：SandboxManager.initialize + wrap（SRT LogonW 路径）。
 */
async function executeSandboxOnceElevated(ctx: SandboxExecContext): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
}> {
  const command = argvToCommandString(ctx.normalizedArgv)
  await SandboxManager.initialize(ctx.config, ctx.sandboxAskCallback)

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

  const wrapped = await SandboxManager.wrapWithSandboxArgv(
    command,
    undefined,
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
  return spawnSandboxed(wrapped.argv, childEnv, ctx.cwdAbs, ctx.timeoutMs, ctx.signal)
}

/**
 * unelevated：不初始化 SandboxManager / SRT WFP；RestrictedToken spawn + 软出站策略。
 */
async function executeSandboxOnceUnelevated(ctx: SandboxExecContext): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
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

  return spawnUnelevatedRestricted({
    argv: ctx.normalizedArgv,
    env: childEnv,
    cwd: ctx.cwdAbs,
    timeoutMs: ctx.timeoutMs,
    signal: ctx.signal,
  })
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
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  let refreshed = false
  const refreshOnce = async (): Promise<boolean> => {
    if (refreshed) return false
    refreshed = true
    await refreshElevatedWindowsCredentials()
    return true
  }

  let first: { exitCode: number | null; stdout: string; stderr: string }
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

export interface ShellRunnerDeps {
  listGrants: (sessionId: string) => Promise<WorkspaceGrant[]>
  gatePath: (sessionId: string, rootId: string, relPath: string) => Promise<{
    grant: WorkspaceGrant
    abs: string
  }>
  stickyNetwork: NetworkInstallStickyStore
  sessionEgress: SessionNetworkEgressStore
  stickyShellRun: ShellRunStickyStore
}

export class ShellRunner {
  constructor(private readonly deps: ShellRunnerDeps) {}

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
  ): Promise<ShellRunResult> {
    assertAllowedShellArgv(params.argv)
    const resolved = await resolveShellArgv(params.argv)
    const resolvedArgv = resolved.argv
    const pythonRewritten = resolved.python_rewritten

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

    const normalizedArgv = assertPackageInstallPolicy(resolvedArgv, cwdAbs, grant.abs_path)

    const diagnostic = isNetworkDiagnosticCommand(normalizedArgv)
    let diagnosticTargetHost: string | undefined
    if (diagnostic) {
      const rawHost = parseDiagnosticTargetHost(normalizedArgv)
      if (!rawHost) throw new WorkspaceError('未能从命令中识别探测目标主机')
      diagnosticTargetHost = await assertDiagnosticTargetAllowed(rawHost, params.sessionId)
    }

    const needsInstallNetwork = !diagnostic && (
      params.networkIntent === 'install' || commandNeedsNetwork(normalizedArgv)
    )

    let egressGrants: EgressRunGrants = { onceHosts: [], runWithDeniedNetwork: false }

    if (diagnostic && diagnosticTargetHost) {
      egressGrants = await requireDiagnosticMergedConfirmation(
        params.sessionId,
        normalizedArgv,
        diagnosticTargetHost,
        this.deps.stickyShellRun,
        this.deps.sessionEgress,
        confirm,
      )
    } else {
      await requireShellRunConfirmation(
        params.sessionId,
        normalizedArgv,
        this.deps.stickyShellRun,
        confirm,
      )
    }

    if (needsInstallNetwork) {
      await requireNetworkInstallConfirmation(
        params.sessionId,
        this.deps.stickyNetwork,
        this.deps.sessionEgress,
        confirm,
      )
    }

    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const started = Date.now()

    const secretInjections = resolveSecretInjections(params.sessionId, params.secret_refs)
    const secretInjectHosts = [
      ...new Set(secretInjections.flatMap(s => s.injectHosts.map(h => normalizeEgressHost(h)).filter(Boolean))),
    ]
    const plainSecretsForRedact = secretInjections.map(s => s.plainValue)

    await resolvePreferredPipIndexUrl(getPythonSettings().pip_index_urls)

    await this.assertShellReady(true)

    return withSandboxMutex(async () => {
      const grants = await this.deps.listGrants(params.sessionId)
      const allowNetworkInstall = !egressGrants.runWithDeniedNetwork && (
        needsInstallNetwork || this.deps.stickyNetwork.has(params.sessionId)
      )
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

      const config = await buildSandboxConfigFromGrants({
        grants,
        allowNetworkInstall,
        diagnosticTargetHosts,
        sessionEgress,
        onceEgressHosts,
        sessionId: params.sessionId,
        pipIndexUrls: getPythonSettings().pip_index_urls,
      })

      // CA 物化到 grant 根后再注入 pip --cert（sanitize 在 spawn 时也会再物化一次，幂等）
      const materializedCert = materializeBundledCaCert(grant.abs_path)
      const execArgv = materializedCert
        ? injectPipCertArgv(normalizedArgv, materializedCert)
        : normalizedArgv

      const runOnceHosts = new Set<string>(
        [...egressGrants.onceHosts, ...secretInjectHosts, ...preflightEgress]
          .map(h => normalizeEgressHost(h))
          .filter(Boolean),
      )
      const sandboxAskCallback = egressGrants.runWithDeniedNetwork
        ? undefined
        : createSandboxAskCallback({
          sessionId: params.sessionId,
          confirm,
          sessionEgress: this.deps.sessionEgress,
          shellSticky: this.deps.stickyShellRun,
          signal: params.signal,
          runOnceHosts,
        })

      let result: { exitCode: number | null; stdout: string; stderr: string }
      const winMode = process.platform === 'win32'
        ? getSandboxSettings().windows_isolation_mode
        : 'elevated'
      try {
        result = await executeSandboxOnce({
          sessionId: params.sessionId,
          normalizedArgv: execArgv,
          cwdRel,
          cwdAbs,
          grantRootAbs: grant.abs_path,
          config,
          timeoutMs,
          signal: params.signal,
          sandboxAskCallback,
          secretInjections,
          // unelevated 主路径不要求完整网络围栏（软策略：确认/白名单）
          requireFullNetworkIsolation: false,
        })
      } finally {
        // unelevated 未 initialize SRT；reset 仍安全
        if (winMode !== 'unelevated') {
          await SandboxManager.reset()
        }
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
        sandbox: true as const,
        platform: detectPlatformLabel(),
        duration_ms: Date.now() - started,
        python_runtime: pythonRuntimeInfo,
      }

      if (egressBlocked.blocked) {
        const suggested = egressBlocked.suggestedHost ?? diagnosticTargetHost
        shellResult.needs_network_egress = buildNeedsNetworkEgressPayload(suggested)
      }

      if (shouldInvalidatePipMirrorCache(execArgv, result.exitCode, stderr.text)) {
        invalidatePipMirrorCache()
        const pipUrls = getPythonSettings().pip_index_urls
        if (pipUrls.length > 1) {
          rotatePreferredPipMirror(pipUrls)
        }
      }

      return shellResult
    })
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
      argv,
      networkIntent: 'install',
      signal: params.signal,
    }, confirm)
  }

  /** 按预需提前唤起联网安装授权（ConfirmHandler / sticky|preflight once） */
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
    this.deps.stickyShellRun.clearSession(sessionId)
  }
}

function spawnSandboxed(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    if (!argv.length) {
      reject(new WorkspaceError('沙箱命令为空'))
      return
    }
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
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

    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve({ stdout, stderr, exitCode: code })
    })
  })
}
