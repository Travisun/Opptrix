import type { AshareEngine } from '@inno-a-stock/a-stock-layer'
import type { MarketDataStore } from '../store.js'
import { daysSince } from '../utils.js'
import { SYNC_JOB_CONFIG } from './config.js'

export type HydrateManifest = 'watchlist' | 'detail'

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
  let shareholders = 0
  let partners = 0

  for (const code of codes) {
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
  }

  return { shareholders, partners }
}
