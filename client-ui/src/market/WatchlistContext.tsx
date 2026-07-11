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
import type { WatchlistItem } from '../types/market'
import { normalizeWatchlistItem, watchlistItemKey } from './instrument'

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
  addItem: (item: WatchlistItem, opts?: { addedPrice?: number | null }) => void
  updateItem: (code: string, patch: Partial<WatchlistItem>) => void
  removeItem: (code: string) => void
  reorderItem: (code: string, direction: 'up' | 'down') => void
  setItems: Dispatch<SetStateAction<WatchlistItem[]>>
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null)

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const hydrated = useRef(false)
  const skipNextSync = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await fetchWatchlist()
        if (cancelled) return
        if (remote.items.length > 0) {
          skipNextSync.current = true
          setItems(remote.items.map(normalizeWatchlistItem))
        } else {
          const seeded = DEFAULT_ITEMS.map(row => normalizeWatchlistItem({
            ...row,
            addedAt: new Date().toISOString(),
          }))
          await saveWatchlist(seeded)
          skipNextSync.current = true
          setItems(seeded)
        }
      } catch {
        if (!cancelled) {
          setItems(DEFAULT_ITEMS.map(row => normalizeWatchlistItem({
            ...row,
            addedAt: new Date().toISOString(),
          })))
        }
      } finally {
        if (!cancelled) hydrated.current = true
      }
    })()
    return () => { cancelled = true }
  }, [])

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
      const key = itemKey(item)
      const match = item.code === code || itemKey({ ...item, code }) === itemKey({ ...item, code, ...patch })
      if (!match && item.code !== code) return item
      return normalizeWatchlistItem({ ...item, ...patch, code: patch.code ?? item.code })
    }))
  }, [])

  const removeItem = useCallback((code: string) => {
    setItems(prev => prev.filter(item => item.code !== code && itemKey(item) !== code))
  }, [])

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
    addItem,
    updateItem,
    removeItem,
    reorderItem,
    setItems,
  }

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  )
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext)
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider')
  return ctx
}
