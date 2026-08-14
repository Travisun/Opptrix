/** 按 1-based 闭区间行号批量替换（纯逻辑，可单测） */

export const MAX_LINE_EDITS = 40
export const MAX_NUMBERED_SNIPPETS_CHARS = 4_000

export interface LineEditInput {
  start_line: number
  end_line?: number
  new_text: string
  expect_text?: string
}

export type LineEditStatus = 'ok' | 'out_of_range' | 'overlap' | 'mismatch' | 'invalid'

export interface LineEditResultItem {
  start_line: number
  end_line: number
  status: LineEditStatus
  message?: string
}

export interface NumberedSnippet {
  start_line: number
  end_line: number
  text: string
}

export interface ApplyLineEditsResult {
  ok: boolean
  applied: number
  line_count_before: number
  line_count_after: number
  /** 仅 ok 时提供，供调用方写入 */
  content?: string
  results: LineEditResultItem[]
  numbered_snippets?: NumberedSnippet[]
}

function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 拆成行数组；不把末尾单独的空串算作多一行（与常见编辑器一致） */
export function splitContentLines(content: string): {
  lines: string[]
  trailingNewline: boolean
} {
  const n = normalizeLf(content)
  if (n.length === 0) {
    return { lines: [], trailingNewline: false }
  }
  const trailingNewline = n.endsWith('\n')
  const body = trailingNewline ? n.slice(0, -1) : n
  return { lines: body.split('\n'), trailingNewline }
}

export function joinContentLines(lines: string[], trailingNewline: boolean): string {
  if (lines.length === 0) return trailingNewline ? '\n' : ''
  const body = lines.join('\n')
  return trailingNewline ? `${body}\n` : body
}

function formatNumberedBlock(lines: string[], fromLine: number, toLine: number): string {
  const parts: string[] = []
  for (let ln = fromLine; ln <= toLine; ln++) {
    const idx = ln - 1
    const text = idx >= 0 && idx < lines.length ? lines[idx] : ''
    parts.push(`${String(ln).padStart(4, '0')}|${text}`)
  }
  return `${parts.join('\n')}\n`
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

function replacementLines(newText: string): string[] {
  if (newText === '') return []
  const n = normalizeLf(newText)
  if (n.endsWith('\n')) {
    const body = n.slice(0, -1)
    return body.length === 0 ? [''] : body.split('\n')
  }
  return n.split('\n')
}

/**
 * 校验全部 edits 后一次性应用（从大到小）；任一条失败则 ok:false 且不返回 content。
 */
export function applyLineEdits(
  content: string,
  edits: LineEditInput[],
  opts?: { maxEdits?: number },
): ApplyLineEditsResult {
  const maxEdits = opts?.maxEdits ?? MAX_LINE_EDITS
  const { lines, trailingNewline } = splitContentLines(content)
  const lineCountBefore = lines.length

  if (!Array.isArray(edits) || edits.length === 0) {
    return {
      ok: false,
      applied: 0,
      line_count_before: lineCountBefore,
      line_count_after: lineCountBefore,
      results: [{
        start_line: 1,
        end_line: 1,
        status: 'invalid',
        message: 'edits 不能为空',
      }],
    }
  }

  if (edits.length > maxEdits) {
    return {
      ok: false,
      applied: 0,
      line_count_before: lineCountBefore,
      line_count_after: lineCountBefore,
      results: [{
        start_line: 1,
        end_line: 1,
        status: 'invalid',
        message: `edits 最多 ${maxEdits} 条`,
      }],
    }
  }

  type Normalized = {
    index: number
    start: number
    end: number
    newText: string
  }

  const normalized: Normalized[] = []
  const results: LineEditResultItem[] = edits.map(() => ({
    start_line: 1,
    end_line: 1,
    status: 'invalid' as LineEditStatus,
  }))

  let anyFail = false

  for (let i = 0; i < edits.length; i++) {
    const raw = edits[i]
    const start = typeof raw?.start_line === 'number' ? Math.trunc(raw.start_line) : NaN
    const endRaw = raw?.end_line
    const end = endRaw == null ? start : (typeof endRaw === 'number' ? Math.trunc(endRaw) : NaN)
    const newText = raw?.new_text == null ? '' : String(raw.new_text)
    const expect = raw?.expect_text != null ? String(raw.expect_text) : undefined

    results[i] = {
      start_line: Number.isFinite(start) ? start : 0,
      end_line: Number.isFinite(end) ? end : 0,
      status: 'ok',
    }

    if (!Number.isFinite(start) || start < 1 || !Number.isFinite(end) || end < start) {
      results[i] = {
        start_line: Number.isFinite(start) ? start : 0,
        end_line: Number.isFinite(end) ? end : 0,
        status: 'invalid',
        message: 'start_line/end_line 须为 ≥1 的整数，且 end_line ≥ start_line',
      }
      anyFail = true
      continue
    }

    if (start > lineCountBefore || end > lineCountBefore) {
      results[i] = {
        start_line: start,
        end_line: end,
        status: 'out_of_range',
        message: `行号超出范围（文件共 ${lineCountBefore} 行）`,
      }
      anyFail = true
      continue
    }

    if (expect != null) {
      const current = lines.slice(start - 1, end).join('\n')
      if (normalizeLf(expect) !== current) {
        results[i] = {
          start_line: start,
          end_line: end,
          status: 'mismatch',
          message: 'expect_text 与当前行段不一致（文件可能已漂移）',
        }
        anyFail = true
        continue
      }
    }

    normalized.push({ index: i, start, end, newText })
    results[i] = { start_line: start, end_line: end, status: 'ok' }
  }

  for (let a = 0; a < normalized.length; a++) {
    for (let b = a + 1; b < normalized.length; b++) {
      const A = normalized[a]
      const B = normalized[b]
      if (rangesOverlap(A.start, A.end, B.start, B.end)) {
        for (const item of [A, B]) {
          if (results[item.index].status === 'ok') {
            results[item.index] = {
              start_line: item.start,
              end_line: item.end,
              status: 'overlap',
              message: '与其它 edit 的行区间重叠',
            }
          }
        }
        anyFail = true
      }
    }
  }

  if (anyFail || normalized.some(n => results[n.index].status !== 'ok')) {
    return {
      ok: false,
      applied: 0,
      line_count_before: lineCountBefore,
      line_count_after: lineCountBefore,
      results,
    }
  }

  const ordered = [...normalized].sort((a, b) => b.start - a.start || b.end - a.end)
  const work = [...lines]
  const insertLens = new Map<number, number>()

  for (const edit of ordered) {
    const insert = replacementLines(edit.newText)
    insertLens.set(edit.index, insert.length)
    work.splice(edit.start - 1, edit.end - edit.start + 1, ...insert)
    results[edit.index] = {
      start_line: edit.start,
      end_line: edit.end,
      status: 'ok',
    }
  }

  const nextTrailing = work.length === 0 ? false : trailingNewline
  const nextContent = joinContentLines(work, nextTrailing)
  const lineCountAfter = work.length

  const snippetParts: NumberedSnippet[] = []
  let snippetChars = 0
  const successOrdered = [...normalized].sort((a, b) => a.start - b.start)
  for (const edit of successOrdered) {
    const insertLen = insertLens.get(edit.index) ?? 0
    if (work.length === 0) break

    if (insertLen === 0) {
      const focus = Math.min(Math.max(1, edit.start), work.length)
      const from = Math.max(1, focus - 2)
      const to = Math.min(work.length, Math.max(from, focus + 1))
      const text = formatNumberedBlock(work, from, to)
      if (snippetChars + text.length > MAX_NUMBERED_SNIPPETS_CHARS) break
      snippetParts.push({ start_line: from, end_line: to, text })
      snippetChars += text.length
      continue
    }

    const endAfter = edit.start + insertLen - 1
    const from = Math.max(1, edit.start - 2)
    const to = Math.min(work.length, endAfter + 2)
    const text = formatNumberedBlock(work, from, to)
    if (snippetChars + text.length > MAX_NUMBERED_SNIPPETS_CHARS) break
    snippetParts.push({ start_line: from, end_line: to, text })
    snippetChars += text.length
  }

  return {
    ok: true,
    applied: normalized.length,
    line_count_before: lineCountBefore,
    line_count_after: lineCountAfter,
    content: nextContent,
    results,
    numbered_snippets: snippetParts.length ? snippetParts : undefined,
  }
}
