/**
 * LanceDB 向量索引：chunk_id / document_id / vector(384) / text。
 * 未可用时所有方法安全降级（空结果 / no-op）。
 *
 * 写路径必须串行 + 校验向量 + 定期 optimize；search 读优先插队；
 * 损坏库在 ensure 时安全重建并限速回填，避免 delete+add 版本爆炸导致原生 SIGTRAP。
 */
import fs from 'node:fs'
import path from 'node:path'
import { lanceDbDir, EMBEDDING_DIM } from './paths.js'

export interface VectorChunkRow {
  chunk_id: string
  document_id: string
  text: string
  vector: number[]
}

export interface VectorSearchHit {
  chunk_id: string
  document_id: string
  text: string
  score: number
}

export interface VectorStore {
  isAvailable(): Promise<boolean>
  upsert(rows: VectorChunkRow[]): Promise<void>
  deleteByDocument(documentId: string): Promise<void>
  search(
    vector: number[],
    opts: { documentIds?: string[]; limit?: number },
  ): Promise<VectorSearchHit[]>
  /** 释放原生连接（LanceDB）；无原生资源时可 no-op */
  close?(): Promise<void>
}

type LanceConnection = {
  openTable: (name: string) => Promise<LanceTable>
  createTable: (name: string, data: Record<string, unknown>[], opts?: { mode?: string }) => Promise<LanceTable>
  tableNames: () => Promise<string[]>
  close?: () => void
}

type LanceTable = {
  add: (data: Record<string, unknown>[]) => Promise<void>
  delete: (predicate: string) => Promise<void>
  search: (vector: number[]) => {
    limit: (n: number) => {
      where: (predicate: string) => { toArray: () => Promise<Record<string, unknown>[]> }
      toArray: () => Promise<Record<string, unknown>[]>
    }
  }
  optimize?: (options?: { cleanupOlderThan?: Date; deleteUnverified?: boolean }) => Promise<unknown>
  mergeInsert?: (on: string) => {
    whenMatchedUpdateAll: () => {
      whenNotMatchedInsertAll: () => {
        execute: (data: Record<string, unknown>[]) => Promise<void>
      }
    }
  }
}

const TABLE_NAME = 'doc_chunks'
/** `_versions` 文件数超过此阈值视为版本爆炸，触发安全重建 */
export const LANCE_VERSIONS_PATHOLOGY_THRESHOLD = 500
/** 成功写次数达到此值后触发 optimize（另有 debounce） */
const OPTIMIZE_EVERY_N_WRITES = 8
const OPTIMIZE_DEBOUNCE_MS = 3_000
/** manifest 版本号超过此值（或接近 u64 溢出包装）视为损坏 */
const MANIFEST_VERSION_SUSPECT = 1_000_000_000

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

/** 校验 embedding 向量：长度=EMBEDDING_DIM 且全部有限数 */
export function isValidEmbeddingVector(vector: unknown): vector is number[] {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) return false
  for (const v of vector) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false
  }
  return true
}

/** 过滤不合格行；不记录正文，仅计数量 */
export function filterValidUpsertRows(rows: VectorChunkRow[]): {
  valid: VectorChunkRow[]
  rejected: number
} {
  const valid: VectorChunkRow[] = []
  let rejected = 0
  for (const row of rows) {
    if (!row?.chunk_id || !isValidEmbeddingVector(row.vector)) {
      rejected++
      continue
    }
    valid.push(row)
  }
  return { valid, rejected }
}

/** `~/.opptrix/lancedb/doc_chunks/doc_chunks.lance` */
export function lanceTableDatasetDir(lanceRoot: string): string {
  return path.join(lanceRoot, `${TABLE_NAME}.lance`)
}

export interface LancePathologyResult {
  pathological: boolean
  reason: string | null
  versionsCount: number
}

/**
 * 检测 Lance dataset 目录是否版本爆炸 / manifest 异常。
 * 不打开原生连接；供 ensureTable 与单测使用。
 */
export function detectLanceDatasetPathology(datasetDir: string): LancePathologyResult {
  const versionsDir = path.join(datasetDir, '_versions')
  if (!fs.existsSync(datasetDir)) {
    return { pathological: false, reason: null, versionsCount: 0 }
  }
  let versionsCount = 0
  try {
    if (fs.existsSync(versionsDir)) {
      const entries = fs.readdirSync(versionsDir)
      versionsCount = entries.length
      for (const name of entries) {
        const m = /^(\d+)\.manifest$/i.exec(name)
        if (!m) continue
        const ver = Number(m[1])
        // u64 wrap / 异常巨大版本号（本机曾出现 18446744073709551611）
        if (!Number.isSafeInteger(ver) || ver > MANIFEST_VERSION_SUSPECT) {
          return {
            pathological: true,
            reason: 'suspect_manifest_version',
            versionsCount,
          }
        }
      }
      if (versionsCount > LANCE_VERSIONS_PATHOLOGY_THRESHOLD) {
        return {
          pathological: true,
          reason: 'versions_count_exceeded',
          versionsCount,
        }
      }
    }
  } catch {
    return { pathological: true, reason: 'versions_readdir_failed', versionsCount }
  }
  return { pathological: false, reason: null, versionsCount }
}

function logVectorStore(msg: string, extra?: Record<string, number | string | boolean>): void {
  const suffix = extra
    ? ` ${Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' ')}`
    : ''
  console.warn(`[doc-library/lance] ${msg}${suffix}`)
}

export type LanceScheduleKind = 'read' | 'write'

export interface LanceOpSchedulerOptions {
  /** 尚未开始的 pending 上限（不含 running）；默认 256 */
  maxPending?: number
}

type LanceQueuedOp = {
  kind: LanceScheduleKind
  start: () => void
  reject: (err: Error) => void
}

/**
 * Lance 操作调度：全局互斥串行；search（read）可插队到尚未开始的 write 之前，
 * 避免大量 upsert/optimize 长时间堵住检索。写与 optimize 仍不得并发。
 * pending 有界：超限丢弃最旧尚未开始的 write（不丢 running）；无 write 可丢时拒绝新任务。
 */
export class LanceOpScheduler {
  private readonly queue: LanceQueuedOp[] = []
  private running = false
  private readonly maxPending: number

  constructor(opts?: LanceOpSchedulerOptions) {
    this.maxPending = opts?.maxPending ?? 256
  }

  get maxPendingOps(): number {
    return this.maxPending
  }

  schedule<T>(kind: LanceScheduleKind, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.queue.length >= this.maxPending) {
        if (!this.evictOldestPendingWrite()) {
          reject(new Error(`LanceOpScheduler queue full (maxPending=${this.maxPending})`))
          return
        }
      }

      const item: LanceQueuedOp = {
        kind,
        reject,
        start: () => {
          Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
              this.running = false
              this.pump()
            })
        },
      }
      if (kind === 'read') {
        const idx = this.queue.findIndex(j => j.kind === 'write')
        if (idx >= 0) this.queue.splice(idx, 0, item)
        else this.queue.push(item)
      } else {
        this.queue.push(item)
      }
      this.pump()
    })
  }

  /** 测试：尚未执行的任务种类（不含进行中） */
  pendingKinds(): LanceScheduleKind[] {
    return this.queue.map(j => j.kind)
  }

  /** 丢弃队列中最旧的尚未开始的 write；不触碰 running */
  private evictOldestPendingWrite(): boolean {
    const idx = this.queue.findIndex(j => j.kind === 'write')
    if (idx < 0) return false
    const [evicted] = this.queue.splice(idx, 1)
    if (!evicted) return false
    evicted.reject(new Error('LanceOpScheduler dropped oldest write (queue full)'))
    return true
  }

  private pump(): void {
    if (this.running) return
    const next = this.queue.shift()
    if (!next) return
    this.running = true
    next.start()
  }
}

/** 病理重建成功后限速回填钩子（由 DocLibrary 注入；失败不得抛） */
export type LanceRebuildBackfillHook = () => void | Promise<void>

let rebuildBackfillHook: LanceRebuildBackfillHook | null = null

export function setLanceRebuildBackfillHook(hook: LanceRebuildBackfillHook | null): void {
  rebuildBackfillHook = hook
}

export function getLanceRebuildBackfillHook(): LanceRebuildBackfillHook | null {
  return rebuildBackfillHook
}

/** 重建后回填冷却，避免失败写路径反复 rebuild→backfill 风暴 */
const REBUILD_BACKFILL_COOLDOWN_MS = 60_000

export class LanceVectorStore implements VectorStore {
  private readonly dir: string
  private conn: LanceConnection | null = null
  private table: LanceTable | null = null
  private initFailed = false
  /** 读优先互斥队列：write 串行；read 可插队未开始的 write */
  private readonly opScheduler = new LanceOpScheduler()
  private writesSinceOptimize = 0
  private optimizeTimer: ReturnType<typeof setTimeout> | null = null
  private rejectedVectorCount = 0
  private backfillInflight: Promise<void> | null = null
  private lastRebuildBackfillAt = 0

  constructor(dir = lanceDbDir()) {
    this.dir = dir
  }

  /** @internal 测试用 */
  getOpSchedulerForTests(): LanceOpScheduler {
    return this.opScheduler
  }

  private scheduleWrite<T>(fn: () => Promise<T>): Promise<T> {
    return this.opScheduler.schedule('write', fn)
  }

  private scheduleRead<T>(fn: () => Promise<T>): Promise<T> {
    return this.opScheduler.schedule('read', fn)
  }

  /** 重建空表成功后异步调度回填；不 await、失败不抛、冷却防循环 */
  private notifyRebuildBackfill(): void {
    const hook = rebuildBackfillHook
    if (!hook) return
    const now = Date.now()
    if (this.backfillInflight) return
    if (now - this.lastRebuildBackfillAt < REBUILD_BACKFILL_COOLDOWN_MS) {
      logVectorStore('skip rebuild backfill (cooldown)')
      return
    }
    this.lastRebuildBackfillAt = now
    this.backfillInflight = Promise.resolve()
      .then(() => hook())
      .then(() => undefined, err => {
        logVectorStore('rebuild backfill failed', {
          err: err instanceof Error ? err.message : 'unknown',
        })
      })
      .finally(() => {
        this.backfillInflight = null
      })
  }

  async isAvailable(): Promise<boolean> {
    return this.scheduleWrite(async () => {
      if (this.initFailed) return false
      try {
        await this.ensureTableUnlocked()
        return this.table !== null
      } catch {
        this.initFailed = true
        return false
      }
    })
  }

  private datasetDir(): string {
    return lanceTableDatasetDir(this.dir)
  }

  private async connectUnlocked(): Promise<LanceConnection> {
    if (this.conn) return this.conn
    fs.mkdirSync(this.dir, { recursive: true })
    const lancedb = await import('@lancedb/lancedb')
    this.conn = await lancedb.connect(this.dir) as unknown as LanceConnection
    return this.conn
  }

  private dropNativeHandles(): void {
    const conn = this.conn
    this.table = null
    this.conn = null
    try {
      conn?.close?.()
    } catch {
      /* ignore */
    }
  }

  /** 删除损坏 dataset 目录后重建空表（不删用户 SQLite 文档库） */
  private async rebuildEmptyTableUnlocked(reason: string): Promise<LanceTable | null> {
    logVectorStore('rebuilding pathological lance dataset', { reason })
    this.dropNativeHandles()
    const ds = this.datasetDir()
    try {
      if (fs.existsSync(ds)) {
        fs.rmSync(ds, { recursive: true, force: true })
      }
    } catch (err) {
      logVectorStore('failed to remove pathological dataset', {
        err: err instanceof Error ? err.message : 'unknown',
      })
      this.initFailed = true
      return null
    }
    try {
      const db = await this.connectUnlocked()
      const placeholder: Record<string, unknown> = {
        chunk_id: '__init__',
        document_id: '__init__',
        text: '',
        vector: new Array<number>(EMBEDDING_DIM).fill(0),
      }
      this.table = await db.createTable(TABLE_NAME, [placeholder], { mode: 'overwrite' })
      await this.table.delete(`chunk_id = '${escapeSqlString('__init__')}'`)
      this.initFailed = false
      this.writesSinceOptimize = 0
      // 空表已可打开；回填异步限速，失败不影响本路径
      this.notifyRebuildBackfill()
      return this.table
    } catch (err) {
      logVectorStore('rebuild createTable failed', {
        err: err instanceof Error ? err.message : 'unknown',
      })
      this.initFailed = true
      this.table = null
      return null
    }
  }

  private async ensureTableUnlocked(): Promise<LanceTable | null> {
    if (this.table) return this.table
    if (this.initFailed) return null

    const pathology = detectLanceDatasetPathology(this.datasetDir())
    if (pathology.pathological) {
      return this.rebuildEmptyTableUnlocked(pathology.reason ?? 'pathology')
    }

    try {
      const db = await this.connectUnlocked()
      const names = await db.tableNames()
      if (names.includes(TABLE_NAME)) {
        this.table = await db.openTable(TABLE_NAME)
      } else {
        const placeholder: Record<string, unknown> = {
          chunk_id: '__init__',
          document_id: '__init__',
          text: '',
          vector: new Array<number>(EMBEDDING_DIM).fill(0),
        }
        this.table = await db.createTable(TABLE_NAME, [placeholder])
        await this.table.delete(`chunk_id = '${escapeSqlString('__init__')}'`)
      }
      return this.table
    } catch (err) {
      logVectorStore('ensureTable open failed; attempting rebuild', {
        err: err instanceof Error ? err.message : 'unknown',
      })
      return this.rebuildEmptyTableUnlocked('open_failed')
    }
  }

  private scheduleOptimizeDebounced(): void {
    if (this.optimizeTimer) clearTimeout(this.optimizeTimer)
    this.optimizeTimer = setTimeout(() => {
      this.optimizeTimer = null
      void this.scheduleWrite(() => this.optimizeUnlocked())
    }, OPTIMIZE_DEBOUNCE_MS)
    if (typeof this.optimizeTimer === 'object' && this.optimizeTimer && 'unref' in this.optimizeTimer) {
      this.optimizeTimer.unref()
    }
  }

  private async optimizeUnlocked(): Promise<void> {
    const table = this.table
    if (!table?.optimize) return
    try {
      // cleanupOlderThan: 立刻可回收已提交旧版本（官方 0.33 API）
      await table.optimize({ cleanupOlderThan: new Date(), deleteUnverified: false })
      this.writesSinceOptimize = 0
    } catch (err) {
      logVectorStore('optimize failed', {
        err: err instanceof Error ? err.message : 'unknown',
      })
    }
  }

  async upsert(rows: VectorChunkRow[]): Promise<void> {
    if (!rows.length) return
    return this.scheduleWrite(async () => {
      const { valid, rejected } = filterValidUpsertRows(rows)
      if (rejected > 0) {
        this.rejectedVectorCount += rejected
        logVectorStore('rejected invalid embedding vectors', {
          rejected,
          totalRejected: this.rejectedVectorCount,
        })
      }
      if (!valid.length) return

      let table = await this.ensureTableUnlocked()
      if (!table) return

      const data = valid.map(r => ({
        chunk_id: r.chunk_id,
        document_id: r.document_id,
        text: r.text.slice(0, 2000),
        vector: r.vector,
      }))

      let wrote = false
      if (typeof table.mergeInsert === 'function') {
        try {
          await table
            .mergeInsert('chunk_id')
            .whenMatchedUpdateAll()
            .whenNotMatchedInsertAll()
            .execute(data)
          wrote = true
        } catch (err) {
          logVectorStore('mergeInsert failed; falling back to delete+add', {
            err: err instanceof Error ? err.message : 'unknown',
            rows: valid.length,
          })
        }
      }

      if (!wrote) {
        const ids = valid.map(r => `'${escapeSqlString(r.chunk_id)}'`).join(', ')
        try {
          await table.delete(`chunk_id IN (${ids})`)
        } catch {
          /* 表空或谓词无匹配 */
        }

        try {
          await table.add(data)
        } catch (err) {
          logVectorStore('table.add failed; rebuilding', {
            err: err instanceof Error ? err.message : 'unknown',
            rows: valid.length,
          })
          table = await this.rebuildEmptyTableUnlocked('add_failed')
          if (!table) return
          try {
            await table.add(data)
          } catch (err2) {
            logVectorStore('table.add failed after rebuild', {
              err: err2 instanceof Error ? err2.message : 'unknown',
            })
            this.initFailed = true
            this.table = null
            return
          }
        }
      }

      this.writesSinceOptimize += 1
      if (this.writesSinceOptimize >= OPTIMIZE_EVERY_N_WRITES) {
        await this.optimizeUnlocked()
      } else {
        this.scheduleOptimizeDebounced()
      }
    })
  }

  async deleteByDocument(documentId: string): Promise<void> {
    return this.scheduleWrite(async () => {
      const table = await this.ensureTableUnlocked()
      if (!table) return
      try {
        await table.delete(`document_id = '${escapeSqlString(documentId)}'`)
        this.writesSinceOptimize += 1
        this.scheduleOptimizeDebounced()
      } catch {
        /* ignore */
      }
    })
  }

  async search(
    vector: number[],
    opts: { documentIds?: string[]; limit?: number },
  ): Promise<VectorSearchHit[]> {
    if (!isValidEmbeddingVector(vector)) return []
    return this.scheduleRead(async () => {
      const table = await this.ensureTableUnlocked()
      if (!table) return []
      const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20)

      try {
        const query = table.search(vector).limit(limit)
        if (opts.documentIds?.length) {
          const inList = opts.documentIds.map(id => `'${escapeSqlString(id)}'`).join(', ')
          const rows = await query.where(`document_id IN (${inList})`).toArray()
          return mapHits(rows)
        }
        const rows = await query.toArray()
        return mapHits(rows)
      } catch {
        return []
      }
    })
  }

  /** 关闭 Lance 连接，避免 process.exit 时原生析构 SIGABRT */
  async close(): Promise<void> {
    return this.scheduleWrite(async () => {
      if (this.optimizeTimer) {
        clearTimeout(this.optimizeTimer)
        this.optimizeTimer = null
      }
      this.dropNativeHandles()
      this.initFailed = false
      this.writesSinceOptimize = 0
    })
  }
}

function mapHits(rows: Record<string, unknown>[]): VectorSearchHit[] {
  return rows.map(row => ({
    chunk_id: String(row.chunk_id ?? ''),
    document_id: String(row.document_id ?? ''),
    text: String(row.text ?? ''),
    score: typeof row._distance === 'number' ? 1 / (1 + row._distance) : 0,
  })).filter(h => h.chunk_id)
}

/** 内存向量库（测试 / LanceDB 不可用时） */
export class MemoryVectorStore implements VectorStore {
  private rows = new Map<string, VectorChunkRow>()

  async isAvailable(): Promise<boolean> {
    return true
  }

  async upsert(rows: VectorChunkRow[]): Promise<void> {
    const { valid } = filterValidUpsertRows(rows)
    for (const row of valid) {
      this.rows.set(row.chunk_id, row)
    }
  }

  async deleteByDocument(documentId: string): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.document_id === documentId) this.rows.delete(id)
    }
  }

  async search(
    vector: number[],
    opts: { documentIds?: string[]; limit?: number },
  ): Promise<VectorSearchHit[]> {
    if (!isValidEmbeddingVector(vector)) return []
    const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20)
    const allow = opts.documentIds ? new Set(opts.documentIds) : null
    const scored: VectorSearchHit[] = []
    for (const row of this.rows.values()) {
      if (allow && !allow.has(row.document_id)) continue
      const score = cosine(vector, row.vector)
      scored.push({
        chunk_id: row.chunk_id,
        document_id: row.document_id,
        text: row.text,
        score,
      })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  async close(): Promise<void> {
    this.rows.clear()
  }
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}

let sharedStore: VectorStore | null = null

export function getVectorStore(): VectorStore {
  if (!sharedStore) sharedStore = new LanceVectorStore()
  return sharedStore
}

/** 关闭共享向量库（若已打开）；未打开则 no-op */
export async function closeVectorStore(): Promise<void> {
  const store = sharedStore
  sharedStore = null
  if (!store) return
  try {
    await store.close?.()
  } catch {
    /* ignore teardown races */
  }
}

export function setVectorStoreForTests(store: VectorStore | null): void {
  sharedStore = store
}
