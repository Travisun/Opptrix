import { useEffect, useRef, useState } from 'react'
import { research } from '../api/client'
import type { LocalInstrumentHit } from '../types/instrument'
import type { WatchlistItem } from '../types/market'
import { hitToWatchlistItem } from './instrument'

export type UniversePrepStatus = 'ready' | 'preparing' | 'failed' | null

/** @deprecated 搜索不再依赖名录预热；保留类型以免旧调用方编译失败 */
export interface UniversePrepUi {
  status: UniversePrepStatus
  percent: number
  message: string
}

const SEARCH_DEBOUNCE_MS = 280

/** @deprecated 无预热文案；保留空常量以免旧 import 失败 */
export const UNIVERSE_PREP_COPY = {
  preparing: '',
  refreshing: '',
  failed: '',
} as const

export interface UseInstrumentSearchWithUniversePrepOptions {
  keyword: string
  limit?: number
  /** Minimum keyword length to search; default 2 */
  minLength?: number
  debounceMs?: number
  enabled?: boolean
  mapHit?: (hit: LocalInstrumentHit) => WatchlistItem
}

export interface UseInstrumentSearchWithUniversePrepResult {
  hits: WatchlistItem[]
  searching: boolean
  /** 恒为「无预热」空态 */
  universePrep: UniversePrepUi
  refreshingAfterPrep: boolean
}

/**
 * 标的搜索（OpptrixQuant 在线）— 不再触发名录预热。
 */
export function useInstrumentSearchWithUniversePrep(
  opts: UseInstrumentSearchWithUniversePrepOptions,
): UseInstrumentSearchWithUniversePrepResult {
  const {
    keyword,
    limit = 20,
    minLength = 2,
    debounceMs = SEARCH_DEBOUNCE_MS,
    enabled = true,
    mapHit = hitToWatchlistItem,
  } = opts

  const [hits, setHits] = useState<WatchlistItem[]>([])
  const [searching, setSearching] = useState(false)
  const genRef = useRef(0)
  const mapHitRef = useRef(mapHit)
  mapHitRef.current = mapHit
  const limitRef = useRef(limit)
  limitRef.current = limit

  useEffect(() => {
    if (!enabled) {
      setHits([])
      setSearching(false)
      return undefined
    }

    const q = keyword.trim()
    const gen = ++genRef.current

    if (q.length < minLength) {
      setHits([])
      setSearching(false)
      return undefined
    }

    const timer = window.setTimeout(() => {
      setSearching(true)
      void research.searchInstruments(q, limitRef.current)
        .then(resp => {
          if (gen !== genRef.current) return
          setHits((resp.data?.items ?? []).map(hit => mapHitRef.current(hit)))
        })
        .catch(() => {
          if (gen === genRef.current) setHits([])
        })
        .finally(() => {
          if (gen === genRef.current) setSearching(false)
        })
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [keyword, enabled, minLength, debounceMs])

  return {
    hits,
    searching,
    universePrep: { status: null, percent: 0, message: '' },
    refreshingAfterPrep: false,
  }
}
