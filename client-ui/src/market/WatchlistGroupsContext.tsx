import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { fetchWatchlistGroups, saveWatchlistGroups } from '../api/client'
import type { WatchlistGroup, WatchlistGroupsDocument } from '../types/market'
import { WATCHLIST_ALL_GROUP_ID } from '../types/market'

type WatchlistGroupsContextValue = {
  groups: WatchlistGroup[]
  membership: Record<string, string[]>
  selectedGroupId: string | null
  setSelectedGroupId: (groupId: string | null) => void
  replaceDoc: (doc: WatchlistGroupsDocument) => Promise<void>
  removeItemMembership: (itemKey: string) => void
  dialogOpen: boolean
  setDialogOpen: (open: boolean) => void
}

const WatchlistGroupsContext = createContext<WatchlistGroupsContextValue | null>(null)

export function WatchlistGroupsProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [membership, setMembership] = useState<Record<string, string[]>>({})
  const [selectedGroupId, setSelectedGroupIdRaw] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  /** 最新乐观文档；removeItemMembership 据此计算 next，避免闭包过期 */
  const docRef = useRef<WatchlistGroupsDocument>({ groups: [], membership: {} })
  /** 单调递增；仅最新 writeId 的 save 响应可回写 state */
  const saveEpochRef = useRef(0)
  /** 串行保存链：后一次 await 前一次，避免并发 PUT 互相覆盖 */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  const applyLocalDoc = useCallback((doc: WatchlistGroupsDocument) => {
    docRef.current = doc
    setGroups(doc.groups)
    setMembership(doc.membership)
  }, [])

  const enqueueSave = useCallback((doc: WatchlistGroupsDocument): Promise<void> => {
    const writeId = ++saveEpochRef.current
    const run = async () => {
      try {
        const saved = await saveWatchlistGroups(doc)
        // 过期响应不得回写：连续新建时先完成的旧 save 会带着旧 groups
        if (writeId !== saveEpochRef.current) return
        applyLocalDoc(saved)
      } catch {
        /* keep optimistic local doc */
      }
    }
    const next = saveChainRef.current.then(run, run)
    saveChainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }, [applyLocalDoc])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const remote = await fetchWatchlistGroups()
        if (cancelled) return
        // hydrate 仅读；失败路径也不 PUT 空文档
        applyLocalDoc(remote)
      } catch {
        if (!cancelled) {
          applyLocalDoc({ groups: [], membership: {} })
        }
      }
    })()
    return () => { cancelled = true }
  }, [applyLocalDoc])

  useEffect(() => {
    if (!selectedGroupId) return
    if (!groups.some(g => g.id === selectedGroupId)) {
      setSelectedGroupIdRaw(null)
    }
  }, [groups, selectedGroupId])

  const setSelectedGroupId = useCallback((groupId: string | null) => {
    if (groupId === WATCHLIST_ALL_GROUP_ID) {
      setSelectedGroupIdRaw(null)
      return
    }
    setSelectedGroupIdRaw(groupId)
  }, [])

  const replaceDoc = useCallback(async (doc: WatchlistGroupsDocument) => {
    applyLocalDoc(doc)
    await enqueueSave(doc)
  }, [applyLocalDoc, enqueueSave])

  const removeItemMembership = useCallback((itemKey: string) => {
    const current = docRef.current
    if (!(itemKey in current.membership)) return
    const nextMembership = { ...current.membership }
    delete nextMembership[itemKey]
    const nextDoc: WatchlistGroupsDocument = {
      groups: current.groups,
      membership: nextMembership,
    }
    applyLocalDoc(nextDoc)
    void enqueueSave(nextDoc)
  }, [applyLocalDoc, enqueueSave])

  const value: WatchlistGroupsContextValue = {
    groups,
    membership,
    selectedGroupId,
    setSelectedGroupId,
    replaceDoc,
    removeItemMembership,
    dialogOpen,
    setDialogOpen,
  }

  return (
    <WatchlistGroupsContext.Provider value={value}>
      {children}
    </WatchlistGroupsContext.Provider>
  )
}

const EMPTY_GROUPS: WatchlistGroupsContextValue = {
  groups: [],
  membership: {},
  selectedGroupId: null,
  setSelectedGroupId: () => {},
  replaceDoc: async () => {},
  removeItemMembership: () => {},
  dialogOpen: false,
  setDialogOpen: () => {},
}

export function useWatchlistGroups(): WatchlistGroupsContextValue {
  const ctx = useContext(WatchlistGroupsContext)
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn('[WatchlistGroups] useWatchlistGroups called outside provider — using empty fallback')
    }
    return EMPTY_GROUPS
  }
  return ctx
}

export function filterWatchlistByGroup<T extends { code: string; instrument?: import('../types/instrument').InstrumentRef }>(
  items: T[],
  membership: Record<string, string[]>,
  selectedGroupId: string | null,
  itemKeyFn: (item: T) => string,
): T[] {
  if (!selectedGroupId) return items
  return items.filter(item => {
    const key = itemKeyFn(item)
    return membership[key]?.includes(selectedGroupId) ?? false
  })
}
