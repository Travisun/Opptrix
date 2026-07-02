type Task<T> = () => Promise<T>

export class InferenceJobQueue {
  private chain: Promise<unknown> = Promise.resolve()
  private active = false

  get busy(): boolean {
    return this.active
  }

  enqueue<T>(task: Task<T>): Promise<T> {
    const run = this.chain.then(async () => {
      this.active = true
      try {
        return await task()
      } finally {
        this.active = false
      }
    })
    this.chain = run.catch(() => {})
    return run
  }
}

export const globalInferenceQueue = new InferenceJobQueue()
