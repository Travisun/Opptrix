/**
 * Migrate opptrix-home data between named volume and host bind paths.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { probeHealth, runCompose } from './compose.mjs'
import { ensureContainerRestartPolicy } from './autostart.mjs'
import {
  isContainerRunning,
  readComposeContainerName,
} from './docker-runtime.mjs'
import { ensureThinDeploy } from './ensure-source.mjs'
import { flagString, flagTrue } from './parse.mjs'
import {
  ensureComposeEnv,
  readHostConfig,
  resolveDeployRoot,
  writeHostConfig,
} from './paths.mjs'

export const NAMED_VOLUME_KEY = 'opptrix-home'
export const CONTAINER_HOME = '/opptrix'

/**
 * @param {string} [root]
 */
export function overrideComposePath(root = resolveDeployRoot()) {
  return path.join(root, 'docker-compose.override.yml')
}

/**
 * Normalize a host data directory path (~ expansion).
 * @param {string} raw
 * @returns {string}
 */
export function normalizeHostDataPath(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) throw new Error('目标路径不能为空')
  if (trimmed === '~' || trimmed.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    if (!home) throw new Error('无法展开 ~：未设置 HOME/USERPROFILE')
    return path.resolve(home, trimmed === '~' ? '' : trimmed.slice(2))
  }
  return path.resolve(trimmed)
}

/**
 * Generate docker-compose.override.yml that redefines named volume as bind.
 * Matches Compose local bind via driver_opts (keeps `opptrix-home:/opptrix` in base compose).
 * @param {string} hostPath absolute path
 * @returns {string}
 */
export function generateHomeBindOverrideYaml(hostPath) {
  const abs = normalizeHostDataPath(hostPath)
  // YAML: quote path if needed
  const device = /[:#\s]/.test(abs) || abs.includes('\\') ? JSON.stringify(abs) : abs
  return `# Opptrix data path bind — managed by \`opptrix setup\` / \`opptrix data\`
# Redefines named volume ${NAMED_VOLUME_KEY} as a host bind (base compose still mounts ${NAMED_VOLUME_KEY}:${CONTAINER_HOME})
volumes:
  ${NAMED_VOLUME_KEY}:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${device}
`
}

/**
 * @param {string} text
 * @returns {string | null}
 */
export function parseBindDeviceFromOverride(text) {
  const m = /volumes:\s*\n\s*opptrix-home:\s*\n[\s\S]*?device:\s*([^\n]+)/.exec(text)
  if (!m) return null
  let raw = m[1].trim()
  if (
    (raw.startsWith('"') && raw.endsWith('"'))
    || (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1)
  }
  try {
    return normalizeHostDataPath(raw)
  } catch {
    return raw
  }
}

/**
 * @param {string} root
 * @param {string} hostPath
 */
export function writeHomeBindOverride(root, hostPath) {
  const abs = normalizeHostDataPath(hostPath)
  const dest = overrideComposePath(root)
  fs.writeFileSync(dest, generateHomeBindOverrideYaml(abs), 'utf8')
  return dest
}

/**
 * Remove managed home-bind override (restore default named volume).
 * @param {string} root
 * @returns {boolean} true if removed
 */
export function clearHomeBindOverride(root) {
  const dest = overrideComposePath(root)
  if (!fs.existsSync(dest)) return false
  const text = fs.readFileSync(dest, 'utf8')
  if (!/^# Opptrix data path bind/m.test(text)) return false
  // Managed file only (no extra services mounts) — safe to delete
  if (/^\s*services:\s*$/m.test(text)) return false
  fs.unlinkSync(dest)
  return true
}

/**
 * @returns {boolean}
 */
export function hasRsync() {
  const r = spawnSync('rsync', ['--version'], { encoding: 'utf8', shell: false })
  return r.status === 0
}

/**
 * Pure copy plan for tests / dry-run (host↔host).
 * @param {{
 *   fromKind: 'volume' | 'bind',
 *   toKind: 'volume' | 'bind',
 *   fromPath?: string | null,
 *   toPath?: string | null,
 *   volumeName?: string | null,
 *   preferRsync?: boolean,
 * }} input
 */
export function buildCopyPlan(input) {
  const preferRsync = input.preferRsync ?? hasRsync()
  /** @type {{ step: string, detail: string }[]} */
  const steps = []
  const fromKind = input.fromKind
  const toKind = input.toKind

  if (fromKind === 'bind' && toKind === 'bind') {
    const from = normalizeHostDataPath(input.fromPath || '')
    const to = normalizeHostDataPath(input.toPath || '')
    if (from === to) {
      return {
        ok: false,
        error: '源路径与目标路径相同',
        steps: [],
        copyMethod: null,
        from,
        to,
      }
    }
    const method = preferRsync ? 'rsync' : 'cp'
    steps.push({
      step: 'copy',
      detail: method === 'rsync'
        ? `rsync -aH --info=progress2 ${from}/ ${to}/`
        : `cp -a ${from}/. ${to}/`,
    })
    return { ok: true, error: null, steps, copyMethod: method, from, to, fromKind, toKind }
  }

  if (fromKind === 'volume' && toKind === 'bind') {
    const to = normalizeHostDataPath(input.toPath || '')
    const vol = input.volumeName || NAMED_VOLUME_KEY
    const method = preferRsync ? 'docker-rsync' : 'docker-cp'
    steps.push({
      step: 'copy',
      detail: `docker run --rm -v ${vol}:${CONTAINER_HOME}:ro -v ${to}:/to alpine sh -c 'cp -a ${CONTAINER_HOME}/. /to/'`,
    })
    return {
      ok: true,
      error: null,
      steps,
      copyMethod: method,
      from: vol,
      to,
      fromKind,
      toKind,
    }
  }

  if (fromKind === 'bind' && toKind === 'volume') {
    const from = normalizeHostDataPath(input.fromPath || '')
    const vol = input.volumeName || NAMED_VOLUME_KEY
    steps.push({
      step: 'copy',
      detail: `docker run --rm -v ${vol}:${CONTAINER_HOME} -v ${from}:/from:ro alpine sh -c 'cp -a /from/. ${CONTAINER_HOME}/'`,
    })
    return {
      ok: true,
      error: null,
      steps,
      copyMethod: 'docker-cp',
      from,
      to: vol,
      fromKind,
      toKind,
    }
  }

  return {
    ok: false,
    error: `不支持的迁移方向: ${fromKind} → ${toKind}`,
    steps: [],
    copyMethod: null,
  }
}

/**
 * Resolve compose project volume name for opptrix-home.
 * @param {string} root
 * @returns {string | null}
 */
export function resolveNamedVolumeName(root) {
  const r = spawnSync(
    'docker',
    ['compose', 'config', '--format', 'json'],
    { cwd: root, encoding: 'utf8', shell: false },
  )
  if (r.status === 0 && r.stdout) {
    try {
      const cfg = JSON.parse(r.stdout)
      const vol = cfg?.volumes?.[NAMED_VOLUME_KEY]
      if (vol && typeof vol.name === 'string' && vol.name.trim()) return vol.name.trim()
      if (vol && typeof vol.Name === 'string' && vol.Name.trim()) return vol.Name.trim()
    } catch {
      // fall through
    }
  }
  // Fallback: list docker volumes
  const ls = spawnSync('docker', ['volume', 'ls', '-q'], { encoding: 'utf8', shell: false })
  if (ls.status === 0) {
    const names = String(ls.stdout || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const exact = names.find((n) => n === NAMED_VOLUME_KEY || n.endsWith(`_${NAMED_VOLUME_KEY}`))
    if (exact) return exact
  }
  return null
}

/**
 * @param {string} root
 * @returns {{ kind: 'volume' | 'bind', path: string | null, volumeName: string | null }}
 */
export function resolveCurrentDataSource(root) {
  const cfg = readHostConfig(root)
  const overridePath = overrideComposePath(root)
  if (fs.existsSync(overridePath)) {
    const device = parseBindDeviceFromOverride(fs.readFileSync(overridePath, 'utf8'))
    if (device) {
      return { kind: 'bind', path: device, volumeName: null }
    }
  }
  if (cfg.dataStorage === 'bind' && cfg.dataPath) {
    return { kind: 'bind', path: String(cfg.dataPath), volumeName: null }
  }
  const volumeName = resolveNamedVolumeName(root)
  return { kind: 'volume', path: null, volumeName }
}

/**
 * @param {string} srcDir
 * @param {string} destDir
 * @returns {{ ok: boolean, method: string, error?: string }}
 */
export function copyHostToHost(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  if (hasRsync()) {
    const r = spawnSync(
      'rsync',
      ['-aH', '--info=progress2', `${srcDir}/`, `${destDir}/`],
      { encoding: 'utf8', shell: false, stdio: 'inherit' },
    )
    if (r.status === 0) return { ok: true, method: 'rsync' }
    return { ok: false, method: 'rsync', error: `rsync exit ${r.status}` }
  }
  const r = spawnSync('cp', ['-a', `${srcDir}/.`, destDir], {
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
  })
  if (r.status === 0) return { ok: true, method: 'cp' }
  return { ok: false, method: 'cp', error: `cp exit ${r.status}` }
}

/**
 * @param {string} volumeName
 * @param {string} destDir
 */
export function copyVolumeToHost(volumeName, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${volumeName}:${CONTAINER_HOME}:ro`,
      '-v',
      `${destDir}:/to`,
      'alpine',
      'sh',
      '-c',
      `cp -a ${CONTAINER_HOME}/. /to/`,
    ],
    { encoding: 'utf8', shell: false, stdio: 'inherit' },
  )
  if (r.status === 0) return { ok: true, method: 'docker-cp' }
  return { ok: false, method: 'docker-cp', error: `docker run exit ${r.status}` }
}

/**
 * @param {string} srcDir
 * @param {string} volumeName
 */
export function copyHostToVolume(srcDir, volumeName) {
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${volumeName}:${CONTAINER_HOME}`,
      '-v',
      `${srcDir}:/from:ro`,
      'alpine',
      'sh',
      '-c',
      `mkdir -p ${CONTAINER_HOME} && cp -a /from/. ${CONTAINER_HOME}/`,
    ],
    { encoding: 'utf8', shell: false, stdio: 'inherit' },
  )
  if (r.status === 0) return { ok: true, method: 'docker-cp' }
  return { ok: false, method: 'docker-cp', error: `docker run exit ${r.status}` }
}

function printCopyFailureRecovery(sourceLabel) {
  console.error('[opptrix] 复制失败：未删除源数据')
  console.error(`[opptrix] 恢复建议:`)
  console.error(`  1. 确认源仍在: ${sourceLabel}`)
  console.error('  2. 修复目标路径权限/磁盘空间后重试')
  console.error('  3. 勿手动 docker volume rm；配置未改动前仍可 opptrix up 使用原存储')
}

/**
 * @param {string} root
 * @param {number} [maxAttempts]
 */
export async function waitForHealth(root, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const h = await probeHealth(root)
    if (h.ok) {
      console.log(`[opptrix] health OK (${h.status}) ${h.url || ''}`.trim())
      return true
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  console.warn('[opptrix] WARN: 健康检查超时；容器可能仍在启动，请稍后 opptrix health')
  return false
}

export function printDataHelp() {
  console.log(`Opptrix 数据路径迁移

用法:
  opptrix data path <新目录> [--yes] [--dry-run]
  opptrix data migrate --to <路径|volume> [--yes] [--dry-run]
  opptrix data help

说明:
  在安装前或安装后均可执行。若容器在运行，会先 docker compose down（不加 -v，保留卷）。
  优先 rsync -aH --info=progress2，否则 cp -a。
  支持: 命名卷 → 宿主机目录、宿主机 → 另一目录、宿主机 → 命名卷。
  成功后更新 docker-compose.override.yml，使 opptrix-home 绑定到新路径，并 up -d。

选项:
  --to <路径|volume>   migrate 目标（volume = 恢复 Docker 命名卷）
  --yes, -y            TTY 下跳过确认（迁移会改挂载，建议显式确认）
  --dry-run            只打印复制计划，不执行

示例:
  opptrix data path /var/lib/opptrix --yes
  opptrix data migrate --to ~/opptrix-data --dry-run
  opptrix data migrate --to volume --yes
`)
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @returns {Promise<number>}
 */
export async function cmdData(parsed) {
  const sub = (parsed.args[0] || '').trim()
  if (!sub || sub === 'help' || sub === '-h' || sub === '--help' || flagTrue(parsed.flags, 'help', 'h')) {
    printDataHelp()
    return 0
  }

  let targetRaw = ''
  if (sub === 'path') {
    targetRaw = (parsed.args[1] || flagString(parsed.flags, 'to') || '').trim()
  } else if (sub === 'migrate') {
    targetRaw = (flagString(parsed.flags, 'to') || parsed.args[1] || '').trim()
  } else {
    console.error(`[opptrix] 未知 data 子命令: ${sub}`)
    printDataHelp()
    return 2
  }

  if (!targetRaw) {
    console.error('[opptrix] 用法: opptrix data path <新目录>  或  opptrix data migrate --to <路径|volume>')
    return 2
  }

  const dryRun = flagTrue(parsed.flags, 'dry-run')
  const yes = flagTrue(parsed.flags, 'yes', 'y')
  const root = resolveDeployRoot()
  fs.mkdirSync(root, { recursive: true })
  ensureThinDeploy(root)
  ensureComposeEnv(root)

  const current = resolveCurrentDataSource(root)
  const toVolume = targetRaw === 'volume' || targetRaw === NAMED_VOLUME_KEY || targetRaw === 'named'
  /** @type {'volume' | 'bind'} */
  const toKind = toVolume ? 'volume' : 'bind'
  /** @type {string | null} */
  const toPath = toVolume ? null : normalizeHostDataPath(targetRaw)

  if (current.kind === 'bind' && toKind === 'bind' && current.path && toPath === path.resolve(current.path)) {
    console.log('[opptrix] 目标与当前数据路径相同，无需迁移')
    return 0
  }
  if (current.kind === 'volume' && toKind === 'volume') {
    console.log('[opptrix] 已在使用命名卷 opptrix-home，无需迁移')
    return 0
  }

  const volumeName = current.volumeName
    || (toKind === 'volume' ? resolveNamedVolumeName(root) : null)
    || `${path.basename(root)}_opptrix-home`

  const plan = buildCopyPlan({
    fromKind: current.kind,
    toKind,
    fromPath: current.path,
    toPath,
    volumeName: current.kind === 'volume' ? (current.volumeName || volumeName) : volumeName,
  })

  console.log(`[opptrix] 数据迁移计划 (${current.kind} → ${toKind})`)
  console.log(`[opptrix] deploy root → ${root}`)
  if (current.kind === 'bind') console.log(`[opptrix] 源: ${current.path}`)
  else console.log(`[opptrix] 源卷: ${current.volumeName || volumeName}`)
  if (toKind === 'bind') console.log(`[opptrix] 目标: ${toPath}`)
  else console.log(`[opptrix] 目标卷: ${volumeName}`)
  for (const s of plan.steps) {
    console.log(`[opptrix]   ${s.step}: ${s.detail}`)
  }
  if (!plan.ok) {
    console.error(`[opptrix] ${plan.error}`)
    return 2
  }

  if (dryRun) {
    console.log('[opptrix] dry-run：未执行复制 / 未改配置')
    return 0
  }

  if (!yes && process.stdin.isTTY) {
    console.log('[opptrix] 迁移将停止容器并改写挂载配置；继续请加 --yes')
    return 2
  }
  if (!yes && !process.stdin.isTTY) {
    console.error('[opptrix] 非 TTY 迁移需要 --yes')
    return 2
  }

  const containerName = readComposeContainerName(root)
  if (isContainerRunning(containerName)) {
    console.log('[opptrix] 容器运行中，执行 compose down（保留卷，不加 -v）…')
    const downCode = await runCompose(['down'], { root })
    if (downCode !== 0) {
      console.error('[opptrix] compose down 失败，已中止（源数据未动）')
      return downCode
    }
  } else {
    // still try down to remove stopped container if any
    await runCompose(['down'], { root })
  }

  let copyResult = { ok: false, method: 'none', error: '未执行' }
  const sourceLabel = current.kind === 'bind' ? current.path : (current.volumeName || volumeName)

  try {
    if (current.kind === 'bind' && toKind === 'bind' && current.path && toPath) {
      copyResult = copyHostToHost(current.path, toPath)
    } else if (current.kind === 'volume' && toKind === 'bind' && toPath) {
      const vol = current.volumeName || volumeName
      // Ensure volume exists
      const inspect = spawnSync('docker', ['volume', 'inspect', vol], { encoding: 'utf8', shell: false })
      if (inspect.status !== 0) {
        console.log(`[opptrix] 命名卷 ${vol} 尚不存在（可能尚未安装）；将创建空目录并切换挂载`)
        fs.mkdirSync(toPath, { recursive: true })
        copyResult = { ok: true, method: 'mkdir-only' }
      } else {
        copyResult = copyVolumeToHost(vol, toPath)
      }
    } else if (current.kind === 'bind' && toKind === 'volume' && current.path) {
      // create volume if needed
      spawnSync('docker', ['volume', 'create', volumeName], { encoding: 'utf8', shell: false })
      copyResult = copyHostToVolume(current.path, volumeName)
    }
  } catch (err) {
    copyResult = { ok: false, method: 'error', error: err instanceof Error ? err.message : String(err) }
  }

  if (!copyResult.ok) {
    console.error(`[opptrix] 复制失败: ${copyResult.error || copyResult.method}`)
    printCopyFailureRecovery(String(sourceLabel))
    return 1
  }

  console.log(`[opptrix] 复制完成（${copyResult.method}）`)

  if (toKind === 'bind' && toPath) {
    writeHomeBindOverride(root, toPath)
    writeHostConfig(root, {
      dataStorage: 'bind',
      dataPath: toPath,
    })
    console.log(`[opptrix] 已更新 ${overrideComposePath(root)}`)
  } else {
    const cleared = clearHomeBindOverride(root)
    if (cleared) console.log('[opptrix] 已移除 bind override，恢复命名卷 opptrix-home')
    else if (fs.existsSync(overrideComposePath(root))) {
      console.warn('[opptrix] WARN: 存在非托管的 docker-compose.override.yml，请手动去掉 opptrix-home bind')
    }
    writeHostConfig(root, {
      dataStorage: 'volume',
      dataPath: null,
    })
  }

  console.log('[opptrix] 启动容器…')
  const upCode = await runCompose(['up', '-d'], { root })
  if (upCode !== 0) {
    console.error('[opptrix] up 失败；源数据仍保留，请检查 override / 权限后重试')
    return upCode
  }
  ensureContainerRestartPolicy(readComposeContainerName(root))
  await waitForHealth(root)
  console.log('[opptrix] 数据路径迁移完成')
  return 0
}
