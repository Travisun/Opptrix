/**
 * 东方财富 HTTP 客户端 — 封装东财 push2/datacenter API 的请求与限流。
 *
 * 用途：所有东方财富数据接口的底层 HTTP 通信。
 * 特性：
 *   - 自动限流（eastmoneyThrottle，2 秒最小间隔，模拟浏览器合规访问）
 *   - 统一 User-Agent / Referer 头
 *   - 统一错误包装为 EastmoneyBrowseError
 * 数据源：https://push2.eastmoney.com/、https://datacenter.eastmoney.com/
 */

import { httpGet } from '../../../utils/http.js'
import { eastmoneyThrottle } from './rate-limit.js'

/** 行情接口专用 Referer — 匹配东财网页端请求头 */
export const EASTMONEY_QUOTE_HEADERS = {
  Referer: 'https://quote.eastmoney.com/',
}

/** F10 公司资料接口专用 Referer */
export const EMWEB_HEADERS = {
  Referer: 'https://emweb.securities.eastmoney.com/',
}

/** 数据中心接口专用 Referer */
export const SEC_HEADERS = {
  Referer: 'https://data.eastmoney.com/',
}

/**
 * 东方财富 HTTP 请求异常 — 包装 fetch 错误为用户友好提示。
 *
 * 用途：统一错误处理，提示用户"请稍后在浏览器打开查看"。
 */
export class EastmoneyBrowseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EastmoneyBrowseError'
  }
}

/**
 * 东方财富 GET 请求 — 带自动限流（2s 间隔）和错误包装。
 *
 * 用途：所有东财 push2/datacenter API 调用的统一入口。
 * 限流：通过 eastmoneyThrottle 串行化，最多每 2 秒一次请求。
 *
 * @param url            东财 API 地址
 * @param params         URL 查询参数（自动序列化）
 * @param timeoutMs      超时时间（毫秒），默认 15000
 * @param extraHeaders   额外请求头（如 Referer）
 * @returns 响应 JSON 对象
 * @throws EastmoneyBrowseError 请求失败时抛出
 */
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

/**
 * 测试东方财富连接 — 尝试获取贵州茅台（600519）的股票名称。
 *
 * 用途：Provider 连接测试按钮的后端实现。
 * 数据源：push2.eastmoney.com/api/qt/stock/get（secid=1.600519）
 *
 * @returns { ok: true, message: "东方财富可访问 · 贵州茅台" } 或 { ok: false, message: 错误原因 }
 */
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
