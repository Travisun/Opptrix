import net from 'node:net'

export type OutboundConnectFamily = 4 | 6

export interface OutboundNetworkStatus {
  family: OutboundConnectFamily
  ipv6Available: boolean
  ipv4Available: boolean
}

export interface OutboundNetworkInitOptions {
  /** Dual-stack probe host; defaults to cloudflare.com */
  probeHost?: string
  probePort?: number
  timeoutMs?: number
}

const DEFAULT_PROBE_HOST = 'cloudflare.com'
const DEFAULT_PROBE_PORT = 443
const DEFAULT_PROBE_TIMEOUT_MS = 2_500

let preferredFamily: OutboundConnectFamily | null = null
let networkStatus: OutboundNetworkStatus | null = null
let initPromise: Promise<OutboundNetworkStatus> | null = null

function probeTcp(
  host: string,
  port: number,
  family: OutboundConnectFamily,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host, port, family })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)

    const finish = (ok: boolean) => {
      clearTimeout(timer)
      socket.destroy()
      resolve(ok)
    }

    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

async function detectOutboundConnectFamily(
  opts: OutboundNetworkInitOptions = {},
): Promise<OutboundNetworkStatus> {
  const host = opts.probeHost?.trim() || process.env.OPPTRIX_OUTBOUND_PROBE_HOST?.trim() || DEFAULT_PROBE_HOST
  const port = opts.probePort ?? DEFAULT_PROBE_PORT
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS

  const ipv6Available = await probeTcp(host, port, 6, timeoutMs)
  const ipv4Available = await probeTcp(host, port, 4, timeoutMs)
  const family: OutboundConnectFamily = ipv6Available ? 6 : ipv4Available ? 4 : 6

  return { family, ipv6Available, ipv4Available }
}

/** Startup probe: IPv6 first, fall back to IPv4 when v6 is unreachable. */
export function initOutboundNetwork(opts?: OutboundNetworkInitOptions): Promise<OutboundNetworkStatus> {
  if (!initPromise) {
    initPromise = detectOutboundConnectFamily(opts).then(status => {
      preferredFamily = status.family
      networkStatus = status
      return status
    })
  }
  return initPromise
}

export function getOutboundNetworkStatus(): OutboundNetworkStatus | null {
  return networkStatus
}

export function getOutboundConnectFamily(): OutboundConnectFamily | null {
  return preferredFamily
}

export async function ensureOutboundNetworkReady(): Promise<OutboundConnectFamily> {
  if (preferredFamily != null) return preferredFamily
  const status = await initOutboundNetwork()
  return status.family
}

/** Learn from a connect failure and switch to the alternate IP family. */
export function noteOutboundConnectFailure(failedFamily: OutboundConnectFamily): OutboundConnectFamily {
  const next: OutboundConnectFamily = failedFamily === 6 ? 4 : 6
  preferredFamily = next
  if (networkStatus) {
    networkStatus = { ...networkStatus, family: next }
  }
  return next
}

export function isOutboundConnectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? String(error.code) : ''
  return code === 'ETIMEDOUT'
    || code === 'ECONNREFUSED'
    || code === 'ENETUNREACH'
    || code === 'EHOSTUNREACH'
    || code === 'ENETDOWN'
    || code === 'EAI_AGAIN'
}
