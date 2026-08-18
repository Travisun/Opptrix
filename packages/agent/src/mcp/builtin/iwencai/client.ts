/**
 * 问财 OpenAPI REST 客户端（本机 MCP 内用）。
 * 与扶摇（fuyao / X-api-key）无关；密钥仅来自 IWENCAI_API_KEY。
 */

import { randomBytes } from 'node:crypto'

export const IWENCAI_BASE_URL = 'https://openapi.iwencai.com'
export const IWENCAI_SKILL_ID = 'opptrix-iwencai'
export const IWENCAI_SKILL_VERSION = '1.0.0'
export const IWENCAI_APP_ID = 'AIME_SKILL'

export type IwencaiSearchChannel = 'news' | 'announcement' | 'report'

export interface Query2DataParams {
  query: string
  page?: number
  limit?: number
  isCache?: boolean
  expandIndex?: boolean
}

export interface ComprehensiveSearchParams {
  query: string
  channels: IwencaiSearchChannel[]
  size?: number
  appId?: string
}

export function generateIwencaiTraceId(): string {
  return randomBytes(32).toString('hex')
}

export function buildIwencaiHeaders(
  apiKey: string,
  opts?: {
    callType?: 'normal' | 'retry'
    skillId?: string
    skillVersion?: string
    traceId?: string
  },
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Claw-Call-Type': opts?.callType ?? 'normal',
    'X-Claw-Skill-Id': opts?.skillId ?? IWENCAI_SKILL_ID,
    'X-Claw-Skill-Version': opts?.skillVersion ?? IWENCAI_SKILL_VERSION,
    'X-Claw-Plugin-Id': 'none',
    'X-Claw-Plugin-Version': 'none',
    'X-Claw-Trace-Id': opts?.traceId ?? generateIwencaiTraceId(),
  }
}

export function buildQuery2DataBody(params: Query2DataParams): Record<string, string> {
  const page = Math.max(1, Math.floor(params.page ?? 1))
  const limit = Math.min(50, Math.max(1, Math.floor(params.limit ?? 10)))
  return {
    query: params.query.trim(),
    page: String(page),
    limit: String(limit),
    is_cache: params.isCache === false ? '0' : '1',
    expand_index: params.expandIndex === false ? 'false' : 'true',
  }
}

export function buildComprehensiveSearchBody(
  params: ComprehensiveSearchParams,
): Record<string, unknown> {
  const size = Math.min(50, Math.max(1, Math.floor(params.size ?? 10)))
  return {
    query: params.query.trim(),
    channels: params.channels,
    app_id: params.appId ?? IWENCAI_APP_ID,
    size,
  }
}

export class IwencaiApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'IwencaiApiError'
  }
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs = 30_000,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await resp.text()
    if (!resp.ok) {
      throw new IwencaiApiError(
        `HTTP ${resp.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
        resp.status,
      )
    }
    if (!text.trim()) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  } catch (e) {
    if (e instanceof IwencaiApiError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new IwencaiApiError(msg)
  } finally {
    clearTimeout(timer)
  }
}

export class IwencaiClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = IWENCAI_BASE_URL,
  ) {}

  static fromEnv(): IwencaiClient | null {
    const key = (process.env.IWENCAI_API_KEY ?? '').trim()
    if (!key) return null
    const base = (process.env.IWENCAI_BASE_URL ?? IWENCAI_BASE_URL).trim() || IWENCAI_BASE_URL
    return new IwencaiClient(key, base)
  }

  private url(path: string): string {
    const base = this.baseUrl.replace(/\/$/, '')
    return `${base}${path.startsWith('/') ? path : `/${path}`}`
  }

  async query2data(params: Query2DataParams): Promise<unknown> {
    const query = params.query.trim()
    if (!query) throw new IwencaiApiError('查询内容不能为空')
    const body = buildQuery2DataBody({ ...params, query })
    const headers = buildIwencaiHeaders(this.apiKey, { skillId: 'hithink-astock-selector' })
    try {
      return await postJson(this.url('/v1/query2data'), body, headers)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new IwencaiApiError(`问财查数失败：${msg}`)
    }
  }

  async comprehensiveSearch(params: ComprehensiveSearchParams): Promise<unknown> {
    const query = params.query.trim()
    if (!query) throw new IwencaiApiError('查询内容不能为空')
    if (!params.channels.length) throw new IwencaiApiError('检索频道不能为空')
    const body = buildComprehensiveSearchBody({ ...params, query })
    const skillId = params.channels[0] === 'news'
      ? 'news-search'
      : params.channels[0] === 'announcement'
        ? 'announcement-search'
        : 'report-search'
    const headers = buildIwencaiHeaders(this.apiKey, { skillId })
    try {
      return await postJson(this.url('/v1/comprehensive/search'), body, headers)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new IwencaiApiError(`问财综搜失败：${msg}`)
    }
  }
}

export function requireIwencaiClient(): IwencaiClient {
  const client = IwencaiClient.fromEnv()
  if (!client) {
    throw new IwencaiApiError('未配置问财数据密钥，请在设置中启用问财并填写密钥')
  }
  return client
}
