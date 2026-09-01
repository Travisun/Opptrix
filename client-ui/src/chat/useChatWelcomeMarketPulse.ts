import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  acquireMarketDynamicsCnPolling,
  getMarketDynamicsCnSnapshot,
  releaseMarketDynamicsCnPolling,
  subscribeMarketDynamicsCn,
} from '../pages/market-dynamics/marketDynamicsCnStore'
import {
  chunkWelcomePulsePages,
  extractWelcomePulseItems,
  resolveWelcomePulsePageSize,
  type WelcomePulseItem,
} from './welcomeMarketPulseModel'

type State = {
  pages: WelcomePulseItem[][]
  loading: boolean
}

export function useChatWelcomeMarketPulse(
  enabled: boolean,
  shuffleEpoch = 0,
  isMobile = false,
): State {
  useEffect(() => {
    if (!enabled) return undefined
    acquireMarketDynamicsCnPolling()
    return releaseMarketDynamicsCnPolling
  }, [enabled])

  const snap = useSyncExternalStore(
    subscribeMarketDynamicsCn,
    getMarketDynamicsCnSnapshot,
    getMarketDynamicsCnSnapshot,
  )

  const pageSize = resolveWelcomePulsePageSize(isMobile)

  const pages = useMemo(() => {
    if (!enabled) return []
    const items = extractWelcomePulseItems(snap.data, { shuffleEpoch })
    return chunkWelcomePulsePages(items, pageSize)
  }, [enabled, isMobile, pageSize, shuffleEpoch, snap.data])

  return {
    pages,
    loading: enabled && snap.loading && pages.length === 0,
  }
}
