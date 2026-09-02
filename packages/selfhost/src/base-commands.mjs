/**
 * opptrix base … — Docker 底座（opptrix-selfhost-v*）管理。
 */
import {
  assertAppTagAllowed,
  classifyTagRelation,
  compareSemver,
  listAppTags,
  parseAppTag,
  parseSemver,
} from './app-refs.mjs'
import { appendUpdateAudit } from './update-audit.mjs'
import { normalizeBaseTag, baseTagToDisplayVersion } from './version-format.mjs'
import { flagTrue, flagString } from './parse.mjs'
import { readHostConfig, readPackageMeta, resolveDeployRoot, writeHostConfig } from './paths.mjs'
import { resolveGitCloneUrls, resolveMirrorProfile } from './mirrors.mjs'
import { resolveEnsureAppRef } from './ensure-source.mjs'

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {(parsed: import('./parse.mjs').ParsedArgv, opts?: { update?: boolean }) => Promise<number>} applyFn
 */
export async function handleBaseCommand(parsed, applyFn) {
  const sub = (parsed.args[0] || 'help').trim()
  const rest = parsed.args.slice(1)
  switch (sub) {
    case 'list':
    case 'tags':
      return cmdBaseList(parsed)
    case 'status':
      return cmdBaseStatus(parsed)
    case 'use':
      return cmdBaseUse(parsed, rest[0], applyFn)
    case 'apply':
      return cmdBaseApply(parsed, applyFn)
    case 'help':
    case '-h':
    case '--help':
      printBaseHelp()
      return 0
    default:
      console.error(`[opptrix] 未知 base 子命令: ${sub}`)
      printBaseHelp()
      return 2
  }
}

function printBaseHelp() {
  console.log(`Opptrix 底座（Docker 镜像）管理

用法:
  opptrix base list [--no-dates] [--json]
  opptrix base status
  opptrix base use <版本|tag|latest> [--apply] [--allow-downgrade]
  opptrix base apply

版本格式: 1.4.0 / v1.4.0 / opptrix-selfhost-v1.4.0 / latest（→ 包内 preferredAppTag）

说明:
  use 写入 .opptrix.json 的 appRef；apply 拉取预构建镜像并重建容器（保留数据卷）。
  降级需 --allow-downgrade。用户路径仅 pull，不本地编译。`)
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function cmdBaseList(parsed) {
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

  const mirror = resolveMirrorProfile(flagString(parsed.flags, 'mirror') || 'auto').profile
  const urls = resolveGitCloneUrls(mirror)
  const json = flagTrue(parsed.flags, 'json')

  console.log(`[opptrix] 底座轨道 opptrix-selfhost-v*（≥ ${meta.minAppTag}）`)
  console.log(`[opptrix] 当前配置 → ${currentRef}`)

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

  if (json) {
    console.log(JSON.stringify({ currentRef, rows: listed.rows, source: listed.url }, null, 2))
    return 0
  }

  console.log(`[opptrix] 来源 ${listed.url}`)
  if (!listed.rows.length) {
    console.log('[opptrix] 暂无可用的底座版本。')
    return 0
  }
  console.log('')
  console.log('标签\t版本\t发布日期\t状态')
  for (const row of listed.rows) {
    console.log(`${row.tag}\t${row.version}\t${row.date || '—'}\t${row.relationLabel || '—'}`)
  }
  console.log('')
  for (const row of listed.rows) {
    if (row.relation === 'current') continue
    const verb = row.relation === 'rollback' ? '回退' : '升级'
    console.log(`[opptrix] ${verb}: opptrix base use ${row.version}${verb === '升级' ? ' --apply' : ' --apply --allow-downgrade'}`)
  }
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function cmdBaseStatus(parsed) {
  const root = resolveDeployRoot()
  const cfg = readHostConfig(root)
  const meta = readPackageMeta()
  let resolved
  try {
    resolved = resolveEnsureAppRef({ root, ref: flagString(parsed.flags, 'ref') })
  } catch (err) {
    console.log(`[opptrix] base status: ${err instanceof Error ? err.message : err}`)
    return 1
  }
  console.log('[opptrix] 底座状态')
  console.log(`  配置 appRef: ${cfg.appRef ?? '(未设置)'}`)
  console.log(`  解析 ref: ${resolved.ref} (${resolved.source})`)
  console.log(`  CLI preferred: ${meta.preferredAppTag}`)
  console.log(`  镜像仓库: ${meta.imageRepository}`)
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {string | undefined} rawTarget
 * @param {(parsed: import('./parse.mjs').ParsedArgv, opts?: { update?: boolean }) => Promise<number>} applyFn
 */
export async function cmdBaseUse(parsed, rawTarget, applyFn) {
  const target = String(rawTarget ?? '').trim()
  if (!target) {
    console.error('[opptrix] 用法: opptrix base use <版本|latest|tag> [--apply] [--allow-downgrade]')
    return 2
  }

  const meta = readPackageMeta()
  const root = resolveDeployRoot()

  // "latest" → package preferredAppTag (published default), never invent a version
  let effectiveTarget = target
  if (target === 'latest') {
    effectiveTarget = meta.preferredAppTag
    console.log(`[opptrix] latest → 包内 preferredAppTag ${effectiveTarget}`)
  }

  const tag = normalizeBaseTag(effectiveTarget)
  if (!tag && effectiveTarget !== 'main') {
    console.error(`[opptrix] 无法识别底座版本: ${target}`)
    return 2
  }

  if (tag) {
    assertAppTagAllowed(tag, meta.minAppTag)
    const cfg = readHostConfig(root)
    const currentTag = cfg.appRef || meta.preferredAppTag
    const relation = classifyTagRelation(tag, currentTag)
    if (relation === 'rollback' && !flagTrue(parsed.flags, 'allow-downgrade')) {
      console.error(
        `[opptrix] ${tag} 低于当前 ${currentTag}。底座降级可能带来兼容风险，`
          + '若确认请追加 --allow-downgrade',
      )
      appendUpdateAudit({
        action: 'base.use',
        layer: 'base',
        targetVersion: tag,
        fromVersion: currentTag,
        ok: false,
        message: 'downgrade blocked',
        deployRoot: root,
      })
      return 1
    }
    writeHostConfig(root, { appRef: tag })
    console.log(`[opptrix] 已选定底座 ${tag} → ${root}/.opptrix.json`)
    appendUpdateAudit({
      action: 'base.use',
      layer: 'base',
      targetVersion: tag,
      fromVersion: currentTag,
      ok: true,
      message: 'appRef updated',
      deployRoot: root,
    })
  } else if (effectiveTarget === 'main') {
    writeHostConfig(root, { appRef: 'main' })
    console.log(
      '[opptrix] 已选定 main（开发分支）。用户请改用预构建 tag；'
        + '本地编译需 OPPTRIX_DEV_ALLOW_BUILD=1。',
    )
  }

  if (!flagTrue(parsed.flags, 'apply')) {
    console.log('[opptrix] 下一步: opptrix base apply')
    return 0
  }
  return cmdBaseApply(parsed, applyFn)
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {(parsed: import('./parse.mjs').ParsedArgv, opts?: { update?: boolean }) => Promise<number>} applyFn
 */
export async function cmdBaseApply(parsed, applyFn) {
  const root = resolveDeployRoot()
  const cfg = readHostConfig(root)
  const fromTag = cfg.appRef ?? readPackageMeta().preferredAppTag
  console.log('[opptrix] 正在应用底座更新（拉取镜像并重建容器，数据卷默认保留）…')
  const code = await applyFn(parsed, { update: true })
  appendUpdateAudit({
    action: 'base.apply',
    layer: 'base',
    targetVersion: cfg.appRef ?? fromTag,
    fromVersion: fromTag,
    ok: code === 0,
    exitCode: code,
    message: code === 0 ? 'compose up complete' : 'compose up failed',
    deployRoot: root,
  })
  return code
}

export { baseTagToDisplayVersion, normalizeBaseTag, compareSemver, parseSemver, parseAppTag }
