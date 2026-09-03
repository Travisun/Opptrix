/**
 * opptrix auth … — 本地账户恢复（经 Docker 在容器内执行，不走 HTTP）。
 * 信任边界：能对 Opptrix 容器 / 数据卷执行 docker 的宿主机管理员。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectDocker } from './compose.mjs'
import {
  isContainerRunning,
  parseRuntimeCliJson,
  readComposeContainerName,
} from './docker-runtime.mjs'
import { flagString, flagTrue } from './parse.mjs'
import { resolveDeployRoot } from './paths.mjs'

export const AUTH_CLI_IN_CONTAINER = '/app/scripts/selfhost-auth-cli.mjs'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function handleAuthCommand(parsed) {
  const sub = (parsed.args[0] || 'help').trim()
  switch (sub) {
    case 'whoami':
      return cmdAuthWhoami(parsed)
    case 'reset-password':
      return cmdAuthResetPassword(parsed)
    case 'disable-totp':
      return cmdAuthDisableTotp(parsed)
    case 'help':
    case '-h':
    case '--help':
      printAuthHelp()
      return 0
    default:
      console.error(`[opptrix] 未知 auth 子命令: ${sub}`)
      printAuthHelp()
      return 2
  }
}

function printAuthHelp() {
  console.log(`Opptrix 本地账户恢复（Docker 部署）

用法:
  opptrix auth whoami
  opptrix auth reset-password [--password <新密码>] [--yes] [--keep-totp]
  opptrix auth disable-totp --yes

说明:
  在运行中的 Opptrix 容器内重置本地所有者密码 / 关闭二次验证。
  默认 reset-password：设置新密码、关闭二次验证、并使全部登录失效。
  --keep-totp：重置密码时保留二次验证。
  能对本机 Docker 容器与部署卷操作的人即可执行（宿主机管理员边界）。
  数据位于部署卷内；本命令不回显新密码。

示例:
  opptrix auth whoami
  opptrix auth reset-password --yes
  opptrix auth reset-password --password 'YourNew1!' --yes
  opptrix auth reset-password --password 'YourNew1!' --yes --keep-totp
  opptrix auth disable-totp --yes`)
}

/**
 * @param {string} containerName
 * @returns {boolean}
 */
function syncHostAuthCli(containerName) {
  const src = path.join(PACKAGE_ROOT, 'bundle', 'scripts', 'selfhost-auth-cli.mjs')
  if (!fs.existsSync(src)) return false
  const r = spawnSync(
    'docker',
    ['cp', src, `${containerName}:${AUTH_CLI_IN_CONTAINER}`],
    { encoding: 'utf8', shell: false },
  )
  return r.status === 0
}

/**
 * @param {string} s
 */
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

/**
 * @param {string[]} scriptArgs
 * @param {string} containerName
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function dockerExecAuthCli(scriptArgs, containerName) {
  const quoted = scriptArgs.map(shellQuote).join(' ')
  const shell = `exec node ${shellQuote(AUTH_CLI_IN_CONTAINER)} ${quoted}`
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', containerName, 'sh', '-c', shell], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    /** @type {Buffer[]} */
    const out = []
    /** @type {Buffer[]} */
    const err = []
    child.stdout?.on('data', (c) => out.push(Buffer.from(c)))
    child.stderr?.on('data', (c) => err.push(Buffer.from(c)))
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    })
  })
}

/**
 * @param {string[]} scriptArgs
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
async function runAuthCli(scriptArgs, parsed) {
  const docker = detectDocker()
  if (!docker.ok) {
    throw new Error(docker.message)
  }
  const root = resolveDeployRoot()
  const containerName = readComposeContainerName(root)
  if (!isContainerRunning(containerName)) {
    throw new Error(
      `容器 ${containerName} 未在运行。请先 opptrix start / opptrix up，再执行账户恢复。`,
    )
  }
  syncHostAuthCli(containerName)
  const args = [...scriptArgs, '--json']
  const r = await dockerExecAuthCli(args, containerName)
  const payload = parseRuntimeCliJson(r.stdout)
  return { ...r, payload, containerName, deployRoot: root }
}

/**
 * Muted TTY password prompt (no echo). Cross-platform best-effort.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function askPasswordMuted(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error('非交互终端无法提示输入密码'))
      return
    }
    const stdin = process.stdin
    const stdout = process.stdout
    stdout.write(prompt)
    let password = ''
    const wasRaw = stdin.isRaw
    stdin.setRawMode?.(true)
    stdin.resume()
    /** @param {Buffer} buf */
    const onData = (buf) => {
      const s = buf.toString('utf8')
      for (const ch of s) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          cleanup()
          stdout.write('\n')
          resolve(password)
          return
        }
        if (ch === '\u0003') {
          cleanup()
          stdout.write('\n')
          reject(new Error('已取消'))
          return
        }
        if (ch === '\u007f' || ch === '\b') {
          if (password.length > 0) password = password.slice(0, -1)
          continue
        }
        if (ch === '\u001b') continue
        password += ch
      }
    }
    function cleanup() {
      stdin.removeListener('data', onData)
      if (typeof wasRaw === 'boolean') stdin.setRawMode?.(wasRaw)
      else stdin.setRawMode?.(false)
    }
    stdin.on('data', onData)
  })
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @returns {Promise<string | null>}
 */
async function resolveNewPassword(parsed) {
  const fromFlag = flagString(parsed.flags, 'password')
  if (fromFlag) return fromFlag
  if (!process.stdin.isTTY) {
    console.error('[opptrix] 非 TTY 环境必须用 --password 提供新密码，并加 --yes')
    return null
  }
  const a = await askPasswordMuted('新密码: ')
  const b = await askPasswordMuted('再输入一次: ')
  if (a !== b) {
    console.error('[opptrix] 两次输入的密码不一致')
    return null
  }
  if (!a) {
    console.error('[opptrix] 密码不能为空')
    return null
  }
  return a
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {string} actionLabel
 * @returns {boolean}
 */
function requireYes(parsed, actionLabel) {
  if (flagTrue(parsed.flags, 'yes', 'y')) return true
  if (!process.stdin.isTTY) {
    console.error(`[opptrix] 非 TTY：${actionLabel} 需要 --yes`)
    return false
  }
  console.log(`[opptrix] ${actionLabel}；继续请加 --yes`)
  return false
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
async function cmdAuthWhoami(parsed) {
  const { code, payload, stderr } = await runAuthCli(['whoami'], parsed)
  if (!payload?.ok) {
    console.error(`[opptrix] auth whoami 失败 (exit ${code})`)
    if (payload?.error) console.error(`[opptrix] ${payload.error}`)
    else if (stderr.trim()) console.error(stderr.trim())
    return code || 1
  }
  if (flagTrue(parsed.flags, 'json')) {
    console.log(JSON.stringify(payload))
    return 0
  }
  if (!payload.claimed) {
    console.log('[opptrix] 尚未创建本地账户')
    return 0
  }
  console.log('[opptrix] 本地账户')
  console.log(`  用户名: ${payload.username}`)
  console.log(`  二次验证: ${payload.totp_enabled ? '已开启' : '未开启'}`)
  console.log(`  创建时间: ${payload.created_at}`)
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
async function cmdAuthResetPassword(parsed) {
  if (!requireYes(parsed, '将重置密码、默认关闭二次验证，并使全部登录失效')) {
    return 2
  }
  let password
  try {
    password = await resolveNewPassword(parsed)
  } catch (err) {
    console.error(`[opptrix] ${err instanceof Error ? err.message : err}`)
    return 1
  }
  if (!password) return 2

  /** @type {string[]} */
  const args = ['reset-password', '--password', password, '--yes']
  if (flagTrue(parsed.flags, 'keep-totp')) args.push('--keep-totp')

  const { code, payload, stderr } = await runAuthCli(args, parsed)
  // Avoid leaking password via accidental debug of scriptArgs
  if (!payload?.ok) {
    console.error(`[opptrix] 密码重置失败 (exit ${code})`)
    if (payload?.error) console.error(`[opptrix] ${payload.error}`)
    else if (stderr.trim()) console.error(stderr.trim())
    return code || 1
  }
  if (flagTrue(parsed.flags, 'json')) {
    const safe = { ...payload }
    delete safe.password
    console.log(JSON.stringify(safe))
    return 0
  }
  console.log(`[opptrix] 密码已重置（用户 ${payload.username}）`)
  console.log(
    `  二次验证: ${
      payload.totpDisabled ? '已关闭' : payload.keepTotp ? '已保留' : '未开启'
    }`,
  )
  console.log(`  已失效登录: ${payload.sessionsRevoked ?? 0}`)
  console.log('[opptrix] 请使用新密码重新登录')
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
async function cmdAuthDisableTotp(parsed) {
  if (!requireYes(parsed, '将强制关闭二次验证（无需旧密码）')) {
    return 2
  }
  const { code, payload, stderr } = await runAuthCli(['disable-totp', '--yes'], parsed)
  if (!payload?.ok) {
    console.error(`[opptrix] 关闭二次验证失败 (exit ${code})`)
    if (payload?.error) console.error(`[opptrix] ${payload.error}`)
    else if (stderr.trim()) console.error(stderr.trim())
    return code || 1
  }
  if (flagTrue(parsed.flags, 'json')) {
    console.log(JSON.stringify(payload))
    return 0
  }
  console.log(`[opptrix] ${payload.message || '二次验证已关闭'}`)
  if (payload.username) console.log(`  用户名: ${payload.username}`)
  return 0
}
