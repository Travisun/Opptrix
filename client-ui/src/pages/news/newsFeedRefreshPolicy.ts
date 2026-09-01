import {
  NEWS_FEED_REFRESH_INTERVAL_MIN,
  clampNewsRefreshIntervalMin,
  newsFeedPollIntervalMs,
  newsFeedTtlMs,
} from '@opptrix/shared'

let refreshIntervalMin: number = NEWS_FEED_REFRESH_INTERVAL_MIN.default
let clientTtlMs = newsFeedTtlMs(refreshIntervalMin)
let clientPollMs = newsFeedPollIntervalMs(refreshIntervalMin)

type PolicyListener = () => void
const listeners = new Set<PolicyListener>()

export function getNewsFeedRefreshIntervalMin(): number {
  return refreshIntervalMin
}

export function getNewsFeedClientTtlMs(): number {
  return clientTtlMs
}

export function getNewsFeedClientPollMs(): number {
  return clientPollMs
}

export function applyNewsFeedRefreshIntervalMin(raw: unknown): boolean {
  const next = clampNewsRefreshIntervalMin(raw)
  if (next === refreshIntervalMin) return false
  refreshIntervalMin = next
  clientTtlMs = newsFeedTtlMs(refreshIntervalMin)
  clientPollMs = newsFeedPollIntervalMs(refreshIntervalMin)
  for (const listener of listeners) listener()
  return true
}

export function subscribeNewsFeedRefreshPolicy(listener: PolicyListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
