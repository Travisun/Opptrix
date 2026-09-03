/**
 * Interactive deploy setup: mirror, data storage, ports, Docker-on-boot.
 */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { writeComposeEnvPatch } from './compose-env.mjs'
import { detectDocker } from './compose.mjs'
import { ensureThinDeploy } from './ensure-source.mjs'
import { flagString, flagTrue } from './parse.mjs'
import {
  composeEnvPath,
  ensureComposeEnv,
  hostConfigPath,
  readHostConfig,
  readPackageMeta,
  resolveDeployRoot,
  writeHostConfig,
} from './paths.mjs'
import {
  clearHomeBindOverride,
  overrideComposePath,
  writeHomeBindOverride,
} from './data-migrate.mjs'
import { ensureUserAgreementAccepted, USER_AGREEMENT_URL } from './deploy-ux.mjs'
import {
  DEFAULT_HTTP_PORT,
  DEFAULT_HTTPS_PORT,
  findFreeHostPort,
  isHostPortFree,
} from './ports.mjs'
import {
  checkDockerAutostart,
  ensureDockerEngineAutostart,
  maybeOfferDockerAutostart,
} from './autostart.mjs'

export { DEFAULT_HTTP_PORT, DEFAULT_HTTPS_PORT }
export {
  checkDockerAutostart,
  ensureDockerEngineAutostart,
  maybeOfferDockerAutostart,
}
export const DEFAULT_VOLUME_NAME = 'opptrix-home'

/**
 * @typedef {{
 *   mirror: 'auto' | 'cn' | 'foreign',
 *   dataStorage: 'volume' | 'bind',
 *   dataPath: string | null,
 *   httpPort: number,
 *   httpsPort: number,
 *   skipModels: boolean,
 * }} SetupAnswers
 */

/**
 * @returns {SetupAnswers}
 */
export function defaultSetupAnswers() {
  return {
    mirror: 'auto',
    dataStorage: 'volume',
    dataPath: null,
    httpPort: DEFAULT_HTTP_PORT,
    httpsPort: DEFAULT_HTTPS_PORT,
    skipModels: false,
  }
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeDataPath(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) {
    throw new Error('数据目录路径不能为空')
  }
  if (trimmed === '~' || trimmed.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    if (!home) throw new Error('无法展开 ~：未设置 HOME/USERPROFILE')
    return path.resolve(home, trimmed === '~' ? '' : trimmed.slice(2))
  }
  return path.resolve(trimmed)
}

/**
 * @param {string} raw
 * @param {number} fallback
 */
export function parsePort(raw, fallback) {
  const n = Number(String(raw ?? '').trim())
  if (!Number.isInteger(n) || n < 1 || n > 65535) return fallback
  return n
}

/**
 * True when first-time setup should run before `up`.
 * @param {string} [root]
 */
export function needsSetup(root = resolveDeployRoot()) {
  return !fs.existsSync(hostConfigPath(root))
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
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @returns {Partial<SetupAnswers>}
 */
export function answersFromFlags(parsed) {
  /** @type {Partial<SetupAnswers>} */
  const out = {}
  const mirror = flagString(parsed.flags, 'mirror')
  if (mirror === 'auto' || mirror === 'cn' || mirror === 'foreign') {
    out.mirror = mirror
  }
  const data = flagString(parsed.flags, 'data', 'data-path')
  if (data === 'volume' || data === 'named' || data === DEFAULT_VOLUME_NAME) {
    out.dataStorage = 'volume'
    out.dataPath = null
  } else if (data) {
    out.dataStorage = 'bind'
    out.dataPath = normalizeDataPath(data)
  }
  const http = flagString(parsed.flags, 'http-port')
  if (http) out.httpPort = parsePort(http, DEFAULT_HTTP_PORT)
  const https = flagString(parsed.flags, 'https-port')
  if (https) out.httpsPort = parsePort(https, DEFAULT_HTTPS_PORT)
  if (flagTrue(parsed.flags, 'skip-models')) out.skipModels = true
  if (flagTrue(parsed.flags, 'with-models')) out.skipModels = false
  return out
}

/**
 * @param {Partial<SetupAnswers>} partial
 * @returns {SetupAnswers}
 */
export function mergeSetupAnswers(partial = {}) {
  const base = defaultSetupAnswers()
  const next = { ...base, ...partial }
  if (next.dataStorage === 'bind') {
    if (!next.dataPath) {
      throw new Error('绑定宿主机目录时需要 --data <路径>')
    }
    next.dataPath = normalizeDataPath(next.dataPath)
  } else {
    next.dataStorage = 'volume'
    next.dataPath = null
  }
  next.httpPort = parsePort(next.httpPort, DEFAULT_HTTP_PORT)
  next.httpsPort = parsePort(next.httpsPort, DEFAULT_HTTPS_PORT)
  if (next.mirror !== 'cn' && next.mirror !== 'foreign') next.mirror = 'auto'
  next.skipModels = Boolean(next.skipModels)
  return next
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {{ interactive?: boolean }} [opts]
 * @returns {Promise<SetupAnswers>}
 */
export async function collectSetupAnswers(parsed, opts = {}) {
  const fromFlags = answersFromFlags(parsed)
  const interactive = opts.interactive !== false
    && Boolean(process.stdin.isTTY)
    && !flagTrue(parsed.flags, 'yes', 'y')

  if (!interactive) {
    return mergeSetupAnswers(fromFlags)
  }

  console.log('[opptrix] 部署设置向导（直接回车使用默认值）')
  const mirrorRaw = await ask('镜像源 profile（auto / cn / foreign）', fromFlags.mirror || 'auto')
  const mirror = mirrorRaw === 'cn' || mirrorRaw === 'foreign' ? mirrorRaw : 'auto'

  const storageRaw = await ask(
    '数据存储（volume = Docker 命名卷 opptrix-home；或输入宿主机目录路径）',
    fromFlags.dataPath || fromFlags.dataStorage || 'volume',
  )
  /** @type {'volume' | 'bind'} */
  let dataStorage = 'volume'
  /** @type {string | null} */
  let dataPath = null
  if (storageRaw === 'volume' || storageRaw === 'named' || storageRaw === DEFAULT_VOLUME_NAME) {
    dataStorage = 'volume'
  } else {
    dataStorage = 'bind'
    dataPath = normalizeDataPath(storageRaw)
  }

  const httpPort = parsePort(
    await ask('宿主机 HTTP 端口（0=不开启）', String(fromFlags.httpPort ?? DEFAULT_HTTP_PORT)),
    DEFAULT_HTTP_PORT,
  )
  const httpsPort = parsePort(
    await ask('宿主机 HTTPS 端口', String(fromFlags.httpsPort ?? DEFAULT_HTTPS_PORT)),
    DEFAULT_HTTPS_PORT,
  )

  let skipModels = fromFlags.skipModels === true
  const skipRaw = await ask('跳过首启模型下载？(y/N)', skipModels ? 'y' : 'N')
  skipModels = /^(y|yes|1|true)$/i.test(skipRaw)

  return mergeSetupAnswers({
    mirror,
    dataStorage,
    dataPath,
    httpPort,
    httpsPort,
    skipModels,
  })
}

/**
 * Auto-pick free host ports when defaults / answers collide with occupied ports.
 * @param {SetupAnswers} answers
 * @returns {Promise<SetupAnswers>}
 */
export async function resolveSetupPorts(answers) {
  let httpsPort = answers.httpsPort
  let httpPort = answers.httpPort

  if (!(await isHostPortFree(httpsPort))) {
    const next = await findFreeHostPort({
      start: httpsPort + 1,
      exclude: httpPort > 0 ? [httpPort] : [],
    })
    console.log(`[opptrix] HTTPS 端口 ${httpsPort} 已被占用，已自动改用 ${next}`)
    httpsPort = next
  }

  if (httpPort > 0 && !(await isHostPortFree(httpPort))) {
    const next = await findFreeHostPort({
      start: httpPort + 1,
      exclude: [httpsPort],
    })
    console.log(`[opptrix] HTTP 端口 ${httpPort} 已被占用，已自动改用 ${next}`)
    httpPort = next
  }

  return { ...answers, httpsPort, httpPort }
}

/**
 * Persist setup answers to .opptrix.json, compose.env, and optional override.
 * @param {string} root
 * @param {SetupAnswers} answers
 */
export function applySetupAnswers(root, answers) {
  fs.mkdirSync(root, { recursive: true })
  ensureThinDeploy(root)
  ensureComposeEnv(root)

  const set = {
    OPPTRIX_HOST_HTTPS_PORT: String(answers.httpsPort),
    OPPTRIX_ENABLE_HTTP: answers.httpPort > 0 ? '1' : '0',
  }
  if (answers.httpPort > 0) {
    set.OPPTRIX_HOST_HTTP_PORT = String(answers.httpPort)
  }
  if (answers.skipModels) {
    set.OPPTRIX_SKIP_MODEL_FETCH = '1'
  }
  writeComposeEnvPatch(composeEnvPath(root), { set })

  if (answers.dataStorage === 'bind' && answers.dataPath) {
    fs.mkdirSync(answers.dataPath, { recursive: true })
    writeHomeBindOverride(root, answers.dataPath)
  } else {
    clearHomeBindOverride(root)
  }

  const meta = readPackageMeta()
  const prev = readHostConfig(root)
  /** @type {Record<string, unknown>} */
  const patch = {
    mirror: answers.mirror,
    skipModels: answers.skipModels,
    dataStorage: answers.dataStorage,
    dataPath: answers.dataPath,
    httpPort: answers.httpPort,
    httpsPort: answers.httpsPort,
    setupCompleted: true,
  }
  if (!prev.appRef) patch.appRef = meta.preferredAppTag
  writeHostConfig(root, patch)
}

export function printSetupHelp() {
  console.log(`Opptrix 部署设置

用法:
  opptrix setup [选项]
  opptrix setup --yes

交互（TTY）询问镜像源、数据存储、端口、是否跳过模型，并检查 Docker 开机自启（默认开启）。
非 TTY 或 --yes 时使用默认值 / 命令行选项，退出码 0；Linux 上会尝试启用 Docker 开机自启。

选项:
  --mirror auto|cn|foreign   镜像源（默认 auto）
  --data volume|<路径>       命名卷 opptrix-home，或宿主机绑定目录
  --http-port <n>            宿主机 HTTP（默认 0=不开启；反代可设 8711）
  --https-port <n>           宿主机 HTTPS（默认 8712；占用时自动改用空闲端口）
  --skip-models              跳过首启模型下载
  --yes, -y                  非交互，直接写入默认/选项
  --agree-tos                已阅读并同意用户协议（非 TTY 必填）
                             ${USER_AGREEMENT_URL}

示例:
  opptrix setup
  opptrix setup --yes --mirror cn --data /var/lib/opptrix
  opptrix setup --data volume --https-port 8712
`)
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @returns {Promise<number>}
 */
export async function cmdSetup(parsed) {
  if (flagTrue(parsed.flags, 'help', 'h') || parsed.args[0] === 'help') {
    printSetupHelp()
    return 0
  }

  const root = resolveDeployRoot()
  const tos = await ensureUserAgreementAccepted(parsed, { root, actionLabel: '完成部署设置' })
  if (tos !== 0) return tos

  const interactive = Boolean(process.stdin.isTTY) && !flagTrue(parsed.flags, 'yes', 'y')

  if (!interactive && !flagTrue(parsed.flags, 'yes', 'y') && !Object.keys(answersFromFlags(parsed)).length) {
    let answers = defaultSetupAnswers()
    try {
      answers = await resolveSetupPorts(answers)
    } catch (err) {
      console.error(`[opptrix] ${err instanceof Error ? err.message : err}`)
      return 1
    }
    applySetupAnswers(root, answers)
    console.log('[opptrix] 非 TTY：已写入默认部署设置（可用 opptrix setup --yes 或加选项显式确认）')
    console.log(`[opptrix] deploy root → ${root}`)
    console.log(`[opptrix] data=volume(${DEFAULT_VOLUME_NAME}) ports=${answers.httpPort}/${answers.httpsPort} mirror=${answers.mirror}`)
    const docker = detectDocker()
    if (docker.ok) {
      await ensureDockerEngineAutostart({
        interactive: false,
        yes: true,
      })
    }
    return 0
  }

  let answers
  try {
    answers = await collectSetupAnswers(parsed, { interactive })
  } catch (err) {
    console.error(`[opptrix] ${err instanceof Error ? err.message : err}`)
    return 2
  }

  try {
    answers = await resolveSetupPorts(answers)
  } catch (err) {
    console.error(`[opptrix] ${err instanceof Error ? err.message : err}`)
    return 1
  }

  applySetupAnswers(root, answers)
  console.log(`[opptrix] 部署设置已写入 → ${hostConfigPath(root)}`)
  console.log(`[opptrix] deploy root → ${root}`)
  console.log(
    `[opptrix] mirror=${answers.mirror} data=${answers.dataStorage === 'bind' ? answers.dataPath : `volume(${DEFAULT_VOLUME_NAME})`} http=${answers.httpPort} https=${answers.httpsPort} skipModels=${answers.skipModels}`,
  )
  if (answers.dataStorage === 'bind') {
    console.log(`[opptrix] 已生成 ${overrideComposePath(root)}（opptrix-home → 宿主机绑定）`)
  }

  const docker = detectDocker()
  if (docker.ok) {
    await ensureDockerEngineAutostart({
      interactive,
      yes: flagTrue(parsed.flags, 'yes', 'y'),
    })
  } else {
    console.log(`[opptrix] ${docker.message}`)
  }

  console.log('[opptrix] 下一步: opptrix up')
  return 0
}

/**
 * Run setup once before first up when host config is missing.
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @returns {Promise<number>} 0 ok, else abort up
 */
export async function ensureSetupBeforeUp(parsed) {
  const root = resolveDeployRoot()
  if (!needsSetup(root)) return 0
  console.log('[opptrix] 尚未完成部署设置，先运行 setup…')
  // Force --yes semantics when non-TTY so up does not hang
  if (!process.stdin.isTTY && !flagTrue(parsed.flags, 'yes', 'y')) {
    parsed.flags.yes = true
  }
  return cmdSetup(parsed)
}
