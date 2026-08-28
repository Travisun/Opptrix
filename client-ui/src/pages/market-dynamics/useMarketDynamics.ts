import { useCallback, useEffect, useRef, useState } from 'react'
import { news, research } from '../../api/client'
import type { FeedArticle, MarketDynamicsData } from '../../types/schemas'

const NEWS_REFRESH_MS = 60_000
const MARKET_REFRESH_MS = 30_000

function filterCnArticles(articles: FeedArticle[]): FeedArticle[] {
  return articles.filter(article => {
    const text = `${article.title} ${article.source_title ?? ''}`.toLowerCase()
    return /a股|沪深|上证|深证|创业板|科创板|北交所|cn\b|china/i.test(text)
      || !/美股|nasdaq|nyse|港股|恒生|crypto|btc/i.test(text)
  })
}

export function useMarketInsights() {
  const [articles, setArticles] = useState<FeedArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    setError('')
    try {
      const feedResp = await news.getFeed({ limit: 24 }).catch(() => null)
      if (!mountedRef.current) return
      if (feedResp?.articles) {
        setArticles(filterCnArticles(feedResp.articles).slice(0, 12))
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
    const timer = window.setInterval(() => { void load({ silent: true }) }, NEWS_REFRESH_MS)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
    }
  }, [load])

  return { articles, loading, error, refresh: () => load({ silent: true }) }
}

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
      const resp = await research.marketDynamics({ market: 'cn' })
      if (!mountedRef.current) return
      if (resp.success && resp.data) {
        setData({
          ...resp.data,
          market: resp.data.market ?? 'cn',
        })
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
    const timer = setInterval(() => { void load({ silent: true }) }, MARKET_REFRESH_MS)
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
