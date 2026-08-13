import type { AshareEngine } from '@opptrix/a-stock-layer'
import type { MarketDataStore } from '../store.js'
import { isDuckLowMemProfile } from '../duck/duck-cli-pool.js'
import { daysSince } from '../utils.js'
import { SYNC_JOB_CONFIG } from './config.js'
import { mapPool } from './pool.js'

export type HydrateManifest = 'watchlist' | 'detail'

const DEFAULT_HYDRATE_CONCURRENCY = 2
const MAX_HYDRATE_CONCURRENCY = 3

/**
 * L1 hydrate 跨 code 并发：默认 2；低配 1；`OPPTRIX_HYDRATE_CONCURRENCY` 可覆盖，上限 3。
 * 保持保守以免股东等免费源触发 FreeProviderThrottle。
 */
export function resolveHydrateConcurrency(): number {
  const raw = process.env.OPPTRIX_HYDRATE_CONCURRENCY
  if (raw != null && String(raw).trim() !== '') {
    const n = Number.parseInt(String(raw).trim(), 10)
    if (Number.isFinite(n) && n >= 1) {
      return Math.min(MAX_HYDRATE_CONCURRENCY, Math.floor(n))
    }
  }
  return isDuckLowMemProfile() ? 1 : DEFAULT_HYDRATE_CONCURRENCY
}

function needsRefresh(syncedAt: string | null, ttlDays: number): boolean {
  if (!syncedAt) return true
  return daysSince(syncedAt) >= ttlDays
}

function persistShareholders(store: MarketDataStore, code: string, data: Record<string, unknown>[]): void {
  if (!data.length) return
  const first = data[0]!
  if (first.top10Shareholders || first.top10_shareholders) {
    store.replaceShareholders(code, first)
    return
  }
  const reportDate = String(first.end_date ?? first.endDate ?? first.reportDate ?? '').slice(0, 10)
  store.replaceShareholders(code, {
    reportDate,
    top10Shareholders: data.slice(0, 10).map((h, i) => ({
      rank: i + 1,
      name: h.holder_name ?? h.holderName ?? h.name,
      sharesHeld: h.hold_amount ?? h.holdAmount,
      sharePct: h.hold_ratio ?? h.holdRatio,
    })),
  })
}

export async function hydrateStocks(
  store: MarketDataStore,
  de: AshareEngine,
  codes: string[],
  manifest: HydrateManifest = 'watchlist',
): Promise<{ shareholders: number; partners: number }> {
  const holderTtl = SYNC_JOB_CONFIG.shareholders?.ttlDays ?? 90
  const partnerTtl = SYNC_JOB_CONFIG.partners?.ttlDays ?? 90
  const concurrency = resolveHydrateConcurrency()

  const perCode = await mapPool(codes, concurrency, 0, async (code) => {
    let shareholders = 0
    let partners = 0

    const holderStale = needsRefresh(store.shareholderSyncedAt(code), holderTtl)
    if (holderStale) {
      try {
        const resp = await de.shareholders(code)
        if (resp.success && resp.data?.length) {
          persistShareholders(store, code, resp.data as Record<string, unknown>[])
          store.markJobProgress('shareholders', code, '', 'done')
          shareholders++
        }
      } catch {
        // Best-effort hydration
      }
    }

    // Per-code: shareholders then partners — avoid same-code concurrent DB writes.
    if (manifest === 'detail') {
      const partnerStale = needsRefresh(store.partnerSyncedAt(code), partnerTtl)
      if (partnerStale) {
        try {
          const cust = await de.topCustomerSupplier(code, 'customer')
          const supp = await de.topCustomerSupplier(code, 'supplier')
          if (cust.success && cust.data?.length) {
            store.replacePartners(code, 'customer', cust.data as Record<string, unknown>[])
          }
          if (supp.success && supp.data?.length) {
            store.replacePartners(code, 'supplier', supp.data as Record<string, unknown>[])
          }
          store.markJobProgress('partners', code, '', 'done')
          partners++
        } catch {
          // Best-effort hydration
        }
      }
    }

    return { shareholders, partners }
  })

  let shareholders = 0
  let partners = 0
  for (const row of perCode) {
    shareholders += row.shareholders
    partners += row.partners
  }
  return { shareholders, partners }
}
