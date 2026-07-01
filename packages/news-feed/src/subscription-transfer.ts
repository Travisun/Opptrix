/** Export / import payload for RSS subscriptions (no group metadata). */
export const SUBSCRIPTION_EXPORT_SCHEMA_VERSION = 1 as const

export type SubscriptionExportItem = {
  url: string
  title: string
}

export type SubscriptionExportFile = {
  schema_version: typeof SUBSCRIPTION_EXPORT_SCHEMA_VERSION
  subscriptions: SubscriptionExportItem[]
}

export type SubscriptionImportResult = {
  added: number
  skipped: number
  errors: Array<{ url: string; error: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readExportItem(raw: unknown): SubscriptionExportItem | null {
  if (!isRecord(raw)) return null
  const url = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (!url) return null
  const title = typeof raw.title === 'string'
    ? raw.title.trim()
    : typeof raw.name === 'string'
      ? raw.name.trim()
      : ''
  return { url, title }
}

export function buildSubscriptionExportFile(
  items: Array<{ url: string; title: string }>,
): SubscriptionExportFile {
  return {
    schema_version: SUBSCRIPTION_EXPORT_SCHEMA_VERSION,
    subscriptions: items.map(item => ({
      url: item.url.trim(),
      title: item.title.trim(),
    })),
  }
}

export function parseSubscriptionExportPayload(
  raw: unknown,
): { ok: true; data: SubscriptionExportFile } | { ok: false; error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: '文件格式无效，请使用本应用导出的 JSON' }
  }

  const version = raw.schema_version
  if (version !== SUBSCRIPTION_EXPORT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `不支持的 schema_version：${String(version)}（当前为 ${SUBSCRIPTION_EXPORT_SCHEMA_VERSION}）`,
    }
  }

  if (!Array.isArray(raw.subscriptions)) {
    return { ok: false, error: '缺少 subscriptions 列表' }
  }

  const subscriptions: SubscriptionExportItem[] = []
  for (const entry of raw.subscriptions) {
    const item = readExportItem(entry)
    if (item) subscriptions.push(item)
  }

  if (!subscriptions.length) {
    return { ok: false, error: '没有可导入的订阅（需包含有效的 url）' }
  }

  return {
    ok: true,
    data: {
      schema_version: SUBSCRIPTION_EXPORT_SCHEMA_VERSION,
      subscriptions,
    },
  }
}

export function parseSubscriptionExportJson(
  text: string,
): { ok: true; data: SubscriptionExportFile } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, error: '文件为空' }
  try {
    return parseSubscriptionExportPayload(JSON.parse(trimmed) as unknown)
  } catch {
    return { ok: false, error: 'JSON 解析失败，请检查文件内容' }
  }
}
