export function parseTopicTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const tags: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const name = item.trim()
      if (name) tags.push(name)
      continue
    }
    if (isRecord(item) && typeof item.name === 'string') {
      const name = item.name.trim()
      if (name) tags.push(name)
    }
  }
  return tags
}

export function resolveTopicDisplayTitle(title: string, unicodeTitle?: string): string {
  const normalized = unicodeTitle?.trim()
  if (normalized) return normalized
  return title.trim()
}

/** Discourse 自动生成的板块说明 / 管理帖，不在产品列表展示 */
export function isCommunityMetaTopic(title: string): boolean {
  const trimmed = title.trim()
  if (/^关于[「"].+[」"]$/.test(trimmed)) return true
  if (/^About the .+ category$/i.test(trimmed)) return true
  if (trimmed === 'Admin Guide: Getting Started' || trimmed === 'Guidelines') return true
  return false
}

export function isTopicVisibleInFeed(raw: Record<string, unknown>): boolean {
  if (raw.visible === false) return false
  if (raw.archived === true) return false
  return true
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
