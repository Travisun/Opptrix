/**
 * Message outline tooltip preview helpers (pure; safe to unit-test without React).
 * Strip chart fences before truncate so narrow tips never feed ChartBlock / ECharts.
 */

const PREVIEW_MAX_CHARS = 200

/** Fallback when the body is only chart fence(s). */
export const CHART_PREVIEW_PLACEHOLDER = '（含图表）'

/** Closed ```chart``` / ```opptrix-chart``` fences (lang case-insensitive; optional trailing ws). */
const CHART_FENCE_RE = /```(?:chart|opptrix-chart)\s*\r?\n[\s\S]*?```/gi

/** Trailing unclosed chart fence (avoid half JSON after truncate). */
const CHART_FENCE_UNCLOSED_RE = /```(?:chart|opptrix-chart)\s*\r?\n[\s\S]*$/gi

/**
 * Remove chart / opptrix-chart fenced blocks from markdown.
 * If nothing readable remains, returns {@link CHART_PREVIEW_PLACEHOLDER}.
 */
export function stripChartFencesForPreview(content: string): string {
  let out = content.replace(CHART_FENCE_RE, '')
  out = out.replace(CHART_FENCE_UNCLOSED_RE, '')
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  if (!out) return CHART_PREVIEW_PLACEHOLDER
  return out
}

/** Truncate assistant body for compact markdown tooltip (≈160–220 chars). */
export function buildPreviewMarkdown(content: string, maxChars = PREVIEW_MAX_CHARS): string {
  const text = stripChartFencesForPreview(content)
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const breakAt = Math.max(
    slice.lastIndexOf('\n'),
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf(' '),
  )
  const cut = breakAt > maxChars * 0.55 ? slice.slice(0, breakAt) : slice
  return `${cut.trimEnd()}…`
}

/** Plain one-line summary for aria / reduced contexts (no chart JSON). */
export function buildOutlineSummary(content: string, maxChars = 80): string {
  const text = stripChartFencesForPreview(content.trim())
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}…`
}
