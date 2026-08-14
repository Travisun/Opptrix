import type { PreflightDiagnostic, PreflightLevel } from './types.js'

export const MAX_DIAGNOSTICS = 80
export const MAX_DIAGNOSTICS_CHARS = 12_000
export const MAX_DIAGNOSTIC_MESSAGE = 400

/** 单条截断：保留换行语义，禁止把多行压成一行 */
export function clipMessage(text: string, max = MAX_DIAGNOSTIC_MESSAGE): string {
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/** 擦除常见绝对路径，避免进 diagnostics / 用户向文案 */
export function redactAbsPathsInText(text: string): string {
  return text
    .replace(/(?:^|[\s"'`=(])(\/(?:Users|home|tmp|var|opt|usr)\/[^\s"'`)\]]+)/g, (full, hit: string) => {
      const prefix = full.slice(0, full.length - hit.length)
      return `${prefix}${pathTailHint(hit)}`
    })
    .replace(/([A-Za-z]:\\(?:Users|Windows|Program Files)[^\s"'`)\]]*)/gi, (_m, hit: string) => pathTailHint(hit))
    .replace(/(\\\\[^\s"'`)\]]+)/g, (_m, hit: string) => pathTailHint(hit))
}

function pathTailHint(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean)
  const tail = parts[parts.length - 1] ?? ''
  return tail ? `…/${tail}` : '<绝对路径>'
}

export function pushDiagnostic(
  diagnostics: PreflightDiagnostic[],
  item: PreflightDiagnostic,
): void {
  diagnostics.push({
    ...item,
    message: clipMessage(redactAbsPathsInText(item.message)),
  })
}

export function finalizeDiagnostics(raw: PreflightDiagnostic[]): PreflightDiagnostic[] {
  let chars = 0
  const out: PreflightDiagnostic[] = []
  let truncated = false
  for (const d of raw) {
    const msg = clipMessage(d.message)
    const cost = msg.length + (d.code?.length ?? 0) + 24
    if (out.length >= MAX_DIAGNOSTICS || chars + cost > MAX_DIAGNOSTICS_CHARS) {
      truncated = true
      break
    }
    out.push({ ...d, message: msg })
    chars += cost
  }
  if (truncated) {
    out.push({
      id: 'diagnostics_truncated',
      level: 'l0',
      severity: 'warning',
      message: '已截断其余诊断项（单次最多约 80 条 / 12k 字符）',
    })
  }
  return out
}

/** 派生 errors/warnings 文案：有行号时前缀 L{line}:（有列则 L{line}:C{col}:） */
export function formatDiagnosticSummaryLine(d: PreflightDiagnostic): string {
  const hasLine = typeof d.line === 'number' && Number.isFinite(d.line) && d.line >= 1
  const hasCol = typeof d.column === 'number' && Number.isFinite(d.column) && d.column >= 1
  if (hasLine && hasCol) return `L${d.line}:C${d.column}: ${d.message}`
  if (hasLine) return `L${d.line}: ${d.message}`
  return d.message
}

export function summarizeDiagnostics(diagnostics: PreflightDiagnostic[]): {
  ok: boolean
  errors: string[]
  warnings: string[]
} {
  const errors = diagnostics
    .filter(d => d.severity === 'error')
    .map(formatDiagnosticSummaryLine)
  const warnings = diagnostics
    .filter(d => d.severity === 'warning')
    .map(formatDiagnosticSummaryLine)
  return { ok: errors.length === 0, errors, warnings }
}

/** ruff check 文本输出 → 多条 diagnostic */
export function parseRuffOutput(output: string, level: PreflightLevel = 'l1'): PreflightDiagnostic[] {
  const lines = output.replace(/\r\n/g, '\n').split('\n')
  const out: PreflightDiagnostic[] = []
  // path:line:col: CODE message  |  path:line: CODE message
  const re = /^(?:.*?[/\\])?([^:\s][^:]*):(\d+)(?::(\d+))?:\s*([A-Z]\d{2,4})\s+(.+)$/
  for (const line of lines) {
    const t = line.trim()
    if (!t || /^Found \d+/i.test(t) || /^\[\*\]/i.test(t)) continue
    const m = re.exec(t)
    if (m) {
      out.push({
        id: 'l1_ruff',
        level,
        severity: 'error',
        line: Number(m[2]),
        column: m[3] ? Number(m[3]) : undefined,
        code: m[4],
        message: clipMessage(`${m[4]}: ${m[5]}`.trim()),
      })
      continue
    }
    // 宽松：含 :line: 的行
    const loose = /:(\d+)(?::(\d+))?:\s*(.+)$/.exec(t)
    if (loose && !/^(error|warning):/i.test(t)) {
      out.push({
        id: 'l1_ruff',
        level,
        severity: 'error',
        line: Number(loose[1]),
        column: loose[2] ? Number(loose[2]) : undefined,
        message: clipMessage(redactAbsPathsInText(loose[3].trim())),
      })
    }
  }
  if (!out.length && output.trim()) {
    out.push({
      id: 'l1_ruff',
      level,
      severity: 'error',
      message: clipMessage(redactAbsPathsInText(output.trim())),
    })
  }
  return out
}

/** biome check 文本输出 → 多条 diagnostic */
export function parseBiomeOutput(output: string, level: PreflightLevel = 'l1'): PreflightDiagnostic[] {
  const text = output.replace(/\r\n/g, '\n')
  const out: PreflightDiagnostic[] = []
  // file:line:col lint/rule  or  file:line:col parse ━━━
  const headerRe =
    /(?:^|\n)(?:.*?[/\\])?([^:\s][^:\n]*):(\d+):(\d+)\s+([\w./-]+)\s*(?:FIXABLE\s*)?[━\-·.]*/g
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    const line = Number(m[2])
    const column = Number(m[3])
    const code = m[4]
    const after = text.slice(m.index + m[0].length)
    const nextHeader = after.search(/\n(?:.*?[/\\])?[^:\s][^:\n]*:\d+:\d+\s+/)
    const block = (nextHeader >= 0 ? after.slice(0, nextHeader) : after).trim()
    const detailLine = block
      .split('\n')
      .map(s => s.trim())
      .find(s => s.length > 0 && !s.startsWith('┌') && !s.startsWith('│') && !s.startsWith('└'))
    const detail = detailLine
      ? detailLine.replace(/^[×x!i]\s*/i, '').trim()
      : code
    out.push({
      id: 'l1_biome',
      level,
      severity: 'error',
      line,
      column,
      code,
      message: clipMessage(`${code}: ${detail}`),
    })
  }
  if (!out.length && text.trim()) {
    // 回退：按含 path:line:col 的行拆
    for (const line of text.split('\n')) {
      const lm = /:(\d+):(\d+)\s+(.+)$/.exec(line.trim())
      if (lm) {
        out.push({
          id: 'l1_biome',
          level,
          severity: 'error',
          line: Number(lm[1]),
          column: Number(lm[2]),
          message: clipMessage(redactAbsPathsInText(lm[3].trim())),
        })
      }
    }
  }
  if (!out.length && text.trim()) {
    out.push({
      id: 'l1_biome',
      level,
      severity: 'error',
      message: clipMessage(redactAbsPathsInText(text.trim())),
    })
  }
  return out
}

/** py_compile / SyntaxError 尽量解析 File/line（语言通常仅首条） */
export function parsePythonSyntaxDiagnostic(stderr: string): PreflightDiagnostic {
  const text = stderr.replace(/\r\n/g, '\n')
  let line: number | undefined
  let column: number | undefined
  const fileLine = /File\s+"[^"]+",\s+line\s+(\d+)/i.exec(text)
  if (fileLine) line = Number(fileLine[1])
  const winLine = /,\s*line\s+(\d+)/i.exec(text)
  if (!line && winLine) line = Number(winLine[1])
  const caretCol = /\n(\s*)\^/.exec(text)
  if (caretCol) column = caretCol[1].length + 1
  const errLine =
    /(?:SyntaxError|IndentationError|TabError):\s*(.+)$/m.exec(text)?.[1]?.trim()
    ?? text.trim().split('\n').filter(Boolean).slice(-1)[0]
    ?? '语法错误'
  return {
    id: 'l0_python_syntax',
    level: 'l0',
    severity: 'error',
    line,
    column,
    message: clipMessage(redactAbsPathsInText(`Python 语法错误：${errLine}`)),
  }
}

/** node --check 尽量解析 :line 或 :line:col */
export function parseNodeSyntaxDiagnostic(stderr: string): PreflightDiagnostic {
  const text = stderr.replace(/\r\n/g, '\n')
  let line: number | undefined
  let column: number | undefined
  // path:line  or path:line:col
  const loc = /(?:^|\n)(?:.*?[/\\])?[^:\s][^:\n]*:(\d+)(?::(\d+))?/m.exec(text)
  if (loc) {
    line = Number(loc[1])
    if (loc[2]) column = Number(loc[2])
  }
  const errLine =
    /(?:SyntaxError|TypeError):\s*(.+)$/m.exec(text)?.[1]?.trim()
    ?? text.trim().split('\n').filter(Boolean).slice(-1)[0]
    ?? '语法错误'
  return {
    id: 'l0_js_syntax',
    level: 'l0',
    severity: 'error',
    line,
    column,
    message: clipMessage(redactAbsPathsInText(`语法错误：${errLine}`)),
  }
}
