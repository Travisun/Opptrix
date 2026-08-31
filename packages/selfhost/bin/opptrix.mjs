#!/usr/bin/env node
/**
 * Opptrix self-host CLI — published as @opptrix/selfhost (bin: opptrix).
 *
 *   npm i -g @opptrix/selfhost
 *   opptrix init --mirror cn && opptrix up --mirror cn
 *
 * Linux servers may use scripts/bootstrap/linux.sh (Docker + managed Node + this package).
 */

import fs from 'node:fs'
import path from 'node:path'
import { detectDocker, gitPull, npmLinkCli, npmUnlinkCli, probeHealth, runCompose } from '../src/compose.mjs'
import { ensureBuildContext } from '../src/ensure-source.mjs'
import { normalizeMirrorProfile, resolveBuildMirrorEnv } from '../src/mirrors.mjs'
import { flagString, flagTrue, parseArgv } from '../src/parse.mjs'
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

命令:
  init              生成 compose.env，保存默认镜像偏好
  doctor            检查 Docker / Compose / 构建上下文
  up                构建并启动（必要时自动 clone 完整源码）
  start             启动已有容器（不重建）
  stop              停止容器
  restart           重启容器
  down              停止并移除容器（默认保留数据卷）
  build             仅构建镜像
  update            更新源码（git）后重建并启动；建议同时 npm update -g @opptrix/selfhost
  logs              查看日志（-f / --follow 跟踪）
  status            容器状态（compose ps）
  health            探测 http://127.0.0.1:8711/api/health
  compose           透传 docker compose：opptrix compose -- <args…>
  install-cli       本机 npm link 本包
  uninstall-cli     npm unlink -g @opptrix/selfhost
  help              显示帮助

选项:
  --mirror cn|foreign   构建用镜像源（默认读 .opptrix.json 或 foreign）
  --skip-models         跳过首启模型下载（OPPTRIX_SKIP_MODEL_FETCH=1）
  --no-build            up 时不加 --build
  --volumes             down 时删除数据卷（危险）
  -f, --follow          logs 跟踪输出
  --tail <n>            logs 尾部行数（默认 200）

环境变量:
  OPPTRIX_DEPLOY_DIR    Compose / 源码树目录（默认：当前 monorepo 或 ~/.opptrix/instances/default）
  OPPTRIX_GIT_REF       clone 用的 tag/分支（默认 selfhost-v{version}，回退 main）
  --mirror cn           clone 默认 Gitee（失败再试 GitHub）
  --mirror foreign      clone 默认 GitHub（失败再试 Gitee）

示例:
  opptrix init --mirror cn
  opptrix up --mirror cn --skip-models
  opptrix logs -f
`)
}

/**
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 */
function resolveMirror(parsed) {
  const fromFlag = flagString(parsed.flags, 'mirror')
  if (fromFlag) return normalizeMirrorProfile(fromFlag)
  const cfg = readHostConfig(resolveDeployRoot())
  if (cfg.mirror) return normalizeMirrorProfile(String(cfg.mirror))
  if (process.env.OPPTRIX_BUILD_MIRROR) {
    return normalizeMirrorProfile(process.env.OPPTRIX_BUILD_MIRROR)
  }
  return 'foreign'
}

/**
 * @param {import('../src/parse.mjs').ParsedArgv} parsed
 * @param {{ needFullSource?: boolean }} [opts]
 */
function prepareRoot(parsed, opts = {}) {
  let root = resolveDeployRoot()
  const mirror = resolveMirror(parsed)
  if (opts.needFullSource !== false) {
    root = ensureBuildContext(root, { mirror })
  }
  return { root, mirror }
}

async function cmdInit(parsed) {
  const mirror = resolveMirror(parsed)
  const root = resolveDeployRoot()
  fs.mkdirSync(root, { recursive: true })
  if (!fs.existsSync(path.join(root, 'compose.env.example'))) {
    const bundled = path.join(resolvePackageRoot(), 'bundle', 'compose.env.example')
    if (fs.existsSync(bundled)) {
      fs.copyFileSync(bundled, path.join(root, 'compose.env.example'))
    }
  }
  const force = flagTrue(parsed.flags, 'force')
  const result = ensureComposeEnv(root, { force })
  writeHostConfig(root, { mirror, skipModels: flagTrue(parsed.flags, 'skip-models') })
  const resolved = resolveBuildMirrorEnv(mirror)
  console.log(`[opptrix] compose.env ${result.created ? '已创建' : '已存在'} → ${result.path}`)
  console.log(`[opptrix] 默认 mirror=${resolved.profile}（写入 .opptrix.json）`)
  console.log(`[opptrix] deploy root → ${root}`)
  if (resolved.profile === 'cn') {
    console.log('[opptrix] 国内构建将使用 DaoCloud Node 前缀 + npmmirror + 阿里云 Debian')
  }
  console.log('[opptrix] 下一步: opptrix up')
  return 0
}

async function cmdDoctor() {
  const d = detectDocker()
  console.log(`[opptrix] ${d.message}`)
  if (d.docker) console.log(`[opptrix] docker server ${d.docker}`)
  if (d.compose) console.log(`[opptrix] ${d.compose}`)
  const meta = readPackageMeta()
  console.log(`[opptrix] package ${meta.name}@${meta.version} → ${resolvePackageRoot()}`)

  const root = resolveDeployRoot()
  console.log(`[opptrix] deploy root → ${root}`)
  if (isFullSourceTree(root)) {
    console.log('[opptrix] OK full source tree (apps/packages/client-ui)')
  } else {
    console.log('[opptrix] 提示: 当前不是完整源码树；执行 up 时将自动 clone')
  }

  const need = [
    'docker-compose.yml',
    'Dockerfile',
    'compose.env.example',
    'scripts/docker-entrypoint.sh',
  ]
  let missing = 0
  for (const rel of need) {
    const ok = fs.existsSync(path.join(root, rel))
    console.log(`[opptrix] ${ok ? 'OK' : 'MISSING'} ${rel}`)
    if (!ok) missing++
  }
  const cfg = readHostConfig(root)
  console.log(`[opptrix] config mirror=${cfg.mirror ?? '(unset)'}`)
  console.log(`[opptrix] node ${process.version} platform=${process.platform}/${process.arch}`)
  if (process.platform !== 'linux') {
    console.log('[opptrix] 提示: 一键 bootstrap 仅 Linux；本机请自备 Docker + Node')
  }
  if (!d.ok) return 1
  if (isFullSourceTree(root) && missing > 0) return 1
  return 0
}

async function cmdUp(parsed) {
  const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
  const skipModels = flagTrue(parsed.flags, 'skip-models')
    || readHostConfig(root).skipModels === true
  const noBuild = flagTrue(parsed.flags, 'no-build')
  ensureComposeEnv(root)
  writeHostConfig(root, { mirror, skipModels })
  const args = ['up', '-d']
  if (!noBuild) args.push('--build')
  return runCompose(args, { root, mirror, skipModels })
}

async function cmdUpdate(parsed) {
  const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
  const skipModels = flagTrue(parsed.flags, 'skip-models')
  const pullCode = await gitPull(root)
  if (pullCode !== 0) {
    console.error('[opptrix] git pull 失败；仍可手动改代码后执行 up')
  }
  console.log('[opptrix] 提示: CLI 包更新请执行 npm update -g @opptrix/selfhost')
  return runCompose(['up', '-d', '--build'], { root, mirror, skipModels })
}

async function cmdLogs(parsed) {
  const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
  const follow = flagTrue(parsed.flags, 'follow', 'f')
  const tail = flagString(parsed.flags, 'tail') || '200'
  const args = ['logs', '--tail', tail]
  if (follow) args.push('-f')
  return runCompose(args, { root, mirror })
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
      case 'doctor':
        return await cmdDoctor(parsed)
      case 'up':
        return await cmdUp(parsed)
      case 'start': {
        const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
        return runCompose(['start'], { root, mirror })
      }
      case 'stop': {
        const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
        return runCompose(['stop'], { root, mirror })
      }
      case 'restart': {
        const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
        return runCompose(['restart'], { root, mirror })
      }
      case 'down': {
        const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
        const args = ['down']
        if (flagTrue(parsed.flags, 'volumes')) args.push('-v')
        return runCompose(args, { root, mirror })
      }
      case 'build': {
        const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
        return runCompose(['build'], {
          root,
          mirror,
          skipModels: flagTrue(parsed.flags, 'skip-models'),
        })
      }
      case 'update':
        return await cmdUpdate(parsed)
      case 'logs':
        return await cmdLogs(parsed)
      case 'status':
      case 'ps': {
        const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
        return runCompose(['ps'], { root, mirror })
      }
      case 'health': {
        const h = await probeHealth()
        if (h.ok) {
          console.log(`[opptrix] health OK (${h.status}) ${h.body}`)
          return 0
        }
        console.error(`[opptrix] health FAIL ${h.error || h.status || ''} ${h.body || ''}`)
        return 1
      }
      case 'compose': {
        const { root, mirror } = prepareRoot(parsed, { needFullSource: true })
        return runCompose(parsed.args.length ? parsed.args : [], { root, mirror })
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
