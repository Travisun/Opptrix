/**
 * Run in-container runtime update scripts via docker exec / compose run.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { detectDocker } from './compose.mjs'

export const DEFAULT_CONTAINER_NAME = 'opptrix'
export const RUNTIME_CLI_IN_CONTAINER = '/app/scripts/runtime-update-cli.mjs'

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
 * }} opts
 * @returns {Promise<{ code: number, stdout: string, stderr: string, via: 'docker-exec' }>}
 */
export function dockerExecRuntimeCli(scriptArgs, opts) {
  const args = ['exec', opts.containerName, 'node', RUNTIME_CLI_IN_CONTAINER, ...scriptArgs]
  return runDocker(args, { inheritStdio: opts.inheritStdio })
}

/**
 * @param {string[]} scriptArgs
 * @param {{
 *   deployRoot: string,
 *   env?: NodeJS.ProcessEnv,
 *   inheritStdio?: boolean,
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
    'node',
    'opptrix',
    RUNTIME_CLI_IN_CONTAINER,
    ...scriptArgs,
  ]
  return runDocker(args, {
    cwd: opts.deployRoot,
    env: opts.env,
    inheritStdio: opts.inheritStdio,
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
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, inheritStdio?: boolean }} [opts]
 */
function runDocker(dockerArgs, opts = {}) {
  const inherit = opts.inheritStdio === true
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
      child.stderr?.on('data', (c) => err.push(Buffer.from(c)))
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
 * @param {{ deployRoot: string, containerName?: string, inheritStdio?: boolean, composeEnv?: NodeJS.ProcessEnv }} opts
 */
export async function runRuntimeCli(scriptArgs, opts) {
  const docker = detectDocker()
  if (!docker.ok) {
    throw new Error(docker.message)
  }
  const containerName = opts.containerName ?? readComposeContainerName(opts.deployRoot)
  if (isContainerRunning(containerName)) {
    const r = await dockerExecRuntimeCli(scriptArgs, {
      containerName,
      inheritStdio: opts.inheritStdio,
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
  })
  return { ...r, via: 'compose-run', containerName }
}

/**
 * @param {string} stdout
 */
export function parseRuntimeCliJson(stdout) {
  const trimmed = String(stdout ?? '').trim()
  if (!trimmed) return null
  const line = trimmed.split('\n').filter(Boolean).pop() ?? trimmed
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}
