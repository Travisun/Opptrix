/**
 * 关注列表未消歧 — 在线 Tickflow 精确补强（港股短码等）。
 */
import {
  TickflowClient,
  mapTickflowInstrumentToListItem,
  type WatchlistItem,
  disambiguateWatchlistItemOutcome,
  watchlistItemNeedsDisambiguation,
  type DisambiguationHit,
  type DisambiguationCandidate,
} from '@opptrix/a-stock-layer'
import type { TickflowInstrument } from '@opptrix/a-stock-layer'
import {
  canonicalHkSymbol,
  inferCnAssetClassFromSymbol,
  normalizeInstrumentRef,
  instrumentRefKey,
  type InstrumentRef,
  type Market,
} from '@opptrix/shared'

let lastOnlinePassAt = 0
const ONLINE_THROTTLE_MS = 60_000

type OnlinePassResult = {
  items: WatchlistItem[]
  candidatesByCode: Record<string, DisambiguationCandidate[]>
}

let onlinePassInflight: Promise<OnlinePassResult | null> | null = null

function tickflowRowToHit(inst: TickflowInstrument): DisambiguationHit | null {
  try {
    const row = mapTickflowInstrumentToListItem(inst)
    const market = (row.region === 'CN' || row.region === 'US' || row.region === 'HK'
      ? row.region
      : null) as Market | null
    if (!market) return null
    const assetClass = market === 'CN'
      ? inferCnAssetClassFromSymbol(row.code, row.market)
      : 'EQUITY'
    const instrument = normalizeInstrumentRef({
      market,
      assetClass,
      symbol: row.code,
      exchange: market === 'HK' ? 'HK' : row.market || undefined,
    })
    return { instrument, name: row.name || null }
  } catch {
    return null
  }
}

/**
 * 仍 unresolved 时可选 Tickflow 精确补强（节流）；
 * 唯一命中写回；多命中写入 candidatesByCode。
 */
export async function runWatchlistOnlineDisambiguationPass(
  items: WatchlistItem[],
): Promise<{
  items: WatchlistItem[]
  resolved: number
  candidatesByCode: Record<string, DisambiguationCandidate[]>
}> {
  const now = Date.now()
  if (onlinePassInflight) {
    const prev = await onlinePassInflight
    return {
      items: prev?.items ?? items,
      resolved: 0,
      candidatesByCode: prev?.candidatesByCode ?? {},
    }
  }
  if (now - lastOnlinePassAt < ONLINE_THROTTLE_MS) {
    return { items, resolved: 0, candidatesByCode: {} }
  }

  const unresolved = items.filter(watchlistItemNeedsDisambiguation)
  if (!unresolved.length) return { items, resolved: 0, candidatesByCode: {} }

  lastOnlinePassAt = now
  onlinePassInflight = (async () => {
    try {
      const client = TickflowClient.fromConfig()
      if (!client) return { items, candidatesByCode: {} }

      const next = [...items]
      const candidatesByCode: Record<string, DisambiguationCandidate[]> = {}
      for (let i = 0; i < next.length; i++) {
        const item = next[i]
        if (!watchlistItemNeedsDisambiguation(item)) continue
        const code = String(item.code ?? '').trim()
        const digits = code.replace(/\D/g, '')
        if (!/^\d{1,5}$/.test(digits)) continue
        const hk = `${canonicalHkSymbol(digits)}.HK`
        try {
          const json = await client.getInstruments({ symbols: hk })
          const rows = (json.data ?? []) as TickflowInstrument[]
          const hits: DisambiguationHit[] = []
          const seen = new Set<string>()
          for (const row of rows) {
            const hit = tickflowRowToHit(row)
            if (!hit) continue
            const key = instrumentRefKey(normalizeInstrumentRef(hit.instrument))
            if (seen.has(key)) continue
            seen.add(key)
            hits.push(hit)
          }
          const outcome = disambiguateWatchlistItemOutcome(item, hits)
          if (outcome.status === 'resolved') {
            next[i] = outcome.item
          } else if (outcome.status === 'ambiguous') {
            candidatesByCode[code] = outcome.candidates
          }
        } catch {
          /* 单项失败不阻断 */
        }
      }
      return { items: next, candidatesByCode }
    } catch (err) {
      console.warn(
        '[watchlist] online disambiguation pass failed:',
        err instanceof Error ? err.message : String(err),
      )
      return { items, candidatesByCode: {} }
    } finally {
      onlinePassInflight = null
    }
  })()

  const pass = (await onlinePassInflight) ?? { items, candidatesByCode: {} }
  let resolved = 0
  for (let i = 0; i < items.length; i++) {
    if (
      watchlistItemNeedsDisambiguation(items[i])
      && pass.items[i]
      && !watchlistItemNeedsDisambiguation(pass.items[i])
    ) {
      resolved++
    }
  }
  return {
    items: pass.items,
    resolved,
    candidatesByCode: pass.candidatesByCode,
  }
}
