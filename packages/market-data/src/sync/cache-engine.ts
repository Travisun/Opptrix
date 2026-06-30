import type { AshareEngine } from '@opptrix/a-stock-layer'

/** Per-stock in-memory dedup during factor sync — avoids repeated kline/financials calls. */
export class SyncCachingEngine {
  private cache = new Map<string, Promise<unknown>>()

  constructor(private inner: AshareEngine) {}

  private once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let hit = this.cache.get(key) as Promise<T> | undefined
    if (!hit) {
      hit = fn()
      this.cache.set(key, hit)
    }
    return hit
  }

  realtime(code: string) {
    return this.once(`rt:${code}`, () => this.inner.realtime(code))
  }

  kline(code: string, periodOrCount: number): ReturnType<AshareEngine['kline']>
  kline(code: string, period?: string, start?: string, end?: string, count?: number): ReturnType<AshareEngine['kline']>
  kline(code: string, periodOrCount: string | number = 'daily', start = '', end = '', count?: number) {
    const key = `kl:${code}:${JSON.stringify([periodOrCount, start, end, count])}`
    return this.once(key, () =>
      (this.inner.kline as (...args: unknown[]) => ReturnType<AshareEngine['kline']>)(
        code, periodOrCount, start, end, count,
      ),
    )
  }

  financials(code: string, reportDate = '', reportType = 'annual') {
    return this.once(`fin:${code}:${reportDate}:${reportType}`, () =>
      this.inner.financials(code, reportDate, reportType),
    )
  }

  financialsQuarterly(code: string) {
    return this.once(`finq:${code}`, () => this.inner.financialsQuarterly(code))
  }

  indexKline(code: string, periodOrCount: number): ReturnType<AshareEngine['indexKline']>
  indexKline(code: string, period?: string, start?: string, end?: string, count?: number): ReturnType<AshareEngine['indexKline']>
  indexKline(code: string, periodOrCount: string | number = 'daily', start = '', end = '', count?: number) {
    const key = `idx:${code}:${JSON.stringify([periodOrCount, start, end, count])}`
    return this.once(key, () =>
      (this.inner.indexKline as (...args: unknown[]) => ReturnType<AshareEngine['indexKline']>)(
        code, periodOrCount, start, end, count,
      ),
    )
  }
}
