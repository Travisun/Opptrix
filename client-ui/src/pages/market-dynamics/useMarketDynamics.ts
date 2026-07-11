import { useCallback, useEffect, useRef, useState } from 'react'
import { research } from '../../api/client'
import type { MarketDynamicsData } from '../../types/schemas'

const REFRESH_MS = 30_000

export function useMarketDynamics() {
  const [data, setData] = useState<MarketDynamicsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const resp = await research.marketDynamics()
      if (!mountedRef.current) return
      if (resp.success && resp.data) {
        setData(resp.data)
      } else {
        setError(resp.message || '暂时无法获取市场数据')
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : '加载失败，请检查网络后重试')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void load()
    const timer = setInterval(() => { void load({ silent: true }) }, REFRESH_MS)
    return () => {
      mountedRef.current = false
      clearInterval(timer)
    }
  }, [load])

  return {
    data,
    loading,
    refreshing,
    error,
    refreshedAt: data?.refreshed_at ?? null,
    refresh: () => load({ silent: true }),
  }
}
