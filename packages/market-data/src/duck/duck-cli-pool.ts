/**
 * DuckDB I/O 调度层 — 业内「单写者多读者 + 优先级队列」模式。
 *
 * - 写：p-queue concurrency=1（串行写入，等同 DuckDB 单写者语义）
 * - 读：默认 concurrency=3；低配（见 `resolveDuckReadConcurrency`）降为 1，削峰值
 * - 执行：worker_threads 内 spawn duck-cli，主进程仅 await Promise，不阻塞事件循环
 *
 * 参考：better-sqlite3 WAL + worker_threads；DuckDB node-api cooperative tasks。
 */
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import PQueue from 'p-queue'
import type { DuckCliWorkerRequest, DuckCliWorkerResponse } from './duck-cli-worker.js'

const DEFAULT_MAX_BUFFER = 128 * 1024 * 1024
const DEFAULT_READ_CONCURRENCY = 3
const WRITE_CONCURRENCY = 1
const LOW_MEM_BYTES = 6 * 1024 * 1024 * 1024
const CLI_PATH = fileURLToPath(new URL('../kline/duck-cli.js', import.meta.url))

/** UI / Hub 交互读 — 高于后台统计 */
export const DUCK_READ_PRIORITY_INTERACTIVE = 10
/** 后台同步 / 迁移读 */
export const DUCK_READ_PRIORITY_BACKGROUND = 1

/**
 * 低配判定：`OPPTRIX_SQLITE_MEM_PROFILE=low`，或未强制 high/medium 且 totalmem<6GB。
 * 供读并发与 boot warm 共用；测试可 env 覆盖。
 */
export function isDuckLowMemProfile(): boolean {
  const profile = String(process.env.OPPTRIX_SQLITE_MEM_PROFILE ?? '').trim().toLowerCase()
  if (profile === 'low') return true
  if (profile === 'high' || profile === 'medium') return false
  return os.totalmem() < LOW_MEM_BYTES
}

/**
 * DuckCliPool 读并发：默认 3；`OPPTRIX_DUCK_READ_CONCURRENCY` 优先；低配 → 1。
 * 写并发恒为 1（见 `WRITE_CONCURRENCY`）。
 */
export function resolveDuckReadConcurrency(): number {
  const raw = process.env.OPPTRIX_DUCK_READ_CONCURRENCY
  if (raw != null && String(raw).trim() !== '') {
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isFinite(n) && n >= 1) return Math.floor(n)
  }
  return isDuckLowMemProfile() ? 1 : DEFAULT_READ_CONCURRENCY
}

/**
 * 启动时是否 warm Neo 读缓存：低配或 `OPPTRIX_DUCK_WARM_ON_BOOT=0` 跳过（首次查询仍会拉 stats）。
 */
export function shouldWarmDuckReadCachesOnBoot(): boolean {
  const warm = String(process.env.OPPTRIX_DUCK_WARM_ON_BOOT ?? '').trim().toLowerCase()
  if (warm === '0' || warm === 'false' || warm === 'off') return false
  if (warm === '1' || warm === 'true' || warm === 'on') return true
  return !isDuckLowMemProfile()
}

export class DuckCliPool {
  private worker: Worker | null = null
  private nextId = 0
  private readonly pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>()
  private readonly readQueue: PQueue
  private readonly writeQueue = new PQueue({ concurrency: WRITE_CONCURRENCY })
  private workerBoot: Promise<void> | null = null
  private syncWriteLock = false
  /** 构造时锁定的读并发（便于测试 / 观测） */
  readonly readConcurrency: number
  readonly writeConcurrency = WRITE_CONCURRENCY

  constructor(private readonly label = 'default') {
    this.readConcurrency = resolveDuckReadConcurrency()
    this.readQueue = new PQueue({ concurrency: this.readConcurrency })
  }

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

  private spawnCliSync(args: string[], maxBuffer: number): string {
    const r = spawnSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf8',
      maxBuffer,
      env: process.env,
    })
    if (r.error) throw r.error
    if (r.status !== 0) {
      throw new Error(r.stderr?.trim() || r.stdout?.trim() || `duck-cli exit ${r.status ?? 'null'}`)
    }
    return (r.stdout ?? '').trim()
  }

  private dispatch(args: string[], maxBuffer: number): Promise<string> {
    return this.ensureWorker().then(() => new Promise((resolve, reject) => {
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      const req: DuckCliWorkerRequest = { id, args, maxBuffer }
      this.worker!.postMessage(req)
    }))
  }

  /** 同步边界 — 主进程 spawnSync duck-cli（与 worker 内相同 CLI；测试/导出专用，热路径用 exec） */
  execSync(
    args: string[],
    mode: 'read' | 'write',
    options: { maxBuffer?: number } = {},
  ): string {
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
    if (mode === 'write') {
      while (this.syncWriteLock) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
      this.syncWriteLock = true
      try {
        return this.spawnCliSync(args, maxBuffer)
      } finally {
        this.syncWriteLock = false
      }
    }
    return this.spawnCliSync(args, maxBuffer)
  }

  /** 异步执行 duck-cli — 主进程 API / Hub 唯一入口 */
  exec(
    args: string[],
    mode: 'read' | 'write',
    options: { maxBuffer?: number; priority?: number } = {},
  ): Promise<string> {
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

/** Terminate all duck-cli worker threads — required for Node to exit after tests / DB replace. */
export async function resetDuckCliPools(): Promise<void> {
  const closing = [...pools.values()].map(pool => pool.close())
  pools.clear()
  await Promise.all(closing)
}

export function duckCliWorkerPath(): string {
  return fileURLToPath(new URL('./duck-cli-worker.js', import.meta.url))
}
