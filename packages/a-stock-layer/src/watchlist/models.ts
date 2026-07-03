import type { InstrumentRef } from '@opptrix/shared'

export interface WatchlistItem {
  code: string
  name: string
  industry?: string
  note?: string
  addedAt?: string
  addedPrice?: number | null
  /** Explicit market identity — inferred from code when absent (legacy) */
  instrument?: InstrumentRef
}
