import fs from 'node:fs'
import { resolveProvidersDir } from '@opptrix/shared'

/** Debounced watch on ~/.opptrix/providers — triggers rescan when folders change. */
export class ProviderDirWatcher {
  private watcher: fs.FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(
    private readonly onChange: () => void | Promise<void>,
    private readonly debounceMs = 800,
  ) {}

  start(): void {
    if (this.watcher) return
    const dir = resolveProvidersDir()
    fs.mkdirSync(dir, { recursive: true })

    const schedule = () => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        if (this.running) {
          schedule()
          return
        }
        this.running = true
        Promise.resolve(this.onChange())
          .catch(err => console.warn('[ProviderDirWatcher]', err))
          .finally(() => { this.running = false })
      }, this.debounceMs)
    }

    try {
      this.watcher = fs.watch(dir, { recursive: true }, () => schedule())
    } catch {
      this.watcher = fs.watch(dir, () => schedule())
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.watcher?.close()
    this.watcher = null
  }
}
