/**
 * opptrix runtime … — 卷内热更新（始终经 Docker 内脚本执行）。
 */
import { appendUpdateAudit } from './update-audit.mjs'
import { normalizeRuntimeVersion } from './version-format.mjs'
import { flagTrue } from './parse.mjs'
import { readPackageMeta, resolveDeployRoot } from './paths.mjs'
import {
  dockerRestartContainer,
  parseRuntimeCliJson,
  readComposeContainerName,
  runRuntimeCli,
} from './docker-runtime.mjs'

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function handleRuntimeCommand(parsed) {
  const sub = (parsed.args[0] || 'help').trim()
  const rest = parsed.args.slice(1)
  switch (sub) {
    case 'list':
      return cmdRuntimeList(parsed)
    case 'status':
      return cmdRuntimeStatus(parsed)
    case 'use':
      return cmdRuntimeUse(parsed, rest[0])
    case 'apply':
      return cmdRuntimeApply(parsed)
    case 'rollback':
      return cmdRuntimeRollback(parsed)
    case 'help':
    case '-h':
    case '--help':
      printRuntimeHelp()
      return 0
    default:
      console.error(`[opptrix] 未知 runtime 子命令: ${sub}`)
      printRuntimeHelp()
      return 2
  }
}

function printRuntimeHelp() {
  console.log(`Opptrix 运行时热更新（Docker 卷内 slot）

用法:
  opptrix runtime list
  opptrix runtime status
  opptrix runtime use [latest|<版本>] [--apply] [--yes]
  opptrix runtime apply [--yes]
  opptrix runtime rollback [--yes]

说明:
  所有操作经 docker exec / compose run 在容器 Linux 环境内执行，不依赖 8711 API。
  use 默认拉取 CDN latest；也可 use CDN 保留的最近 8 个历史版本，或已有本机 slot。apply/rollback 后自动 restart 容器。
  用户数据在 /opptrix/private，不在 runtime 包内，升级/回退不会删除。`)
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
async function runCli(subArgs, parsed) {
  const root = resolveDeployRoot()
  const json = flagTrue(parsed.flags, 'json')
  const args = [...subArgs, '--json']
  const r = await runRuntimeCli(args, {
    deployRoot: root,
    inheritStdio: !json,
  })
  const payload = parseRuntimeCliJson(r.stdout)
  return { ...r, payload, deployRoot: root }
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function cmdRuntimeStatus(parsed) {
  const { code, payload, via, deployRoot } = await runCli(['status'], parsed)
  if (!payload?.ok) {
    console.error(`[opptrix] runtime status 失败 (exit ${code})`)
    if (payload?.error) console.error(`[opptrix] ${payload.error}`)
    return code || 1
  }
  console.log('[opptrix] 运行时状态')
  console.log(`  当前: ${payload.currentVersion ?? '—'}`)
  console.log(`  待应用: ${payload.pendingVersion ?? '—'}`)
  console.log(`  备份: ${payload.backupVersion ?? '—'}`)
  console.log(`  阶段: ${payload.uiPhase ?? '—'}`)
  console.log(`  底座: ${payload.baseVersion ?? '—'}`)
  console.log(`  架构: ${payload.arch ?? '—'}`)
  console.log(`  本机 slots: ${(payload.slots ?? []).join(', ') || '—'}`)
  console.log(`  via: ${via}`)
  appendUpdateAudit({
    action: 'runtime.status',
    layer: 'runtime',
    via,
    ok: true,
    deployRoot,
  })
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function cmdRuntimeList(parsed) {
  const root = resolveDeployRoot()
  const local = await runCli(['list-local'], parsed)
  const releases = await runCli(['fetch-releases'], parsed)

  console.log('[opptrix] 运行时版本列表')
  const catalog = releases.payload?.ok ? releases.payload.releases ?? [] : []
  const retention = releases.payload?.retention

  if (catalog.length > 0) {
    console.log('')
    console.log(`[CDN 保留版本${retention?.max ? ` · 最近 ${retention.max} 个` : ''}]`)
    for (const row of catalog) {
      const marker = local.payload?.currentVersion === row.version ? ' (当前)' : ''
      console.log(`  ${row.version}${marker}`)
      const desc = row.description
      const summary = desc?.features?.[0] ?? desc?.fixes?.[0]
      if (summary) console.log(`    ${summary}`)
      else console.log('    （暂无更新说明）')
    }
  } else {
    const latest = await runCli(['fetch-latest'], parsed)
    if (latest.payload?.ok && latest.payload.latest) {
      const l = latest.payload.latest
      console.log('')
      console.log('[CDN latest]')
      console.log(`  版本: ${l.version}`)
      console.log(`  架构包: ${l.archKey}`)
      const summary = l.description?.features?.[0] ?? l.description?.fixes?.[0]
      if (summary) console.log(`  说明: ${summary}`)
      const req = l.requires && typeof l.requires === 'object' ? l.requires : {}
      if (req.minBaseImage) console.log(`  需要底座: ${req.minBaseImage}`)
    } else {
      console.log('[opptrix] WARN: 无法读取 CDN 版本列表')
    }
  }

  const st = local.payload
  console.log('')
  console.log('[本机]')
  if (st?.ok) {
    console.log(`  当前 boot: ${st.currentVersion ?? '—'}`)
    console.log(`  pending: ${st.pendingVersion ?? '—'}`)
    console.log(`  backup: ${st.backupVersion ?? '—'}`)
    console.log(`  slots: ${(st.slots ?? []).join(', ') || '—'}`)
  }

  console.log('')
  console.log('[可 use 的目标]')
  console.log('  latest（CDN 最新）')
  for (const row of catalog) {
    if (row.version !== st?.currentVersion) console.log(`  ${row.version}（CDN）`)
  }
  for (const v of st?.slots ?? []) {
    if (v !== st.currentVersion && !catalog.some((r) => r.version === v)) {
      console.log(`  ${v}（本机 slot）`)
    }
  }
  appendUpdateAudit({
    action: 'runtime.list',
    layer: 'runtime',
    ok: true,
    deployRoot: root,
  })
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {string | undefined} raw
 */
export async function cmdRuntimeUse(parsed, raw) {
  const root = resolveDeployRoot()
  const input = String(raw ?? 'latest').trim() || 'latest'
  const version = input === 'latest' ? 'latest' : normalizeRuntimeVersion(input)
  if (input !== 'latest' && !version) {
    console.error(`[opptrix] 无法识别 runtime 版本: ${input}`)
    return 2
  }

  const target = version ?? 'latest'
  console.log(`[opptrix] runtime use ${target}（Docker 内下载/ staging）…`)
  const { code, payload, via } = await runCli(['use', target], parsed)

  if (!payload?.ok) {
    console.error(`[opptrix] runtime use 失败: ${payload?.error ?? `exit ${code}`}`)
    appendUpdateAudit({
      action: 'runtime.use',
      layer: 'runtime',
      via,
      targetVersion: target,
      ok: false,
      exitCode: code,
      message: String(payload?.error ?? ''),
      deployRoot: root,
    })
    return code || 1
  }

  if (payload.alreadyCurrent) {
    console.log(`[opptrix] 已是 latest ${payload.version}，无需 staging`)
  } else if (payload.needsBaseRefresh) {
    console.error('[opptrix] 此 runtime 需要更高底座，请先 opptrix base use … --apply')
    for (const r of payload.baseRefreshReasons ?? []) console.error(`  · ${r}`)
    appendUpdateAudit({
      action: 'runtime.use',
      layer: 'runtime',
      via,
      targetVersion: payload.version,
      ok: false,
      message: 'needs_base_refresh',
      deployRoot: root,
    })
    return 2
  } else {
    console.log(`[opptrix] 已 staging runtime ${payload.version}（待 apply）`)
  }

  appendUpdateAudit({
    action: 'runtime.use',
    layer: 'runtime',
    via,
    targetVersion: payload.version,
    fromVersion: payload.fromVersion,
    ok: true,
    deployRoot: root,
  })

  if (flagTrue(parsed.flags, 'apply') && payload.needsApply) {
    return cmdRuntimeApply(parsed)
  }
  if (payload.needsApply) {
    console.log('[opptrix] 下一步: opptrix runtime apply')
  }
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function cmdRuntimeApply(parsed) {
  const root = resolveDeployRoot()
  if (!flagTrue(parsed.flags, 'yes', 'y') && process.stdin.isTTY) {
    console.log('[opptrix] 将激活 pending runtime 并重启容器（用户数据库保留在 /opptrix/private）')
    console.log('[opptrix] 继续请加 --yes')
    return 2
  }

  const { code, payload, via, containerName } = await runCli(['apply'], parsed)
  if (!payload?.ok) {
    if (payload?.code === 'needs_base_refresh') {
      console.error('[opptrix] 需要先升级底座: opptrix base use <版本> --apply')
    } else {
      console.error(`[opptrix] runtime apply 失败: ${payload?.error ?? `exit ${code}`}`)
    }
    appendUpdateAudit({
      action: 'runtime.apply',
      layer: 'runtime',
      via,
      ok: false,
      exitCode: code,
      message: String(payload?.error ?? payload?.code ?? ''),
      deployRoot: root,
    })
    return code || 1
  }

  console.log(`[opptrix] 已切换 boot → ${payload.currentVersion}，正在重启容器…`)
  const restartCode = await dockerRestartContainer(containerName ?? readComposeContainerName(root))
  appendUpdateAudit({
    action: 'runtime.apply',
    layer: 'runtime',
    via,
    targetVersion: payload.currentVersion,
    fromVersion: payload.previousVersion,
    ok: restartCode === 0,
    exitCode: restartCode,
    message: 'activate + docker restart',
    deployRoot: root,
  })
  if (restartCode !== 0) {
    console.error('[opptrix] 容器重启失败，请手动 opptrix restart')
    return restartCode
  }
  console.log('[opptrix] 容器已重启；首次启动将执行库迁移与钩子（如有）')
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function cmdRuntimeRollback(parsed) {
  const root = resolveDeployRoot()
  if (!flagTrue(parsed.flags, 'yes', 'y') && process.stdin.isTTY) {
    console.log('[opptrix] 将回退到 backup runtime 并重启容器（不会删除 /opptrix/private 用户数据）')
    console.log('[opptrix] 继续请加 --yes')
    return 2
  }

  const { code, payload, via, containerName } = await runCli(['rollback'], parsed)
  if (!payload?.ok) {
    console.error(`[opptrix] runtime rollback 失败: ${payload?.error ?? `exit ${code}`}`)
    appendUpdateAudit({
      action: 'runtime.rollback',
      layer: 'runtime',
      via,
      ok: false,
      exitCode: code,
      message: String(payload?.error ?? ''),
      deployRoot: root,
    })
    return code || 1
  }

  console.log(`[opptrix] 已回退 ${payload.fromVersion} → ${payload.toVersion}，重启容器…`)
  const restartCode = await dockerRestartContainer(containerName ?? readComposeContainerName(root))
  appendUpdateAudit({
    action: 'runtime.rollback',
    layer: 'runtime',
    via,
    targetVersion: payload.toVersion,
    fromVersion: payload.fromVersion,
    ok: restartCode === 0,
    exitCode: restartCode,
    deployRoot: root,
  })
  return restartCode === 0 ? 0 : restartCode
}
