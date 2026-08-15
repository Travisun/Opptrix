/**
 * 精确字符串替换（对齐 Cursor / OpenCode edit：old_string → new_string）。
 */
import { WorkspaceError } from '../errors.js'

function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export type ExactReplaceResult = {
  ok: boolean
  replacements: number
  content?: string
  error?: string
}

/**
 * 在全文中替换 old_string → new_string。
 * replace_all=false 时要求恰好出现一次；true 时替换全部（至少一次）。
 */
export function applyExactReplace(
  content: string,
  oldString: string,
  newString: string,
  opts?: { replace_all?: boolean },
): ExactReplaceResult {
  const replaceAll = opts?.replace_all === true
  if (oldString === '') {
    return { ok: false, replacements: 0, error: 'old_string 不能为空' }
  }
  const directCount = countOccurrences(content, oldString)
  if (directCount > 0) {
    if (!replaceAll && directCount !== 1) {
      return {
        ok: false,
        replacements: 0,
        error: `old_string 出现 ${directCount} 次；请收紧上下文，或设 replace_all=true`,
      }
    }
    const next = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString)
    return { ok: true, replacements: replaceAll ? directCount : 1, content: next }
  }

  const normContent = normalizeLf(content)
  const normOld = normalizeLf(oldString)
  const normNew = normalizeLf(newString)
  const normCount = countOccurrences(normContent, normOld)
  if (normCount === 0) {
    return { ok: false, replacements: 0, error: 'old_string 未在文件中找到' }
  }
  if (!replaceAll && normCount !== 1) {
    return {
      ok: false,
      replacements: 0,
      error: `old_string 出现 ${normCount} 次；请收紧上下文，或设 replace_all=true`,
    }
  }
  const next = replaceAll
    ? normContent.split(normOld).join(normNew)
    : normContent.replace(normOld, normNew)
  return { ok: true, replacements: replaceAll ? normCount : 1, content: next }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    count++
    from = at + Math.max(needle.length, 1)
  }
  return count
}

export function assertExactReplaceOk(result: ExactReplaceResult): void {
  if (!result.ok) {
    throw new WorkspaceError(result.error || '精确替换失败')
  }
}
