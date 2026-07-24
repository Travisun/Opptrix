import { spawn } from 'node:child_process'
import path from 'node:path'
import { SandboxManager, type Platform } from '@anthropic-ai/sandbox-runtime'
import {
  NetworkInstallConfirmationRequiredError,
  WorkspaceError,
} from '../errors.js'
import { assertReadable, type WorkspaceGrant } from '../grants.js'
import type { ConfirmHandler } from '../service.js'
import { buildSandboxConfigFromGrants } from './config-from-grants.js'
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
} from './package-policy.js'
import {
  NetworkInstallStickyStore,
  NETWORK_INSTALL_CONFIRM_OPTIONS,
  parseNetworkInstallChoice,
} from './sticky-network.js'
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
  return out
}

async function requireNetworkInstallConfirmation(
  sessionId: string,
  sticky: NetworkInstallStickyStore,
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

function detectPlatformLabel(): Platform {
  if (!SandboxManager.isSupportedPlatform()) return 'unknown'
  const p = process.platform
  if (p === 'darwin') return 'macos'
  if (p === 'linux') return 'linux'
  if (p === 'win32') return 'windows'
  return 'unknown'
}

export interface ShellRunnerDeps {
  listGrants: (sessionId: string) => Promise<WorkspaceGrant[]>
  gatePath: (sessionId: string, rootId: string, relPath: string) => Promise<{
    grant: WorkspaceGrant
    abs: string
  }>
  stickyNetwork: NetworkInstallStickyStore
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
    await this.assertShellReady(true)

    const argv = [...params.argv]
    assertAllowedShellArgv(argv)

    const cwdRel = params.cwdRel ?? ''
    const { grant, abs: cwdAbs } = await this.deps.gatePath(
      params.sessionId,
      params.rootId,
      cwdRel,
    )
    assertReadable(grant)

    const normalizedArgv = assertPackageInstallPolicy(argv, cwdAbs, grant.abs_path)
    const needsNetwork = params.networkIntent === 'install' || commandNeedsNetwork(normalizedArgv)
    if (needsNetwork) {
      await requireNetworkInstallConfirmation(params.sessionId, this.deps.stickyNetwork, confirm)
    }

    const grants = await this.deps.listGrants(params.sessionId)
    const allowNetworkInstall = needsNetwork || this.deps.stickyNetwork.has(params.sessionId)
    const config = await buildSandboxConfigFromGrants({
      grants,
      allowNetworkInstall,
    })

    const command = argvToCommandString(normalizedArgv)
    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const started = Date.now()

    return withSandboxMutex(async () => {
      await SandboxManager.initialize(config)
      try {
        const wrapped = await SandboxManager.wrapWithSandboxArgv(
          command,
          undefined,
          undefined,
          params.signal,
          cwdAbs,
        )
        const childEnv = sanitizeChildEnv(
          { ...process.env, ...wrapped.env },
          cwdAbs,
          grant.abs_path,
        )

        const result = await spawnSandboxed(wrapped.argv, childEnv, cwdAbs, timeoutMs, params.signal)
        const stdout = truncateStream(result.stdout, MAX_STREAM_BYTES)
        const stderr = truncateStream(result.stderr, MAX_STREAM_BYTES)

        return {
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
      } finally {
        await SandboxManager.reset()
      }
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

  clearSession(sessionId: string): void {
    this.deps.stickyNetwork.clearSession(sessionId)
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
