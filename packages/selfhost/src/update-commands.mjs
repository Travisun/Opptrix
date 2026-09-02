/**
 * opptrix update … — 联合状态 / 审计 / 一键升级。
 */
import { appendUpdateAudit, readUpdateAudit } from './update-audit.mjs'
import { cmdBaseApply, cmdBaseList, cmdBaseStatus, cmdBaseUse } from './base-commands.mjs'
import { cmdRuntimeApply, cmdRuntimeList, cmdRuntimeStatus, cmdRuntimeUse } from './runtime-commands.mjs'
import { flagString, flagTrue } from './parse.mjs'
import { readHostConfig, readPackageMeta, resolveDeployRoot } from './paths.mjs'
import { parseRuntimeCliJson, runRuntimeCli } from './docker-runtime.mjs'
import { normalizeBaseTag } from './version-format.mjs'

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {(parsed: import('./parse.mjs').ParsedArgv, opts?: { update?: boolean }) => Promise<number>} baseApplyFn
 */
export async function handleUpdateCommand(parsed, baseApplyFn) {
  const sub = (parsed.args[0] || 'status').trim()
  switch (sub) {
    case 'status':
      return cmdUpdateStatus(parsed)
    case 'audit':
      return cmdUpdateAudit(parsed)
    case 'all':
      return cmdUpdateAll(parsed, baseApplyFn)
    case 'help':
    case '-h':
    case '--help':
      printUpdateHelp()
      return 0
    default:
      console.error(`[opptrix] 未知 update 子命令: ${sub}（legacy: update = base apply）`)
      if (sub === 'apply' || !parsed.args.length) {
        return cmdBaseApply(parsed, baseApplyFn)
      }
      printUpdateHelp()
      return 2
  }
}

function printUpdateHelp() {
  console.log(`Opptrix 联合更新

用法:
  opptrix update status     # 底座 + runtime + CLI 摘要
  opptrix update audit [--tail N]
  opptrix update all [--yes] [--ref 底座版本]

legacy:
  opptrix update            # 等同 opptrix base apply`)
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export async function cmdUpdateStatus(parsed) {
  const meta = readPackageMeta()
  console.log(`[opptrix] 更新总览（CLI ${meta.name}@${meta.version}）`)
  console.log('')
  await cmdBaseStatus(parsed)
  console.log('')
  await cmdRuntimeStatus(parsed)
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 */
export function cmdUpdateAudit(parsed) {
  const tailRaw = flagString(parsed.flags, 'tail')
  const tail = tailRaw ? Number(tailRaw) : 20
  const rows = readUpdateAudit({ tail: Number.isFinite(tail) ? tail : 20 })
  if (!rows.length) {
    console.log('[opptrix] 尚无更新审计记录')
    return 0
  }
  console.log(`[opptrix] 更新审计（最近 ${rows.length} 条）→ ${resolveDeployRoot()}/.opptrix/update-audit.jsonl`)
  for (const row of rows) {
    const ok = row.ok ? 'OK' : 'FAIL'
    console.log(`${row.ts}\t${ok}\t${row.layer}\t${row.action}\t${row.targetVersion ?? ''}\t${row.message ?? ''}`)
  }
  return 0
}

/**
 * @param {import('./parse.mjs').ParsedArgv} parsed
 * @param {(parsed: import('./parse.mjs').ParsedArgv, opts?: { update?: boolean }) => Promise<number>} baseApplyFn
 */
export async function cmdUpdateAll(parsed, baseApplyFn) {
  const root = resolveDeployRoot()
  if (!flagTrue(parsed.flags, 'yes', 'y') && process.stdin.isTTY) {
    console.log('[opptrix] update all：按 CDN 要求升级底座（如需）→ staging runtime → apply')
    console.log('[opptrix] 数据卷默认保留；继续请加 --yes')
    return 2
  }

  const ref = flagString(parsed.flags, 'ref')
  if (ref) {
    const tag = normalizeBaseTag(ref)
    if (!tag) {
      console.error(`[opptrix] 无效 --ref: ${ref}`)
      return 2
    }
    const useCode = await cmdBaseUse({ ...parsed, flags: { ...parsed.flags, apply: true } }, ref, baseApplyFn)
    if (useCode !== 0) return useCode
  }

  const fetch = await runRuntimeCli(['fetch-latest', '--json'], { deployRoot: root })
  const latest = parseRuntimeCliJson(fetch.stdout)
  const minBase = latest?.latest?.requires?.minBaseImage
  if (typeof minBase === 'string' && minBase.trim()) {
    const cfg = readHostConfig(root)
    const currentBase = cfg.appRef ?? readPackageMeta().preferredAppTag
    if (currentBase !== minBase.trim()) {
      console.log(`[opptrix] runtime latest 需要底座 ${minBase}，当前 ${currentBase}`)
      const baseCode = await cmdBaseUse(
        { ...parsed, flags: { ...parsed.flags, apply: true } },
        minBase.trim(),
        baseApplyFn,
      )
      if (baseCode !== 0) return baseCode
    }
  }

  parsed.flags.apply = true
  parsed.flags.yes = true
  const useCode = await cmdRuntimeUse({ ...parsed, args: ['use', 'latest'] }, 'latest')
  if (useCode !== 0) {
    appendUpdateAudit({
      action: 'update.all',
      layer: 'combined',
      ok: false,
      message: 'runtime use failed',
      deployRoot: root,
    })
    return useCode
  }

  appendUpdateAudit({
    action: 'update.all',
    layer: 'combined',
    ok: true,
    message: 'base + runtime complete',
    deployRoot: root,
  })
  console.log('[opptrix] update all 完成')
  return 0
}
