import { ProviderHttpClient } from '../../common/http-client.js'
import { HTTP_DEFAULT_HEADERS } from '../../../utils/http-shared.js'
import { FREE_PROVIDER_EMPTY_BODY_REASON, isEmptyHttpResponseBody } from '@opptrix/shared'
import { EM_REFERER } from './types.js'

const runtimeUa = process.env.OPPTRIX_HTTP_USER_AGENT?.trim()

const defaultHeaders: Record<string, string> = {
  ...HTTP_DEFAULT_HEADERS,
  Referer: EM_REFERER,
  Accept: 'application/json, text/plain, */*',
  ...(runtimeUa ? { 'User-Agent': runtimeUa } : {}),
}

/** 东方财富数据中心 / push2 统一 HTTP 出口 */
export const eastmoneyHttp = new ProviderHttpClient({
  providerId: 'eastmoney',
  timeoutMs: 12_000,
  maxRetries: 1,
  bypassRateLimit: true,
  defaultHeaders,
})

export class EastmoneyHttpError extends Error {
  readonly status: number
  constructor(status: number, detail?: string) {
    super(detail ? `EastMoney HTTP ${status}: ${detail}` : `EastMoney HTTP ${status}`)
    this.name = 'EastmoneyHttpError'
    this.status = status
  }
}

export async function fetchEmJson<T>(url: string, referer: string = EM_REFERER): Promise<T> {
  const raw = await eastmoneyHttp.getText(url, { extraHeaders: { Referer: referer } })
  if (isEmptyHttpResponseBody(raw)) {
    throw new EastmoneyHttpError(0, FREE_PROVIDER_EMPTY_BODY_REASON)
  }
  const text = stripJsonp(raw)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new EastmoneyHttpError(0, `invalid JSON: ${text.slice(0, 80)}`)
  }
}

function stripJsonp(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('{') || t.startsWith('[')) return t
  const i = t.indexOf('(')
  const j = t.lastIndexOf(')')
  if (i >= 0 && j > i) return t.slice(i + 1, j)
  return t
}
