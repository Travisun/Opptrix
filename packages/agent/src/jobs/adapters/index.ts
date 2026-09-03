import { jobRegistry } from '../registry.js'
import type { JobAdapter } from './types.js'
import { fuyaoDumpAdapter } from './fuyao-dump.js'
import { shellCommandAdapter } from './shell-command.js'

const unbinders: Array<() => void> = []
let registered = false

export function registerDefaultJobAdapters(): void {
  if (registered) return
  registered = true
  const adapters: JobAdapter[] = [fuyaoDumpAdapter, shellCommandAdapter]
  for (const adapter of adapters) {
    unbinders.push(adapter.bind(jobRegistry))
  }
}

export function unregisterJobAdaptersForTests(): void {
  for (const u of unbinders.splice(0)) {
    try {
      u()
    } catch {
      /* ignore */
    }
  }
  registered = false
}

export { fuyaoDumpAdapter, shellCommandAdapter }
export type { JobAdapter } from './types.js'
