import { httpGet } from '../../../utils/http.js'
import { eastmoneyThrottle } from './rate-limit.js'

/** Same Referer shape as eastmoney web pages — User-Agent stays the shared default. */
export const EASTMONEY_QUOTE_HEADERS = {
  Referer: 'https://quote.eastmoney.com/',
}

export const EMWEB_HEADERS = {
  Referer: 'https://emweb.securities.eastmoney.com/',
}

export const SEC_HEADERS = {
  Referer: 'https://data.eastmoney.com/',
}

export class EastmoneyBrowseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EastmoneyBrowseError'
  }
}

export async function eastmoneyGet(
  url: string,
  params: Record<string, string> = {},
  timeoutMs = 15000,
  extraHeaders: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  return eastmoneyThrottle(async () => {
    try {
      return await httpGet(url, params, timeoutMs, extraHeaders)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new EastmoneyBrowseError(
        msg.includes('HTTP')
          ? `暂时无法访问东方财富（${msg}），请稍后在浏览器打开查看`
          : msg,
      )
    }
  })
}

export async function testEastmoneyConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const json = await eastmoneyGet(
      'https://push2.eastmoney.com/api/qt/stock/get',
      { secid: '1.600519', fields: 'f58', fltt: '2', invt: '2' },
      15000,
      EASTMONEY_QUOTE_HEADERS,
    )
    const name = String((json?.data as Record<string, unknown> | undefined)?.f58 ?? '').trim()
    if (name) return { ok: true, message: `东方财富可访问 · ${name}` }
    return { ok: false, message: '东方财富返回空数据，请稍后再试' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
