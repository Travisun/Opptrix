import { research } from '../../api/client'
import type { MarketDynamicsData } from '../../types/schemas'

/** 与 Hub `MARKET_DYNAMICS_CN_TTL_MS`(22s) 对齐，略长以避免边界重复打满 */
export const MARKET_DYNAMICS_CN_REFRESH_MS = 30_000

const SESSION_CACHE_KEY = 'opptrix-market-dynamics-cn'

export type MarketDynamicsCnSnapshot = {
  data: MarketDynamicsData | null
  loading: boolean
  refreshing: boolean
  error: string
}

function readSessionCache(): MarketDynamicsData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MarketDynamicsData
    if (!parsed || !Array.isArray(parsed.sections)) return null
    return parsed
  } catch {
    return null
  }
}

function writeSessionCache(data: MarketDynamicsData): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data))
  } catch {
    /* quota / private mode */
  }
}

const bootCached = readSessionCache()

let snapshot: MarketDynamicsCnSnapshot = {
  data: bootCached,
  loading: false,
  refreshing: false,
  error: '',
}

let pollRefCount = 0
let refreshTimer: number | null = null
let inflightLoad: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach(listener => listener())
}

async function loadMarketDynamicsCn(opts?: { silent?: boolean; force?: boolean }): Promise<void> {
  if (inflightLoad) return inflightLoad

  const silent = opts?.silent ?? false
  const force = opts?.force ?? false

  if (!silent && !snapshot.data) {
    snapshot = { ...snapshot, loading: true }
    emit()
  } else if (silent && snapshot.data) {
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
        writeSessionCache(data)
        snapshot = {
          data,
          loading: false,
          refreshing: false,
          error: '',
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

function startPolling(): void {
  if (refreshTimer != null) return
  void loadMarketDynamicsCn()
  refreshTimer = window.setInterval(() => {
    if (document.hidden) return
    void loadMarketDynamicsCn({ silent: true })
  }, MARKET_DYNAMICS_CN_REFRESH_MS)
}

function stopPolling(): void {
  if (refreshTimer == null) return
  window.clearInterval(refreshTimer)
  refreshTimer = null
}

/** 有消费者时开启轮询；多路（市场动态页 + 聊天欢迎区）共享同一份内存态与 inflight */
export function acquireMarketDynamicsCnPolling(): void {
  pollRefCount += 1
  if (pollRefCount === 1) startPolling()
}

export function releaseMarketDynamicsCnPolling(): void {
  pollRefCount = Math.max(0, pollRefCount - 1)
  if (pollRefCount === 0) stopPolling()
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
