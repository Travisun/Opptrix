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
  prepareWatchlistItemForStore,
  tryResolveWatchlistInstrument,
  watchlistItemKey,
} from './instrument'
import { buildWatchlistAddedPricePatch, prefetchWatchlistQuotePatch } from './watchlistQuotePrefetch'
import type { MarketQuote } from '../types/market'

export type WatchlistQuotePatchListener = (patch: Record<string, MarketQuote>) => void

const DEFAULT_ITEMS: WatchlistItem[] = [
  { code: '600519', name: '贵州茅台', industry: '白酒' },
  { code: '000001', name: '平安银行', industry: '银行' },
  { code: '300750', name: '宁德时代', industry: '电池' },
]

function itemKey(item: WatchlistItem): string {
  return watchlistItemKey(prepareWatchlistItemForStore(item))
}

function computeItemsKey(list: WatchlistItem[]): string {
  return list.map(item => itemKey(item)).join('|')
}

type WatchlistContextValue = {
  items: WatchlistItem[]
  /** 已与后端 watchlist_save 对齐的 items 签名；行情批拉应在此匹配后再请求 */
  syncedItemsKey: string
  /** 未消歧多命中候选（key = 原 code）；点选写回后清除 */
  disambiguationCandidates: Record<string, DisambiguationCandidate[]>
  addItem: (item: WatchlistItem, opts?: { addedPrice?: number | null }) => void
  /** 写入关注并等待后端 save 完成（供添加后立即 fresh 拉价） */
  addItemAndSync: (item: WatchlistItem, opts?: { addedPrice?: number | null }) => Promise<WatchlistItem>
  updateItem: (code: string, patch: Partial<WatchlistItem>) => void
  removeItem: (code: string) => void
  reorderItem: (code: string, direction: 'up' | 'down') => void
  setItems: Dispatch<SetStateAction<WatchlistItem[]>>
  clearDisambiguationCandidates: (code: string) => void
  /** 订阅 addItemAndSync 后的即时报价 patch（组件 mount 时注册） */
  subscribeQuotePatches: (listener: WatchlistQuotePatchListener) => () => void
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
  const itemsRef = useRef<WatchlistItem[]>([])
  const [syncedItemsKey, setSyncedItemsKey] = useState('')
  const quotePatchListenersRef = useRef(new Set<WatchlistQuotePatchListener>())
  itemsRef.current = items

  const emitQuotePatch = useCallback((patch: Record<string, MarketQuote>) => {
    if (!Object.keys(patch).length) return
    for (const listener of quotePatchListenersRef.current) {
      listener(patch)
    }
  }, [])

  const subscribeQuotePatches = useCallback((listener: WatchlistQuotePatchListener) => {
    quotePatchListenersRef.current.add(listener)
    return () => {
      quotePatchListenersRef.current.delete(listener)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await fetchWatchlist()
        if (cancelled) return
        if (remote.items.length > 0) {
          const normalized = remote.items.map(prepareWatchlistItemForStore)
          skipNextSync.current = true
          setItems(normalized)
          setSyncedItemsKey(computeItemsKey(normalized))
          setDisambiguationCandidates(remote.disambiguation_candidates ?? {})
        } else {
          const seeded = DEFAULT_ITEMS.map(row => normalizeWatchlistItem({
            ...row,
            addedAt: new Date().toISOString(),
          }))
          await saveWatchlist(seeded)
          skipNextSync.current = true
          setItems(seeded)
          setSyncedItemsKey(computeItemsKey(seeded))
          setDisambiguationCandidates({})
        }
      } catch {
        if (!cancelled) {
          const fallback = DEFAULT_ITEMS.map(row => normalizeWatchlistItem({
            ...row,
            addedAt: new Date().toISOString(),
          }))
          setItems(fallback)
          setSyncedItemsKey('')
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
          const normalized = remote.items.map(prepareWatchlistItemForStore)
          skipNextSync.current = true
          setItems(normalized)
          setSyncedItemsKey(computeItemsKey(normalized))
          setDisambiguationCandidates(remote.disambiguation_candidates ?? {})
        })
        .catch(() => {})
    }, 2500)
    return () => clearTimeout(timer)
  }, [items])

  useEffect(() => {
    if (!hydrated.current) return
    const key = computeItemsKey(items)
    if (skipNextSync.current) {
      skipNextSync.current = false
      setSyncedItemsKey(key)
      return
    }
    void saveWatchlist(items)
      .then(() => { setSyncedItemsKey(key) })
      .catch(() => {})
  }, [items])

  const addItem = useCallback((item: WatchlistItem, opts?: { addedPrice?: number | null }) => {
    const row = prepareWatchlistItemForStore(item)
    const key = itemKey(row)
    const now = new Date().toISOString()
    setItems(prev => {
      if (prev.some(x => itemKey(x) === key)) return prev
      return [prepareWatchlistItemForStore({
        ...row,
        addedAt: row.addedAt ?? now,
        addedPrice: opts?.addedPrice ?? row.addedPrice ?? null,
      }), ...prev]
    })
  }, [])

  const addItemAndSync = useCallback(async (item: WatchlistItem, opts?: { addedPrice?: number | null }) => {
    const row = prepareWatchlistItemForStore(item)
    const key = itemKey(row)
    const now = new Date().toISOString()
    const prev = itemsRef.current
    const existing = prev.find(x => itemKey(x) === key)
    if (existing) return existing

    const added = prepareWatchlistItemForStore({
      ...row,
      addedAt: row.addedAt ?? now,
      addedPrice: opts?.addedPrice ?? row.addedPrice ?? null,
    })
    const next = [added, ...prev]
    setItems(next)
    try {
      await saveWatchlist(next)
      setSyncedItemsKey(computeItemsKey(next))
      const ref = tryResolveWatchlistInstrument(added)
      if (ref) {
        void prefetchWatchlistQuotePatch(added, ref).then(patch => {
          emitQuotePatch(patch)
        })
      }
    } catch {
      /* 本地已更新；批拉会在 syncedItemsKey 对齐后重试 */
      const ref = tryResolveWatchlistInstrument(added)
      if (ref && added.addedPrice != null && added.addedPrice > 0) {
        emitQuotePatch(buildWatchlistAddedPricePatch(added, ref, added.addedPrice))
      }
    }
    return added
  }, [emitQuotePatch])

  const updateItem = useCallback((code: string, patch: Partial<WatchlistItem>) => {
    setItems(prev => prev.map(item => {
      const match = item.code === code || itemKey(item) === code
      if (!match && item.code !== code) return item
      return prepareWatchlistItemForStore({ ...item, ...patch, code: patch.code ?? item.code })
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
    syncedItemsKey,
    disambiguationCandidates,
    addItem,
    addItemAndSync,
    updateItem,
    removeItem,
    reorderItem,
    setItems,
    clearDisambiguationCandidates,
    subscribeQuotePatches,
  }

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  )
}

const EMPTY_WATCHLIST: WatchlistContextValue = {
  items: [],
  syncedItemsKey: '',
  disambiguationCandidates: {},
  addItem: () => {},
  addItemAndSync: async item => item,
  updateItem: () => {},
  removeItem: () => {},
  reorderItem: () => {},
  setItems: () => {},
  clearDisambiguationCandidates: () => {},
  subscribeQuotePatches: () => () => {},
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
