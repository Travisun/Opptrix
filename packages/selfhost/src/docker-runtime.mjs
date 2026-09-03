/**
 * Run in-container runtime update scripts via docker exec / compose run.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectDocker } from './compose.mjs'

export const DEFAULT_CONTAINER_NAME = 'opptrix'
export const RUNTIME_CLI_IN_CONTAINER = '/app/scripts/runtime-update-cli.mjs'
export const RUNTIME_CLI_BOOT_IN_CONTAINER = '/opptrix/system/boot/scripts/runtime-update-cli.mjs'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Prefer hot-updated boot slot script when present; else image /app script.
 * @param {string[]} scriptArgs
 */
export function runtimeCliShellCommand(scriptArgs) {
  const quoted = scriptArgs.map(shellQuote).join(' ')
  return (
    `CLI="${RUNTIME_CLI_BOOT_IN_CONTAINER}"; `
    + `[ -f "$CLI" ] || CLI="${RUNTIME_CLI_IN_CONTAINER}"; `
    + `exec node "$CLI" ${quoted}`
  )
}

/**
 * @param {string} s
 */
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

/**
 * Copy package-bundled runtime-update-cli into the running container (/app)
 * so download progress improvements apply without waiting for a new base image.
 * @param {string} containerName
 * @returns {boolean}
 */
export function syncHostRuntimeCli(containerName) {
  const src = path.join(PACKAGE_ROOT, 'bundle', 'scripts', 'runtime-update-cli.mjs')
  if (!fs.existsSync(src)) return false
  const r = spawnSync(
    'docker',
    ['cp', src, `${containerName}:${RUNTIME_CLI_IN_CONTAINER}`],
    { encoding: 'utf8', shell: false },
  )
  return r.status === 0
}

/**
 * @param {string} deployRoot
 */
export function readComposeContainerName(deployRoot) {
  const composePath = path.join(deployRoot, 'docker-compose.yml')
  if (!fs.existsSync(composePath)) return DEFAULT_CONTAINER_NAME
  const text = fs.readFileSync(composePath, 'utf8')
  const m = text.match(/container_name:\s*["']?([A-Za-z0-9_.-]+)/)
  return m?.[1] ?? DEFAULT_CONTAINER_NAME
}

/**
 * @param {string} name
 */
export function isContainerRunning(name) {
  const r = spawnSync(
    'docker',
    ['inspect', '-f', '{{.State.Running}}', name],
    { encoding: 'utf8', shell: false },
  )
  if (r.status !== 0) return false
  return String(r.stdout ?? '').trim() === 'true'
}

/**
 * @param {string} name
 */
export function containerExists(name) {
  const r = spawnSync(
    'docker',
    ['inspect', '-f', '{{.Id}}', name],
    { encoding: 'utf8', shell: false },
  )
  return r.status === 0
}

/**
 * @param {string[]} scriptArgs
 * @param {{
 *   containerName: string,
 *   inheritStdio?: boolean,
 *   streamStderr?: boolean,
 * }} opts
 * @returns {Promise<{ code: number, stdout: string, stderr: string, via: 'docker-exec' }>}
 */
export function dockerExecRuntimeCli(scriptArgs, opts) {
  const args = ['exec', opts.containerName, 'sh', '-c', runtimeCliShellCommand(scriptArgs)]
  return runDocker(args, {
    inheritStdio: opts.inheritStdio,
    streamStderr: opts.streamStderr,
  })
}

/**
 * @param {string[]} scriptArgs
 * @param {{
 *   deployRoot: string,
 *   env?: NodeJS.ProcessEnv,
 *   inheritStdio?: boolean,
 *   streamStderr?: boolean,
 * }} opts
 * @returns {Promise<{ code: number, stdout: string, stderr: string, via: 'compose-run' }>}
 */
export function dockerComposeRunRuntimeCli(scriptArgs, opts) {
  const args = [
    'compose',
    'run',
    '--rm',
    '--no-deps',
    '--entrypoint',
    'sh',
    'opptrix',
    '-c',
    runtimeCliShellCommand(scriptArgs),
  ]
  return runDocker(args, {
    cwd: opts.deployRoot,
    env: opts.env,
    inheritStdio: opts.inheritStdio,
    streamStderr: opts.streamStderr,
  })
}

/**
 * @param {string} containerName
 * @returns {Promise<number>}
 */
export function dockerRestartContainer(containerName) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['restart', containerName], {
      stdio: 'inherit',
      shell: false,
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * @param {string[]} dockerArgs
 * @param {{
 *   cwd?: string,
 *   env?: NodeJS.ProcessEnv,
 *   inheritStdio?: boolean,
 *   streamStderr?: boolean,
 * }} [opts]
 */
function runDocker(dockerArgs, opts = {}) {
  const inherit = opts.inheritStdio === true
  const streamStderr = opts.streamStderr === true && !inherit
  return new Promise((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    /** @type {Buffer[]} */
    const out = []
    /** @type {Buffer[]} */
    const err = []
    if (!inherit) {
      child.stdout?.on('data', (c) => out.push(Buffer.from(c)))
      child.stderr?.on('data', (c) => {
        const buf = Buffer.from(c)
        err.push(buf)
        if (streamStderr) process.stderr.write(buf)
      })
    }
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        via: dockerArgs[0] === 'exec' ? 'docker-exec' : 'compose-run',
      })
    })
  })
}

/**
 * Run runtime-update-cli with exec fallback to compose run.
 * @param {string[]} scriptArgs
 * @param {{
 *   deployRoot: string,
 *   containerName?: string,
 *   inheritStdio?: boolean,
 *   streamStderr?: boolean,
 *   composeEnv?: NodeJS.ProcessEnv,
 * }} opts
 */
export async function runRuntimeCli(scriptArgs, opts) {
  const docker = detectDocker()
  if (!docker.ok) {
    throw new Error(docker.message)
  }
  const containerName = opts.containerName ?? readComposeContainerName(opts.deployRoot)
  if (isContainerRunning(containerName)) {
    if (opts.streamStderr) {
      syncHostRuntimeCli(containerName)
    }
    const r = await dockerExecRuntimeCli(scriptArgs, {
      containerName,
      inheritStdio: opts.inheritStdio,
      streamStderr: opts.streamStderr,
    })
    return { ...r, via: 'docker-exec', containerName }
  }
  if (containerExists(containerName)) {
    console.log(`[opptrix] 容器 ${containerName} 已存在但未运行，使用 compose run 离线执行…`)
  } else {
    console.log('[opptrix] 容器未运行，使用 compose run 离线执行 runtime 命令…')
  }
  const r = await dockerComposeRunRuntimeCli(scriptArgs, {
    deployRoot: opts.deployRoot,
    env: opts.composeEnv,
    inheritStdio: opts.inheritStdio,
    streamStderr: opts.streamStderr,
  })
  return { ...r, via: 'compose-run', containerName }
}

/**
 * Parse last JSON object from runtime-update-cli --json stdout (NDJSON-tolerant).
 * @param {string} stdout
 */
export function parseRuntimeCliJson(stdout) {
  const trimmed = String(stdout ?? '').trim()
  if (!trimmed) return null
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i])
    } catch {
      // keep scanning — docker/runtime may prepend non-JSON lines
    }
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}
