import { sleep } from './pool.js'

/** Global minimum gap between outbound API calls (shared across workers). */
export class ApiThrottler {
  private lastAt = 0
  private lock: Promise<void> = Promise.resolve()

  constructor(private minGapMs: number) {}

  async acquire(): Promise<void> {
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
}
