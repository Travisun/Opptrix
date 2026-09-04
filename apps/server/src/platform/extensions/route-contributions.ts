/**
 * Phase A Route Contributions — /api/ext/{pluginId}/* proxied to extensions.
 *
 * Extensions register sub-routes via callGate('routes.register', { path, method, handler }).
 * Incoming HTTP requests are forwarded to the extension's worker_js VM via callGate.
 * Routes are unregistered automatically on deactivate (contribution cleanup).
 *
 * Phase A scope: simple request→response proxy. The handler receives
 * { method, path, query, body } and returns { status, body, headers }.
 */

import type { CapabilityObservation } from '@opptrix/agent'
import { randomUUID } from 'node:crypto'

export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export type RouteRegistration = {
  id: string
  pluginId: string
  path: string // normalized, leading slash, e.g. "/hello"
  methods: RouteMethod[]
  handle: RouteHandler
}

export type RouteHandler = (req: RouteRequest) => Promise<RouteResponse>

export type RouteRequest = {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  headers: Record<string, string>
}

export type RouteResponse = {
  status: number
  body: unknown
  headers?: Record<string, string>
}

export type RouteContributionRegistry = {
  register(reg: {
    pluginId: string
    path: string
    methods?: RouteMethod[]
    handler: RouteHandler
  }): { id: string; path: string } | { error: string }
  unregister(id: string): void
  unregisterForPlugin(pluginId: string): void
  /** Match a request path to a registered route + capture params. */
  match(
    method: string,
    url: string,
  ): { route: RouteRegistration; params: Record<string, string> } | null
  list(): RouteRegistration[]
}

function normalizePath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '/'
  const withSlash = trimmed.startsWith('/') ? trimmed : '/' + trimmed
  // Collapse duplicate slashes, no trailing slash (except root).
  const collapsed = withSlash.replace(/\/+/g, '/')
  return collapsed.length > 1 && collapsed.endsWith('/')
    ? collapsed.slice(0, -1)
    : collapsed
}

export function createRouteContributionRegistry(): RouteContributionRegistry {
  const routes = new Map<string, RouteRegistration>()

  function register(reg: {
    pluginId: string
    path: string
    methods?: RouteMethod[]
    handler: RouteHandler
  }): { id: string; path: string } | { error: string } {
    if (typeof reg.handler !== 'function') {
      return { error: 'handler must be a function' }
    }
    const path = normalizePath(reg.path)
    const methods = reg.methods ?? ['GET']
    const id = randomId()
    routes.set(id, { id, pluginId: reg.pluginId, path, methods, handle: reg.handler })
    return { id, path }
  }

  function unregister(id: string): void {
    routes.delete(id)
  }

  function unregisterForPlugin(pluginId: string): void {
    for (const [id, r] of routes) {
      if (r.pluginId === pluginId) routes.delete(id)
    }
  }

  function match(
    method: string,
    url: string,
  ): { route: RouteRegistration; params: Record<string, string> } | null {
    const qIdx = url.indexOf('?')
    const pathOnly = qIdx >= 0 ? url.slice(0, qIdx) : url
    for (const route of routes.values()) {
      if (!route.methods.includes(method as RouteMethod)) continue
      const params = matchPath(route.path, pathOnly)
      if (params) return { route, params }
    }
    return null
  }

  function list(): RouteRegistration[] {
    return [...routes.values()].map((r) => ({ ...r }))
  }

  return { register, unregister, unregisterForPlugin, match, list }
}

function matchPath(
  pattern: string,
  actual: string,
): Record<string, string> | null {
  if (pattern === actual) return {}
  // Support "/:param" segments.
  const pSeg = pattern.split('/')
  const aSeg = actual.split('/')
  if (pSeg.length !== aSeg.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pSeg.length; i++) {
    if (pSeg[i].startsWith(':')) {
      params[pSeg[i].slice(1)] = decodeURIComponent(aSeg[i])
    } else if (pSeg[i] !== aSeg[i]) {
      return null
    }
  }
  return params
}

function randomId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}

/**
 * Invoke a route handler via callGate and normalize the response.
 * Returns a RouteResponse; never throws (R0: extension error → 500).
 */
export async function invokeRouteHandler(
  handler: RouteHandler,
  req: RouteRequest,
): Promise<RouteResponse> {
  const out = await handler(req)
  return {
    status: typeof out?.status === 'number' ? out.status : 200,
    body: out?.body ?? null,
    headers: out?.headers ?? {},
  }
}
