export type MarketDynamicsTab = 'cn'

export function readMarketDynamicsTab(): MarketDynamicsTab {
  return 'cn'
}

export function writeMarketDynamicsTab(_tab: MarketDynamicsTab): void {
  /* 暂仅 A 股看板；忽略历史 localStorage */
}
