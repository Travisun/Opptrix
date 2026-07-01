import type { FeedSubscription } from '../../types/schemas'

/** Keep in sync with packages/news-feed/src/subscription-transfer.ts */
export const NEWS_SUBSCRIPTION_EXPORT_SCHEMA_VERSION = 1 as const

export type NewsSubscriptionExportFile = {
  schema_version: typeof NEWS_SUBSCRIPTION_EXPORT_SCHEMA_VERSION
  subscriptions: Array<{ url: string; title: string }>
}

export function buildSubscriptionExportFile(
  subs: FeedSubscription[],
): NewsSubscriptionExportFile {
  return {
    schema_version: NEWS_SUBSCRIPTION_EXPORT_SCHEMA_VERSION,
    subscriptions: subs.map(sub => ({
      url: sub.url,
      title: sub.title?.trim() ?? '',
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSubscriptionExportJson(
  text: string,
): { ok: true; data: NewsSubscriptionExportFile } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: '文件为空' }
  let raw: unknown
  try {
    raw = JSON.parse(trimmed) as unknown
  } catch {
    return { ok: false, error: 'JSON 解析失败，请检查文件内容' }
  }
  if (!isRecord(raw)) {
    return { ok: false, error: '文件格式无效，请使用本应用导出的 JSON' }
  }
  if (raw.schema_version !== NEWS_SUBSCRIPTION_EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `不支持的 schema_version：${String(raw.schema_version)}（当前为 ${NEWS_SUBSCRIPTION_EXPORT_SCHEMA_VERSION}）`,
    }
  }
  if (!Array.isArray(raw.subscriptions)) {
    return { ok: false, error: '缺少 subscriptions 列表' }
  }
  const subscriptions: NewsSubscriptionExportFile['subscriptions'] = []
  for (const entry of raw.subscriptions) {
    if (!isRecord(entry)) continue
    const url = typeof entry.url === 'string' ? entry.url.trim() : ''
    if (!url) continue
    const title = typeof entry.title === 'string'
      ? entry.title.trim()
      : typeof entry.name === 'string'
        ? entry.name.trim()
        : ''
    subscriptions.push({ url, title })
  }
  if (!subscriptions.length) {
    return { ok: false, error: '没有可导入的订阅（需包含有效的 url）' }
  }
  return {
    ok: true,
    data: {
      schema_version: NEWS_SUBSCRIPTION_EXPORT_SCHEMA_VERSION,
      subscriptions,
    },
  }
}

export function downloadSubscriptionExportFile(
  file: NewsSubscriptionExportFile,
  filename = `opptrix-news-subscriptions-v${NEWS_SUBSCRIPTION_EXPORT_SCHEMA_VERSION}.json`,
): void {
  const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
