import { research } from '../../api/client'
import type { MarketDynamicsData } from '../../types/schemas'
import {
  UI_CACHE_TTL_MS,
  UI_POLL_INTERVAL_MS,
  decideRevalidate,
  resolveFetchedAtMs,
} from '@opptrix/shared'
import { createVisibilityPoller, type VisibilityPoller } from '../../data/cacheControl'
import {
  readSessionCacheEnvelope,
  writeSessionCacheEnvelope,
} from '../../data/sessionCacheEnvelope'

const SESSION_CACHE_KEY = 'opptrix-market-dynamics-cn'

export const MARKET_DYNAMICS_CN_REFRESH_MS = UI_POLL_INTERVAL_MS.marketDynamicsCn

export type MarketDynamicsCnSnapshot = {
  data: MarketDynamicsData | null
  loading: boolean
  refreshing: boolean
  error: string
  lastFetchedAtMs: number
}

function isMarketDynamicsData(data: unknown): data is MarketDynamicsData {
  return !!data
    && typeof data === 'object'
    && Array.isArray((data as MarketDynamicsData).sections)
}

function readSessionCache(): { data: MarketDynamicsData; cached_at_ms: number } | null {
  const hit = readSessionCacheEnvelope(SESSION_CACHE_KEY, isMarketDynamicsData)
  if (!hit) return null
  return hit
}

function writeSessionCache(data: MarketDynamicsData, cachedAtMs: number): void {
  writeSessionCacheEnvelope(SESSION_CACHE_KEY, data, cachedAtMs)
}

const bootCached = readSessionCache()

let snapshot: MarketDynamicsCnSnapshot = {
  data: bootCached?.data ?? null,
  loading: false,
  refreshing: false,
  error: '',
  lastFetchedAtMs: bootCached
    ? resolveFetchedAtMs(bootCached.cached_at_ms, bootCached.data.refreshed_at)
    : 0,
}

let pagePollRefCount = 0
let pagePoller: VisibilityPoller | null = null
let inflightLoad: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach(listener => listener())
}

function scheduleLoad(opts?: { force?: boolean; userInitiated?: boolean }): void {
  const hasDisplayedData = snapshot.data != null
  const mode = decideRevalidate({
    cachedAtMs: snapshot.lastFetchedAtMs,
    ttlMs: UI_CACHE_TTL_MS.marketDynamicsCn,
    force: opts?.force,
    hasDisplayedData,
  })
  if (mode === 'skip') return

  void loadMarketDynamicsCn({
    silent: hasDisplayedData,
    force: mode === 'hard' || opts?.userInitiated === true,
  })
}

async function loadMarketDynamicsCn(opts?: { silent?: boolean; force?: boolean }): Promise<void> {
  if (inflightLoad) return inflightLoad

  const silent = opts?.silent ?? false
  const force = opts?.force ?? false
  const hasDisplayedData = snapshot.data != null

  if (!hasDisplayedData && !silent) {
    snapshot = { ...snapshot, loading: true }
    emit()
  } else if (hasDisplayedData) {
    snapshot = { ...snapshot, refreshing: true }
    emit()
  }

  inflightLoad = (async () => {
    try {
      snapshot = { ...snapshot, error: '' }
      const resp = await research.marketDynamics({
        market: 'cn',
        ...(force ? { refresh: true } : {}),
      })
      if (resp.success && resp.data) {
        const data: MarketDynamicsData = {
          ...resp.data,
          market: resp.data.market ?? 'cn',
        }
        const fetchedAtMs = resolveFetchedAtMs(Date.now(), data.refreshed_at)
        writeSessionCache(data, fetchedAtMs)
        snapshot = {
          data,
          loading: false,
          refreshing: false,
          error: '',
          lastFetchedAtMs: fetchedAtMs,
        }
      } else {
        snapshot = {
          ...snapshot,
          loading: false,
          refreshing: false,
          error: resp.message || '暂时无法获取市场数据',
        }
      }
    } catch (e) {
      snapshot = {
        ...snapshot,
        loading: false,
        refreshing: false,
        error: e instanceof Error ? e.message : '加载失败，请检查网络后重试',
      }
    } finally {
      inflightLoad = null
      emit()
    }
  })()

  return inflightLoad
}

function ensurePagePoller(): VisibilityPoller {
  if (!pagePoller) {
    pagePoller = createVisibilityPoller(MARKET_DYNAMICS_CN_REFRESH_MS, () => {
      scheduleLoad()
    })
  }
  return pagePoller
}

function startPagePolling(): void {
  scheduleLoad()
  ensurePagePoller().acquire()
}

function stopPagePolling(): void {
  ensurePagePoller().release()
}

/** 市场动态页可见时开启轮询；离开页面完全停止 */
export function acquireMarketDynamicsCnPagePolling(): void {
  pagePollRefCount += 1
  if (pagePollRefCount === 1) startPagePolling()
}

export function releaseMarketDynamicsCnPagePolling(): void {
  pagePollRefCount = Math.max(0, pagePollRefCount - 1)
  if (pagePollRefCount === 0) stopPagePolling()
}

/** 聊天欢迎区脉搏：单次按需刷新，不开启轮询 */
export function ensureMarketDynamicsCnPulseRefresh(): void {
  scheduleLoad()
}

export function subscribeMarketDynamicsCn(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function getMarketDynamicsCnSnapshot(): MarketDynamicsCnSnapshot {
  return snapshot
}

export function refreshMarketDynamicsCn(force = true): Promise<void> {
  const silent = snapshot.data != null
  return loadMarketDynamicsCn({ silent, force })
}
