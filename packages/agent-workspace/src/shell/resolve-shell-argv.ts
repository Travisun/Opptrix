import { WorkspaceError } from '../errors.js'
import {
  NODE_BINARIES,
  NPM_BINARIES,
  resolveNodeRuntime,
  resolveNpmCliJs,
} from '../node/resolve-node.js'
import { resolvePythonRuntime } from '../python/resolve-python.js'
import { basenameOfArgv0 } from './package-policy.js'

/** basename 是否为 python / python3 / python3.x */
export function looksLikePythonBin(name: string): boolean {
  const b = name.trim().toLowerCase()
  if (!b) return false
  if (b === 'python' || b === 'python3') return true
  return /^python3\.\d+$/.test(b)
}

/** basename 是否为 pip / pip3 / pip3.x */
export function looksLikePipBin(name: string): boolean {
  const b = name.trim().toLowerCase()
  if (!b) return false
  if (b === 'pip' || b === 'pip3') return true
  return /^pip3\.\d+$/.test(b)
}

export interface ResolveShellArgvResult {
  argv: string[]
  /** 本命令 argv0 的 python/pip（含绝对路径 basename）是否被改写到 active */
  python_rewritten: boolean
}

/** 将 argv 中的 python/pip/node/npm/npx 重写为当前 active 运行时绝对路径 */
export async function resolveShellArgv(
  argv: readonly string[],
): Promise<ResolveShellArgvResult> {
  if (!argv.length) return { argv: [...argv], python_rewritten: false }

  const bin = basenameOfArgv0([...argv])

  if (looksLikePythonBin(bin) || looksLikePipBin(bin)) {
    return resolvePythonShellArgv(argv, bin)
  }

  if (NODE_BINARIES.has(bin)) {
    const out = await resolveNodeShellArgv(argv)
    return { argv: out, python_rewritten: false }
  }

  if (NPM_BINARIES.has(bin)) {
    const out = await resolveNpmShellArgv(argv, bin)
    return { argv: out, python_rewritten: false }
  }

  return { argv: [...argv], python_rewritten: false }
}

async function resolvePythonShellArgv(
  argv: readonly string[],
  bin: string,
): Promise<ResolveShellArgvResult> {
  const runtime = await resolvePythonRuntime()
  if (!runtime.ready || !runtime.active_path) {
    throw new WorkspaceError(runtime.message || 'Python 环境尚未就绪')
  }

  const out = [...argv]
  const wasPip = looksLikePipBin(bin)
  if (looksLikePythonBin(bin) && !wasPip) {
    const rewritten = out[0] !== runtime.active_path
    out[0] = runtime.active_path
    return { argv: out, python_rewritten: rewritten }
  }

  // pip* → [active_path, '-m', 'pip', ...rest]
  return {
    argv: [runtime.active_path, '-m', 'pip', ...out.slice(1)],
    python_rewritten: true,
  }
}

async function resolveNodeShellArgv(argv: readonly string[]): Promise<string[]> {
  const runtime = await resolveNodeRuntime()
  if (!runtime.ready || !runtime.active_path) {
    throw new WorkspaceError(runtime.message || 'Node 环境尚未就绪')
  }

  const out = [...argv]
  out[0] = runtime.active_path
  return out
}

async function resolveNpmShellArgv(argv: readonly string[], bin: string): Promise<string[]> {
  const nodeRuntime = await resolveNodeRuntime()
  if (!nodeRuntime.ready || !nodeRuntime.active_path) {
    throw new WorkspaceError(nodeRuntime.message || 'Node 环境尚未就绪')
  }

  const npmKind = bin === 'npx' ? 'npx' : 'npm'
  const npmResolved = await resolveNpmCliJs(npmKind)

  if (npmResolved.source === 'system' && npmResolved.npm_path) {
    const out = [...argv]
    out[0] = npmResolved.npm_path
    return out
  }

  return [nodeRuntime.active_path, npmResolved.cli_js, ...argv.slice(1)]
}
