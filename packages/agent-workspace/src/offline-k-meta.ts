/**
 * 离线日 K 元数据 — 正式 TS 实现（对齐 templates/cn-offline-daily-k 的 markUpdateSuccess）。
 * 仅读写 shared/data/cache/offline-k-meta.json；不写主库。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveSharedWorkspaceRoot } from './paths.js'

export type OfflineKDumpKind = 'full' | 'incremental'

export interface OfflineKMeta {
  lastSuccessAt?: string
  lastDumpKind?: OfflineKDumpKind
  fullRelativePath?: string
  incrRelativePath?: string
  bytes?: number
  note?: string
}

export const OFFLINE_K_META_RELATIVE_PATH = 'data/cache/offline-k-meta.json'
export const FULL_DUMP_RELATIVE_PATH = 'data/dumps/cn-daily-k-full.parquet'
export const INCR_DUMP_RELATIVE_PATH = 'data/dumps/cn-daily-k-incr.parquet'

/** shared 根下 offline-k-meta.json 绝对路径 */
export function offlineKMetaPath(sharedRoot?: string): string {
  return path.join(
    sharedRoot ?? resolveSharedWorkspaceRoot(),
    'data',
    'cache',
    'offline-k-meta.json',
  )
}

/** 仅 full|incremental + local_path + ok 时由 prepare_fuyao_dump 自动写 meta */
export function shouldAutoWriteOfflineKMeta(
  dumpKind: string,
  mode: string,
  ok: boolean,
): boolean {
  return ok && mode === 'local_path' && (dumpKind === 'full' || dumpKind === 'incremental')
}

export async function readOfflineKMeta(metaPath: string): Promise<OfflineKMeta | null> {
  try {
    const raw = await fs.readFile(metaPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as OfflineKMeta
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
    if (code === 'ENOENT') return null
    throw err
  }
}

export async function writeOfflineKMeta(metaPath: string, meta: OfflineKMeta): Promise<void> {
  await fs.mkdir(path.dirname(metaPath), { recursive: true })
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}

/**
 * 记录一次成功的 full/incremental dump（等价模板 markUpdateSuccess）。
 * 合并旧 meta，保留未覆盖字段。
 */
export async function recordOfflineKDumpSuccess(opts: {
  dumpKind: OfflineKDumpKind
  bytes?: number
  note?: string
  at?: Date
  /** 默认 shared/data/cache/offline-k-meta.json */
  metaPath?: string
}): Promise<{
  meta: OfflineKMeta
  metaPath: string
  metaRelativePath: string
}> {
  const metaPath = opts.metaPath ?? offlineKMetaPath()
  const prev = (await readOfflineKMeta(metaPath)) ?? {}
  const next: OfflineKMeta = {
    ...prev,
    lastSuccessAt: (opts.at ?? new Date()).toISOString(),
    lastDumpKind: opts.dumpKind,
    fullRelativePath: prev.fullRelativePath ?? FULL_DUMP_RELATIVE_PATH,
    incrRelativePath: prev.incrRelativePath ?? INCR_DUMP_RELATIVE_PATH,
  }
  if (typeof opts.bytes === 'number') next.bytes = opts.bytes
  if (opts.note) next.note = opts.note
  await writeOfflineKMeta(metaPath, next)
  return {
    meta: next,
    metaPath,
    metaRelativePath: OFFLINE_K_META_RELATIVE_PATH,
  }
}

/**
 * 供 MCP handler：条件满足则写 meta；写失败不抛，返回 warning（dump 仍视为成功）。
 */
export async function tryRecordOfflineKDumpSuccess(opts: {
  dumpKind: string
  mode: string
  ok: boolean
  bytes?: number
}): Promise<{
  meta_written: boolean
  meta_path?: string
  meta_warning?: string
}> {
  if (!shouldAutoWriteOfflineKMeta(opts.dumpKind, opts.mode, opts.ok)) {
    return { meta_written: false }
  }
  try {
    const recorded = await recordOfflineKDumpSuccess({
      dumpKind: opts.dumpKind as OfflineKDumpKind,
      bytes: opts.bytes,
    })
    return {
      meta_written: true,
      meta_path: recorded.metaRelativePath,
    }
  } catch (err) {
    return {
      meta_written: false,
      meta_warning: err instanceof Error ? err.message : String(err),
    }
  }
}
