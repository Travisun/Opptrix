import { useCallback, useEffect, useRef, useState } from 'react'
import { research } from '../api/client'
import type { LocalInstrumentHit } from '../types/instrument'
import type { WatchlistItem } from '../types/market'
import { hitToWatchlistItem } from '../market/instrument'

export type UniversePrepStatus = 'ready' | 'preparing' | 'failed' | null

export interface UniversePrepUi {
  status: UniversePrepStatus
  percent: number
  message: string
}

const PREP_POLL_MS = 1000
const SEARCH_DEBOUNCE_MS = 280

export const UNIVERSE_PREP_COPY = {
  preparing: '请稍等，正在准备标的库…',
  refreshing: '标的库已就绪，正在更新搜索结果…',
  failed: '标的库暂时没法准备好，可以稍后再搜试试',
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
  universePrep: UniversePrepUi
  /** True while showing brief "updating results" after prep completes */
  refreshingAfterPrep: boolean
}

type PrepFromSearch = {
  status: 'ready' | 'preparing' | 'failed'
  percent: number
  message: string
} | undefined

/**
 * 标的搜索 + 名录按需准备：可先展示在线结果；preparing 时轮询 sync 进度；完成后自动重搜。
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
  const [universePrep, setUniversePrep] = useState<UniversePrepUi>({
    status: null,
    percent: 0,
    message: '',
  })
  const [refreshingAfterPrep, setRefreshingAfterPrep] = useState(false)

  const genRef = useRef(0)
  const pollTimerRef = useRef<number | null>(null)
  const keywordRef = useRef(keyword)
  keywordRef.current = keyword
  const mapHitRef = useRef(mapHit)
  mapHitRef.current = mapHit
  const limitRef = useRef(limit)
  limitRef.current = limit

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const applyPrep = useCallback((prep: PrepFromSearch): 'ready' | 'preparing' | 'failed' => {
    if (!prep || prep.status === 'ready') {
      setUniversePrep({ status: null, percent: 100, message: '' })
      return 'ready'
    }
    if (prep.status === 'failed') {
      setUniversePrep({
        status: 'failed',
        percent: Math.max(0, Math.min(100, prep.percent || 0)),
        message: prep.message || UNIVERSE_PREP_COPY.failed,
      })
      return 'failed'
    }
    setUniversePrep({
      status: 'preparing',
      percent: Math.max(0, Math.min(100, prep.percent || 0)),
      message: prep.message || UNIVERSE_PREP_COPY.preparing,
    })
    return 'preparing'
  }, [])

  const runSearchRef = useRef<(q: string, gen: number, afterPrep?: boolean) => Promise<void>>(
    async () => {},
  )
  const schedulePollRef = useRef<(q: string, gen: number) => void>(() => {})

  runSearchRef.current = async (q: string, gen: number, afterPrep = false) => {
    if (afterPrep) setRefreshingAfterPrep(true)
    else setSearching(true)
    try {
      const resp = await research.searchInstruments(q, limitRef.current)
      if (gen !== genRef.current) return
      setHits((resp.data?.items ?? []).map(hit => mapHitRef.current(hit)))
      const status = applyPrep(resp.data?.universe_prep)
      if (status === 'preparing') {
        schedulePollRef.current(q, gen)
      } else {
        clearPoll()
      }
    } catch {
      if (gen === genRef.current) {
        if (!afterPrep) setHits([])
        setUniversePrep(prev => (
          prev.status === 'preparing'
            ? prev
            : { status: null, percent: 0, message: '' }
        ))
      }
    } finally {
      if (gen === genRef.current) {
        setSearching(false)
        setRefreshingAfterPrep(false)
      }
    }
  }

  schedulePollRef.current = (q: string, gen: number) => {
    clearPoll()
    pollTimerRef.current = window.setTimeout(async () => {
      if (gen !== genRef.current) return
      if (keywordRef.current.trim() !== q) return
      try {
        const snap = await research.marketDataSyncState()
        if (gen !== genRef.current) return
        const data = snap.data
        const running = Boolean(data?.running)
        const percent = Math.max(0, Math.min(100, Number(data?.overall_percent) || 0))

        if (running) {
          setUniversePrep({
            status: 'preparing',
            percent,
            message: UNIVERSE_PREP_COPY.preparing,
          })
          schedulePollRef.current(q, gen)
          return
        }

        setUniversePrep({
          status: 'preparing',
          percent: Math.max(percent, 99),
          message: UNIVERSE_PREP_COPY.refreshing,
        })
        await runSearchRef.current(q, gen, true)
      } catch {
        if (gen === genRef.current) {
          setUniversePrep({
            status: 'failed',
            percent: 0,
            message: UNIVERSE_PREP_COPY.failed,
          })
        }
      }
    }, PREP_POLL_MS)
  }

  useEffect(() => {
    if (!enabled) {
      clearPoll()
      setHits([])
      setSearching(false)
      setUniversePrep({ status: null, percent: 0, message: '' })
      setRefreshingAfterPrep(false)
      return undefined
    }

    const q = keyword.trim()
    const gen = ++genRef.current
    clearPoll()

    if (q.length < minLength) {
      setHits([])
      setSearching(false)
      setUniversePrep({ status: null, percent: 0, message: '' })
      setRefreshingAfterPrep(false)
      return undefined
    }

    const timer = window.setTimeout(() => {
      void runSearchRef.current(q, gen)
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
      if (genRef.current === gen) clearPoll()
    }
  }, [keyword, enabled, minLength, debounceMs, clearPoll])

  useEffect(() => () => {
    clearPoll()
  }, [clearPoll])

  return {
    hits,
    searching,
    universePrep,
    refreshingAfterPrep,
  }
}
