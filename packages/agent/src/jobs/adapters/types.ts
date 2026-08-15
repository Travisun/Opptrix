import type { JobRegistry } from '../types.js'
import type { BackgroundJobKind } from '../constants.js'

export interface JobAdapter {
  kind: BackgroundJobKind
  syncFromSource(jobId?: string): import('../types.js').BackgroundJobSnapshot | null
  cancel?(jobId: string): Promise<boolean>
  /** 进程启动时挂载源事件 → Registry；返回 unbind */
  bind(registry: JobRegistry): () => void
}
