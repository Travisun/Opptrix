/**
 * DuckDB I/O 调度层 — 业内「单写者多读者 + 优先级队列」模式。
 *
 * - 写：p-queue concurrency=1（串行写入，等同 DuckDB 单写者语义）
 * - 读：默认 concurrency=3；低配（见 `resolveDuckReadConcurrency`）降为 1，削峰值
 * - 执行：worker_threads 内 spawn duck-cli，主进程仅 await Promise，不阻塞事件循环
 * - pending / PQueue：有界 maxPending（默认 128），超限拒绝并打日志，禁止静默无限涨
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
/** 每条 PQueue 等待深度 + worker pending Map 硬顶（不含 running） */
export const DEFAULT_DUCK_MAX_PENDING = 128
const LOW_MEM_BYTES = 6 * 1024 * 1024 * 1024
const CLI_PATH = fileURLToPath(new URL('../kline/duck-cli.js', import.meta.url))

/** UI / Hub 交互读 — 高于后台统计 */
export const DUCK_READ_PRIORITY_INTERACTIVE = 10
/** 后台同步 / 迁移读 */
export const DUCK_READ_PRIORITY_BACKGROUND = 1

export interface DuckCliPoolOptions {
  /**
   * 读/写各自 PQueue 等待上限，以及 worker 在途 pending Map 上限。
   * 默认 128；可用 `OPPTRIX_DUCK_MAX_PENDING` 覆盖。
   */
  maxPending?: number
}

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
 * Duck 队列 / worker pending 硬顶：默认 128；`OPPTRIX_DUCK_MAX_PENDING` 优先（≥1）。
 */
export function resolveDuckMaxPending(override?: number): number {
  if (override != null && Number.isFinite(override) && override >= 1) {
    return Math.floor(override)
  }
  const raw = process.env.OPPTRIX_DUCK_MAX_PENDING
  if (raw != null && String(raw).trim() !== '') {
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isFinite(n) && n >= 1) return Math.floor(n)
  }
  return DEFAULT_DUCK_MAX_PENDING
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

function warnQueueFull(label: string, mode: string, maxPending: number, waiting: number): void {
  console.warn(
    `[DuckCliPool:${label}] ${mode} queue full (waiting=${waiting}, maxPending=${maxPending}); rejecting`,
  )
}

export class DuckCliPool {
  private worker: Worker | null = null
  private nextId = 0
  private readonly pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>()
  /** 尚未开始的 queue.add 外层 Promise（PQueue.clear 不会 settle，需自管） */
  private readonly waiting = new Set<{ reject: (e: Error) => void }>()
  private readonly readQueue: PQueue
  private readonly writeQueue: PQueue
  private workerBoot: Promise<void> | null = null
  private syncWriteLock = false
  private closed = false
  /** 构造时锁定的读并发（便于测试 / 观测） */
  readonly readConcurrency: number
  readonly writeConcurrency = WRITE_CONCURRENCY
  /** 读/写各自等待深度与 worker pending Map 硬顶 */
  readonly maxPending: number

  constructor(
    private readonly label = 'default',
    opts?: DuckCliPoolOptions,
  ) {
    this.readConcurrency = resolveDuckReadConcurrency()
    this.maxPending = resolveDuckMaxPending(opts?.maxPending)
    this.readQueue = new PQueue({ concurrency: this.readConcurrency })
    this.writeQueue = new PQueue({ concurrency: WRITE_CONCURRENCY })
  }

  /** 读队列等待中任务数（不含 running） */
  get waitingReads(): number {
    return this.readQueue.size
  }

  /** 写队列等待中任务数（不含 running） */
  get waitingWrites(): number {
    return this.writeQueue.size
  }

  /** worker 在途回调数 */
  get inflightPending(): number {
    return this.pending.size
  }

  /** 测试：暂停调度，便于把 waiting 填满而不进入 worker */
  pauseQueues(): void {
    this.readQueue.pause()
    this.writeQueue.pause()
  }

  /** 测试：恢复调度 */
  startQueues(): void {
    this.readQueue.start()
    this.writeQueue.start()
  }

  private rejectAllPending(reason: string): void {
    for (const [, job] of this.pending) {
      job.reject(new Error(reason))
    }
    this.pending.clear()
  }

  private rejectAllWaiting(reason: string): void {
    const err = new Error(reason)
    for (const entry of this.waiting) {
      entry.reject(err)
    }
    this.waiting.clear()
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
        this.rejectAllPending(err instanceof Error ? err.message : 'duck-cli worker error')
        reject(err)
      })
      worker.on('exit', code => {
        this.worker = null
        this.workerBoot = null
        if (this.pending.size > 0) {
          this.rejectAllPending(`duck-cli worker exited (${code ?? 'null'})`)
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
      if (this.pending.size >= this.maxPending) {
        warnQueueFull(this.label, 'worker-pending', this.maxPending, this.pending.size)
        reject(new Error(`DuckCliPool worker pending full (maxPending=${this.maxPending})`))
        return
      }
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      const req: DuckCliWorkerRequest = { id, args, maxBuffer }
      const w = this.worker
      if (!w) {
        this.pending.delete(id)
        reject(new Error('DuckCliPool worker unavailable'))
        return
      }
      w.postMessage(req)
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
    if (this.closed) {
      return Promise.reject(new Error('DuckCliPool closed'))
    }
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
    const priority = options.priority ?? (mode === 'read' ? DUCK_READ_PRIORITY_BACKGROUND : 0)
    const queue = mode === 'write' ? this.writeQueue : this.readQueue
    if (queue.size >= this.maxPending) {
      warnQueueFull(this.label, mode, this.maxPending, queue.size)
      return Promise.reject(
        new Error(`DuckCliPool ${mode} queue full (maxPending=${this.maxPending})`),
      )
    }

    return new Promise<string>((resolve, reject) => {
      const entry = { reject }
      this.waiting.add(entry)
      void queue.add(
        async () => {
          if (!this.waiting.has(entry)) return
          this.waiting.delete(entry)
          if (this.closed) {
            reject(new Error('DuckCliPool closed'))
            return
          }
          try {
            resolve(await this.dispatch(args, maxBuffer))
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        },
        { priority },
      )
    })
  }

  async close(): Promise<void> {
    this.closed = true
    this.readQueue.clear()
    this.writeQueue.clear()
    this.rejectAllWaiting('DuckCliPool closed')
    this.rejectAllPending('DuckCliPool closed')
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
