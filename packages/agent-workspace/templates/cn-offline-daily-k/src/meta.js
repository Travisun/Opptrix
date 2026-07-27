/**
 * 离线日 K 元数据 — 仅读写 shared/data/cache/offline-k-meta.json。
 * @module meta
 */

import fs from 'node:fs/promises'
import path from 'node:path'

/** 距上次成功更新超过该天数则强制全量 */
export const STALE_FULL_DAYS = 10

/**
 * @typedef {object} OfflineKMeta
 * @property {string} [lastSuccessAt] ISO 时间，上次成功更新
 * @property {'full'|'incremental'} [lastDumpKind] 上次 dump 种类
 * @property {string} [fullRelativePath] 全量 parquet 相对 shared 路径
 * @property {string} [incrRelativePath] 增量 parquet 相对 shared 路径
 * @property {number} [bytes] 上次落盘字节数（可选）
 * @property {string} [note] 备注
 */

/**
 * 默认元数据相对路径（相对 shared 根）。
 * @returns {string}
 * @example
 * defaultMetaRelativePath() // 'data/cache/offline-k-meta.json'
 */
export function defaultMetaRelativePath() {
  return 'data/cache/offline-k-meta.json'
}

/**
 * 读取离线日 K 元数据；文件不存在返回 null。
 * @param {string} metaPath 绝对路径或可访问路径
 * @returns {Promise<OfflineKMeta|null>}
 * @example
 * const meta = await readMeta('/…/shared/data/cache/offline-k-meta.json')
 */
export async function readMeta(metaPath) {
  try {
    const raw = await fs.readFile(metaPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return /** @type {OfflineKMeta} */ (parsed)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
    if (code === 'ENOENT') return null
    throw err
  }
}

/**
 * 写入离线日 K 元数据（覆盖写；自动创建父目录）。
 * @param {string} metaPath
 * @param {OfflineKMeta} meta
 * @returns {Promise<void>}
 * @example
 * await writeMeta(metaPath, { lastSuccessAt: new Date().toISOString(), lastDumpKind: 'full' })
 */
export async function writeMeta(metaPath, meta) {
  await fs.mkdir(path.dirname(metaPath), { recursive: true })
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}

/**
 * 距上次成功更新的天数；无成功记录返回 Infinity。
 * @param {OfflineKMeta|null|undefined} meta
 * @param {Date} [now]
 * @returns {number}
 * @example
 * daysSinceLastSuccess(meta) // 3
 */
export function daysSinceLastSuccess(meta, now = new Date()) {
  const raw = meta?.lastSuccessAt
  if (!raw || typeof raw !== 'string') return Number.POSITIVE_INFINITY
  const t = Date.parse(raw)
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  const ms = now.getTime() - t
  if (ms < 0) return 0
  return ms / (24 * 60 * 60 * 1000)
}
