/**
 * 旧版关注列表命名空间 → Opptrix ID（启动幂等迁移）。
 * 旧版仅支持：A 股 CN:SH/SZ/BJ、场内 ETF CN:ETF.xxxxxx、美股 US:、港股 HK:、裸六位 / 裸 ticker。
 */
import { parseOpptrixInstrumentId } from '@opptrix/shared'
import type { WatchlistItem } from './models.js'
import { normalizeWatchlistItem } from './instrument.js'
import { migrateWatchlistItemInstrumentIdV1 } from './migrate-instrument-id.js'

/** user-store meta — 旧命名空间批量升格 Opptrix 已完成 */
export const WATCHLIST_LEGACY_NAMESPACE_TO_OPTRIX_V1 = 'watchlist_legacy_namespace_to_opptrix_v1'

function itemIdentityKey(item: WatchlistItem): string {
  const inst = item.instrument
  return [
    item.code.trim(),
    inst?.market ?? '',
    inst?.assetClass ?? '',
    inst?.symbol ?? '',
    inst?.exchange ?? '',
  ].join('|')
}

/** 仍为旧命名空间 / 裸码，且非 Opptrix ID */
export function isLegacyWatchlistNamespaceCode(code: string): boolean {
  const text = String(code ?? '').trim()
  if (!text || parseOpptrixInstrumentId(text)) return false
  if (/^CN:(?:ETF|LOF|SH|SZ|BJ|PF|OF)[.:]/i.test(text)) return true
  if (/^(?:US|HK):/i.test(text)) return true
  if (/^\d{6}$/.test(text)) return true
  if (/^[A-Z][A-Z0-9.-]{0,11}$/i.test(text) && !text.includes(':') && !/^\d+$/.test(text)) {
    return true
  }
  return false
}

export function watchlistItemNeedsLegacyNamespaceMigration(item: WatchlistItem): boolean {
  if (isLegacyWatchlistNamespaceCode(item.code)) return true
  if (item.instrument?.market && item.instrument.symbol) {
    const expected = normalizeWatchlistItem(item).code
    return expected !== item.code.trim()
  }
  return false
}

/** 单条：v1 假 CN 修复 + normalize → Opptrix */
export function migrateWatchlistLegacyNamespaceItem(item: WatchlistItem): WatchlistItem {
  return normalizeWatchlistItem(migrateWatchlistItemInstrumentIdV1(item))
}

export function migrateWatchlistLegacyNamespaceItems(items: WatchlistItem[]): {
  items: WatchlistItem[]
  changed: number
} {
  let changed = 0
  const next = items.map(item => {
    const migrated = migrateWatchlistLegacyNamespaceItem(item)
    if (itemIdentityKey(migrated) !== itemIdentityKey(item)) changed += 1
    return migrated
  })
  return { items: next, changed }
}
