import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { WatchlistItem } from '../types/market'
import { normalizeWatchlistItem } from './instrument'

/**
 * Workspace-level UI state for the right market panel (tab + selected instrument).
 *
 * NOT session-scoped: switching left-rail chats must not remount/reset this provider
 * or clear `selected` / `tab`. Mount beside WatchlistProvider in main.tsx.
 */
export type MarketPanelTab = 'watchlist' | 'portfolio' | 'detail'

type MarketPanelUiContextValue = {
  tab: MarketPanelTab
  setTab: Dispatch<SetStateAction<MarketPanelTab>>
  selected: WatchlistItem | null
  setSelected: Dispatch<SetStateAction<WatchlistItem | null>>
  /** Select an instrument and open the detail tab (same as former local handleSelect). */
  selectDetail: (item: WatchlistItem) => void
}

const MarketPanelUiContext = createContext<MarketPanelUiContextValue | null>(null)

export function MarketPanelUiProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<MarketPanelTab>('watchlist')
  const [selected, setSelected] = useState<WatchlistItem | null>(null)

  const selectDetail = useCallback((item: WatchlistItem) => {
    // 已解析强制 Opptrix + instrument；pending 短码原样保留
    setSelected(normalizeWatchlistItem(item))
    setTab('detail')
  }, [])

  const value = useMemo<MarketPanelUiContextValue>(() => ({
    tab,
    setTab,
    selected,
    setSelected,
    selectDetail,
  }), [tab, selected, selectDetail])

  return (
    <MarketPanelUiContext.Provider value={value}>
      {children}
    </MarketPanelUiContext.Provider>
  )
}

const FALLBACK: MarketPanelUiContextValue = {
  tab: 'watchlist',
  setTab: () => {},
  selected: null,
  setSelected: () => {},
  selectDetail: () => {},
}

export function useMarketPanelUi(): MarketPanelUiContextValue {
  const ctx = useContext(MarketPanelUiContext)
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn('[MarketPanelUi] useMarketPanelUi called outside MarketPanelUiProvider — using fallback')
    }
    return FALLBACK
  }
  return ctx
}
