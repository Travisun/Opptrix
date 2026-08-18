/**
 * 超时 fetch + 内存 cookie + 403/429 首页 cookie 重试。
 * Cookie 仅内存，禁止落盘。
 */

import { ENGINE_DEFS, isAllowedSearchHost, type EngineDef } from './engines.js'

export const WEBSEARCH_FETCH_TIMEOUT_MS = 10_000
export const WEBSEARCH_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export type WebsearchFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

let injectedFetch: WebsearchFetch | null = null

/** 测试注入 fetch；传 null 恢复全局 fetch */
export function setWebsearchFetchForTests(fn: WebsearchFetch | null): void {
  injectedFetch = fn
}

export function isWebsearchFetchInjected(): boolean {
  return injectedFetch != null
}

export function getWebsearchFetch(): WebsearchFetch {
  return injectedFetch ?? globalThis.fetch.bind(globalThis)
}

/** 按主机存 Cookie 头片段（仅内存） */
export class MemoryCookieJar {
  private readonly byHost = new Map<string, Map<string, string>>()

  clear(): void {
    this.byHost.clear()
  }

  getCookieHeader(hostname: string): string | undefined {
    const jar = this.byHost.get(hostname.toLowerCase())
    if (!jar?.size) return undefined
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  absorbSetCookie(hostname: string, setCookie: string | null): void {
    if (!setCookie) return
    const host = hostname.toLowerCase()
    let jar = this.byHost.get(host)
    if (!jar) {
      jar = new Map()
      this.byHost.set(host, jar)
    }
    // 简化：只取 name=value，忽略 Path/Expires
    const first = setCookie.split(';')[0]?.trim()
    if (!first) return
    const eq = first.indexOf('=')
    if (eq <= 0) return
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (name) jar.set(name, value)
  }

  /** 从 Response 多条 set-cookie 吸收（Node fetch 可能只有一条） */
  absorbResponse(hostname: string, resp: Response): void {
    const anyHeaders = resp.headers as Headers & { getSetCookie?: () => string[] }
    if (typeof anyHeaders.getSetCookie === 'function') {
      for (const c of anyHeaders.getSetCookie()) this.absorbSetCookie(hostname, c)
      return
    }
    this.absorbSetCookie(hostname, resp.headers.get('set-cookie'))
  }
}

export class WebsearchFetchError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'WebsearchFetchError'
  }
}

/** SSRF：仅允许引擎 allowlist 主机 + http(s) */
export function assertAllowedSearchUrl(urlStr: string): URL {
  let u: URL
  try {
    u = new URL(urlStr)
  } catch {
    throw new WebsearchFetchError('无效的检索地址')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new WebsearchFetchError('仅允许 http(s) 检索地址')
  }
  if (!isAllowedSearchHost(u.hostname)) {
    throw new WebsearchFetchError('目标主机不在检索引擎允许列表')
  }
  return u
}

function defaultHeaders(cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': WEBSEARCH_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
  if (cookie) h.Cookie = cookie
  return h
}

async function fetchOnce(
  urlStr: string,
  jar: MemoryCookieJar,
  timeoutMs: number,
): Promise<{ status: number; html: string; url: string }> {
  const u = assertAllowedSearchUrl(urlStr)
  const fetchFn = getWebsearchFetch()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const cookie = jar.getCookieHeader(u.hostname)
    const resp = await fetchFn(u.toString(), {
      method: 'GET',
      headers: defaultHeaders(cookie),
      redirect: 'follow',
      signal: controller.signal,
    })
    jar.absorbResponse(u.hostname, resp)
    // 跟随重定向后主机仍须在 allowlist
    try {
      assertAllowedSearchUrl(resp.url || u.toString())
    } catch {
      throw new WebsearchFetchError('重定向目标不在允许列表')
    }
    const html = await resp.text()
    return { status: resp.status, html, url: resp.url || u.toString() }
  } catch (e) {
    if (e instanceof WebsearchFetchError) throw e
    const msg = e instanceof Error ? e.message : '网络错误'
    // 脱敏：不回显完整 URL / query
    throw new WebsearchFetchError(msg.includes('abort') ? '检索超时' : '检索请求失败')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 拉取搜索页 HTML；403/429 时先拉首页拿 cookie 再重试一次。
 */
export async function fetchSearchHtml(
  engine: EngineDef,
  searchUrl: string,
  jar: MemoryCookieJar,
  opts?: { timeoutMs?: number; retryDelayMs?: number },
): Promise<{ status: number; html: string; url: string }> {
  const timeoutMs = opts?.timeoutMs ?? WEBSEARCH_FETCH_TIMEOUT_MS
  const retryDelayMs = opts?.retryDelayMs ?? 0

  let first = await fetchOnce(searchUrl, jar, timeoutMs)
  if (first.status !== 403 && first.status !== 429) return first

  // 拉首页刷新会话 cookie
  try {
    await fetchOnce(engine.homeUrl, jar, timeoutMs)
  } catch {
    // 首页失败仍用已有 cookie 重试
  }
  if (retryDelayMs > 0) {
    await new Promise(r => setTimeout(r, retryDelayMs))
  }
  return fetchOnce(searchUrl, jar, timeoutMs)
}

/** 测试/编排用：按 id 取引擎定义 */
export function engineById(id: string): EngineDef | null {
  return (ENGINE_DEFS as Record<string, EngineDef>)[id] ?? null
}
