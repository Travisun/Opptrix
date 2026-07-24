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
import { resolveShellArgv } from '../python/resolve-python.js'
import { getPythonSettings } from '../python-settings-store.js'
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
import {
  argvToCommandString,
  assertAllowedShellArgv,
  assertPackageInstallPolicy,
  buildNpmInstallArgv,
  buildPipInstallArgv,
  commandNeedsNetwork,
  isNetworkDiagnosticCommand,
  parseDiagnosticTargetHost,
} from './package-policy.js'
import {
  SessionNetworkEgressStore,
  NETWORK_EGRESS_CONFIRM_OPTIONS,
  normalizeEgressHost,
  parseNetworkEgressChoice,
} from './session-network-egress.js'
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
  ShellRunParams,
  ShellRunResult,
} from './types.js'

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
    return base === 'pip' || base === 'pip3' || base.startsWith('pip')
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

function sanitizeChildEnv(
  base: NodeJS.ProcessEnv,
  cwdAbs: string,
  grantRootAbs: string,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(base)) {
    if (value == null) continue
    if (SENSITIVE_ENV_KEYS.some(re => re.test(key))) continue
    out[key] = value
  }
  out.PWD = cwdAbs
  out.HOME = grantRootAbs
  out.USERPROFILE = grantRootAbs
  out.PIP_TARGET = path.join(cwdAbs, '.opptrix-packages')
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
  const payload = {
    kind: 'network_install' as const,
    title: '允许联网安装',
    prompt: '安装依赖需要访问外部包源。是否允许本次联网安装？',
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

async function assertDiagnosticTargetAllowed(host: string): Promise<string> {
  return assertEgressHostGrantable(host)
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
    kind: 'shell_run' as const,
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
  const normalizedTarget = await assertEgressHostGrantable(targetHost)
  if (isEgressHostPreAuthorized(sessionId, normalizedTarget, egress)) {
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
      normalized = await assertEgressHostGrantable(host)
    } catch {
      return false
    }
    if (isEgressHostPreAuthorized(opts.sessionId, normalized, opts.sessionEgress)) {
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

async function executeSandboxOnce(ctx: SandboxExecContext): Promise<{
  exitCode: number | null
  stdout: string
  stderr: string
}> {
  const command = argvToCommandString(ctx.normalizedArgv)
  await SandboxManager.initialize(ctx.config, ctx.sandboxAskCallback)
  const wrapped = await SandboxManager.wrapWithSandboxArgv(
    command,
    undefined,
    undefined,
    ctx.signal,
    ctx.cwdAbs,
  )
  const childEnv = sanitizeChildEnv(
    { ...process.env, ...wrapped.env },
    ctx.cwdAbs,
    ctx.grantRootAbs,
  )
  return spawnSandboxed(wrapped.argv, childEnv, ctx.cwdAbs, ctx.timeoutMs, ctx.signal)
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
    const resolvedArgv = await resolveShellArgv(params.argv)
    assertAllowedShellArgv(resolvedArgv)

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
      diagnosticTargetHost = await assertDiagnosticTargetAllowed(rawHost)
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
      const onceEgressHosts = egressGrants.runWithDeniedNetwork
        ? undefined
        : egressGrants.onceHosts

      const config = await buildSandboxConfigFromGrants({
        grants,
        allowNetworkInstall,
        diagnosticTargetHosts,
        sessionEgress,
        onceEgressHosts,
      })

      const runOnceHosts = new Set<string>(
        egressGrants.onceHosts.map(h => normalizeEgressHost(h)).filter(Boolean),
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
      try {
        result = await executeSandboxOnce({
          sessionId: params.sessionId,
          normalizedArgv,
          cwdRel,
          cwdAbs,
          grantRootAbs: grant.abs_path,
          config,
          timeoutMs,
          signal: params.signal,
          sandboxAskCallback,
        })
      } finally {
        await SandboxManager.reset()
      }

      const stdout = truncateStream(result.stdout, MAX_STREAM_BYTES)
      let stderr = truncateStream(result.stderr, MAX_STREAM_BYTES)
      stderr = {
        ...stderr,
        text: appendDiagnosticFallbackHint(normalizedArgv, result.exitCode, stdout.text, stderr.text),
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
        command: normalizedArgv,
        sandbox: true as const,
        platform: detectPlatformLabel(),
        duration_ms: Date.now() - started,
      }

      if (egressBlocked.blocked) {
        const suggested = egressBlocked.suggestedHost ?? diagnosticTargetHost
        shellResult.needs_network_egress = buildNeedsNetworkEgressPayload(suggested)
      }

      if (shouldInvalidatePipMirrorCache(normalizedArgv, result.exitCode, stderr.text)) {
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
    const rawArgv = params.manager === 'pip'
      ? buildPipInstallArgv(params.packages)
      : buildNpmInstallArgv(params.packages)
    const argv = await resolveShellArgv(rawArgv)
    return this.run({
      sessionId: params.sessionId,
      rootId: params.rootId,
      cwdRel: params.cwdRel,
      argv,
      networkIntent: 'install',
      signal: params.signal,
    }, confirm)
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
