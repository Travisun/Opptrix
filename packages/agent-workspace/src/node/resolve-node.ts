import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { promisify } from 'node:util'
import { isDesktopRuntime } from '@opptrix/shared'
import { WorkspaceError } from '../errors.js'
import { needsWindowsAclGrant } from '../shell/windows-acl-path-policy.js'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

export type NodeActiveSource = 'system' | 'electron' | 'none'
export type NpmActiveSource = 'system' | 'runtime_cli' | 'none'

export interface NodeRuntimeStatus {
  ready: boolean
  active_source: NodeActiveSource
  active_path: string | null
  active_version: string | null
  npm_ready: boolean
  npm_source: NpmActiveSource
  npm_path: string | null
  npm_cli_js: string | null
  npx_cli_js: string | null
  message: string
  electron_run_as_node: boolean
}

const NODE_BINARIES = new Set(['node'])
const NPM_BINARIES = new Set(['npm', 'npx'])

export { NODE_BINARIES, NPM_BINARIES }

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function probeExecutable(exePath: string): Promise<{ path: string; version: string } | null> {
  try {
    const { stdout } = await execFileAsync(exePath, ['--version'], { timeout: 5000 })
    const version = stdout.trim().split('\n')[0]?.trim() ?? stdout.trim()
    if (!version) return null
    return { path: exePath, version }
  } catch {
    return null
  }
}

async function whichOnPath(names: readonly string[]): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  for (const name of names) {
    try {
      const { stdout } = await execFileAsync(cmd, [name], { timeout: 3000 })
      const first = stdout.trim().split(/\r?\n/)[0]?.trim()
      if (first) return first
    } catch {
      /* try next name */
    }
  }
  return null
}

function execPathLooksLikeElectronOrOpptrix(): boolean {
  const base = path.basename(process.execPath).replace(/\.exe$/i, '').toLowerCase()
  return base === 'electron' || base === 'opptrix'
}

function isElectronRunAsNodeContext(): boolean {
  return Boolean(process.versions.electron)
    || process.env.ELECTRON_RUN_AS_NODE === '1'
    || (isDesktopRuntime() && execPathLooksLikeElectronOrOpptrix())
}

function electronAllowReadPaths(): string[] {
  const execPath = process.execPath
  const out = [path.dirname(execPath)]
  if (process.platform === 'darwin') {
    const contents = path.join(execPath, '..', '..', '..')
    out.push(
      path.join(contents, 'Frameworks'),
      path.join(contents, 'Resources'),
      path.join(contents, 'Resources', 'app.asar'),
    )
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
    if (resourcesPath) out.push(resourcesPath)
  }
  if (process.platform === 'win32') {
    out.push(path.dirname(execPath))
  }
  return out.filter(Boolean)
}

function runtimeStageRoot(): string | null {
  const raw = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  return raw ? path.resolve(raw) : null
}

function runtimeStageNpmCliCandidates(): string[] {
  const stage = runtimeStageRoot()
  if (!stage) return []
  const out: string[] = []
  for (const depsDir of ['node_modules', 'deps']) {
    const npmRoot = path.join(stage, depsDir, 'npm', 'bin')
    out.push(
      path.join(npmRoot, 'npm-cli.js'),
      path.join(npmRoot, 'npx-cli.js'),
    )
  }
  return out
}

async function resolveNpmCliJsPaths(): Promise<{
  npm_cli_js: string | null
  npx_cli_js: string | null
  npm_source: NpmActiveSource
  npm_path: string | null
}> {
  const systemNpm = await whichOnPath(['npm'])
  if (systemNpm && await fileExists(systemNpm)) {
    const npmDir = path.dirname(systemNpm)
    const npmCli = path.join(npmDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    const npxCli = path.join(npmDir, 'node_modules', 'npm', 'bin', 'npx-cli.js')
    return {
      npm_path: systemNpm,
      npm_cli_js: await fileExists(npmCli) ? npmCli : null,
      npx_cli_js: await fileExists(npxCli) ? npxCli : null,
      npm_source: 'system',
    }
  }

  for (const candidate of runtimeStageNpmCliCandidates()) {
    if (await fileExists(candidate)) {
      const npmCli = candidate.endsWith('npx-cli.js')
        ? path.join(path.dirname(candidate), 'npm-cli.js')
        : candidate
      const npxCli = path.join(path.dirname(candidate), 'npx-cli.js')
      return {
        npm_path: null,
        npm_cli_js: await fileExists(npmCli) ? npmCli : candidate,
        npx_cli_js: await fileExists(npxCli) ? npxCli : null,
        npm_source: 'runtime_cli',
      }
    }
  }

  try {
    const npmCli = require.resolve('npm/bin/npm-cli.js')
    const npxCli = path.join(path.dirname(npmCli), 'npx-cli.js')
    return {
      npm_path: null,
      npm_cli_js: npmCli,
      npx_cli_js: await fileExists(npxCli) ? npxCli : null,
      npm_source: 'runtime_cli',
    }
  } catch {
    /* fall through */
  }

  return {
    npm_path: null,
    npm_cli_js: null,
    npx_cli_js: null,
    npm_source: 'none',
  }
}

function buildStatusMessage(
  ready: boolean,
  activeSource: NodeActiveSource,
  npmReady: boolean,
): string {
  if (!ready) {
    return '尚未检测到可用的 Node 运行时。桌面端通常由应用内嵌运行时提供；请先 get_system_info 确认。'
  }
  if (activeSource === 'electron') {
    return npmReady
      ? '已使用应用内嵌 Node 运行时，可直接运行 node 脚本与 npm 安装依赖。'
      : '已使用应用内嵌 Node 运行时；npm 尚未就绪，请检查 runtime-stage 或系统 npm。'
  }
  return npmReady
    ? '已检测到 Node 运行时，可直接运行脚本与 npm 安装依赖。'
    : '已检测到 Node 运行时；npm 尚未就绪。'
}

/** 探测系统 / Electron-as-Node 运行时与 npm CLI */
export async function resolveNodeRuntime(): Promise<NodeRuntimeStatus> {
  const electron_run_as_node = isElectronRunAsNodeContext()
  let active_source: NodeActiveSource = 'none'
  let active_path: string | null = null
  let active_version: string | null = null

  if (electron_run_as_node) {
    const probed = await probeExecutable(process.execPath)
    if (probed) {
      active_source = 'electron'
      active_path = probed.path
      active_version = probed.version
    }
  } else {
    const fromPath = await whichOnPath(['node'])
    if (fromPath) {
      const probed = await probeExecutable(fromPath)
      if (probed) {
        active_source = 'system'
        active_path = probed.path
        active_version = probed.version
      }
    }
    if (!active_path && !process.versions.electron) {
      const probed = await probeExecutable(process.execPath)
      if (probed) {
        active_source = 'system'
        active_path = probed.path
        active_version = probed.version
      }
    }
  }

  const npmResolved = await resolveNpmCliJsPaths()
  const npm_ready = npmResolved.npm_source === 'system'
    ? npmResolved.npm_path != null
    : npmResolved.npm_cli_js != null

  const ready = active_path != null

  return {
    ready,
    active_source,
    active_path,
    active_version,
    npm_ready,
    npm_source: npmResolved.npm_source,
    npm_path: npmResolved.npm_path,
    npm_cli_js: npmResolved.npm_cli_js,
    npx_cli_js: npmResolved.npx_cli_js,
    message: buildStatusMessage(ready, active_source, npm_ready),
    electron_run_as_node,
  }
}

/** npm / npx CLI 解析失败时抛出清晰错误 */
export async function resolveNpmCliJs(kind: 'npm' | 'npx'): Promise<{
  source: NpmActiveSource
  npm_path: string | null
  cli_js: string
}> {
  const runtime = await resolveNodeRuntime()
  const cli = kind === 'npm' ? runtime.npm_cli_js : runtime.npx_cli_js
  if (runtime.npm_source === 'system' && runtime.npm_path) {
    return { source: 'system', npm_path: runtime.npm_path, cli_js: runtime.npm_path }
  }
  if (cli) {
    return { source: runtime.npm_source, npm_path: null, cli_js: cli }
  }
  throw new WorkspaceError(
    kind === 'npm'
      ? 'npm 尚未就绪：未找到系统 npm 或 runtime-stage 内 npm-cli.js'
      : 'npx 尚未就绪：未找到系统 npx 或 runtime-stage 内 npx-cli.js',
  )
}

/** Node / npm 运行时只读路径 — 供 sandbox allowRead */
export async function nodeRuntimeAllowReadPaths(): Promise<string[]> {
  const runtime = await resolveNodeRuntime()
  const out: string[] = []

  if (runtime.active_path) {
    out.push(path.dirname(runtime.active_path))
    out.push(...electronAllowReadPaths())
  }

  const stage = runtimeStageRoot()
  if (stage) out.push(stage)

  if (runtime.npm_cli_js) {
    let dir = path.dirname(runtime.npm_cli_js)
    while (dir !== path.dirname(dir)) {
      if (path.basename(dir) === 'node_modules') {
        out.push(dir)
        break
      }
      dir = path.dirname(dir)
    }
    out.push(path.dirname(runtime.npm_cli_js))
  }

  if (runtime.npm_path) {
    out.push(path.dirname(runtime.npm_path))
  }

  const resolved = [...new Set(out.map(p => path.resolve(p)).filter(Boolean))]
  // win32：Program Files 下 node/Opptrix 依赖默认 Users RX，勿 stamp ACL
  if (process.platform === 'win32') {
    return resolved.filter(p => needsWindowsAclGrant(p))
  }
  return resolved
}

export function usesElectronAsNodeArgv(argv: readonly string[]): boolean {
  if (!argv.length) return false
  const raw = argv[0]?.trim()
  if (!raw) return false
  return path.resolve(raw) === path.resolve(process.execPath)
    && isElectronRunAsNodeContext()
}
