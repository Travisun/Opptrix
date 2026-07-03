import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WatchlistItem } from '../types/market'
import { research } from '../api/client'
import { hitToWatchlistItem, normalizeWatchlistItem, watchlistItemKey } from '../market/instrument'

export interface StockMentionState {
  open: boolean
  query: string
  startIndex: number
  activeIndex: number
}

const CLOSED: StockMentionState = {
  open: false,
  query: '',
  startIndex: -1,
  activeIndex: 0,
}

function findMentionTrigger(text: string, cursor: number) {
  const slice = text.slice(0, cursor)
  const atIndex = slice.lastIndexOf('@')
  if (atIndex < 0) return null
  if (atIndex > 0 && /[\w.]/.test(slice[atIndex - 1]!)) return null
  const query = slice.slice(atIndex + 1)
  if (/[\s@]/.test(query)) return null
  return { query, startIndex: atIndex }
}

export function useStockMention(items: WatchlistItem[]) {
  const [state, setState] = useState<StockMentionState>(CLOSED)
  const [remote, setRemote] = useState<WatchlistItem[]>([])
  const searchGen = useRef(0)

  useEffect(() => {
    if (!state.open) {
      setRemote([])
      return
    }
    const q = state.query.trim()
    if (q.length < 2 && !q.includes(':')) {
      setRemote([])
      return
    }
    const gen = ++searchGen.current
    const timer = window.setTimeout(() => {
      void research.searchInstruments(q, 12)
        .then(resp => {
          if (gen !== searchGen.current) return
          const hits = resp.data?.items ?? []
          setRemote(hits.map(hitToWatchlistItem))
        })
        .catch(() => {
          if (gen === searchGen.current) setRemote([])
        })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [state.open, state.query])

  const syncFromInput = useCallback((text: string, cursor: number) => {
    const trigger = findMentionTrigger(text, cursor)
    if (!trigger) {
      setState(prev => (prev.open ? CLOSED : prev))
      return
    }
    setState(prev => ({
      open: true,
      query: trigger.query,
      startIndex: trigger.startIndex,
      activeIndex: prev.open && prev.startIndex === trigger.startIndex
        ? prev.activeIndex
        : 0,
    }))
  }, [])

  const close = useCallback(() => {
    setState(CLOSED)
    setRemote([])
  }, [])

  const matches = useMemo(() => {
    if (!state.open) return []
    const q = state.query.trim().toLowerCase()
    const local = items.filter(item => {
      if (!q) return true
      const normalized = normalizeWatchlistItem(item)
      const code = normalized.code.toLowerCase()
      const label = normalized.instrument
        ? `${normalized.instrument.market}:${normalized.instrument.symbol}`.toLowerCase()
        : code
      return item.name.toLowerCase().includes(q)
        || code.includes(q)
        || label.includes(q)
        || (item.industry?.toLowerCase().includes(q) ?? false)
    })
    const merged = new Map<string, WatchlistItem>()
    for (const item of [...local, ...remote]) {
      const row = normalizeWatchlistItem(item)
      merged.set(watchlistItemKey(row), row)
    }
    return [...merged.values()].slice(0, 10)
  }, [items, remote, state.open, state.query])

  const moveActive = useCallback((delta: number) => {
    setState(prev => {
      if (!prev.open || !matches.length) return prev
      const next = (prev.activeIndex + delta + matches.length) % matches.length
      return { ...prev, activeIndex: next }
    })
  }, [matches.length])

  const applySelection = useCallback((
    text: string,
    cursor: number,
  ): { nextText: string; nextCursor: number } => {
    const before = text.slice(0, state.startIndex)
    const after = text.slice(cursor)
    const nextText = `${before}${after}`
    const nextCursor = before.length
    setState(CLOSED)
    setRemote([])
    return { nextText, nextCursor }
  }, [state.startIndex])

  const selectActive = useCallback((text: string, cursor: number) => {
    const item = matches[state.activeIndex]
    if (!item) return null
    return { ...applySelection(text, cursor), item: normalizeWatchlistItem(item) }
  }, [applySelection, matches, state.activeIndex])

  const clampActiveIndex = useCallback(() => {
    setState(prev => {
      if (!prev.open || !matches.length) return prev
      if (prev.activeIndex < matches.length) return prev
      return { ...prev, activeIndex: Math.max(0, matches.length - 1) }
    })
  }, [matches.length])

  const setActiveIndex = useCallback((index: number) => {
    setState(prev => {
      if (!prev.open) return prev
      return { ...prev, activeIndex: index }
    })
  }, [])

  return {
    state,
    matches,
    syncFromInput,
    close,
    moveActive,
    selectActive,
    applySelection,
    clampActiveIndex: clampMentionActiveIndex,
    setActiveIndex,
    setMentionActiveIndex: setActiveIndex,
  }
}
