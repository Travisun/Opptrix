/**
 * OCR 批处理并行度：默认 3；低配 2；`OPPTRIX_OCR_CONCURRENCY` 可覆盖（1～4）。
 * embedding 已加载时再降到 1（不 unload），并打一条脱敏日志。
 */
import os from 'node:os'
import { resolveSqliteMemProfile } from '@opptrix/shared'

/** 默认并行度（非低配） */
export const OCR_CONCURRENCY_DEFAULT = 3

/** 低配并行度（1～2 区间取 2，保功能可用） */
export const OCR_CONCURRENCY_LOW = 2

/** 硬上限（与 ocr-batch clamp 一致） */
export const OCR_CONCURRENCY_MAX = 4

/** embedding 已驻留内存时的互斥并行度 */
export const OCR_CONCURRENCY_WITH_EMBEDDING = 1

/**
 * 历史常量：等于默认并行度。新代码请用 `resolveOcrConcurrency()`。
 * @deprecated Prefer resolveOcrConcurrency()
 */
export const OCR_CONCURRENCY = OCR_CONCURRENCY_DEFAULT

export type ResolveOcrConcurrencyOpts = {
  env?: NodeJS.ProcessEnv
  totalMemBytes?: number
  /** embedding 模型已在内存（如 getEmbeddingService().isReady()） */
  embeddingReady?: boolean
  /** embeddingReady 时是否打脱敏警告；默认 true */
  logMutualExclusion?: boolean
  log?: (msg: string) => void
}

/**
 * 解析 OCR 并行度。
 * - `OPPTRIX_OCR_CONCURRENCY` 优先（整数 ≥1，上限 4）
 * - 否则低配（`OPPTRIX_SQLITE_MEM_PROFILE=low` 或 totalmem&lt;6GB）→ 2
 * - 默认 → 3
 * - `embeddingReady` → min(base, 1) + 可选日志（不 unload embedding）
 */
export function resolveOcrConcurrency(opts: ResolveOcrConcurrencyOpts = {}): number {
  const env = opts.env ?? process.env
  const raw = env.OPPTRIX_OCR_CONCURRENCY
  let base = OCR_CONCURRENCY_DEFAULT

  if (raw != null && String(raw).trim() !== '') {
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isFinite(n) && n >= 1) {
      base = Math.min(OCR_CONCURRENCY_MAX, Math.floor(n))
    }
  } else {
    const profile = resolveSqliteMemProfile(env, opts.totalMemBytes ?? os.totalmem())
    base = profile === 'low' ? OCR_CONCURRENCY_LOW : OCR_CONCURRENCY_DEFAULT
  }

  if (!opts.embeddingReady) return base

  if (opts.logMutualExclusion !== false) {
    const log = opts.log ?? ((msg: string) => console.warn(msg))
    log(
      '[doc-library] OCR concurrency reduced: embedding model already loaded (no unload)',
    )
  }
  return Math.min(base, OCR_CONCURRENCY_WITH_EMBEDDING)
}
