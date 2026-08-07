/**
 * Markdown ```chart``` / ```opptrix-chart``` 围栏 JSON 校验（纯函数，可单测）。
 * 仅接受安全可解析 JSON，拒绝任意代码与危险色值。
 */

export type ChartFenceType = 'bar' | 'line' | 'pie' | 'heatmap'

export type ChartFenceDatum = {
  label: string
  value: number
  color?: string
  row?: string
  col?: string
}

export type ChartFenceSpec = {
  type: ChartFenceType
  title?: string
  caption?: string
  data: ChartFenceDatum[]
  height: number
  showLegend?: boolean
  showValues?: boolean
  showAxis?: boolean
  showGrid?: boolean
  showTooltip?: boolean
}

export type ChartFenceParseOk = { ok: true; spec: ChartFenceSpec }
export type ChartFenceParseErr = { ok: false; reason: string }
export type ChartFenceParseResult = ChartFenceParseOk | ChartFenceParseErr

const CHART_TYPES = new Set<ChartFenceType>(['bar', 'line', 'pie', 'heatmap'])

const MAX_DATA = 40
const MAX_LABEL = 80
const MAX_TITLE = 200
const HEIGHT_MIN = 80
const HEIGHT_MAX = 320
const HEIGHT_DEFAULT = 160

/** 允许 #RGB / #RRGGBB / rgba(...)；拒绝 url() / expression / 其它注入。 */
const SAFE_COLOR_RE =
  /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function asOptionalString(v: unknown, field: string, max: number): string | ChartFenceParseErr {
  if (v === undefined) return ''
  if (typeof v !== 'string') return { ok: false, reason: `${field} 须为文本` }
  const t = v.trim()
  if (t.length > max) return { ok: false, reason: `${field} 过长` }
  return t
}

function asOptionalBoolean(
  v: unknown,
  field: string,
): { ok: true; value: boolean | undefined } | ChartFenceParseErr {
  if (v === undefined) return { ok: true, value: undefined }
  if (typeof v !== 'boolean') return { ok: false, reason: `${field} 须为布尔值` }
  return { ok: true, value: v }
}

function validateColor(color: string): ChartFenceParseErr | null {
  const c = color.trim()
  if (!c) return { ok: false, reason: '颜色无效' }
  const lower = c.toLowerCase()
  if (lower.includes('url(') || lower.includes('expression') || lower.includes('javascript:')) {
    return { ok: false, reason: '颜色格式不支持' }
  }
  if (!SAFE_COLOR_RE.test(c)) return { ok: false, reason: '颜色格式不支持' }
  return null
}

function parseDatum(raw: unknown, index: number): ChartFenceDatum | ChartFenceParseErr {
  if (!isRecord(raw)) return { ok: false, reason: `第 ${index + 1} 项数据无效` }

  const labelRaw = raw.label
  if (typeof labelRaw !== 'string' || !labelRaw.trim()) {
    return { ok: false, reason: `第 ${index + 1} 项缺少 label` }
  }
  const label = labelRaw.trim()
  if (label.length > MAX_LABEL) {
    return { ok: false, reason: `第 ${index + 1} 项 label 过长` }
  }

  const value = raw.value
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, reason: `第 ${index + 1} 项 value 须为有限数字` }
  }

  const datum: ChartFenceDatum = { label, value }

  if (raw.color !== undefined) {
    if (typeof raw.color !== 'string') {
      return { ok: false, reason: `第 ${index + 1} 项 color 须为文本` }
    }
    const colorErr = validateColor(raw.color)
    if (colorErr) return colorErr
    datum.color = raw.color.trim()
  }

  if (raw.row !== undefined) {
    if (typeof raw.row !== 'string') {
      return { ok: false, reason: `第 ${index + 1} 项 row 须为文本` }
    }
    const row = raw.row.trim()
    if (row.length > MAX_LABEL) {
      return { ok: false, reason: `第 ${index + 1} 项 row 过长` }
    }
    datum.row = row
  }

  if (raw.col !== undefined) {
    if (typeof raw.col !== 'string') {
      return { ok: false, reason: `第 ${index + 1} 项 col 须为文本` }
    }
    const col = raw.col.trim()
    if (col.length > MAX_LABEL) {
      return { ok: false, reason: `第 ${index + 1} 项 col 过长` }
    }
    datum.col = col
  }

  return datum
}

/**
 * 解析并校验图表围栏 JSON。
 * 失败时返回简短 reason（面向用户提示，不含堆栈）。
 */
export function parseChartFence(code: string): ChartFenceParseResult {
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, reason: '内容为空' }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return { ok: false, reason: 'JSON 无效' }
  }

  if (!isRecord(parsed)) return { ok: false, reason: '须为 JSON 对象' }

  let type: ChartFenceType = 'bar'
  if (parsed.type !== undefined) {
    if (typeof parsed.type !== 'string' || !CHART_TYPES.has(parsed.type as ChartFenceType)) {
      return { ok: false, reason: '图表类型不支持' }
    }
    type = parsed.type as ChartFenceType
  }

  const titleRes = asOptionalString(parsed.title, 'title', MAX_TITLE)
  if (typeof titleRes !== 'string') return titleRes
  const captionRes = asOptionalString(parsed.caption, 'caption', MAX_TITLE)
  if (typeof captionRes !== 'string') return captionRes

  if (!Array.isArray(parsed.data)) return { ok: false, reason: '缺少 data' }
  if (parsed.data.length < 1 || parsed.data.length > MAX_DATA) {
    return { ok: false, reason: `data 须为 1–${MAX_DATA} 项` }
  }

  const data: ChartFenceDatum[] = []
  for (let i = 0; i < parsed.data.length; i++) {
    const d = parseDatum(parsed.data[i], i)
    if ('ok' in d && d.ok === false) return d
    data.push(d as ChartFenceDatum)
  }

  let height = HEIGHT_DEFAULT
  if (parsed.height !== undefined) {
    if (typeof parsed.height !== 'number' || !Number.isFinite(parsed.height)) {
      return { ok: false, reason: 'height 须为数字' }
    }
    const h = Math.round(parsed.height)
    if (h < HEIGHT_MIN || h > HEIGHT_MAX) {
      return { ok: false, reason: `height 须在 ${HEIGHT_MIN}–${HEIGHT_MAX}` }
    }
    height = h
  }

  const showLegendRes = asOptionalBoolean(parsed.showLegend, 'showLegend')
  if (!showLegendRes.ok) return showLegendRes
  const showValuesRes = asOptionalBoolean(parsed.showValues, 'showValues')
  if (!showValuesRes.ok) return showValuesRes
  const showAxisRes = asOptionalBoolean(parsed.showAxis, 'showAxis')
  if (!showAxisRes.ok) return showAxisRes
  const showGridRes = asOptionalBoolean(parsed.showGrid, 'showGrid')
  if (!showGridRes.ok) return showGridRes
  const showTooltipRes = asOptionalBoolean(parsed.showTooltip, 'showTooltip')
  if (!showTooltipRes.ok) return showTooltipRes

  const spec: ChartFenceSpec = {
    type,
    data,
    height,
  }
  if (titleRes) spec.title = titleRes
  if (captionRes) spec.caption = captionRes
  if (showLegendRes.value !== undefined) spec.showLegend = showLegendRes.value
  if (showValuesRes.value !== undefined) spec.showValues = showValuesRes.value
  if (showAxisRes.value !== undefined) spec.showAxis = showAxisRes.value
  if (showGridRes.value !== undefined) spec.showGrid = showGridRes.value
  if (showTooltipRes.value !== undefined) spec.showTooltip = showTooltipRes.value

  return { ok: true, spec }
}
