import { fetchText } from './http.js'

/**
 * 解析腾讯 JSONP 响应（`callbackName={...}`）为 JSON 对象。
 */
export function parseTencentJsonp<T>(text: string, callbackName: string): T {
  const trimmed = text.trim()
  const prefix = `${callbackName}=`
  const jsonPart = trimmed.startsWith(prefix)
    ? trimmed.slice(prefix.length)
    : trimmed
  const end = jsonPart.lastIndexOf(';')
  const payload = end > 0 ? jsonPart.slice(0, end) : jsonPart
  return JSON.parse(payload) as T
}

export async function fetchTencentJsonp<T>(
  url: string,
  callbackName: string,
): Promise<T> {
  const text = await fetchText(url, 'utf-8')
  return parseTencentJsonp<T>(text, callbackName)
}
