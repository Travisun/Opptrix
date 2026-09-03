/**
 * Deploy UX: TOS gate, health wait, post-start summary.
 */
import os from 'node:os'
import readline from 'node:readline'
import { probeHealth, resolveHealthProbe, runCompose } from './compose.mjs'
import { resolveCurrentDataSource } from './data-migrate.mjs'
import { flagTrue } from './parse.mjs'
import {
  readHostConfig,
  readPackageMeta,
  resolveDeployRoot,
  writeHostConfig,
} from './paths.mjs'

export const USER_AGREEMENT_URL = 'https://opptrix.org/legal/user-agreement'
export const COMMUNITY_URL = 'https://opptrix.net'
/** Bump when agreement text materially changes and re-consent is required. */
export const USER_AGREEMENT_VERSION = '2026-03'

/**
 * @param {string} [root]
 */
export function hasAcceptedUserAgreement(root = resolveDeployRoot()) {
  const cfg = readHostConfig(root)
  const at = typeof cfg.userAgreementAcceptedAt === 'string' ? cfg.userAgreementAcceptedAt.trim() : ''
  const ver = typeof cfg.userAgreementVersion === 'string' ? cfg.userAgreementVersion.trim() : ''
  return Boolean(at) && ver === USER_AGREEMENT_VERSION
}

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(String(answer ?? '').trim())
    })
  })
}

/**
 * Gate start paths until the user accepts the agreement.
 * Non-TTY: require `--agree-tos` (or already accepted in .opptrix.json).
 *
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {{ root?: string, actionLabel?: string }} [opts]
 * @returns {Promise<number>} 0 = ok to continue; 2 = declined / missing flag
 */
export async function ensureUserAgreementAccepted(parsed, opts = {}) {
  const root = opts.root ?? resolveDeployRoot()
  if (hasAcceptedUserAgreement(root)) return 0

  const label = opts.actionLabel ?? '继续'
  console.log('[opptrix] 使用 Opptrix 自托管前，请阅读并同意用户协议：')
  console.log(`[opptrix]   ${USER_AGREEMENT_URL}`)
  console.log(`[opptrix] 社区与互助：${COMMUNITY_URL}`)

  if (flagTrue(parsed.flags, 'agree-tos', 'agree')) {
    writeHostConfig(root, {
      userAgreementAcceptedAt: new Date().toISOString(),
      userAgreementVersion: USER_AGREEMENT_VERSION,
    })
    console.log('[opptrix] 已记录协议同意（--agree-tos）')
    return 0
  }

  if (!process.stdin.isTTY) {
    console.error('[opptrix] 非交互环境请先加 --agree-tos，表示你已阅读并同意用户协议')
    console.error(`[opptrix] ${USER_AGREEMENT_URL}`)
    return 2
  }

  const answer = await askLine(`同意协议后输入 yes 以${label}（其它键取消）: `)
  if (!/^y(es)?$/i.test(answer)) {
    console.error('[opptrix] 未同意用户协议，已取消')
    return 2
  }
  writeHostConfig(root, {
    userAgreementAcceptedAt: new Date().toISOString(),
    userAgreementVersion: USER_AGREEMENT_VERSION,
  })
  console.log('[opptrix] 已记录协议同意')
  return 0
}

/**
 * Parse runtime/base versions from `/api/health` JSON body (same fields as doctor).
 * @param {string | null | undefined} body
 * @returns {{ runtimeVersion: string | null, baseVersion: string | null }}
 */
export function parseHealthVersions(body) {
  /** @type {string | null} */
  let runtimeVersion = null
  /** @type {string | null} */
  let baseVersion = null
  if (typeof body !== 'string' || !body.trim()) {
    return { runtimeVersion, baseVersion }
  }
  try {
    const json = JSON.parse(body)
    if (json && typeof json === 'object') {
      if (typeof json.runtime_version === 'string' && json.runtime_version.trim()) {
        runtimeVersion = json.runtime_version.trim()
      } else if (typeof json.version === 'string' && json.version.trim()) {
        runtimeVersion = json.version.trim()
      }
      if (typeof json.base_version === 'string' && json.base_version.trim()) {
        baseVersion = json.base_version.trim()
      }
    }
  } catch {
    // ignore malformed health body
  }
  return { runtimeVersion, baseVersion }
}

/**
 * @param {string} [root]
 * @param {{
 *   maxAttempts?: number,
 *   intervalMs?: number,
 *   label?: string,
 * }} [opts]
 * @returns {Promise<{
 *   ok: boolean,
 *   url?: string,
 *   status?: number,
 *   attempts: number,
 *   runtimeVersion?: string | null,
 *   baseVersion?: string | null,
 * }>}
 */
export async function waitUntilHealthy(root = resolveDeployRoot(), opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 45
  const intervalMs = opts.intervalMs ?? 2000
  const label = opts.label ?? '服务'
  const probe = resolveHealthProbe(root)
  console.log(`[opptrix] 正在等待${label}就绪…`)
  console.log(`[opptrix]   探测 ${probe.url}`)

  /** @type {{ runtimeVersion: string | null, baseVersion: string | null }} */
  let lastVersions = { runtimeVersion: null, baseVersion: null }

  for (let i = 1; i <= maxAttempts; i += 1) {
    const h = await probeHealth(root)
    const versions = parseHealthVersions(h.body)
    if (versions.runtimeVersion || versions.baseVersion) {
      lastVersions = versions
    }
    if (h.ok) {
      console.log(`[opptrix] 健康检查通过（第 ${i} 次，HTTP ${h.status}）`)
      return {
        ok: true,
        url: h.url,
        status: h.status,
        attempts: i,
        runtimeVersion: versions.runtimeVersion,
        baseVersion: versions.baseVersion,
      }
    }
    if (i === 1 || i % 5 === 0) {
      const detail = h.error || `HTTP ${h.status ?? '—'}`
      console.log(`[opptrix]   尚未就绪（${i}/${maxAttempts}）：${detail}`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  console.warn('[opptrix] WARN: 健康检查超时，容器可能仍在启动')
  console.warn('[opptrix]   可稍后执行：opptrix health')
  console.warn('[opptrix]   或：opptrix restart')
  return {
    ok: false,
    url: probe.url,
    attempts: maxAttempts,
    runtimeVersion: lastVersions.runtimeVersion,
    baseVersion: lastVersions.baseVersion,
  }
}

/**
 * Prefer compose restart (project-aware); fall back to docker restart by name.
 * @param {string} root
 * @param {string} [containerName]
 * @param {{ mirror?: import('./mirrors.mjs').BuildMirrorProfile, releaseEnv?: Record<string, string> }} [composeOpts]
 * @returns {Promise<{ ok: boolean, via: string, code: number }>}
 */
export async function restartService(root, containerName, composeOpts = {}) {
  console.log('[opptrix] 正在重启容器（docker compose restart）…')
  const code = await runCompose(['restart'], {
    root,
    mirror: composeOpts.mirror,
    releaseEnv: composeOpts.releaseEnv,
  })
  if (code === 0) return { ok: true, via: 'compose-restart', code: 0 }

  if (containerName) {
    console.warn(`[opptrix] WARN: compose restart 失败（exit ${code}），尝试 docker restart ${containerName}`)
    const { spawn } = await import('node:child_process')
    const fallback = await new Promise((resolve) => {
      const child = spawn('docker', ['restart', containerName], {
        stdio: 'inherit',
        shell: false,
      })
      child.on('error', () => resolve(1))
      child.on('close', (c) => resolve(c ?? 1))
    })
    return {
      ok: fallback === 0,
      via: 'docker-restart',
      code: fallback,
    }
  }
  return { ok: false, via: 'compose-restart', code }
}

/**
 * @returns {string[]}
 */
export function listLanIpv4Addresses() {
  const nets = os.networkInterfaces()
  /** @type {string[]} */
  const out = []
  for (const entries of Object.values(nets)) {
    if (!entries) continue
    for (const e of entries) {
      if (e.family !== 'IPv4' && e.family !== 4) continue
      if (e.internal) continue
      if (e.address) out.push(e.address)
    }
  }
  return [...new Set(out)]
}

/**
 * @param {string} [root]
 * @param {{
 *   runtimeVersion?: string | null,
 *   baseVersion?: string | null,
 *   healthy?: boolean,
 * }} [opts]
 */
export function printDeployReadySummary(root = resolveDeployRoot(), opts = {}) {
  const probe = resolveHealthProbe(root)
  const data = resolveCurrentDataSource(root)
  const meta = readPackageMeta()
  const cfg = readHostConfig(root)
  const appRef = typeof cfg.appRef === 'string' && cfg.appRef.trim()
    ? cfg.appRef.trim()
    : meta.preferredAppTag
  const baseVersion = typeof opts.baseVersion === 'string' && opts.baseVersion.trim()
    ? opts.baseVersion.trim()
    : appRef
  const runtimeVersion = typeof opts.runtimeVersion === 'string' && opts.runtimeVersion.trim()
    ? opts.runtimeVersion.trim()
    : null
  const lan = listLanIpv4Addresses()
  const dataLabel = data.kind === 'bind'
    ? (data.path || '（宿主机目录）')
    : `Docker 命名卷 ${data.volumeName || 'opptrix-home'}`

  console.log('')
  console.log('──────── Opptrix 已就绪 ────────')
  console.log(`  部署目录:     ${root}`)
  console.log(`  数据位置:     ${dataLabel}`)
  console.log(`  运行时版本:   ${runtimeVersion || '（未探测）'}`)
  console.log(`  底座版本:     ${baseVersion}`)
  console.log(`  CLI:          ${meta.name}@${meta.version}`)
  console.log(`  本机访问:     https://127.0.0.1:${probe.port}/`)
  if (lan.length) {
    for (const ip of lan.slice(0, 3)) {
      console.log(`  局域网访问:   https://${ip}:${probe.port}/`)
    }
  }
  console.log(`  公网访问:     https://<公网IP>:${probe.port}/  （需自行放行端口与证书信任）`)
  if (opts.healthy === false) {
    console.log('  状态:         健康检查尚未通过，请稍候 opptrix health')
  } else {
    console.log('  状态:         健康检查通过')
  }
  console.log('')
  console.log('  更改数据目录:')
  console.log('    opptrix data migrate --to /你的路径 --yes')
  console.log('    opptrix data migrate --to volume --yes   # 迁回命名卷')
  console.log('')
  console.log(`  社区与帮助:   ${COMMUNITY_URL}`)
  console.log(`  用户协议:     ${USER_AGREEMENT_URL}`)
  console.log('──────────────────────────────')
  console.log('')
}

/**
 * Restart (compose) then wait for health and print summary.
 * @param {string} root
 * @param {{
 *   containerName?: string,
 *   runtimeVersion?: string | null,
 *   baseVersion?: string | null,
 *   mirror?: import('./mirrors.mjs').BuildMirrorProfile,
 *   releaseEnv?: Record<string, string>,
 *   printSummary?: boolean,
 * }} [opts]
 * @returns {Promise<number>}
 */
export async function restartAndAwaitReady(root, opts = {}) {
  const restarted = await restartService(root, opts.containerName, {
    mirror: opts.mirror,
    releaseEnv: opts.releaseEnv,
  })
  if (!restarted.ok) {
    console.error(`[opptrix] 容器重启失败（via ${restarted.via}, exit ${restarted.code}）`)
    console.error('[opptrix] 请手动执行：opptrix restart')
    return restarted.code || 1
  }
  const health = await waitUntilHealthy(root, { label: '服务' })
  if (opts.printSummary !== false) {
    printDeployReadySummary(root, {
      runtimeVersion: opts.runtimeVersion ?? health.runtimeVersion,
      baseVersion: opts.baseVersion ?? health.baseVersion,
      healthy: health.ok,
    })
  }
  return health.ok ? 0 : 1
}

/**
 * After compose up -d success: wait health + summary.
 * @param {string} root
 * @param {{ runtimeVersion?: string | null, baseVersion?: string | null }} [opts]
 * @returns {Promise<number>}
 */
export async function afterComposeUpReady(root, opts = {}) {
  const health = await waitUntilHealthy(root, { label: '服务' })
  printDeployReadySummary(root, {
    runtimeVersion: opts.runtimeVersion ?? health.runtimeVersion,
    baseVersion: opts.baseVersion ?? health.baseVersion,
    healthy: health.ok,
  })
  return health.ok ? 0 : 1
}

/**
 * Format download progress for stderr (throttled by caller).
 * @param {number} received
 * @param {number | null} total
 * @param {number} startedAtMs
 */
export function formatDownloadProgressLine(received, total, startedAtMs) {
  const elapsedSec = Math.max(0.001, (Date.now() - startedAtMs) / 1000)
  const mb = (received / (1024 * 1024)).toFixed(1)
  const speed = received / elapsedSec
  const speedLabel = speed > 1024 * 1024
    ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
    : `${(speed / 1024).toFixed(0)} KB/s`
  const elapsedLabel = elapsedSec < 60
    ? `${elapsedSec.toFixed(0)}s`
    : `${Math.floor(elapsedSec / 60)}m${Math.floor(elapsedSec % 60)}s`
  if (total && total > 0) {
    const pct = Math.min(100, Math.floor((received / total) * 100))
    const remain = Math.max(0, total - received)
    const etaSec = speed > 0 ? remain / speed : 0
    const etaLabel = etaSec < 60
      ? `${Math.ceil(etaSec)}s`
      : `${Math.floor(etaSec / 60)}m${Math.ceil(etaSec % 60)}s`
    const totalMb = (total / (1024 * 1024)).toFixed(1)
    return `下载中 ${pct}%  ${mb}/${totalMb} MB  ${speedLabel}  已用 ${elapsedLabel}  剩余约 ${etaLabel}`
  }
  return `下载中 ${mb} MB  ${speedLabel}  已用 ${elapsedLabel}`
}
