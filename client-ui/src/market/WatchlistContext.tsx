import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { fetchWatchlist, saveWatchlist } from '../api/client'
import type { DisambiguationCandidate, WatchlistItem } from '../types/market'
import {
  isAmbiguousNumericCode,
  normalizeWatchlistItem,
  tryResolveWatchlistInstrument,
  watchlistItemKey,
} from './instrument'

const DEFAULT_ITEMS: WatchlistItem[] = [
  { code: '600519', name: '贵州茅台', industry: '白酒' },
  { code: '000001', name: '平安银行', industry: '银行' },
  { code: '300750', name: '宁德时代', industry: '电池' },
]

function itemKey(item: WatchlistItem): string {
  return watchlistItemKey(normalizeWatchlistItem(item))
}

type WatchlistContextValue = {
  items: WatchlistItem[]
  /** 未消歧多命中候选（key = 原 code）；点选写回后清除 */
  disambiguationCandidates: Record<string, DisambiguationCandidate[]>
  addItem: (item: WatchlistItem, opts?: { addedPrice?: number | null }) => void
  updateItem: (code: string, patch: Partial<WatchlistItem>) => void
  removeItem: (code: string) => void
  reorderItem: (code: string, direction: 'up' | 'down') => void
  setItems: Dispatch<SetStateAction<WatchlistItem[]>>
  clearDisambiguationCandidates: (code: string) => void
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null)

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [disambiguationCandidates, setDisambiguationCandidates] = useState<
    Record<string, DisambiguationCandidate[]>
  >({})
  const hydrated = useRef(false)
  const skipNextSync = useRef(false)
  const unresolvedRefetchDone = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await fetchWatchlist()
        if (cancelled) return
        if (remote.items.length > 0) {
          skipNextSync.current = true
          setItems(remote.items.map(normalizeWatchlistItem))
          setDisambiguationCandidates(remote.disambiguation_candidates ?? {})
        } else {
          const seeded = DEFAULT_ITEMS.map(row => normalizeWatchlistItem({
            ...row,
            addedAt: new Date().toISOString(),
          }))
          await saveWatchlist(seeded)
          skipNextSync.current = true
          setItems(seeded)
          setDisambiguationCandidates({})
        }
      } catch {
        if (!cancelled) {
          setItems(DEFAULT_ITEMS.map(row => normalizeWatchlistItem({
            ...row,
            addedAt: new Date().toISOString(),
          })))
          setDisambiguationCandidates({})
        }
      } finally {
        if (!cancelled) hydrated.current = true
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 仍有未消歧短码时，稍后重拉一次（承接服务端后台唯一消歧写回）
  useEffect(() => {
    if (!hydrated.current || unresolvedRefetchDone.current) return
    const hasUnresolved = items.some(item => {
      if (tryResolveWatchlistInstrument(item)) return false
      return isAmbiguousNumericCode(item.code.trim())
    })
    if (!hasUnresolved) return
    unresolvedRefetchDone.current = true
    const timer = setTimeout(() => {
      void fetchWatchlist()
        .then(remote => {
          if (!remote.items.length) return
          skipNextSync.current = true
          setItems(remote.items.map(normalizeWatchlistItem))
          setDisambiguationCandidates(remote.disambiguation_candidates ?? {})
        })
        .catch(() => {})
    }, 2500)
    return () => clearTimeout(timer)
  }, [items])

  useEffect(() => {
    if (!hydrated.current) return
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    void saveWatchlist(items).catch(() => {})
  }, [items])

  const addItem = useCallback((item: WatchlistItem, opts?: { addedPrice?: number | null }) => {
    const row = normalizeWatchlistItem(item)
    const key = itemKey(row)
    const now = new Date().toISOString()
    setItems(prev => {
      if (prev.some(x => itemKey(x) === key)) return prev
      return [normalizeWatchlistItem({
        ...row,
        addedAt: row.addedAt ?? now,
        addedPrice: opts?.addedPrice ?? row.addedPrice ?? null,
      }), ...prev]
    })
  }, [])

  const updateItem = useCallback((code: string, patch: Partial<WatchlistItem>) => {
    setItems(prev => prev.map(item => {
      const match = item.code === code || itemKey(item) === code
      if (!match && item.code !== code) return item
      return normalizeWatchlistItem({ ...item, ...patch, code: patch.code ?? item.code })
    }))
  }, [])

  const clearDisambiguationCandidates = useCallback((code: string) => {
    setDisambiguationCandidates(prev => {
      if (!(code in prev)) return prev
      const next = { ...prev }
      delete next[code]
      return next
    })
  }, [])

  const removeItem = useCallback((code: string) => {
    setItems(prev => prev.filter(item => item.code !== code && itemKey(item) !== code))
    clearDisambiguationCandidates(code)
  }, [clearDisambiguationCandidates])

  const reorderItem = useCallback((code: string, direction: 'up' | 'down') => {
    setItems(prev => {
      const index = prev.findIndex(item => item.code === code)
      if (index < 0) return prev
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      const [row] = copy.splice(index, 1)
      copy.splice(nextIndex, 0, row)
      return copy
    })
  }, [])

  const value: WatchlistContextValue = {
    items,
    disambiguationCandidates,
    addItem,
    updateItem,
    removeItem,
    reorderItem,
    setItems,
    clearDisambiguationCandidates,
  }

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  )
}

const EMPTY_WATCHLIST: WatchlistContextValue = {
  items: [],
  disambiguationCandidates: {},
  addItem: () => {},
  updateItem: () => {},
  removeItem: () => {},
  reorderItem: () => {},
  setItems: () => {},
  clearDisambiguationCandidates: () => {},
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext)
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn('[Watchlist] useWatchlist called outside WatchlistProvider — using empty fallback')
    }
    return EMPTY_WATCHLIST
  }
  return ctx
}
