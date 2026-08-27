const TAB_KEY = 'opptrix-market-dynamics-tab'

export type MarketDynamicsTab = 'cn' | 'us'

export function readMarketDynamicsTab(): MarketDynamicsTab {
  if (typeof window === 'undefined') return 'cn'
  try {
    const raw = localStorage.getItem(TAB_KEY)
    return raw === 'us' ? 'us' : 'cn'
  } catch {
    return 'cn'
  }
}

export function writeMarketDynamicsTab(tab: MarketDynamicsTab): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    /* ignore */
  }
}
