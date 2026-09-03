/**
 * Two-layer autostart: Docker engine on OS boot + container RestartPolicy.
 */
import { spawnSync } from 'node:child_process'
import readline from 'node:readline'
import { containerExists } from './docker-runtime.mjs'

/** Preferred compose / docker update policy (not `always`). */
export const DESIRED_RESTART_POLICY = 'unless-stopped'

/**
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function isRestartPolicyOk(name) {
  const n = String(name ?? '').trim().toLowerCase()
  return n === 'unless-stopped' || n === 'always'
}

/**
 * @param {string} question
 * @param {string} [def]
 * @returns {Promise<string>}
 */
function ask(question, def = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const suffix = def !== '' ? ` [${def}]` : ''
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close()
      const t = String(answer ?? '').trim()
      resolve(t === '' ? def : t)
    })
  })
}

/**
 * @returns {string}
 */
function linuxEnableCommand() {
  try {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return 'systemctl enable docker'
    }
  } catch {
    // ignore
  }
  return 'sudo systemctl enable docker'
}

/**
 * @returns {{
 *   platform: string,
 *   enabled: boolean | null,
 *   message: string,
 *   enableCommand: string | null,
 * }}
 */
export function checkDockerAutostart() {
  const platform = process.platform
  if (platform === 'linux') {
    const r = spawnSync('systemctl', ['is-enabled', 'docker'], {
      encoding: 'utf8',
      shell: false,
    })
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim()
    const enabled = r.status === 0 && /^enabled$/i.test(out.split('\n')[0] || '')
    if (enabled) {
      return {
        platform,
        enabled: true,
        message: 'Docker 服务已设置为开机自启（systemctl is-enabled docker → enabled）',
        enableCommand: null,
      }
    }
    const r2 = spawnSync('systemctl', ['is-enabled', 'docker.service'], {
      encoding: 'utf8',
      shell: false,
    })
    const out2 = `${r2.stdout || ''}${r2.stderr || ''}`.trim()
    const enabled2 = r2.status === 0 && /^enabled$/i.test(out2.split('\n')[0] || '')
    if (enabled2) {
      return {
        platform,
        enabled: true,
        message: 'Docker 服务已设置为开机自启（docker.service）',
        enableCommand: null,
      }
    }
    return {
      platform,
      enabled: false,
      message: `Docker 开机自启未启用（systemctl: ${out || out2 || 'disabled/unknown'}）`,
      enableCommand: linuxEnableCommand(),
    }
  }

  if (platform === 'darwin') {
    return {
      platform,
      enabled: null,
      message:
        'macOS：请打开 Docker Desktop → Settings → General，勾选 “Start Docker Desktop when you sign in”，'
        + '以便登录后自动启动引擎；CLI 无法可靠代为开启。',
      enableCommand: null,
    }
  }

  if (platform === 'win32') {
    return {
      platform,
      enabled: null,
      message:
        'Windows：请打开 Docker Desktop 设置，开启 “Start Docker Desktop when you sign in”，'
        + '以便登录后自动启动引擎；CLI 无法可靠代为开启。',
      enableCommand: null,
    }
  }

  return {
    platform,
    enabled: null,
    message: `当前平台 ${platform}：请自行确认 Docker 是否随系统启动。`,
    enableCommand: null,
  }
}

/**
 * Ensure Docker engine follows OS boot (Linux: systemctl enable).
 * Non-fatal: WARN on failure so pull/up can continue.
 * @param {{ interactive?: boolean, yes?: boolean }} [opts]
 * @returns {Promise<{ attempted: boolean, enabled: boolean | null, ok: boolean }>}
 */
export async function ensureDockerEngineAutostart(opts = {}) {
  const status = checkDockerAutostart()

  if (status.platform === 'darwin' || status.platform === 'win32') {
    console.warn(`[opptrix] WARN: ${status.message}`)
    return { attempted: false, enabled: null, ok: false }
  }

  console.log(`[opptrix] ${status.message}`)

  if (status.enabled === true) {
    return { attempted: false, enabled: true, ok: true }
  }
  if (status.enabled !== false || !status.enableCommand) {
    return { attempted: false, enabled: status.enabled, ok: false }
  }

  const interactive = opts.interactive !== false && Boolean(process.stdin.isTTY) && !opts.yes
  /** Product: 必须自启 — default attempt unless user explicitly declines in TTY. */
  let doEnable = true
  if (interactive) {
    const ans = await ask(`是否执行 \`${status.enableCommand}\`？(Y/n)`, 'Y')
    doEnable = !/^(n|no|0|false)$/i.test(ans)
  }

  if (!doEnable) {
    console.log(`[opptrix] 如需开机自启，请手动执行: ${status.enableCommand}`)
    return { attempted: false, enabled: false, ok: false }
  }

  const parts = status.enableCommand.split(/\s+/)
  const r = spawnSync(parts[0], parts.slice(1), {
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
  })
  if (r.status === 0) {
    console.log('[opptrix] 已启用 Docker 开机自启')
    return { attempted: true, enabled: true, ok: true }
  }
  console.warn('[opptrix] WARN: 无法自动启用 Docker 开机自启（可能需要更高权限）')
  console.warn(`[opptrix] 请手动执行: ${status.enableCommand}`)
  return { attempted: true, enabled: false, ok: false }
}

/** @deprecated Prefer ensureDockerEngineAutostart */
export async function maybeOfferDockerAutostart(opts = {}) {
  await ensureDockerEngineAutostart(opts)
}

/**
 * @param {string} containerName
 * @returns {string | null} policy name, or null if inspect failed / missing
 */
export function inspectContainerRestartPolicy(containerName) {
  const name = String(containerName ?? '').trim()
  if (!name) return null
  const r = spawnSync(
    'docker',
    ['inspect', '-f', '{{.HostConfig.RestartPolicy.Name}}', name],
    { encoding: 'utf8', shell: false },
  )
  if (r.status !== 0) return null
  const policy = String(r.stdout ?? '').trim()
  return policy || null
}

/**
 * Enforce RestartPolicy=unless-stopped on an existing container (docker update).
 * @param {string} containerName
 * @returns {{
 *   ok: boolean,
 *   updated: boolean,
 *   skipped: boolean,
 *   policy: string | null,
 *   reason?: string,
 * }}
 */
export function ensureContainerRestartPolicy(containerName) {
  const name = String(containerName ?? '').trim()
  if (!name) {
    return { ok: false, updated: false, skipped: true, policy: null, reason: 'no-name' }
  }
  if (!containerExists(name)) {
    return { ok: false, updated: false, skipped: true, policy: null, reason: 'missing' }
  }

  const policy = inspectContainerRestartPolicy(name)
  if (isRestartPolicyOk(policy)) {
    return { ok: true, updated: false, skipped: false, policy }
  }

  const current = policy || '无'
  console.log(
    `[opptrix] 容器 ${name} 重启策略为 ${current}，正在设为 ${DESIRED_RESTART_POLICY}…`,
  )
  const u = spawnSync(
    'docker',
    ['update', `--restart=${DESIRED_RESTART_POLICY}`, name],
    { encoding: 'utf8', shell: false },
  )
  if (u.status === 0) {
    console.log(
      `[opptrix] 已设置容器随 Docker 引擎自动重启（${DESIRED_RESTART_POLICY}）`,
    )
    return { ok: true, updated: true, skipped: false, policy: DESIRED_RESTART_POLICY }
  }
  const err = `${u.stderr || ''}${u.stdout || ''}`.trim()
  console.warn(
    `[opptrix] WARN: 无法更新容器重启策略${err ? `（${err.split('\n')[0]}）` : ''}`,
  )
  console.warn(
    `[opptrix] 请手动执行: docker update --restart=${DESIRED_RESTART_POLICY} ${name}`,
  )
  return { ok: false, updated: false, skipped: false, policy, reason: 'update-failed' }
}

/**
 * Doctor lines for both autostart layers; optionally auto-fix container policy.
 * @param {string} containerName
 * @param {{ autoFix?: boolean, includeEngine?: boolean }} [opts]
 */
export function reportAutostartDoctor(containerName, opts = {}) {
  const autoFix = opts.autoFix !== false
  const includeEngine = opts.includeEngine !== false
  if (includeEngine) {
    const engine = checkDockerAutostart()
    if (engine.enabled == null && (engine.platform === 'darwin' || engine.platform === 'win32')) {
      console.warn(`[opptrix] WARN: ${engine.message}`)
    } else {
      console.log(`[opptrix] Docker 引擎开机自启: ${engine.message}`)
      if (engine.enabled === false) {
        console.warn(
          `[opptrix] WARN: Docker 引擎未设为开机自启`
            + (engine.enableCommand ? `；可执行: ${engine.enableCommand}` : ''),
        )
      }
    }
  }

  const name = String(containerName ?? '').trim() || 'opptrix'
  if (!containerExists(name)) {
    console.log(`[opptrix] 容器重启策略: （容器 ${name} 不存在）`)
    return
  }

  const policy = inspectContainerRestartPolicy(name)
  console.log(`[opptrix] 容器 ${name} RestartPolicy=${policy || '无'}`)
  if (isRestartPolicyOk(policy)) {
    console.log(`[opptrix] OK 容器会在 Docker 引擎启动后自动拉起（${policy}）`)
    return
  }

  console.warn(
    `[opptrix] WARN: 容器重启策略应为 ${DESIRED_RESTART_POLICY}（当前: ${policy || '无'}）`,
  )
  if (autoFix) {
    ensureContainerRestartPolicy(name)
  }
}
