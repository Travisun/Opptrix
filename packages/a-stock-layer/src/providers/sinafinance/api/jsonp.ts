import { fetchText } from './http.js'
import { SINA_REFERER } from './types.js'

/** 解析 `callbackName({...})` 或 `var x=({...})` 形 JSONP */
export function parseSinaJsonp<T>(text: string, callbackName?: string): T {
  const trimmed = text.trim()
  if (trimmed.startsWith('/*<script>')) {
    const start = trimmed.indexOf('(')
    const end = trimmed.lastIndexOf(')')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start + 1, end)) as T
    }
  }
  if (callbackName) {
    const prefix = `${callbackName}(`
    const varPrefix = `${callbackName}=`
    let payload = trimmed
    if (trimmed.startsWith(prefix)) {
      payload = trimmed.slice(prefix.length)
    } else if (trimmed.includes(varPrefix)) {
      const idx = trimmed.indexOf(varPrefix)
      payload = trimmed.slice(idx + varPrefix.length)
    }
    const end = payload.lastIndexOf(')')
    const jsonPart = end > 0 ? payload.slice(0, end) : payload.replace(/;+\s*$/, '')
    return JSON.parse(jsonPart) as T
  }
  const paren = trimmed.indexOf('(')
  const end = trimmed.lastIndexOf(')')
  if (paren >= 0 && end > paren) {
    return JSON.parse(trimmed.slice(paren + 1, end)) as T
  }
  return JSON.parse(trimmed) as T
}

export async function fetchSinaJsonp<T>(
  url: string,
  callbackName?: string,
  referer = SINA_REFERER,
): Promise<T> {
  const text = await fetchText(url, 'utf-8', referer)
  return parseSinaJsonp<T>(text, callbackName)
}
