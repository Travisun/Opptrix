type Task<T> = () => Promise<T>

type PendingJob = {
  run: () => Promise<void>
}

export interface InferenceJobQueueOptions {
  /** 等待中任务上限（不含正在执行的）；超限 enqueue 立即 reject（默认 48） */
  maxDepth?: number
}

/**
 * 本地推理串行队列：显式有界 pending，避免无界 Promise 链在突发下撑爆内存。
 */
export class InferenceJobQueue {
  private readonly maxDepth: number
  private readonly pending: PendingJob[] = []
  private running = false
  private active = false

  constructor(opts?: InferenceJobQueueOptions) {
    this.maxDepth = opts?.maxDepth ?? 48
  }

  get busy(): boolean {
    return this.active
  }

  /** 等待中任务数（不含 running） */
  get depth(): number {
    return this.pending.length
  }

  get maxQueueDepth(): number {
    return this.maxDepth
  }

  enqueue<T>(task: Task<T>): Promise<T> {
    if (this.pending.length >= this.maxDepth) {
      return Promise.reject(
        new Error(`InferenceJobQueue full (maxDepth=${this.maxDepth})`),
      )
    }

    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        run: async () => {
          this.active = true
          try {
            resolve(await task())
          } catch (err) {
            reject(err)
          } finally {
            this.active = false
          }
        },
      })
      this.pump()
    })
  }

  private pump(): void {
    if (this.running) return
    const next = this.pending.shift()
    if (!next) return
    this.running = true
    Promise.resolve()
      .then(() => next.run())
      .finally(() => {
        this.running = false
        this.pump()
      })
  }
}

export const globalInferenceQueue = new InferenceJobQueue({ maxDepth: 48 })
