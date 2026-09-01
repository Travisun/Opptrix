import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { news } from '../../api/client'
import type { FeedArticle } from '../../types/schemas'
import {
  decideRevalidate,
  resolveFetchedAtMs,
} from '@opptrix/shared'
import {
  ensureNewsFeedRefreshPolicyHydrated,
  getNewsFeedClientPollMs,
  getNewsFeedClientTtlMs,
  subscribeNewsFeedRefreshPolicy,
} from '../news/newsFeedSession'
import {
  acquireMarketDynamicsCnPagePolling,
  getMarketDynamicsCnSnapshot,
  refreshMarketDynamicsCn,
  releaseMarketDynamicsCnPagePolling,
  subscribeMarketDynamicsCn,
} from './marketDynamicsCnStore'

function filterCnArticles(articles: FeedArticle[]): FeedArticle[] {
  return articles.filter(article => {
    const text = `${article.title} ${article.source_title ?? ''}`.toLowerCase()
    return /a股|沪深|上证|深证|创业板|科创板|北交所|cn\b|china/i.test(text)
      || !/美股|nasdaq|nyse|港股|恒生|crypto|btc/i.test(text)
  })
}

let lastInsightsFetchedAtMs = 0

export function useMarketInsights(pageActive: boolean) {
  const [articles, setArticles] = useState<FeedArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [pollMs, setPollMs] = useState(getNewsFeedClientPollMs)
  const mountedRef = useRef(true)
  const articlesRef = useRef(articles)
  articlesRef.current = articles

  useEffect(() => {
    return subscribeNewsFeedRefreshPolicy(() => {
      setPollMs(getNewsFeedClientPollMs())
    })
  }, [])

  const load = useCallback(async (opts?: { force?: boolean }) => {
    await ensureNewsFeedRefreshPolicyHydrated()
    const hasDisplayed = articlesRef.current.length > 0
    const mode = decideRevalidate({
      cachedAtMs: lastInsightsFetchedAtMs,
      ttlMs: getNewsFeedClientTtlMs(),
      force: opts?.force,
      hasDisplayedData: hasDisplayed,
    })
    if (mode === 'skip') return

    const silent = hasDisplayed
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const feedResp = await news.getFeed({ limit: 24 }).catch(() => null)
      if (!mountedRef.current) return
      if (feedResp?.articles) {
        setArticles(filterCnArticles(feedResp.articles).slice(0, 12))
        lastInsightsFetchedAtMs = resolveFetchedAtMs(Date.now(), feedResp.refreshed_at)
      }
    } catch (e) {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : '资讯加载失败')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!pageActive) return undefined
    mountedRef.current = true
    void load()
    const timer = window.setInterval(() => {
      if (document.hidden) return
      void load()
    }, pollMs)
    return () => {
      mountedRef.current = false
      window.clearInterval(timer)
    }
  }, [load, pageActive, pollMs])

  return {
    articles,
    loading,
    refreshing,
    error,
    refresh: () => load({ force: true }),
  }
}

export function useMarketDynamics(pageActive: boolean) {
  useEffect(() => {
    if (!pageActive) return undefined
    acquireMarketDynamicsCnPagePolling()
    return releaseMarketDynamicsCnPagePolling
  }, [pageActive])

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
