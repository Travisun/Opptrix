import path from 'node:path'
import { WorkspaceError } from '../errors.js'
import {
  NODE_BINARIES,
  NPM_BINARIES,
  resolveNodeRuntime,
  resolveNpmCliJs,
} from '../node/resolve-node.js'
import {
  PYTHON_BINARIES,
  PIP_BINARIES,
  resolvePythonRuntime,
} from '../python/resolve-python.js'
import { basenameOfArgv0 } from './package-policy.js'

/** 将 argv 中的 python/pip/node/npm/npx 重写为当前 active 运行时绝对路径 */
export async function resolveShellArgv(argv: readonly string[]): Promise<string[]> {
  if (!argv.length) return [...argv]

  const bin = basenameOfArgv0([...argv])

  if (PYTHON_BINARIES.has(bin) || PIP_BINARIES.has(bin)) {
    return resolvePythonShellArgv(argv, bin)
  }

  if (NODE_BINARIES.has(bin)) {
    return resolveNodeShellArgv(argv)
  }

  if (NPM_BINARIES.has(bin)) {
    return resolveNpmShellArgv(argv, bin)
  }

  return [...argv]
}

async function resolvePythonShellArgv(argv: readonly string[], bin: string): Promise<string[]> {
  const runtime = await resolvePythonRuntime()
  if (!runtime.ready || !runtime.active_path) {
    throw new WorkspaceError(runtime.message || 'Python 环境尚未就绪')
  }

  const out = [...argv]
  if (PYTHON_BINARIES.has(bin)) {
    out[0] = runtime.active_path
    return out
  }

  out[0] = runtime.active_path
  return [out[0], '-m', 'pip', ...out.slice(1)]
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
