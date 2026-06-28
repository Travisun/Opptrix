import { useCallback, useEffect, useState } from 'react'
import type { WatchlistItem } from '../types/market'
import { normalizeCode } from './format'

const STORAGE_KEY = 'inno-watchlist-v1'

const DEFAULT_ITEMS: WatchlistItem[] = [
  { code: '600519', name: '贵州茅台', industry: '白酒' },
  { code: '000001', name: '平安银行', industry: '银行' },
  { code: '300750', name: '宁德时代', industry: '电池' },
]

function readStorage(): WatchlistItem[] {
  if (typeof window === 'undefined') return DEFAULT_ITEMS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_ITEMS
    const parsed = JSON.parse(raw) as WatchlistItem[]
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_ITEMS
    return parsed.map(item => ({
      code: normalizeCode(item.code),
      name: item.name,
      industry: item.industry,
    }))
  } catch {
    return DEFAULT_ITEMS
  }
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(readStorage)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((item: WatchlistItem) => {
    const code = normalizeCode(item.code)
    setItems(prev => {
      if (prev.some(x => x.code === code)) return prev
      return [{ ...item, code }, ...prev]
    })
  }, [])

  const removeItem = useCallback((code: string) => {
    const normalized = normalizeCode(code)
    setItems(prev => prev.filter(item => item.code !== normalized))
  }, [])

  const reorderItem = useCallback((code: string, direction: 'up' | 'down') => {
    const normalized = normalizeCode(code)
    setItems(prev => {
      const index = prev.findIndex(item => item.code === normalized)
      if (index < 0) return prev
      const nextIndex = direction === 'up' ? index - 1 : index + 1
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const copy = [...prev]
      const [row] = copy.splice(index, 1)
      copy.splice(nextIndex, 0, row)
      return copy
    })
  }, [])

  return { items, addItem, removeItem, reorderItem, setItems }
}
