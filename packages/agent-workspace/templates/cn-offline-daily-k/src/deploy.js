/**
 * 部署 / 更新 / 状态 — 封装 prepare_fuyao_dump 约定（不写主库）。
 * @module deploy
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  STALE_FULL_DAYS,
  daysSinceLastSuccess,
  readMeta,
  writeMeta,
} from './meta.js'

/**
 * @typedef {import('./meta.js').OfflineKMeta} OfflineKMeta
 */

/**
 * @typedef {object} DeployPlan
 * @property {'full'|'incremental'} dumpKind 传给 prepare_fuyao_dump 的 dump_kind
 * @property {string} reason 决策原因
 * @property {number} daysSinceSuccess 距上次成功天数（无记录为 Infinity）
 * @property {string} agentHint 给 Agent 的下一步提示
 */

/**
 * @typedef {object} DeployStatus
 * @property {OfflineKMeta|null} meta
 * @property {'full'|'incremental'} recommendedDumpKind
 * @property {string} reason
 * @property {boolean} fullExists
 * @property {boolean} incrExists
 * @property {number} [fullBytes]
 * @property {number} [incrBytes]
 */

const FULL_FILE = 'cn-daily-k-full.parquet'
const INCR_FILE = 'cn-daily-k-incr.parquet'

/**
 * 根据元数据决定全量或增量。
 * 规则：无成功记录或距上次成功 > 10 日 → full；否则 incremental。
 *
 * @param {OfflineKMeta|null|undefined} meta
 * @param {Date} [now]
 * @returns {DeployPlan}
 * @example
 * decideDumpKind(null)
 * // { dumpKind: 'full', reason: '尚无成功更新记录', … }
 */
export function decideDumpKind(meta, now = new Date()) {
  const days = daysSinceLastSuccess(meta, now)
  if (!Number.isFinite(days)) {
    return {
      dumpKind: 'full',
      reason: '尚无成功更新记录，须全量（约十年日 K）',
      daysSinceSuccess: days,
      agentHint: 'prepare_fuyao_dump({ dump_kind: "full" })；成功会自动写 offline-k-meta（markUpdateSuccess 仅补写）',
    }
  }
  if (days > STALE_FULL_DAYS) {
    return {
      dumpKind: 'full',
      reason: `距上次成功已 ${days.toFixed(1)} 日（>${STALE_FULL_DAYS}），须全量`,
      daysSinceSuccess: days,
      agentHint: 'prepare_fuyao_dump({ dump_kind: "full" })；成功会自动写 offline-k-meta（markUpdateSuccess 仅补写）',
    }
  }
  return {
    dumpKind: 'incremental',
    reason: `距上次成功 ${days.toFixed(1)} 日（≤${STALE_FULL_DAYS}），可用增量（约 10 日）`,
    daysSinceSuccess: days,
    agentHint: 'prepare_fuyao_dump({ dump_kind: "incremental" })；成功会自动写 offline-k-meta（markUpdateSuccess 仅补写）',
  }
}

/**
 * 记录一次成功的 dump 准备（只写 offline-k-meta.json）。
 *
 * @param {string} metaPath 元数据绝对路径
 * @param {object} opts
 * @param {'full'|'incremental'} opts.dumpKind
 * @param {string} [opts.fullPath] 相对 shared 的全量路径
 * @param {string} [opts.incrPath] 相对 shared 的增量路径
 * @param {number} [opts.bytes]
 * @param {string} [opts.note]
 * @param {Date} [opts.at]
 * @returns {Promise<OfflineKMeta>}
 * @example
 * await markUpdateSuccess(metaPath, { dumpKind: 'full', fullPath: 'data/dumps/cn-daily-k-full.parquet' })
 */
export async function markUpdateSuccess(metaPath, opts) {
  const prev = (await readMeta(metaPath)) ?? {}
  /** @type {OfflineKMeta} */
  const next = {
    ...prev,
    lastSuccessAt: (opts.at ?? new Date()).toISOString(),
    lastDumpKind: opts.dumpKind,
    fullRelativePath: opts.fullPath ?? prev.fullRelativePath ?? `data/dumps/${FULL_FILE}`,
    incrRelativePath: opts.incrPath ?? prev.incrRelativePath ?? `data/dumps/${INCR_FILE}`,
  }
  if (typeof opts.bytes === 'number') next.bytes = opts.bytes
  if (opts.note) next.note = opts.note
  await writeMeta(metaPath, next)
  return next
}

/**
 * 汇总部署状态（元数据 + dumps 文件是否存在）。
 *
 * @param {object} opts
 * @param {string} opts.metaPath
 * @param {string} opts.dumpsDir dumps 目录绝对路径
 * @param {Date} [opts.now]
 * @returns {Promise<DeployStatus>}
 * @example
 * const st = await getDeployStatus({ metaPath, dumpsDir })
 * // st.recommendedDumpKind === 'full' | 'incremental'
 */
export async function getDeployStatus(opts) {
  const meta = await readMeta(opts.metaPath)
  const plan = decideDumpKind(meta, opts.now)
  const fullPath = path.join(opts.dumpsDir, FULL_FILE)
  const incrPath = path.join(opts.dumpsDir, INCR_FILE)

  const fullStat = await statOrNull(fullPath)
  const incrStat = await statOrNull(incrPath)

  return {
    meta,
    recommendedDumpKind: plan.dumpKind,
    reason: plan.reason,
    fullExists: Boolean(fullStat),
    incrExists: Boolean(incrStat),
    fullBytes: fullStat?.size,
    incrBytes: incrStat?.size,
  }
}

/**
 * 生成 Agent 可执行的更新步骤说明（不含密钥、不写主库）。
 *
 * @param {OfflineKMeta|null|undefined} meta
 * @returns {{ dumpKind: 'full'|'incremental', steps: string[] }}
 * @example
 * buildUpdatePlaybook(meta)
 * // { dumpKind: 'incremental', steps: […'] }
 */
export function buildUpdatePlaybook(meta) {
  const plan = decideDumpKind(meta)
  return {
    dumpKind: plan.dumpKind,
    steps: [
      '确认已 activate workspace；勿引导 market sync / importDailyKDump',
      `调用 prepare_fuyao_dump({ dump_kind: "${plan.dumpKind}" })（成功自动写 offline-k-meta）`,
      '如需手动补写可用 markUpdateSuccess；通常不必',
      '用 query/screen 模块做挖掘；密钥禁止进沙盒',
    ],
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<{ size: number }|null>}
 */
async function statOrNull(filePath) {
  try {
    const st = await fs.stat(filePath)
    return { size: st.size }
  } catch {
    return null
  }
}
