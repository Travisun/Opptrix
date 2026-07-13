/**
 * DuckDB I/O 调度层 — 业内「单写者多读者 + 优先级队列」模式。
 *
 * - 写：p-queue concurrency=1（串行写入，等同 DuckDB 单写者语义）
 * - 读：p-queue concurrency=3（并行只读 duck-cli，DuckDB MVCC 允许）
 * - 执行：worker_threads 内 spawn duck-cli，主进程仅 await Promise，不阻塞事件循环
 *
 * 参考：better-sqlite3 WAL + worker_threads；DuckDB node-api cooperative tasks。
 */
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import PQueue from 'p-queue'
import { isDerivedMaintenanceActive } from './duck-subprocess-gate.js'
import type { DuckCliWorkerRequest, DuckCliWorkerResponse } from './duck-cli-worker.js'

const DEFAULT_MAX_BUFFER = 128 * 1024 * 1024
const READ_CONCURRENCY = 3
const WRITE_CONCURRENCY = 1

/** UI / Hub 交互读 — 高于后台统计 */
export const DUCK_READ_PRIORITY_INTERACTIVE = 10
/** 后台同步 / 迁移读 */
export const DUCK_READ_PRIORITY_BACKGROUND = 1

export class DuckCliPool {
  private worker: Worker | null = null
  private nextId = 0
  private readonly pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>()
  private readonly readQueue = new PQueue({ concurrency: READ_CONCURRENCY })
  private readonly writeQueue = new PQueue({ concurrency: WRITE_CONCURRENCY })
  private workerBoot: Promise<void> | null = null

  constructor(private readonly label = 'default') {}

  private ensureWorker(): Promise<void> {
    if (this.worker) return Promise.resolve()
    if (this.workerBoot) return this.workerBoot
    this.workerBoot = new Promise((resolve, reject) => {
      const workerUrl = new URL('./duck-cli-worker.js', import.meta.url)
      const worker = new Worker(workerUrl, { name: `duck-cli-${this.label}` })
      worker.on('message', (msg: DuckCliWorkerResponse) => {
        const job = this.pending.get(msg.id)
        if (!job) return
        this.pending.delete(msg.id)
        if (msg.ok && msg.stdout != null) job.resolve(msg.stdout)
        else job.reject(new Error(msg.error ?? msg.stderr ?? 'duck-cli worker failed'))
      })
      worker.on('error', err => {
        this.worker = null
        this.workerBoot = null
        reject(err)
      })
      worker.on('exit', code => {
        if (code !== 0) {
          this.worker = null
          this.workerBoot = null
        }
      })
      worker.on('online', () => {
        this.worker = worker
        resolve()
      })
    })
    return this.workerBoot
  }

  private dispatch(args: string[], maxBuffer: number): Promise<string> {
    return this.ensureWorker().then(() => new Promise((resolve, reject) => {
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      const req: DuckCliWorkerRequest = { id, args, maxBuffer }
      this.worker!.postMessage(req)
    }))
  }

  /** 异步执行 duck-cli — 主进程 API / Hub 唯一入口 */
  exec(
    args: string[],
    mode: 'read' | 'write',
    options: { maxBuffer?: number; priority?: number } = {},
  ): Promise<string> {
    if (mode === 'write' && isDerivedMaintenanceActive()) {
      return Promise.reject(new Error('DuckDB 写入已暂停（本地指标维护进行中）'))
    }
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
    const priority = options.priority ?? (mode === 'read' ? DUCK_READ_PRIORITY_BACKGROUND : 0)
    const queue = mode === 'write' ? this.writeQueue : this.readQueue
    return queue.add(async () => this.dispatch(args, maxBuffer), { priority }) as Promise<string>
  }

  async close(): Promise<void> {
    this.readQueue.clear()
    this.writeQueue.clear()
    for (const [, job] of this.pending) {
      job.reject(new Error('DuckCliPool closed'))
    }
    this.pending.clear()
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
    this.workerBoot = null
  }
}

const pools = new Map<string, DuckCliPool>()

export function getDuckCliPool(label = 'market'): DuckCliPool {
  let pool = pools.get(label)
  if (!pool) {
    pool = new DuckCliPool(label)
    pools.set(label, pool)
  }
  return pool
}

export function resetDuckCliPools(): void {
  for (const pool of pools.values()) {
    void pool.close()
  }
  pools.clear()
}

export function duckCliWorkerPath(): string {
  return fileURLToPath(new URL('./duck-cli-worker.js', import.meta.url))
}
