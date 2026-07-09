import { useCallback, useEffect, useRef, useState } from 'react'
import { news, research } from '../../api/client'
import type { FeedArticle, MarketReportData } from '../../types/schemas'

const REFRESH_MS = 60_000

export function useMarketInsights() {
  const [report, setReport] = useState<MarketReportData | null>(null)
  const [articles, setArticles] = useState<FeedArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setError('')
    try {
      const [reportResp, feedResp] = await Promise.all([
        research.marketReport('morning').catch(() => research.marketReport('closing')),
        news.getFeed({ limit: 10 }).catch(() => null),
      ])
      if (!mountedRef.current) return
      if (reportResp.success && reportResp.data) {
        setReport(reportResp.data)
      }
      if (feedResp?.articles) {
        setArticles(feedResp.articles)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : '资讯加载失败')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void load()
    const timer = window.setInterval(() => { void load({ silent: true }) }, REFRESH_MS)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
    }
  }, [load])

  return { report, articles, loading, error, refresh: () => load({ silent: true }) }
}
