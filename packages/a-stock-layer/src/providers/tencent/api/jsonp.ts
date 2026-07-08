import { fetchText } from './http.js'

/**
 * 解析腾讯 JSONP 响应（`callbackName={...}`）为 JSON 对象。
 */
export function parseTencentJsonp<T>(text: string, callbackName: string): T {
  const trimmed = text.trim()
  const prefix = `${callbackName}=`
  let jsonPart = trimmed.startsWith(prefix)
    ? trimmed.slice(prefix.length)
    : trimmed
  // 仅去掉 JSONP 末尾分号；勿用 lastIndexOf(';')，K 线除权等字段字符串内可能含 ';'
  if (jsonPart.endsWith(';')) {
    jsonPart = jsonPart.slice(0, -1).trimEnd()
  }
  return JSON.parse(jsonPart) as T
}

export async function fetchTencentJsonp<T>(
  url: string,
  callbackName: string,
): Promise<T> {
  const text = await fetchText(url, 'utf-8')
  return parseTencentJsonp<T>(text, callbackName)
}
