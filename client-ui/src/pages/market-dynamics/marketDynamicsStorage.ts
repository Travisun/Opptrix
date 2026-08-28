/** A 股市场动态 — 港股/美股面板已暂时下线 */
export type MarketDynamicsTab = 'cn'

const STORAGE_KEY = 'opptrix-market-dynamics-tab'

export function readMarketDynamicsTab(): MarketDynamicsTab {
  if (typeof window === 'undefined') return 'cn'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim().toLowerCase()
    if (raw === 'hk' || raw === 'us') {
      localStorage.setItem(STORAGE_KEY, 'cn')
    }
  } catch {
    /* ignore */
  }
  return 'cn'
}

export function writeMarketDynamicsTab(_tab: MarketDynamicsTab): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, 'cn')
  } catch {
    /* ignore */
  }
}
