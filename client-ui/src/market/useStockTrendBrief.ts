import { useCallback, useEffect, useRef, useState } from 'react'
import { research } from '../api/client'
import type { TrendBriefData } from '../types/schemas'
import { shouldPollTrendBrief, TREND_BRIEF_POLL_MS } from './chartLiveRefresh'

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
    || (e instanceof Error && e.name === 'AbortError')
}

export function useStockTrendBrief(
  code: string | null,
  active: boolean,
  holdingCost?: number | null,
) {
  const [data, setData] = useState<TrendBriefData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const dataRef = useRef<TrendBriefData | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!code) return
    setLoading(prev => (dataRef.current ? prev : true))
    setError('')
    try {
      const resp = await research.trendBrief(code, holdingCost, signal)
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || '趋势研判加载失败')
      }
      dataRef.current = resp.data
      setData(resp.data)
      setUpdatedAt(new Date())
    } catch (e) {
      if (isAbort(e)) return
      setError(e instanceof Error ? e.message : '趋势研判加载失败')
    } finally {
      setLoading(false)
    }
  }, [code, holdingCost])

  useEffect(() => {
    dataRef.current = null
    setData(null)
    setError('')
    setUpdatedAt(null)
  }, [code, holdingCost])

  useEffect(() => {
    if (!active || !code) return undefined
    const ac = new AbortController()
    void load(ac.signal)

    if (!shouldPollTrendBrief()) {
      return () => ac.abort()
    }

    const timer = window.setInterval(() => {
      if (!shouldPollTrendBrief()) return
      void load()
    }, TREND_BRIEF_POLL_MS)

    return () => {
      ac.abort()
      window.clearInterval(timer)
    }
  }, [active, code, load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { data, loading, error, updatedAt, refresh }
}
