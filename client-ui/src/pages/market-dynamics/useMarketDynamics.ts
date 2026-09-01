import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { news } from '../../api/client'
import type { FeedArticle } from '../../types/schemas'
import {
  acquireMarketDynamicsCnPolling,
  getMarketDynamicsCnSnapshot,
  refreshMarketDynamicsCn,
  releaseMarketDynamicsCnPolling,
  subscribeMarketDynamicsCn,
} from './marketDynamicsCnStore'

const NEWS_REFRESH_MS = 60_000

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
  useEffect(() => {
    acquireMarketDynamicsCnPolling()
    return releaseMarketDynamicsCnPolling
  }, [])

  const snap = useSyncExternalStore(
    subscribeMarketDynamicsCn,
    getMarketDynamicsCnSnapshot,
    getMarketDynamicsCnSnapshot,
  )

  return {
    data: snap.data,
    loading: snap.loading,
    refreshing: snap.refreshing,
    error: snap.error,
    refreshedAt: snap.data?.refreshed_at ?? null,
    refresh: () => refreshMarketDynamicsCn(true),
  }
}
