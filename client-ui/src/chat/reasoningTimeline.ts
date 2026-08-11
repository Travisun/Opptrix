/**
 * 思考时间线（client 侧）— 与 packages/agent reasoning-timeline 契约对齐。
 * 读路径优先 segments；旧字符串按 SEP 降级。
 */

export const REASONING_TIMELINE_SEP = '\n\n---\n\n'

export interface ReasoningSegment {
  content: string
  at?: string
  label?: string
  round?: number
}

export function formatReasoningSegmentLabel(index1Based: number): string {
  return `第 ${index1Based} 段思路`
}

export function joinReasoningSegments(segments: ReasoningSegment[]): string {
  return segments
    .map(s => s.content.trim())
    .filter(Boolean)
    .join(REASONING_TIMELINE_SEP)
}

function isReasoningSegment(value: unknown): value is ReasoningSegment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  return typeof o.content === 'string'
}

export function normalizeReasoningSegments(
  raw: unknown,
): ReasoningSegment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: ReasoningSegment[] = []
  for (const item of raw) {
    if (!isReasoningSegment(item)) continue
    const content = item.content.trim()
    if (!content) continue
    const seg: ReasoningSegment = { content }
    if (typeof item.at === 'string' && item.at.trim()) seg.at = item.at
    if (typeof item.label === 'string' && item.label.trim()) seg.label = item.label
    if (typeof item.round === 'number' && Number.isFinite(item.round)) {
      seg.round = Math.floor(item.round)
    }
    out.push(seg)
  }
  return out.length ? out : undefined
}

/** 优先结构化 segments；旧会话仅字符串时 split(SEP)，可无 label */
export function resolveReasoningSegments(
  segments?: ReasoningSegment[] | null,
  content?: string | null,
): ReasoningSegment[] {
  const normalized = normalizeReasoningSegments(segments)
  if (normalized?.length) return normalized
  const raw = content?.trim()
  if (!raw) return []
  return raw
    .split(REASONING_TIMELINE_SEP)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => ({ content: part }))
}
