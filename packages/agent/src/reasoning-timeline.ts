/**
 * 整轮思考时间线 — 将多轮（工具轮 + 终轮）reasoning 按时间顺序拼接。
 * 分隔符固定，供历史气泡与 live 面板共用同一字段。
 */
export const REASONING_TIMELINE_SEP = '\n\n---\n\n'

/** 追加一段非空 reasoning；空 chunk 原样返回 existing */
export function appendReasoningTimeline(existing: string, chunk: string): string {
  const next = chunk.trim()
  if (!next) return existing
  const prev = existing.trim()
  if (!prev) return next
  return `${prev}${REASONING_TIMELINE_SEP}${next}`
}
