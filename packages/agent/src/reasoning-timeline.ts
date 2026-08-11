/**
 * 整轮思考时间线 — 结构化分段 + 派生字符串（兼容旧读）。
 * 分隔符仅用于派生/降级，UI 应以 segments 竖轴渲染，勿只靠解析 `---`。
 */

export const REASONING_TIMELINE_SEP = '\n\n---\n\n'

/** 单段思路（工具轮 / 终轮各一段；流式时末段 content 持续更新） */
export interface ReasoningSegment {
  content: string
  /** ISO 8601；有则 UI 显示时分秒 */
  at?: string
  /** 用户向标签，如「第 2 段思路」；单段 UI 可不展示 */
  label?: string
  round?: number
}

/** 用户可见段标题（禁止 reasoning / token 等技术词） */
export function formatReasoningSegmentLabel(index1Based: number): string {
  return `第 ${index1Based} 段思路`
}

/** 由 segments 派生兼容字符串 */
export function joinReasoningSegments(segments: ReasoningSegment[]): string {
  return segments
    .map(s => s.content.trim())
    .filter(Boolean)
    .join(REASONING_TIMELINE_SEP)
}

/** 追加一段非空 reasoning；空 chunk 原样返回 existing（旧字符串 API） */
export function appendReasoningTimeline(existing: string, chunk: string): string {
  const next = chunk.trim()
  if (!next) return existing
  const prev = existing.trim()
  if (!prev) return next
  return `${prev}${REASONING_TIMELINE_SEP}${next}`
}

function isReasoningSegment(value: unknown): value is ReasoningSegment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  return typeof o.content === 'string'
}

/** 规范化已持久化的 segments；非法项丢弃 */
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

/**
 * 读路径：优先结构化 segments；旧会话仅字符串时按 SEP 降级（可无 label）。
 */
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

/** 追加已完成的一段（非流式）；空 chunk 不追加 */
export function appendReasoningSegment(
  segments: ReasoningSegment[],
  chunk: string,
  meta?: { at?: string; round?: number },
): ReasoningSegment[] {
  const next = chunk.trim()
  if (!next) return segments
  const index = segments.length + 1
  const seg: ReasoningSegment = {
    content: next,
    label: formatReasoningSegmentLabel(index),
  }
  if (meta?.at) seg.at = meta.at
  if (meta?.round != null) seg.round = meta.round
  return [...segments, seg]
}

/** 开启新的流式末段（content 可先空，随后 updateLast） */
export function beginReasoningSegment(
  segments: ReasoningSegment[],
  meta?: { at?: string; round?: number },
): ReasoningSegment[] {
  const index = segments.length + 1
  const seg: ReasoningSegment = {
    content: '',
    label: formatReasoningSegmentLabel(index),
  }
  if (meta?.at) seg.at = meta.at
  if (meta?.round != null) seg.round = meta.round
  return [...segments, seg]
}

/** 流式更新末段 content；无末段时先 begin */
export function updateLastReasoningSegmentContent(
  segments: ReasoningSegment[],
  content: string,
  meta?: { at?: string; round?: number },
): ReasoningSegment[] {
  if (segments.length === 0) {
    return beginReasoningSegment(segments, meta).map((s, i, arr) =>
      i === arr.length - 1 ? { ...s, content } : s,
    )
  }
  const copy = segments.slice()
  const last = copy[copy.length - 1]
  if (!last) return updateLastReasoningSegmentContent([], content, meta)
  copy[copy.length - 1] = {
    ...last,
    content,
    ...(meta?.at && !last.at ? { at: meta.at } : {}),
    ...(meta?.round != null && last.round == null ? { round: meta.round } : {}),
  }
  return copy
}
