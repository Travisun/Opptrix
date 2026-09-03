#!/usr/bin/env node
/**
 * Opptrix self-host CLI — published as @opptrix/selfhost (bin: opptrix).
 *
 *   npm i -g @opptrix/selfhost
 *   opptrix init --mirror cn && opptrix up --mirror cn
 *
 * App snapshots: opptrix-selfhost-v*  ·  CLI npm tags: selfhost-v*  ·  Desktop: desktop-v*
 * Default path: pull prebuilt GHCR image; --build / pull fail → local clone + build.
 * Linux servers may use scripts/bootstrap/linux.sh (Docker + managed Node + this package).
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  assertAppTagAllowed,
  listAppTags,
  parseAppTag,
  resolveImageRef,
} from '../src/app-refs.mjs'
import { detectDocker, gitPull, npmLinkCli, npmUnlinkCli, probeHealth, resolveHealthProbe, runCompose } from '../src/compose.mjs'
import {
  ensureDockerEngineAutostart,
  reportAutostartDoctor,
} from '../src/autostart.mjs'
import {
  knownEnvKeyCatalogForRoot,
  knownEnvKeysForRoot,
  maskEnvValue,
  parseEnvSetTokens,
  readComposeEnvMap,
  resolveComposeEnvFile,
  warnPathEnvKey,
  warnUnknownEnvKey,
  writeComposeEnvPatch,
} from '../src/compose-env.mjs'
import {
  buildReleaseEnv,
  ensureBuildContext,
  ensureThinDeploy,
  isDevMonorepoRoot,
  resolveEnsureAppRef,
} from '../src/ensure-source.mjs'
import {
  formatGhcrProbeResults,
  resolveBuildMirrorEnv,
  resolveGhcrPullRepositories,
  resolveGitCloneUrls,
  resolveMirrorProfile,
} from '../src/mirrors.mjs'
import { flagString, flagTrue, parseArgv } from '../src/parse.mjs'
import { handleBaseCommand } from '../src/base-commands.mjs'
import { cmdData } from '../src/data-migrate.mjs'
import {
  afterComposeUpReady,
  ensureUserAgreementAccepted,
  parseHealthVersions,
  restartAndAwaitReady,
  USER_AGREEMENT_URL,
} from '../src/deploy-ux.mjs'
import {
  isContainerRunning,
  readComposeContainerName,
} from '../src/docker-runtime.mjs'
import {
  ensureDeployHostPorts,
  isHostPortListening,
  readConfiguredHostPorts,
  writeHostPorts,
  DEFAULT_HTTPS_PORT,
} from '../src/ports.mjs'
import { parsePort, cmdSetup, ensureSetupBeforeUp } from '../src/setup-wizard.mjs'
import { handleRuntimeCommand } from '../src/runtime-commands.mjs'
import { handleUpdateCommand } from '../src/update-commands.mjs'
import {
  ensureComposeEnv,
  isFullSourceTree,
  readHostConfig,
  readPackageMeta,
  resolveDeployRoot,
  resolvePackageRoot,
  writeHostConfig,
} from '../src/paths.mjs'

function printHelp() {
  const meta = readPackageMeta()
  console.log(`Opptrix 自托管管理（opptrix · ${meta.name}@${meta.version}）

用法:
  opptrix <命令> [选项]

安装:
  npm i -g @opptrix/selfhost
  # 仓内开发: npm run build -w @opptrix/selfhost && npm link -w @opptrix/selfhost

Linux 服务器也可: ./scripts/bootstrap/linux.sh（Docker + 托管 Node + 本 CLI）
macOS / Windows: 自备 Docker + Node ≥24 后 npm i -g @opptrix/selfhost

版本轨道（请勿混淆）:
  desktop-v*              桌面安装包（本 CLI 不使用）
  opptrix-selfhost-v*     自托管应用可安装快照（预构建镜像 / clone / 升级 / 回退）
  selfhost-v*             仅 CLI npm 发版标签，不是应用源码

默认安装 ${meta.preferredAppTag}（最低 ${meta.minAppTag}）；不会自动回退 main。
预构建镜像仓库: ${meta.imageRepository}（国内经 ghcr.nju.edu.cn / ghcr.milu.moe / ghcr.linkos.org 测速，最后回退 ghcr.io；海外 ghcr.io）

命令:
  init              生成 compose.env，保存默认镜像偏好
  setup             交互式部署设置（镜像源 / 数据目录 / 端口 / Docker 开机自启）
  doctor            检查 Docker / Compose / 部署目录 / 端口 / 版本
  base              底座（Docker 镜像）list / status / use / apply
  runtime           运行时热更新 list / status / use / apply / rollback
  update            联合 status / audit / all（legacy: 等同 base apply）
  tags              [别名] opptrix base list
  use <tag|main>    [别名] opptrix base use
  up                拉取预构建镜像并启动（无主机配置时先 setup；端口占用时自动改用空闲端口）
  start             启动已有容器（不重建）
  stop              停止容器
  restart           重启容器
  port              查看 / 设置宿主机 HTTPS 端口（status / set）
  env               管理 compose.env（set / get / list / unset / keys）
  data              数据路径迁移：path / migrate（命名卷 ↔ 宿主机目录）
  down              停止并移除容器（默认保留数据卷；加 --volumes 才会删卷）
  build             仅本地构建镜像（需 OPPTRIX_DEV_ALLOW_BUILD=1）
  update            [legacy] 等同 opptrix base apply（拉预构建镜像并重建容器）
  logs              查看日志（-f / --follow 跟踪）
  status            容器状态（compose ps）
  health            探测本机 HTTPS 健康检查（端口见配置，默认 8712）
  compose           透传 docker compose：opptrix compose -- <args…>
  install-cli       本机 npm link 本包
  uninstall-cli     npm unlink -g @opptrix/selfhost
  help              显示帮助

选项:
  --mirror cn|foreign|auto
                        构建与 clone 区域（默认 auto：按时区/语言与 Docker Hub 连通性检测；
                        也可读 .opptrix.json / OPPTRIX_BUILD_MIRROR）
  --ref <tag|main>      本次使用的应用版本（写入前可用 use 固定偏好）
  --apply               use 后直接 ensure + 启动
  --allow-downgrade     允许底座降到更低 opptrix-selfhost-v*
  --yes, -y             setup / data migrate / runtime apply / port set 等跳过确认
  --agree-tos           表示已阅读并同意用户协议（非 TTY 启动前必填；见 ${USER_AGREEMENT_URL}）
  --skip-models         跳过首启模型下载（OPPTRIX_SKIP_MODEL_FETCH=1）
  --data volume|<路径>  setup 数据存储（命名卷或宿主机目录）
  --http-port / --https-port  setup / up 宿主机端口（HTTP 默认关闭 / HTTPS 8712；占用时自动改用空闲端口）
  --to <路径|volume>    data migrate 目标
  --dry-run             data 只打印迁移计划
  --build               开发者本地编译（需 OPPTRIX_DEV_ALLOW_BUILD=1）
  --no-build            开发者本地路径下 up 时不加 --build（已有镜像时）
  --volumes             down 时删除数据/模型/系统槽位卷（危险，不可恢复）
  -f, --follow          logs 跟踪输出
  --tail <n>            logs 尾部行数（默认 200）
  --no-restart          env set/unset 后只写 compose.env，不重建容器
  --force-recreate      env set/unset 后 docker compose up -d --force-recreate

环境变量:
  OPPTRIX_DEPLOY_DIR    Compose / 部署目录（默认：当前 monorepo 或 ~/.opptrix/instances/default）
  OPPTRIX_GIT_REF       显式应用 ref（tag 或 main；未设置时用 .opptrix.json / 包内默认 tag）
  OPPTRIX_APP_REF       同 OPPTRIX_GIT_REF（备选名）
  OPPTRIX_IMAGE         完整镜像引用（手动覆盖时跳过镜像站测速）
  OPPTRIX_IMAGE_REPO    镜像仓库路径（默认 ${meta.imageRepository}；仍会按区域改写 registry 主机）
  OPPTRIX_GHCR_MIRROR   强制 GHCR 镜像站主机（如 ghcr.nju.edu.cn）
  OPPTRIX_DEV_ALLOW_BUILD=1  允许开发者本地 Docker 构建（配合 --build / build / OPPTRIX_FORCE_BUILD）
  OPPTRIX_FORCE_BUILD=1 同 --build（仍需 OPPTRIX_DEV_ALLOW_BUILD=1）
  OPPTRIX_BUILD_MIRROR  cn|foreign|auto（与 --mirror 相同）
  OPPTRIX_FORCE_CN=1    强制国内源（检测时）

示例:
  opptrix setup
  opptrix setup --yes --mirror cn --data /var/lib/opptrix
  opptrix init
  opptrix base list
  opptrix base use 1.4.1 --apply
  opptrix base use latest --apply
  opptrix runtime list
  opptrix runtime use latest --apply --yes
  opptrix update status
  opptrix up
  opptrix up --https-port 8720
  opptrix up --ref ${meta.preferredAppTag}
  opptrix up --skip-models
  opptrix port status
  opptrix port set 8720 --yes
  opptrix data path /var/lib/opptrix --yes
  opptrix data migrate --to volume --dry-run
  opptrix env set OPPTRIX_UPDATE_CHECK_INTERVAL_HOURS=6
  opptrix env keys
  opptrix env list
  opptrix logs -f
`)
}

function printEnvHelp() {
  console.log(`Opptrix compose.env 管理

用法:
  opptrix env set KEY=VALUE [KEY2=VALUE2 …]
  opptrix env get KEY
  opptrix env list
  opptrix env unset KEY [KEY2 …]
  opptrix env keys

说明:
  写入部署目录下的 compose.env（与 opptrix init 相同位置）。
  默认在修改后执行 docker compose up -d，使新环境变量注入容器
  （restart 不会重载 env_file，请勿用手动 restart 代替）。
  env keys 列出 compose.env.example 中的已知键（含简短说明）。

选项:
  --no-restart        只更新 compose.env，不启动/重建容器
  --force-recreate    修改后强制重建容器（路径类变量变更时推荐）

示例:
  opptrix env set OPPTRIX_UPDATE_CHECK_INTERVAL_HOURS=12
  opptrix env set LLM_API_KEY=sk-xxx LLM_PROVIDER=DeepSeek
  opptrix env unset LLM_API_KEY
  opptrix env keys
  opptrix env list
`)
}

function printPortHelp() {
  console.log(`Opptrix 宿主机端口

用法:
  opptrix port status
  opptrix port set <端口> [--yes] [--agree-tos]

说明:
  查看或更改 HTTPS 宿主机发布端口（写入 OPPTRIX_HOST_HTTPS_PORT 与 .opptrix.json）。
  set 后会 docker compose up -d --force-recreate，并等待健康检查。
  启动时若默认端口被占用，up / setup 会自动改用空闲端口。

示例:
  opptrix port status
  opptrix port set 8720 --yes --agree-tos
`)
}

/**
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 * @param {{ set?: Record<string, string>, unset?: string[] }} patch
 */
async function applyComposeEnvChange(parsed, patch) {
  const root = resolveDeployRoot()
  fs.mkdirSync(root, { recursive: true })
  ensureThinDeploy(root)
  const envFile = resolveComposeEnvFile(root)
  const known = knownEnvKeysForRoot(root)

  for (const key of [...Object.keys(patch.set ?? {}), ...(patch.unset ?? [])]) {
    const unk = warnUnknownEnvKey(key, known)
    if (unk) console.warn(unk)
    const pathWarn = warnPathEnvKey(key)
    if (pathWarn) console.warn(pathWarn)
  }

  const result = writeComposeEnvPatch(envFile, patch)
  console.log(`[opptrix] compose.env 已更新 → ${result.path}`)

  if (patch.set) {
    for (const [key, value] of Object.entries(patch.set)) {
      console.log(`[opptrix]   set ${key}=${maskEnvValue(key, value)}`)
    }
  }
  if (patch.unset?.length) {
    for (const key of patch.unset) {
      console.log(`[opptrix]   unset ${key}`)
    }
  }

  if (flagTrue(parsed.flags, 'no-restart')) {
    console.log('[opptrix] 已跳过容器重建；请稍后执行 opptrix up 或 docker compose up -d 使配置生效')
    return 0
  }

  const docker = detectDocker()
  if (!docker.ok) {
    console.warn(`[opptrix] WARN: ${docker.message}`)
    console.warn('[opptrix] compose.env 已保存；Docker 就绪后请执行 opptrix up')
    return 0
  }

  const { root: deployRoot, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
  const args = ['up', '-d']
  if (flagTrue(parsed.flags, 'force-recreate')) args.push('--force-recreate')
  console.log('[opptrix] 正在重建容器以注入新环境变量…')
  const code = await runCompose(args, { root: deployRoot, mirror, releaseEnv })
  return finishComposeStart(deployRoot, code)
}

async function cmdEnv(parsed) {
  const sub = (parsed.args[0] || '').trim()
  const rest = parsed.args.slice(1)

  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    printEnvHelp()
    return 0
  }

  const root = resolveDeployRoot()
  ensureThinDeploy(root)
  const envFile = resolveComposeEnvFile(root)

  if (sub === 'list') {
    const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : ''
    const map = readComposeEnvMap(text)
    if (!map.size) {
      console.log(`[opptrix] compose.env 暂无有效变量 → ${envFile}`)
      return 0
    }
    console.log(`[opptrix] compose.env → ${envFile}`)
    for (const [key, value] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`${key}=${maskEnvValue(key, value)}`)
    }
    return 0
  }

  if (sub === 'get') {
    const key = (rest[0] || '').trim()
    if (!key) {
      console.error('[opptrix] 用法: opptrix env get KEY')
      return 2
    }
    const text = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : ''
    const map = readComposeEnvMap(text)
    if (!map.has(key)) {
      console.error(`[opptrix] compose.env 中未找到 ${key}`)
      return 1
    }
    console.log(maskEnvValue(key, map.get(key) ?? ''))
    return 0
  }

  if (sub === 'set') {
    if (!rest.length) {
      console.error('[opptrix] 用法: opptrix env set KEY=VALUE [KEY2=VALUE2 …]')
      return 2
    }
    const { entries, errors } = parseEnvSetTokens(rest)
    if (errors.length) {
      for (const err of errors) console.error(`[opptrix] ${err}`)
      return 2
    }
    if (!Object.keys(entries).length) {
      console.error('[opptrix] 未解析到任何 KEY=VALUE')
      return 2
    }
    return applyComposeEnvChange(parsed, { set: entries })
  }

  if (sub === 'unset') {
    if (!rest.length) {
      console.error('[opptrix] 用法: opptrix env unset KEY [KEY2 …]')
      return 2
    }
    const keys = rest.map(k => k.trim()).filter(Boolean)
    for (const key of keys) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        console.error(`[opptrix] 无效键名 "${key}"`)
        return 2
      }
    }
    return applyComposeEnvChange(parsed, { unset: keys })
  }

  if (sub === 'keys') {
    const catalog = knownEnvKeyCatalogForRoot(root)
    if (!catalog.length) {
      console.log('[opptrix] 未找到 compose.env.example 键目录')
      return 0
    }
    console.log(`[opptrix] 已知环境变量（来自 compose.env.example，共 ${catalog.length} 项）`)
    for (const row of catalog) {
      if (row.comment) {
        console.log(`${row.key}\t# ${row.comment}`)
      } else {
        console.log(row.key)
      }
    }
    return 0
  }

  console.error(`[opptrix] 未知 env 子命令: ${sub}`)
  printEnvHelp()
  return 2
}

/**
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 */
async function cmdPort(parsed) {
  const sub = (parsed.args[0] || '').trim()
  if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
    printPortHelp()
    return 0
  }

  const root = resolveDeployRoot()

  if (sub === 'status') {
    const ports = readConfiguredHostPorts(root)
    const probe = resolveHealthProbe(root)
    const listening = await isHostPortListening(ports.httpsPort)
    const name = readComposeContainerName(root)
    const running = isContainerRunning(name)
    console.log(`[opptrix] deploy root → ${root}`)
    console.log(`[opptrix] HTTPS 宿主机端口: ${ports.httpsPort}${listening ? '（监听中）' : '（未监听）'}`)
    if (ports.httpPort > 0) {
      const httpListening = await isHostPortListening(ports.httpPort)
      console.log(`[opptrix] HTTP 宿主机端口:  ${ports.httpPort}${httpListening ? '（监听中）' : '（未监听）'}`)
    } else {
      console.log('[opptrix] HTTP 宿主机端口:  已关闭')
    }
    console.log(`[opptrix] 健康探测: ${probe.url}`)
    console.log(`[opptrix] 容器 ${name}: ${running ? '运行中' : '未运行'}`)
    return 0
  }

  if (sub === 'set') {
    const raw = (parsed.args[1] || '').trim()
    if (!raw) {
      console.error('[opptrix] 用法: opptrix port set <端口> [--yes]')
      return 2
    }
    const httpsPort = parsePort(raw, 0)
    if (!httpsPort || httpsPort < 1) {
      console.error(`[opptrix] 无效端口: ${raw}`)
      return 2
    }

    const tos = await ensureUserAgreementAccepted(parsed, {
      root,
      actionLabel: '更改访问端口并重建服务',
    })
    if (tos !== 0) return tos

    if (!flagTrue(parsed.flags, 'yes', 'y') && process.stdin.isTTY) {
      console.log(`[opptrix] 将把 HTTPS 宿主机端口改为 ${httpsPort} 并重建容器`)
      console.log('[opptrix] 继续请加 --yes')
      return 2
    }

    ensureThinDeploy(root)
    ensureComposeEnv(root)
    const prev = readConfiguredHostPorts(root)
    writeHostPorts(root, { httpsPort, httpPort: prev.httpPort })
    console.log(`[opptrix] 已写入 HTTPS 端口 ${httpsPort} → compose.env / .opptrix.json`)

    const docker = detectDocker()
    if (!docker.ok) {
      console.warn(`[opptrix] WARN: ${docker.message}`)
      console.warn('[opptrix] 端口已保存；Docker 就绪后请执行 opptrix up')
      return 0
    }

    const { root: deployRoot, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
    console.log('[opptrix] 正在重建容器以应用新端口…')
    const code = await runCompose(['up', '-d', '--force-recreate'], {
      root: deployRoot,
      mirror,
      releaseEnv,
    })
    return finishComposeStart(deployRoot, code)
  }

  console.error(`[opptrix] 未知 port 子命令: ${sub}`)
  printPortHelp()
  return 2
}

/**
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 * @returns {import('../src/mirrors.mjs').BuildMirrorProfile}
 */
function resolveMirror(parsed) {
  const fromFlag = flagString(parsed.flags, 'mirror')
  if (fromFlag) {
    const r = resolveMirrorProfile(fromFlag)
    if (r.auto) console.log(`[opptrix] mirror=${r.profile}（自动检测: ${r.reason}）`)
    return r.profile
  }
  const cfg = readHostConfig(resolveDeployRoot())
  if (cfg.mirror != null && String(cfg.mirror).trim() !== '') {
    const r = resolveMirrorProfile(String(cfg.mirror))
    if (r.auto) console.log(`[opptrix] mirror=${r.profile}（配置 auto → ${r.reason}）`)
    return r.profile
  }
  if (process.env.OPPTRIX_BUILD_MIRROR) {
    const r = resolveMirrorProfile(process.env.OPPTRIX_BUILD_MIRROR)
    if (r.auto) console.log(`[opptrix] mirror=${r.profile}（环境 auto → ${r.reason}）`)
    else console.log(`[opptrix] mirror=${r.profile}（OPPTRIX_BUILD_MIRROR）`)
    return r.profile
  }
  const r = resolveMirrorProfile('auto')
  console.log(`[opptrix] mirror=${r.profile}（自动检测: ${r.reason}）`)
  return r.profile
}

/**
 * Developer-only gate for local Docker image builds.
 * @param {NodeJS.ProcessEnv} [env]
 */
function devAllowBuild(env = process.env) {
  const v = String(env.OPPTRIX_DEV_ALLOW_BUILD ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

/**
 * Force local Docker build (skip prebuilt pull). Requires OPPTRIX_DEV_ALLOW_BUILD.
 * Non-app-tag refs alone do NOT trigger local build — users must pull a prebuilt tag.
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 */
function wantsLocalBuild(parsed) {
  if (!devAllowBuild()) return false
  if (flagTrue(parsed.flags, 'build')) return true
  if (process.env.OPPTRIX_FORCE_BUILD === '1') return true
  return false
}

/**
 * User-facing refusal when local build was requested without the dev gate.
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 */
function refuseLocalBuildUnlessDev(parsed) {
  const asked = flagTrue(parsed.flags, 'build') || process.env.OPPTRIX_FORCE_BUILD === '1'
  if (!asked || devAllowBuild()) return null
  console.error(
    '[opptrix] 本地 Docker 构建仅供开发者使用。请执行 opptrix up 拉取预构建镜像；'
      + '若必须本机编译，请设置 OPPTRIX_DEV_ALLOW_BUILD=1 后再加 --build。',
  )
  return 2
}

/**
 * Ordered pull refs for an app tag (CN: speed-tested mirrors; foreign: official ghcr.io).
 * @param {string} appTag
 * @param {import('../src/mirrors.mjs').BuildMirrorProfile} mirror
 * @returns {{
 *   images: string[],
 *   winnerHost: string,
 *   reason: string,
 *   probeResults: Array<{ host: string, ok: boolean, ms: number }>,
 * }}
 */
function resolvePullImageCandidates(appTag, mirror) {
  const meta = readPackageMeta()
  const plan = resolveGhcrPullRepositories({
    profile: mirror,
    imageRepository: meta.imageRepository,
    env: process.env,
  })
  const images = []
  for (const repo of plan.repositories) {
    const ref = resolveImageRef(appTag, {
      imageRepository: repo,
      env: {},
    })
    if (ref) images.push(ref)
  }
  return {
    images: [...new Set(images)],
    winnerHost: plan.winnerHost,
    reason: plan.reason,
    probeResults: plan.probeResults,
  }
}

/**
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 * @param {{ needFullSource?: boolean }} [opts]
 */
function prepareRoot(parsed, opts = {}) {
  let root = resolveDeployRoot()
  const mirror = resolveMirror(parsed)
  const refFlag = flagString(parsed.flags, 'ref')
  if (opts.needFullSource === true) {
    root = ensureBuildContext(root, { mirror, ref: refFlag })
  } else {
    // Thin deploy for pull / start / stop — no full monorepo clone
    root = ensureThinDeploy(root)
  }
  const resolved = resolveEnsureAppRef({ root, ref: refFlag })
  // Monorepo 开发树未强制 checkout tag：release 身份按当前工作区（main@sha），除非用户显式 --ref tag
  let releaseRef = resolved.ref
  if (isDevMonorepoRoot(root) && !(resolved.explicit && parseAppTag(resolved.ref))) {
    releaseRef = 'main'
  }
  const releaseEnv = buildReleaseEnv(root, releaseRef)
  return { root, mirror, resolved, releaseEnv, releaseRef }
}

/**
 * After successful compose up/start: wait for health and print ready summary.
 * @param {string} root
 * @param {number} code
 */
async function finishComposeStart(root, code) {
  if (code !== 0) return code
  return afterComposeUpReady(root)
}

/**
 * Local build path: full source + compose up --build (unless --no-build).
 * @param {{
 *   root: string,
 *   mirror: import('../src/mirrors.mjs').BuildMirrorProfile,
 *   releaseEnv: Record<string, string>,
 *   skipModels: boolean,
 *   noBuild?: boolean,
 * }} ctx
 */
async function upWithLocalBuild(ctx) {
  const args = ['up', '-d']
  if (!ctx.noBuild) args.push('--build')
  // Clear prebuilt image override so compose tags opptrix:local from build
  const env = { ...ctx.releaseEnv }
  if (!process.env.OPPTRIX_IMAGE) {
    env.OPPTRIX_IMAGE = 'opptrix:local'
  }
  const code = await runCompose(args, {
    root: ctx.root,
    mirror: ctx.mirror,
    skipModels: ctx.skipModels,
    releaseEnv: env,
  })
  return finishComposeStart(ctx.root, code)
}

/**
 * Prefer GHCR pull only. Local build requires OPPTRIX_DEV_ALLOW_BUILD + --build / FORCE_BUILD.
 * Pull failures never silently fall back to clone+build.
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 * @param {{ update?: boolean }} [opts]
 */
async function cmdUpOrUpdate(parsed, opts = {}) {
  const blocked = refuseLocalBuildUnlessDev(parsed)
  if (blocked != null) return blocked

  const mirror = resolveMirror(parsed)
  let root = resolveDeployRoot()
  const tos = await ensureUserAgreementAccepted(parsed, {
    root,
    actionLabel: opts.update ? '更新并启动服务' : '启动服务',
  })
  if (tos !== 0) return tos

  // Engine autostart once per up/update (container policy enforced after compose ready)
  await ensureDockerEngineAutostart({
    interactive: Boolean(process.stdin.isTTY) && !flagTrue(parsed.flags, 'yes', 'y'),
    yes: flagTrue(parsed.flags, 'yes', 'y') || !process.stdin.isTTY,
  })

  const refFlag = flagString(parsed.flags, 'ref')
  const resolved = resolveEnsureAppRef({ root, ref: refFlag })
  const skipModels = flagTrue(parsed.flags, 'skip-models')
    || readHostConfig(root).skipModels === true
  const forceBuild = wantsLocalBuild(parsed)
  const noBuild = flagTrue(parsed.flags, 'no-build')
  const meta = readPackageMeta()

  const httpsFlag = flagString(parsed.flags, 'https-port')
  const httpFlag = flagString(parsed.flags, 'http-port')
  try {
    await ensureDeployHostPorts(root, {
      httpsPort: httpsFlag ? parsePort(httpsFlag, DEFAULT_HTTPS_PORT) : undefined,
      httpPort: httpFlag != null && httpFlag !== ''
        ? parsePort(httpFlag, 0)
        : undefined,
    })
  } catch (err) {
    console.error(`[opptrix] ${err instanceof Error ? err.message : err}`)
    return 1
  }

  if (opts.update) {
    console.log(
      '[opptrix] 更新容器镜像；数据卷（opptrix-home 或旧版三卷）默认保留，不会删除挂载数据',
    )
    console.log(
      '[opptrix] 升级保留: compose.env / .opptrix.json / docker-compose.override.yml，以及 Docker 卷 opptrix-home（或旧版 opptrix-data / opptrix-models / opptrix-system）',
    )
    console.log(
      '[opptrix] 拉取预构建镜像；已有核心模型不会重下（强制重下请在 compose.env 设 OPPTRIX_FORCE_MODEL_FETCH=1）',
    )
    console.log(
      '[opptrix] 说明: 本命令升级 Docker 底座/镜像；启动时冲掉旧热更新 pending，以镜像内运行时晋升/激活并走库迁移与钩子（非应用内热更新下载）',
    )
    console.log(
      '[opptrix] 目录: 新布局 OPPTRIX_HOME=/opptrix（private/workspace/mounts/models/system）；旧三卷用 docker-compose.legacy-volumes.yml',
    )
  }

  if (forceBuild) {
    console.log('[opptrix] 开发者本地编译（OPPTRIX_DEV_ALLOW_BUILD + --build / OPPTRIX_FORCE_BUILD）')
    root = ensureBuildContext(root, { mirror, ref: refFlag })
    ensureComposeEnv(root)
    writeHostConfig(root, { mirror, skipModels })
    let releaseRef = resolved.ref
    if (isDevMonorepoRoot(root) && !(resolved.explicit && parseAppTag(resolved.ref))) {
      releaseRef = 'main'
    }
    const releaseEnv = buildReleaseEnv(root, releaseRef)
    if (opts.update && fs.existsSync(path.join(root, '.git'))) {
      const pullCode = await gitPull(root, resolved.ref)
      if (pullCode !== 0) {
        console.error('[opptrix] 源码同步未完全成功；仍可手动改代码后执行 up')
      }
    }
    console.log('[opptrix] 提示: CLI 包更新请执行 npm update -g @opptrix/selfhost（selfhost-v*）')
    return upWithLocalBuild({
      root,
      mirror,
      releaseEnv,
      skipModels,
      noBuild: opts.update ? false : noBuild,
    })
  }

  if (!parseAppTag(resolved.ref) && !process.env.OPPTRIX_IMAGE?.trim()) {
    console.error(
      `[opptrix] ref=${resolved.ref} 不是可拉取的应用快照 tag（opptrix-selfhost-v*）。`
        + `请执行 opptrix base use ${meta.preferredAppTag}（或 opptrix base use latest）后 opptrix up，`
        + '或设置 OPPTRIX_IMAGE 指向已发布的预构建镜像。'
        + '本地编译仅开发者可用：OPPTRIX_DEV_ALLOW_BUILD=1 opptrix up --build',
    )
    return 1
  }

  // Prebuilt path: thin deploy + pull (never fall back to local build)
  root = ensureThinDeploy(root)
  ensureComposeEnv(root)
  writeHostConfig(root, { mirror, skipModels })
  let releaseRef = resolved.ref
  if (isDevMonorepoRoot(root) && !(resolved.explicit && parseAppTag(resolved.ref))) {
    releaseRef = 'main'
  }
  const releaseEnv = buildReleaseEnv(root, releaseRef)

  const failPull = (detail) => {
    console.error(`[opptrix] 拉取预构建镜像失败。${detail}`)
    console.error(
      '[opptrix] 请检查：1) 该 tag 是否已发布到 GHCR；2) 网络 / 防火墙；'
        + '3) 国内可试 --mirror cn 或 OPPTRIX_GHCR_MIRROR；4) opptrix base list 确认可用版本。'
        + ` 默认推荐 ${meta.preferredAppTag}。不会自动本地编译。`,
    )
    return 1
  }

  if (process.env.OPPTRIX_IMAGE?.trim()) {
    const imageRef = process.env.OPPTRIX_IMAGE.trim()
    console.log(`[opptrix] 使用 OPPTRIX_IMAGE=${imageRef}`)
    const pullEnv = { ...releaseEnv, OPPTRIX_IMAGE: imageRef }
    const pullCode = await runCompose(['pull'], { root, mirror, releaseEnv: pullEnv })
    if (pullCode === 0) {
      console.log('[opptrix] 预构建镜像已就绪，启动中…')
      const upCode = await runCompose(['up', '-d'], { root, mirror, skipModels, releaseEnv: pullEnv })
      return finishComposeStart(root, upCode)
    }
    return failPull(`OPPTRIX_IMAGE=${imageRef}（exit ${pullCode}）`)
  }

  const candidates = resolvePullImageCandidates(resolved.ref, mirror)
  if (!candidates.images.length) {
    return failPull(`无法解析预构建镜像引用（ref=${resolved.ref}）`)
  }

  if (mirror === 'cn' && candidates.probeResults.length) {
    console.log(`[opptrix] GHCR 国内镜像测速: ${formatGhcrProbeResults(candidates.probeResults)}`)
    console.log(`[opptrix] 选用 ${candidates.winnerHost}（${candidates.reason}）`)
  } else if (mirror === 'foreign') {
    console.log(`[opptrix] GHCR 使用官方 ${candidates.winnerHost}`)
  }

  for (const imageRef of candidates.images) {
    console.log(`[opptrix] 拉取预构建镜像 ${imageRef}`)
    const pullEnv = { ...releaseEnv, OPPTRIX_IMAGE: imageRef }
    const pullCode = await runCompose(['pull'], {
      root,
      mirror,
      releaseEnv: pullEnv,
    })
    if (pullCode === 0) {
      console.log('[opptrix] 预构建镜像已就绪，启动中…')
      const upCode = await runCompose(['up', '-d'], {
        root,
        mirror,
        skipModels,
        releaseEnv: pullEnv,
      })
      return finishComposeStart(root, upCode)
    }
    console.warn(`[opptrix] WARN: 拉取 ${imageRef} 失败（exit ${pullCode}），尝试下一源…`)
  }

  return failPull(`已尝试：${candidates.images.join(' → ')}`)
}

async function cmdInit(parsed) {
  const mirror = resolveMirror(parsed)
  const root = resolveDeployRoot()
  fs.mkdirSync(root, { recursive: true })
  ensureThinDeploy(root)
  if (!fs.existsSync(path.join(root, 'compose.env.example'))) {
    const bundled = path.join(resolvePackageRoot(), 'bundle', 'compose.env.example')
    if (fs.existsSync(bundled)) {
      fs.copyFileSync(bundled, path.join(root, 'compose.env.example'))
    }
  }
  const force = flagTrue(parsed.flags, 'force')
  const result = ensureComposeEnv(root, { force })
  const meta = readPackageMeta()
  const patch = { mirror, skipModels: flagTrue(parsed.flags, 'skip-models') }
  const existing = readHostConfig(root)
  if (!existing.appRef) patch.appRef = meta.preferredAppTag
  writeHostConfig(root, patch)
  const resolved = resolveBuildMirrorEnv(mirror)
  console.log(`[opptrix] compose.env ${result.created ? '已创建' : '已存在'} → ${result.path}`)
  console.log(`[opptrix] 默认 mirror=${resolved.profile}（写入 .opptrix.json；可用 --mirror 覆盖）`)
  console.log(`[opptrix] 默认应用版本 ${(existing.appRef || meta.preferredAppTag)}（opptrix tags / use 可切换）`)
  console.log(`[opptrix] 预构建镜像 ${meta.imageRepository}:<tag>（opptrix up 优先 pull）`)
  console.log(`[opptrix] deploy root → ${root}`)
  if (resolved.profile === 'cn') {
    console.log('[opptrix] 国内构建（仅开发者）: Node 前缀 docker.1ms.run/library/ + npm 候选华为/腾讯/官方 + 阿里云 Debian；clone 优先 Gitee')
    console.log('[opptrix] 国内拉镜像：对 ghcr.nju.edu.cn / ghcr.milu.moe / ghcr.linkos.org 测速，最后回退 ghcr.io（可用 OPPTRIX_GHCR_MIRROR 固定）')
  } else {
    console.log('[opptrix] 海外：官方 Docker/npm/apt；clone 优先 GitHub；拉镜像用官方 ghcr.io')
  }
  console.log('[opptrix] 下一步: opptrix up（拉取预构建镜像）')
  return 0
}

async function cmdDoctor(parsed) {
  const d = detectDocker()
  console.log(`[opptrix] ${d.message}`)
  if (d.docker) console.log(`[opptrix] docker server ${d.docker}`)
  if (d.compose) console.log(`[opptrix] ${d.compose}`)
  const meta = readPackageMeta()
  console.log(`[opptrix] package ${meta.name}@${meta.version} → ${resolvePackageRoot()}`)
  console.log(`[opptrix] preferredAppTag=${meta.preferredAppTag} minAppTag=${meta.minAppTag}`)
  console.log(`[opptrix] imageRepository=${meta.imageRepository}`)

  const root = resolveDeployRoot()
  console.log(`[opptrix] deploy root → ${root}`)
  if (isFullSourceTree(root)) {
    console.log('[opptrix] OK full source tree (apps/packages/client-ui) — 开发者本地构建可用（需 OPPTRIX_DEV_ALLOW_BUILD=1）')
  } else if (fs.existsSync(path.join(root, 'docker-compose.yml'))) {
    console.log('[opptrix] OK thin deploy（compose 清单）— 默认 pull 预构建镜像')
  } else {
    console.log('[opptrix] 提示: 尚无 compose；执行 up 将写入 bundle 清单并 pull 预构建')
  }

  const containerName = readComposeContainerName(root)
  const containerRunning = isContainerRunning(containerName)
  console.log(`[opptrix] 容器 ${containerName}: ${containerRunning ? '运行中' : '未运行'}`)
  if (d.ok) {
    if (process.platform === 'linux') {
      await ensureDockerEngineAutostart({
        interactive: Boolean(process.stdin.isTTY),
        yes: !process.stdin.isTTY,
      })
    }
    reportAutostartDoctor(containerName, { autoFix: true, includeEngine: true })
  }

  const ports = readConfiguredHostPorts(root)
  const probe = resolveHealthProbe(root)
  const httpsListening = await isHostPortListening(ports.httpsPort)
  console.log(
    `[opptrix] HTTPS 宿主机端口 ${ports.httpsPort}${httpsListening ? '（监听中）' : '（未监听）'}`
      + ` → ${probe.url}`,
  )
  if (ports.httpPort > 0) {
    const httpListening = await isHostPortListening(ports.httpPort)
    console.log(
      `[opptrix] HTTP 宿主机端口 ${ports.httpPort}${httpListening ? '（监听中）' : '（未监听）'}`,
    )
  }

  let runtimeVersion = null
  let baseVersion = null
  try {
    const h = await probeHealth(root)
    const versions = parseHealthVersions(h.body)
    runtimeVersion = versions.runtimeVersion
    baseVersion = versions.baseVersion
  } catch {
    // ignore probe/parse errors
  }
  const cfg = readHostConfig(root)
  if (!baseVersion) {
    baseVersion = typeof cfg.appRef === 'string' && cfg.appRef.trim()
      ? cfg.appRef.trim()
      : meta.preferredAppTag
  }
  console.log(`[opptrix] 运行时版本: ${runtimeVersion || '（未探测）'}`)
  console.log(`[opptrix] 底座版本:   ${baseVersion}`)

  const need = [
    'docker-compose.yml',
    'Dockerfile',
    'compose.env.example',
  ]
  let missing = 0
  for (const rel of need) {
    const ok = fs.existsSync(path.join(root, rel))
    console.log(`[opptrix] ${ok ? 'OK' : 'MISSING'} ${rel}`)
    if (!ok) missing++
  }

  const composePath = path.join(root, 'docker-compose.yml')
  const composeEnvPathLocal = path.join(root, 'compose.env')
  if (fs.existsSync(composePath)) {
    const composeText = fs.readFileSync(composePath, 'utf8')
    const usesHome = /opptrix-home:|OPPTRIX_HOME/.test(composeText)
    const usesLegacy = /opptrix-data:|OPPTRIX_DATA_DIR:\s*"\/data"/.test(composeText)
    if (usesHome) {
      console.log('[opptrix] OK compose 使用统一卷 opptrix-home → /opptrix')
    } else if (usesLegacy) {
      console.log('[opptrix] OK compose 使用旧三卷布局（或 legacy 清单）')
    } else {
      console.log('[opptrix] 提示: 未能识别 compose 卷布局；请确认 OPPTRIX_DATA_DIR / OPPTRIX_SYSTEM_DIR')
    }
  }
  if (fs.existsSync(composeEnvPathLocal)) {
    const envText = fs.readFileSync(composeEnvPathLocal, 'utf8')
    const dataDir = /(?:^|\n)\s*OPPTRIX_DATA_DIR\s*=\s*(\S+)/.exec(envText)?.[1]
    const homeDir = /(?:^|\n)\s*OPPTRIX_HOME\s*=\s*(\S+)/.exec(envText)?.[1]
    if (dataDir === '/data' && fs.existsSync(composePath)) {
      const composeText = fs.readFileSync(composePath, 'utf8')
      if (/OPPTRIX_HOME:\s*"\/opptrix"|opptrix-home:/.test(composeText) && homeDir !== '/opptrix') {
        console.log(
          '[opptrix] WARN: compose.env 仍为 OPPTRIX_DATA_DIR=/data，但 compose 已是 /opptrix 布局；'
            + '请对照 compose.env.example 更新，或改用 docker-compose.legacy-volumes.yml',
        )
      }
    }
    if (homeDir === '/opptrix' || dataDir === '/opptrix/private') {
      console.log('[opptrix] OK compose.env 指向统一 /opptrix 布局')
    }
  } else {
    console.log('[opptrix] 提示: 尚无 compose.env（将使用镜像/compose 默认环境）')
  }
  if (fs.existsSync(path.join(root, 'docker-compose.legacy-volumes.yml'))) {
    console.log('[opptrix] OK 附带 docker-compose.legacy-volumes.yml（旧三卷迁移）')
  }

  console.log(`[opptrix] config mirror=${cfg.mirror ?? '(unset)'} appRef=${cfg.appRef ?? '(unset)'}`)
  try {
    const resolved = resolveEnsureAppRef({ root, ref: flagString(parsed.flags, 'ref') })
    console.log(`[opptrix] resolved ref=${resolved.ref} (${resolved.source})`)
    if (parseAppTag(resolved.ref)) {
      const mirrorNow = resolveMirror(parsed)
      const candidates = resolvePullImageCandidates(resolved.ref, mirrorNow)
      if (candidates.probeResults.length) {
        console.log(`[opptrix] GHCR mirror probe → ${formatGhcrProbeResults(candidates.probeResults)}`)
      }
      console.log(
        `[opptrix] GHCR pull host=${candidates.winnerHost} (${candidates.reason})`
          + (candidates.images[0] ? ` → ${candidates.images[0]}` : ''),
      )
      if (candidates.images.length > 1) {
        console.log(`[opptrix] pull fallbacks: ${candidates.images.slice(1).join(' → ')}`)
      }
    }
  } catch (err) {
    console.log(`[opptrix] resolved ref: ${err instanceof Error ? err.message : err}`)
  }
  const detected = resolveMirrorProfile('auto')
  console.log(`[opptrix] auto-detect now → ${detected.profile} (${detected.reason})`)
  console.log(`[opptrix] node ${process.version} platform=${process.platform}/${process.arch}`)
  if (process.platform !== 'linux') {
    console.log('[opptrix] 提示: 一键 bootstrap 仅 Linux；本机请自备 Docker + Node')
  }
  if (!d.ok) return 1
  if (isFullSourceTree(root) && missing > 0) return 1
  return 0
}

async function cmdTags(parsed) {
  const meta = readPackageMeta()
  const root = resolveDeployRoot()
  const cfg = readHostConfig(root)
  let currentRef = ''
  try {
    currentRef = resolveEnsureAppRef({
      root,
      ref: flagString(parsed.flags, 'ref'),
    }).ref
  } catch {
    currentRef = cfg.appRef || meta.preferredAppTag
  }

  const mirror = resolveMirror(parsed)
  const urls = resolveGitCloneUrls(mirror)
  console.log(`[opptrix] 应用快照轨道：opptrix-selfhost-v*（≥ ${meta.minAppTag}）`)
  console.log(`[opptrix] CLI 包内 preferred=${meta.preferredAppTag}  min=${meta.minAppTag}`)
  console.log(`[opptrix] 预构建镜像 ${meta.imageRepository}:opptrix-selfhost-v*`)
  console.log(`[opptrix] 当前实例配置 ref=${cfg.appRef || '(未设置)'} → 解析为 ${currentRef}`)
  console.log(`[opptrix] CLI npm 发版标签 selfhost-v* 仅用于包发布，不用于 clone`)
  console.log(`[opptrix] 查询镜像: ${urls.join(' → ')}`)

  let listed
  try {
    listed = listAppTags({
      urls,
      currentRef,
      minVersion: parseAppTag(meta.minAppTag)?.version,
      withDates: !flagTrue(parsed.flags, 'no-dates'),
    })
  } catch (err) {
    console.error(`[opptrix] ${err instanceof Error ? err.message : err}`)
    return 1
  }

  console.log(`[opptrix] 来源 ${listed.url}`)
  if (!listed.rows.length) {
    console.log('[opptrix] 暂无可用的应用快照。')
    console.log(`[opptrix] 远端可能尚未推送 ${meta.minAppTag}；请稍后再试，或显式 --ref main（风险自担）。`)
    return 0
  }

  console.log('')
  console.log('标签\t版本\t发布日期\t状态')
  for (const row of listed.rows) {
    const date = row.date || '—'
    const status = row.relationLabel || '—'
    console.log(`${row.tag}\t${row.version}\t${date}\t${status}`)
  }
  console.log('')
  for (const row of listed.rows) {
    if (row.relation === 'current') continue
    const verb = row.relation === 'rollback' ? '回退' : '升级'
    console.log(`[opptrix] ${verb}到 ${row.tag}: opptrix use ${row.tag} && opptrix up`)
  }
  return 0
}

async function cmdUse(parsed) {
  const target = (parsed.args[0] || '').trim()
  if (!target) {
    console.error('[opptrix] 用法: opptrix use <opptrix-selfhost-vX.Y.Z|main> [--apply]')
    return 2
  }
  const meta = readPackageMeta()
  if (parseAppTag(target)) {
    assertAppTagAllowed(target, meta.minAppTag)
  } else if (target !== 'main' && !target.startsWith('opptrix-selfhost-v')) {
    console.error(
      `[opptrix] 不支持的版本引用: ${target}。请使用 opptrix-selfhost-v* 或显式 main。`,
    )
    return 2
  } else if (target.startsWith('opptrix-selfhost-v') && !parseAppTag(target)) {
    console.error(`[opptrix] 标签格式无效: ${target}`)
    return 2
  }

  const root = resolveDeployRoot()
  fs.mkdirSync(root, { recursive: true })
  writeHostConfig(root, { appRef: target })
  console.log(`[opptrix] 已写入应用版本偏好 appRef=${target} → ${path.join(root, '.opptrix.json')}`)
  if (target === 'main') {
    console.log(
      '[opptrix] 注意: main 为开发分支。用户请改用 opptrix-selfhost-v* 预构建 tag；'
        + '本地编译需 OPPTRIX_DEV_ALLOW_BUILD=1 opptrix up --build。',
    )
  }
  if (!flagTrue(parsed.flags, 'apply')) {
    console.log('[opptrix] 下一步: opptrix up   （或 opptrix use … --apply 一步完成）')
    return 0
  }
  return cmdUp(parsed)
}

async function cmdUp(parsed) {
  const setupCode = await ensureSetupBeforeUp(parsed)
  if (setupCode !== 0) return setupCode
  return cmdUpOrUpdate(parsed, { update: false })
}

async function cmdUpdate(parsed) {
  return cmdUpOrUpdate(parsed, { update: true })
}

async function cmdLogs(parsed) {
  const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
  const follow = flagTrue(parsed.flags, 'follow', 'f')
  const tail = flagString(parsed.flags, 'tail') || '200'
  const args = ['logs', '--tail', tail]
  if (follow) args.push('-f')
  return runCompose(args, { root, mirror, releaseEnv })
}

async function main() {
  const parsed = parseArgv(process.argv.slice(2))
  const cmd = parsed.command

  try {
    switch (cmd) {
      case 'help':
      case '-h':
      case '--help':
      case undefined:
        printHelp()
        return cmd ? 0 : 0
      case 'init':
        return await cmdInit(parsed)
      case 'setup':
        return await cmdSetup(parsed)
      case 'doctor':
        return await cmdDoctor(parsed)
      case 'base':
        return await handleBaseCommand(parsed, cmdUpOrUpdate)
      case 'runtime':
        return await handleRuntimeCommand(parsed)
      case 'tags':
        return await handleBaseCommand(
          { ...parsed, command: 'base', args: ['list', ...parsed.args] },
          cmdUpOrUpdate,
        )
      case 'use':
        return await handleBaseCommand(
          { ...parsed, command: 'base', args: ['use', ...parsed.args] },
          cmdUpOrUpdate,
        )
      case 'up':
        return await cmdUp(parsed)
      case 'start': {
        const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
        const tos = await ensureUserAgreementAccepted(parsed, { root, actionLabel: '启动服务' })
        if (tos !== 0) return tos
        const startCode = await runCompose(['start'], { root, mirror, releaseEnv })
        return finishComposeStart(root, startCode)
      }
      case 'stop': {
        const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
        return runCompose(['stop'], { root, mirror, releaseEnv })
      }
      case 'restart': {
        const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
        const tos = await ensureUserAgreementAccepted(parsed, { root, actionLabel: '重启服务' })
        if (tos !== 0) return tos
        return restartAndAwaitReady(root, { mirror, releaseEnv })
      }
      case 'env':
        return await cmdEnv(parsed)
      case 'port':
        return await cmdPort(parsed)
      case 'data':
        return await cmdData(parsed)
      case 'down': {
        const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
        const args = ['down']
        if (flagTrue(parsed.flags, 'volumes')) {
          console.warn(
            '[opptrix] WARN: --volumes 将删除 Docker 卷（含 opptrix-home 或旧版 opptrix-data / opptrix-models / opptrix-system 及其中数据），不可恢复',
          )
          args.push('-v')
        } else {
          console.log(
            '[opptrix] 移除容器；数据卷 / 模型卷 / 系统槽位卷默认保留（不会删除挂载数据）。若要清空卷请显式加 --volumes',
          )
        }
        return runCompose(args, { root, mirror, releaseEnv })
      }
      case 'build': {
        if (!devAllowBuild()) {
          console.error(
            '[opptrix] opptrix build 仅供开发者。请使用 opptrix up 拉取预构建镜像；'
              + '若必须本机编译，请设置 OPPTRIX_DEV_ALLOW_BUILD=1 后再执行。',
          )
          return 2
        }
        const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: true })
        return runCompose(['build'], {
          root,
          mirror,
          skipModels: flagTrue(parsed.flags, 'skip-models'),
          releaseEnv: { ...releaseEnv, OPPTRIX_IMAGE: process.env.OPPTRIX_IMAGE || 'opptrix:local' },
        })
      }
      case 'update':
        if (!parsed.args.length || parsed.args[0] === 'apply' || parsed.args[0] === 'up') {
          return await cmdUpOrUpdate(parsed, { update: true })
        }
        return await handleUpdateCommand(parsed, cmdUpOrUpdate)
      case 'logs':
        return await cmdLogs(parsed)
      case 'status':
      case 'ps': {
        const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
        return runCompose(['ps'], { root, mirror, releaseEnv })
      }
      case 'health': {
        const root = resolveDeployRoot()
        const h = await probeHealth(root)
        if (h.ok) {
          console.log(`[opptrix] health OK (${h.status}) ${h.body}`)
          return 0
        }
        console.error(`[opptrix] health FAIL ${h.error || h.status || ''} ${h.body || ''}`)
        return 1
      }
      case 'compose': {
        const { root, mirror, releaseEnv } = prepareRoot(parsed, { needFullSource: false })
        return runCompose(parsed.args.length ? parsed.args : [], { root, mirror, releaseEnv })
      }
      case 'install-cli': {
        console.log('[opptrix] npm link @opptrix/selfhost …')
        const code = await npmLinkCli()
        if (code === 0) {
          console.log('[opptrix] 已安装。也可: npm i -g @opptrix/selfhost')
          console.log('[opptrix] 请执行: opptrix doctor')
        }
        return code
      }
      case 'uninstall-cli':
        return npmUnlinkCli()
      default:
        console.error(`[opptrix] 未知命令: ${cmd}`)
        printHelp()
        return 2
    }
  } catch (err) {
    console.error(`[opptrix] ${err instanceof Error ? err.message : err}`)
    return 1
  }
}

const code = await main()
process.exit(code)
