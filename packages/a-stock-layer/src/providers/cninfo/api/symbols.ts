import { getCninfoClient } from './client.js'

type StockRow = { code?: string; orgId?: string }

let orgIdByCode: Map<string, string> | null = null
let loadedAt = 0

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

async function ensureOrgIdIndex(): Promise<Map<string, string>> {
  const now = Date.now()
  if (orgIdByCode && now - loadedAt < CACHE_TTL_MS) return orgIdByCode

  const data = await getCninfoClient().fetchStockIndex()
  const list = (data.stockList ?? []) as StockRow[]
  const next = new Map<string, string>()
  for (const row of list) {
    const code = String(row.code ?? '').trim()
    const orgId = String(row.orgId ?? '').trim()
    if (code.length === 6 && orgId) next.set(code, orgId)
  }
  if (!next.size) throw new Error('无法加载巨潮证券代码表')
  orgIdByCode = next
  loadedAt = now
  return next
}

export async function resolveCninfoOrgId(code: string): Promise<string | null> {
  const normalized = code.trim().replace(/\D/g, '').padStart(6, '0').slice(-6)
  if (!/^\d{6}$/.test(normalized)) return null
  const index = await ensureOrgIdIndex()
  return index.get(normalized) ?? null
}

/** Test helper — drop cached orgId table. */
export function resetCninfoSymbolCacheForTests(): void {
  orgIdByCode = null
  loadedAt = 0
}
