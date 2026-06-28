import { useCallback, useEffect, useState } from 'react'
import type { WatchlistItem } from '../types/market'
import { normalizeCode } from './format'

const STORAGE_KEY = 'inno-watchlist-v2'
const LEGACY_KEY = 'inno-watchlist-v1'

const DEFAULT_ITEMS: WatchlistItem[] = [
  { code: '600519', name: '贵州茅台', industry: '白酒' },
  { code: '000001', name: '平安银行', industry: '银行' },
  { code: '300750', name: '宁德时代', industry: '电池' },
]

function normalizeItem(item: WatchlistItem): WatchlistItem {
  return {
    code: normalizeCode(item.code),
    name: item.name,
    industry: item.industry,
    note: item.note?.trim() || undefined,
    addedAt: item.addedAt,
    addedPrice: item.addedPrice ?? null,
  }
}

function readStorage(): WatchlistItem[] {
  if (typeof window === 'undefined') return DEFAULT_ITEMS.map(normalizeItem)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as WatchlistItem[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(normalizeItem)
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy) as WatchlistItem[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(row => normalizeItem({ ...row, addedAt: row.addedAt ?? new Date().toISOString() }))
      }
    }
  } catch { /* fall through */ }
  return DEFAULT_ITEMS.map(row => normalizeItem({ ...row, addedAt: new Date().toISOString() }))
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(readStorage)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((item: WatchlistItem, opts?: { addedPrice?: number | null }) => {
    const code = normalizeCode(item.code)
    const now = new Date().toISOString()
    setItems(prev => {
      if (prev.some(x => x.code === code)) return prev
      return [normalizeItem({
        ...item,
        code,
        addedAt: item.addedAt ?? now,
        addedPrice: opts?.addedPrice ?? item.addedPrice ?? null,
      }), ...prev]
    })
  }, [])

  const updateItem = useCallback((code: string, patch: Partial<WatchlistItem>) => {
    const normalized = normalizeCode(code)
    setItems(prev => prev.map(item => (
      item.code === normalized ? normalizeItem({ ...item, ...patch, code: normalized }) : item
    )))
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

  return { items, addItem, updateItem, removeItem, reorderItem, setItems }
}
