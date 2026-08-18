/**
 * 编排：选引擎、分批、限流、聚合去重。
 */

import {
  buildSearchUrl,
  resolveRegion,
  selectEngines,
  type EngineDef,
  type SearchRegion,
  type TimeWindow,
} from './engines.js'
import { parseEngineHtml, type SearchHit } from './parse.js'
import {
  fetchSearchHtml,
  MemoryCookieJar,
  isWebsearchFetchInjected,
} from './session-fetch.js'

export const WEBSEARCH_QUERY_MAX_LEN = 400

export interface WebSearchParams {
  query: string
  region?: SearchRegion
  site?: string
  time?: TimeWindow
  limit?: number
}

/** 每次工具返回必须带上；引用结果时须向用户声明。 */
export const WEBSEARCH_DISCLAIMER =
  '公开网页检索，内容可能不真实或过期，不能作为行情、公告或研报依据。'

export interface WebSearchResult {
  query: string
  region: 'cn' | 'global'
  enginesTried: string[]
  enginesOk: string[]
  hits: SearchHit[]
  note?: string
  disclaimer: string
}

function withDisclaimer(base: Omit<WebSearchResult, 'disclaimer'>): WebSearchResult {
  return { ...base, disclaimer: WEBSEARCH_DISCLAIMER }
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    let path = u.pathname
    if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1)
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`
  } catch {
    return url.trim().toLowerCase()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** 测试注入 fetch 时跳过引擎间等待 */
function shouldSkipRateLimit(): boolean {
  return isWebsearchFetchInjected()
}

async function runOneEngine(
  engine: EngineDef,
  params: WebSearchParams,
  jar: MemoryCookieJar,
): Promise<{ engineId: string; hits: SearchHit[]; ok: boolean }> {
  const url = buildSearchUrl(engine, params.query, {
    site: params.site,
    time: params.time,
  })
  try {
    const { status, html } = await fetchSearchHtml(engine, url, jar, {
      retryDelayMs: shouldSkipRateLimit() ? 0 : 2000,
    })
    if (status >= 400) {
      return { engineId: engine.id, hits: [], ok: false }
    }
    const hits = parseEngineHtml(engine.id, html)
    return { engineId: engine.id, hits, ok: hits.length > 0 }
  } catch {
    return { engineId: engine.id, hits: [], ok: false }
  }
}

/**
 * 多引擎网页检索（结构化 hits，不返回 raw HTML）。
 */
export async function runWebSearch(params: WebSearchParams): Promise<WebSearchResult> {
  const raw = (params.query ?? '').trim()
  if (!raw) {
    return withDisclaimer({
      query: '',
      region: 'global',
      enginesTried: [],
      enginesOk: [],
      hits: [],
      note: '查询内容不能为空',
    })
  }
  if (raw.length > WEBSEARCH_QUERY_MAX_LEN) {
    return withDisclaimer({
      query: raw.slice(0, 40) + '…',
      region: 'global',
      enginesTried: [],
      enginesOk: [],
      hits: [],
      note: `查询过长（上限 ${WEBSEARCH_QUERY_MAX_LEN} 字），请缩短后重试`,
    })
  }

  const region = resolveRegion(params.region, raw)
  const limit = Math.min(20, Math.max(1, Math.floor(params.limit ?? 8)))
  const engines = selectEngines(region, 4)
  const jar = new MemoryCookieJar()
  const enginesTried: string[] = []
  const enginesOk: string[] = []
  const merged: SearchHit[] = []
  const seen = new Set<string>()

  const batchSize = 4
  for (let i = 0; i < engines.length; i += batchSize) {
    const batch = engines.slice(i, i + batchSize)
    for (let j = 0; j < batch.length; j++) {
      const engine = batch[j]
      if (!engine) continue
      if (j > 0 && !shouldSkipRateLimit()) {
        await delay(1000 + Math.floor(Math.random() * 1000))
      }
      enginesTried.push(engine.id)
      const result = await runOneEngine(
        engine,
        { ...params, query: raw },
        jar,
      )
      if (result.ok) enginesOk.push(result.engineId)
      for (const hit of result.hits) {
        const key = normalizeUrlKey(hit.url)
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(hit)
        if (merged.length >= limit) break
      }
      if (merged.length >= limit) break
    }
    if (merged.length >= limit) break
    if (i + batchSize < engines.length && !shouldSkipRateLimit()) {
      await delay(1000)
    }
  }

  jar.clear()

  const hits = merged.slice(0, limit)
  let note: string | undefined
  if (hits.length === 0) {
    note =
      '部分检索引擎暂时不可用或未返回结果。可换更具体的关键词、调整 region（cn/global），或加上 site: 限定站点后再试。无需配置数据密钥。'
  } else if (enginesOk.length < enginesTried.length) {
    note = '部分引擎未返回结果，已聚合可用来源；结果不足时可换关键词或 region。'
  }

  return withDisclaimer({
    query: raw,
    region,
    enginesTried,
    enginesOk,
    hits,
    note,
  })
}
