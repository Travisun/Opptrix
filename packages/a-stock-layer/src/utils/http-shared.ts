/**
 * HTTP 共享常量和工具函数
 *
 * 被 http.ts 和 http-client.ts 共同导入，打破循环依赖。
 */

export const HTTP_DEFAULT_HEADERS = {
  'User-Agent': (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ),
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function sdkKeyHeaders(token: string): Record<string, string> {
  const key = token.trim()
  return key ? { 'sdk-key': key } : {}
}
