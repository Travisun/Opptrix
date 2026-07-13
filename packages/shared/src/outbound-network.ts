export type OutboundConnectFamily = 4 | 6
export type OutboundFamilyMode = 'auto' | OutboundConnectFamily

export interface OutboundNetworkStatus {
  /** Routing strategy: always IPv4-first with per-host v6 fallback. */
  family: OutboundConnectFamily
}

const HOST_FAMILY_CACHE_TTL_MS = 30 * 60_000

interface HostFamilyPreference {
  family: OutboundConnectFamily
  expiresAt: number
}

const DEFAULT_STATUS: OutboundNetworkStatus = { family: 4 }

let networkStatus: OutboundNetworkStatus | null = null
let initPromise: Promise<OutboundNetworkStatus> | null = null
const hostFamilyCache = new Map<string, HostFamilyPreference>()

const RETRYABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EAI_NODATA',
  'EAI_FAIL',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

function parseFamilyModeOverride(): OutboundFamilyMode | null {
  const raw = process.env.OPPTRIX_OUTBOUND_FAMILY?.trim().toLowerCase()
  if (!raw || raw === 'auto') return null
  if (raw === '4' || raw === 'ipv4') return 4
  if (raw === '6' || raw === 'ipv6') return 6
  return null
}

function getCachedHostFamily(hostname: string): OutboundConnectFamily | null {
  const cached = hostFamilyCache.get(hostname)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    hostFamilyCache.delete(hostname)
    return null
  }
  return cached.family
}

function rememberHostFamily(hostname: string, family: OutboundConnectFamily): void {
  hostFamilyCache.set(hostname, {
    family,
    expiresAt: Date.now() + HOST_FAMILY_CACHE_TTL_MS,
  })
}

function alternateFamily(family: OutboundConnectFamily): OutboundConnectFamily {
  return family === 6 ? 4 : 6
}

function uniqueFamilies(families: OutboundConnectFamily[]): OutboundConnectFamily[] {
  const seen = new Set<OutboundConnectFamily>()
  const out: OutboundConnectFamily[] = []
  for (const family of families) {
    if (seen.has(family)) continue
    seen.add(family)
    out.push(family)
  }
  return out
}

/**
 * Mark outbound routing ready — no startup network probe; IPv4-first is always used.
 */
export function initOutboundNetwork(): Promise<OutboundNetworkStatus> {
  if (!initPromise) {
    networkStatus = DEFAULT_STATUS
    initPromise = Promise.resolve(networkStatus)
  }
  return initPromise
}

export function getOutboundNetworkStatus(): OutboundNetworkStatus | null {
  return networkStatus
}

/** @deprecated Returns IPv4-first strategy marker. */
export function getOutboundConnectFamily(): OutboundConnectFamily | null {
  return networkStatus?.family ?? null
}

export async function ensureOutboundNetworkReady(): Promise<OutboundNetworkStatus> {
  if (networkStatus) return networkStatus
  return initOutboundNetwork()
}

/**
 * Per-host connect family order:
 * 1. Env override — `4`/`6` 严格单栈，无回退
 * 2. 已学习偏好 — 该 host 上次成功的 family 优先
 * 3. 默认 — 强制 IPv4；仅当该 host 在 v4 上连接/DNS 失败时再试 v6
 */
export function getConnectFamiliesForHost(hostname: string): OutboundConnectFamily[] {
  const override = parseFamilyModeOverride()
  if (override === 4) return [4]
  if (override === 6) return [6]

  const cached = getCachedHostFamily(hostname)
  if (cached != null) {
    return uniqueFamilies([cached, alternateFamily(cached)])
  }

  return [4, 6]
}

export function noteHostConnectSuccess(hostname: string, family: OutboundConnectFamily): void {
  rememberHostFamily(hostname, family)
}

export function noteHostConnectFailure(hostname: string, failedFamily: OutboundConnectFamily): OutboundConnectFamily {
  const next = alternateFamily(failedFamily)
  rememberHostFamily(hostname, next)
  return next
}

/** @deprecated Prefer noteHostConnectFailure(hostname, family) */
export function noteOutboundConnectFailure(failedFamily: OutboundConnectFamily): OutboundConnectFamily {
  return alternateFamily(failedFamily)
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return ''
  if ('code' in error && error.code != null) return String(error.code)
  if ('cause' in error && error.cause instanceof Error && 'code' in error.cause && error.cause.code != null) {
    return String(error.cause.code)
  }
  return ''
}

export function isOutboundConnectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError' || error.message === 'Aborted') return false
  const code = errorCode(error)
  if (code && RETRYABLE_NETWORK_CODES.has(code)) return true
  const message = error.message.toLowerCase()
  return message.includes('getaddrinfo')
    || message.includes('network is unreachable')
    || message.includes('connection timed out')
}

/** Reset module state — for tests only. */
export function resetOutboundNetworkForTests(): void {
  networkStatus = null
  initPromise = null
  hostFamilyCache.clear()
}

/** Inject state — for tests only. */
export function setOutboundNetworkStatusForTests(status: OutboundNetworkStatus = DEFAULT_STATUS): void {
  networkStatus = status
  initPromise = Promise.resolve(status)
}
