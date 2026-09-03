#!/usr/bin/env node
/**
 * In-container local owner auth recovery CLI (invoked via docker exec).
 * Host: opptrix auth … — never uses HTTP API; never prints the new password.
 *
 * Subcommands (append --json for machine-readable last line):
 *   whoami
 *   reset-password [--password=<new>] [--keep-totp] [--yes]
 *   disable-totp --yes
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

/**
 * @param {boolean} json
 * @param {Record<string, unknown>} payload
 */
function emit(json, payload) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  }
}

/**
 * @param {boolean} json
 * @param {number} code
 * @param {Record<string, unknown>} payload
 */
function exitWith(json, code, payload) {
  emit(json, { ok: code === 0, exitCode: code, ...payload })
  process.exit(code)
}

async function loadUserStore() {
  const candidates = [
    path.join(REPO_ROOT, 'packages', 'user-store', 'dist', 'index.js'),
    path.join(process.cwd(), 'packages', 'user-store', 'dist', 'index.js'),
    '/app/packages/user-store/dist/index.js',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return import(pathToFileURL(p).href)
    }
  }
  throw new Error('无法加载 @opptrix/user-store（请确认容器内已构建 packages/user-store）')
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const flags = {}
  /** @type {string[]} */
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--') {
      positional.push(...argv.slice(i + 1))
      break
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq > 0) {
        flags[token.slice(2, eq)] = token.slice(eq + 1)
        continue
      }
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('-')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
      continue
    }
    positional.push(token)
  }
  return { command: positional[0] || 'help', flags }
}

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string[]} names
 */
function flagTrue(flags, ...names) {
  for (const name of names) {
    const v = flags[name]
    if (v === true || v === '1' || v === 'true' || v === 'yes') return true
  }
  return false
}

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string} name
 */
function flagString(flags, name) {
  const v = flags[name]
  if (typeof v === 'string' && v.trim()) return v
  return null
}

function printHelp() {
  process.stdout.write(`Opptrix 容器内账户恢复（宿主机请用 opptrix auth）

用法:
  node selfhost-auth-cli.mjs whoami [--json]
  node selfhost-auth-cli.mjs reset-password --password <新密码> [--keep-totp] --yes [--json]
  node selfhost-auth-cli.mjs disable-totp --yes [--json]

说明:
  默认 reset-password 会设置新密码、关闭二次验证、并使全部登录失效。
  切勿在日志中打印密码；本脚本从不回显新密码。
`)
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))
  const json = flagTrue(flags, 'json')

  if (command === 'help' || command === '-h' || command === '--help') {
    printHelp()
    process.exit(0)
  }

  let storeMod
  try {
    storeMod = await loadUserStore()
  } catch (err) {
    exitWith(json, 1, {
      error: err instanceof Error ? err.message : String(err),
      command,
    })
  }

  const { getUserDataStore } = storeMod
  /** @type {{ appAuth: import('@opptrix/user-store').AppAuthRepository }} */
  let store
  try {
    store = getUserDataStore()
  } catch (err) {
    exitWith(json, 1, {
      error: err instanceof Error ? err.message : String(err),
      command,
    })
  }
  const auth = store.appAuth

  try {
    if (command === 'whoami') {
      const claimed = auth.isClaimed()
      const owner = auth.getOwnerPublic()
      const payload = {
        command: 'whoami',
        claimed,
        username: owner?.username ?? null,
        totp_enabled: owner?.totp_enabled ?? false,
        created_at: owner?.created_at ?? null,
      }
      if (!json) {
        if (!claimed) {
          console.log('[auth] 尚未创建本地账户')
        } else {
          console.log('[auth] 本地账户')
          console.log(`  用户名: ${payload.username}`)
          console.log(`  二次验证: ${payload.totp_enabled ? '已开启' : '未开启'}`)
          console.log(`  创建时间: ${payload.created_at}`)
        }
      }
      exitWith(json, 0, payload)
    }

    if (command === 'reset-password') {
      if (!flagTrue(flags, 'yes', 'y')) {
        exitWith(json, 2, {
          error: '重置密码需加 --yes 确认（将使全部登录失效；默认关闭二次验证）',
          command,
        })
      }
      const password = flagString(flags, 'password')
      if (!password) {
        exitWith(json, 2, {
          error: '请通过 --password 提供新密码（容器内脚本不交互读取密码）',
          command,
        })
      }
      const keepTotp = flagTrue(flags, 'keep-totp')
      const result = auth.adminResetPassword({
        newPassword: password,
        disableTotp: !keepTotp,
      })
      const payload = {
        command: 'reset-password',
        username: result.username,
        totpWasEnabled: result.totpWasEnabled,
        totpDisabled: result.totpDisabled,
        sessionsRevoked: result.sessionsRevoked,
        keepTotp,
        message: '密码已重置',
      }
      if (!json) {
        console.log(`[auth] 密码已重置（用户 ${result.username}）`)
        console.log(`  二次验证: ${result.totpDisabled ? '已关闭' : keepTotp ? '保留' : '未开启'}`)
        console.log(`  已失效登录: ${result.sessionsRevoked}`)
      }
      exitWith(json, 0, payload)
    }

    if (command === 'disable-totp') {
      if (!flagTrue(flags, 'yes', 'y')) {
        exitWith(json, 2, {
          error: '关闭二次验证需加 --yes 确认',
          command,
        })
      }
      if (!auth.isClaimed()) {
        exitWith(json, 1, {
          error: '尚未创建账户',
          command,
        })
      }
      const before = auth.getOwnerPublic()
      const wasEnabled = before?.totp_enabled === true
      auth.forceClearTotp()
      const after = auth.getOwnerPublic()
      const payload = {
        command: 'disable-totp',
        username: after?.username ?? null,
        totpWasEnabled: wasEnabled,
        totp_enabled: after?.totp_enabled ?? false,
        message: wasEnabled ? '二次验证已关闭' : '二次验证本未开启',
      }
      if (!json) {
        console.log(`[auth] ${payload.message}`)
        if (payload.username) console.log(`  用户名: ${payload.username}`)
      }
      exitWith(json, 0, payload)
    }

    exitWith(json, 2, { error: `未知命令: ${command}`, command })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!json) console.error(`[auth] ${msg}`)
    exitWith(json, 1, { error: msg, command })
  }
}

main()
