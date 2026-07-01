import type { FeedSourceKind } from './types.js'

export interface ResolveUrlResult {
  resolved_url: string
  kind: FeedSourceKind
}

export function resolveFeedUrl(raw: string): ResolveUrlResult {
  const input = raw.trim()
  if (!input) throw new Error('请输入订阅地址')

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('订阅地址格式无效，请填写完整的 http(s) 链接')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http/https 订阅地址')
  }

  const host = parsed.hostname.toLowerCase()
  const isRsshubHost = host.includes('rsshub')
  return {
    resolved_url: parsed.toString(),
    kind: isRsshubHost ? 'rsshub' : 'rss',
  }
}

export function detectAtomFromXml(xml: string): boolean {
  const head = xml.slice(0, 800).toLowerCase()
  return head.includes('<feed') && (head.includes('xmlns="http://www.w3.org/2005/atom"') || head.includes('<feed '))
}
