import { sleep } from './pool.js'

type Release = () => void

/** Rate-limit outbound sync API calls. Serial (gap) or concurrent (semaphore) mode. */
export class ApiThrottler {
  private lastAt = 0
  private lock: Promise<void> = Promise.resolve()
  private active = 0
  private waitQueue: Array<() => void> = []

  constructor(
    private minGapMs: number,
    private maxConcurrent = 1,
  ) {}

  async acquire(): Promise<Release> {
    if (this.maxConcurrent <= 1) {
      await this.acquireSerial()
      return () => {}
    }
    return this.acquireConcurrent()
  }

  private async acquireSerial(): Promise<void> {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    this.lock = this.lock.then(async () => {
      const now = Date.now()
      const wait = this.minGapMs - (now - this.lastAt)
      if (wait > 0) await sleep(wait)
      this.lastAt = Date.now()
      release()
    })
    await gate
  }

  private acquireConcurrent(): Promise<Release> {
    return new Promise(resolve => {
      const enter = () => {
        if (this.active < this.maxConcurrent) {
          this.active++
          let released = false
          resolve(() => {
            if (released) return
            released = true
            this.active--
            const next = this.waitQueue.shift()
            if (next) next()
          })
          return
        }
        this.waitQueue.push(enter)
      }
      enter()
    })
  }
}
