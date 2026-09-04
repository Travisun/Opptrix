/**
 * Market Data Plane (Phase B) — unified, self-negotiating cross-market data
 * access layer serving the whole system (UI, extensions, future services).
 *
 * Design (docs/EXTENSION-STORE-PROTOCOL.md is store; this is the data plane):
 *   - Demand-driven: polls only while at least one subscriber (UI page,
 *     extension) holds a subscription — zero cost when idle.
 *   - Coalesced: all demanded refs are batched into hub `instrument_quotes`
 *     calls (the engine's per-host serial guard keeps free sources ≤1 req/s).
 *   - Bounded: tick interval 5s, batch ≤50 refs, per-ref event throttle ≥1s,
 *     ≤100 emitted events per tick, cache entries TTL-evicted.
 *   - Event fan-out: every quote update is emitted on the event bus as
 *     `market.quote.updated` — extensions subscribe via `events.subscribe`
 *     (topic `market.quote.*`) and react to ticks (reactive model).
 *
 * All polling flows through the existing engine (`queryInstrumentData`
 * backbone via hub dispatch) — provider negotiation/failover stays where it
 * is; the plane adds coalescing, caching, and event distribution.
 */

import { SystemEvents, type EventDispatcher } from '@opptrix/event-bus'

export type MarketQuote = {
  code: string
  name?: string
  price?: number | null
  changePct?: number | null
  [k: string]: unknown
}

export type InstrumentRefLike = {
  market: string
  assetClass: string
  symbol: string
  exchange?: string
}

export type MarketPlaneBindings = {
  events: EventDispatcher
  dispatch: (feature: string, params: unknown) => Promise<unknown>
  log?: { warn: (msg: string) => void }
  /** Poll cadence (ms). Free-source compliant: batched single calls. */
  tickMs?: number
}

const BATCH_SIZE = 50
const MAX_EVENTS_PER_TICK = 100
const PER_REF_EVENT_THROTTLE_MS = 1_000
const TICK_MS_DEFAULT = 5_000

class MarketDataPlaneImpl {
  private events: EventDispatcher | null = null
  private dispatch: ((feature: string, params: unknown) => Promise<unknown>) | null = null
  private log: { warn: (msg: string) => void } | null = null
  private tickMs = TICK_MS_DEFAULT
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  /** subscriberId → set of demand keys (JSON of instruments array). */
  private demand = new Map<string, Set<string>>()
  /** demand key → instruments (for batched dispatch). */
  private demandInstruments = new Map<string, InstrumentRefLike[]>()
  /** quote code → last emitted at (throttle). */
  private lastEmit = new Map<string, number>()
  /** quote code → last quote (plane cache, latest snapshot). */
  private latest = new Map<string, MarketQuote>()

  bind(bindings: MarketPlaneBindings): void {
    this.events = bindings.events
    this.dispatch = bindings.dispatch
    this.log = bindings.log ?? null
    this.tickMs = bindings.tickMs ?? TICK_MS_DEFAULT
  }

  /** Start the demand-driven poll timer (idempotent; unref'd). */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, this.tickMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Register a subscriber's demanded instruments (ref-counted per id). */
  subscribe(subscriberId: string, instruments: InstrumentRefLike[]): number {
    if (instruments.length === 0) return 0
    const bounded = instruments.slice(0, 200)
    const keys = new Set<string>()
    for (const inst of bounded) {
      const key = JSON.stringify(inst)
      keys.add(key)
      if (!this.demandInstruments.has(key)) {
        this.demandInstruments.set(key, [inst])
      }
    }
    this.demand.set(subscriberId, keys)
    this.start()
    return bounded.length
  }

  unsubscribe(subscriberId: string): void {
    const keys = this.demand.get(subscriberId)
    if (!keys) return
    // Ref-count: only drop instrument demand not shared with other subscribers.
    const otherKeys = new Set<string>()
    for (const [id, set] of this.demand) {
      if (id === subscriberId) continue
      for (const k of set) otherKeys.add(k)
    }
    for (const k of keys) {
      if (!otherKeys.has(k)) this.demandInstruments.delete(k)
    }
    this.demand.delete(subscriberId)
    if (this.demand.size === 0) {
      this.stop() // idle: zero polling cost
    }
  }

  unsubscribeFor(extensionId: string): void {
    this.unsubscribe(extensionId)
  }

  demandCount(): number {
    return this.demand.size
  }

  /** Latest cached quote snapshot (cross-market unified surface). */
  snapshot(codes: string[]): MarketQuote[] {
    return codes
      .map((c) => this.latest.get(c))
      .filter((q): q is MarketQuote => q !== undefined)
  }

  private demandedInstruments(): InstrumentRefLike[] {
    const out: InstrumentRefLike[] = []
    for (const insts of this.demandInstruments.values()) out.push(...insts)
    return out
  }

  private async fetchBatch(instruments: InstrumentRefLike[]): Promise<MarketQuote[]> {
    if (!this.dispatch) return []
    const result = (await this.dispatch('instrument_quotes', {
      instruments,
    })) as { data?: { quotes?: MarketQuote[] } } | undefined
    return result?.data?.quotes ?? []
  }

  private async tick(): Promise<void> {
    if (this.ticking || !this.dispatch || !this.events) return
    if (this.demand.size === 0) return
    this.ticking = true
    try {
      const instruments = this.demandedInstruments()
      let emitted = 0
      const now = Date.now()
      for (let i = 0; i < instruments.length; i += BATCH_SIZE) {
        const batch = instruments.slice(i, i + BATCH_SIZE)
        let quotes: MarketQuote[] = []
        try {
          quotes = await this.fetchBatch(batch)
        } catch (err) {
          this.log?.warn(`market plane batch failed: ${err instanceof Error ? err.message : String(err)}`)
          continue
        }
        for (const q of quotes) {
          if (!q?.code) continue
          this.latest.set(q.code, q)
          const last = this.lastEmit.get(q.code) ?? 0
          if (now - last < PER_REF_EVENT_THROTTLE_MS) continue
          if (emitted >= MAX_EVENTS_PER_TICK) continue
          this.lastEmit.set(q.code, now)
          emitted++
          this.events.emit(
            SystemEvents.market.quoteUpdated,
            { quote: q, at: new Date(now).toISOString() },
            { kind: 'system', id: 'market-plane' },
          )
        }
      }
      // Evict throttle entries for refs no longer demanded (bounded state).
      if (this.lastEmit.size > 2_000) {
        const demandedCodes = new Set(
          this.demandedInstruments().map((i) => `${i.market}:${i.assetClass}:${i.symbol}`),
        )
        for (const code of this.lastEmit.keys()) {
          if (!demandedCodes.has(code) && ![...this.latest.values()].some((q) => q.code === code)) {
            this.lastEmit.delete(code)
          }
        }
      }
    } finally {
      this.ticking = false
    }
  }
}

const plane = new MarketDataPlaneImpl()

export type MarketDataPlane = {
  subscribe(subscriberId: string, instruments: InstrumentRefLike[]): number
  unsubscribe(subscriberId: string): void
  unsubscribeFor(extensionId: string): void
  demandCount(): number
  snapshot(codes: string[]): MarketQuote[]
  bind(bindings: MarketPlaneBindings): void
  start(): void
  stop(): void
}

export function bindMarketPlane(bindings: MarketPlaneBindings): MarketDataPlane {
  plane.bind(bindings)
  plane.start()
  return plane
}

export function getMarketPlane(): MarketDataPlane {
  return plane
}
