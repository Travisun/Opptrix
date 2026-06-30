import { useCallback, useMemo, useState } from 'react'
import type { WatchlistItem } from '../types/market'
import { normalizeCode } from '../market/format'

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
  }, [])

  const matches = useMemo(() => {
    if (!state.open) return []
    const q = state.query.trim().toLowerCase()
    const filtered = items.filter(item => {
      if (!q) return true
      const code = normalizeCode(item.code)
      return item.name.toLowerCase().includes(q)
        || code.includes(q)
        || (item.industry?.toLowerCase().includes(q) ?? false)
    })
    return filtered.slice(0, 8)
  }, [items, state.open, state.query])

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
    return { nextText, nextCursor }
  }, [state.startIndex])

  const selectActive = useCallback((text: string, cursor: number) => {
    const item = matches[state.activeIndex]
    if (!item) return null
    return { ...applySelection(text, cursor), item }
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
    clampActiveIndex,
    setActiveIndex,
  }
}
