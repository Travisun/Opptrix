/**
 * LanceDB 向量索引：chunk_id / document_id / vector(384) / text。
 * 未可用时所有方法安全降级（空结果 / no-op）。
 */
import fs from 'node:fs'
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
  mergeInsert?: (on: string) => {
    whenMatchedUpdateAll: () => {
      whenNotMatchedInsertAll: () => {
        execute: (data: Record<string, unknown>[]) => Promise<void>
      }
    }
  }
}

const TABLE_NAME = 'doc_chunks'

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

export class LanceVectorStore implements VectorStore {
  private readonly dir: string
  private conn: LanceConnection | null = null
  private table: LanceTable | null = null
  private initFailed = false

  constructor(dir = lanceDbDir()) {
    this.dir = dir
  }

  async isAvailable(): Promise<boolean> {
    if (this.initFailed) return false
    try {
      await this.ensureTable()
      return this.table !== null
    } catch {
      this.initFailed = true
      return false
    }
  }

  private async connect(): Promise<LanceConnection> {
    if (this.conn) return this.conn
    fs.mkdirSync(this.dir, { recursive: true })
    const lancedb = await import('@lancedb/lancedb')
    this.conn = await lancedb.connect(this.dir) as unknown as LanceConnection
    return this.conn
  }

  private async ensureTable(): Promise<LanceTable | null> {
    if (this.table) return this.table
    if (this.initFailed) return null
    try {
      const db = await this.connect()
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
    } catch {
      this.initFailed = true
      this.table = null
      return null
    }
  }

  async upsert(rows: VectorChunkRow[]): Promise<void> {
    if (!rows.length) return
    const table = await this.ensureTable()
    if (!table) return

    const data = rows.map(r => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      text: r.text.slice(0, 2000),
      vector: r.vector,
    }))

    // 先删后加，保证幂等（重复入库不炸）
    const ids = rows.map(r => `'${escapeSqlString(r.chunk_id)}'`).join(', ')
    try {
      await table.delete(`chunk_id IN (${ids})`)
    } catch {
      /* 表空或谓词无匹配 */
    }
    await table.add(data)
  }

  async deleteByDocument(documentId: string): Promise<void> {
    const table = await this.ensureTable()
    if (!table) return
    try {
      await table.delete(`document_id = '${escapeSqlString(documentId)}'`)
    } catch {
      /* ignore */
    }
  }

  async search(
    vector: number[],
    opts: { documentIds?: string[]; limit?: number },
  ): Promise<VectorSearchHit[]> {
    const table = await this.ensureTable()
    if (!table) return []
    const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20)

    try {
      let query = table.search(vector).limit(limit)
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
  }

  /** 关闭 Lance 连接，避免 process.exit 时原生析构 SIGABRT */
  async close(): Promise<void> {
    const conn = this.conn
    this.table = null
    this.conn = null
    this.initFailed = false
    try {
      conn?.close?.()
    } catch {
      /* ignore teardown races */
    }
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
    for (const row of rows) {
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
