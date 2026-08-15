/**
 * OpenCode 风格 `*** Begin Patch` 解析与应用（Add / Update / Delete）。
 * 不引入 Effect 运行时；纯字符串 + 调用方提供的读写删。
 */

import { WorkspaceError } from './errors.js'

export type PatchFileOp =
  | { kind: 'add'; path: string; content: string }
  | { kind: 'delete'; path: string }
  | { kind: 'update'; path: string; hunks: PatchHunk[] }

export type PatchHunk = {
  /** 上下文与变更行：' ' context / '-' remove / '+' add */
  lines: Array<{ tag: ' ' | '-' | '+'; text: string }>
}

export type ParsedPatch = {
  ops: PatchFileOp[]
}

export type ApplyPatchFileResult = {
  path: string
  action: 'add' | 'update' | 'delete'
  ok: boolean
  message?: string
}

export type ApplyPatchResult = {
  ok: boolean
  applied: number
  results: ApplyPatchFileResult[]
  error?: string
}

const BEGIN = '*** Begin Patch'
const END = '*** End Patch'
const ADD = '*** Add File:'
const UPDATE = '*** Update File:'
const DELETE = '*** Delete File:'

function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 解析 OpenCode / Codex 风格 patch 文本。
 */
export function parseOpenCodePatch(raw: string): ParsedPatch {
  const text = normalizeLf(String(raw ?? '')).trim()
  if (!text) {
    throw new WorkspaceError('patch 为空')
  }
  const lines = text.split('\n')
  let i = 0
  // 允许省略 Begin/End 包裹
  if (lines[i]?.startsWith(BEGIN)) i++
  const ops: PatchFileOp[] = []

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (!line.trim() || line.startsWith(END)) {
      i++
      continue
    }
    if (line.startsWith(ADD)) {
      const filePath = line.slice(ADD.length).trim()
      if (!filePath) throw new WorkspaceError('Add File 缺少路径')
      i++
      const contentLines: string[] = []
      while (i < lines.length) {
        const L = lines[i] ?? ''
        if (L.startsWith('*** ')) break
        if (L.startsWith('+')) contentLines.push(L.slice(1))
        else if (L.startsWith('-')) {
          throw new WorkspaceError(`Add File「${filePath}」不应含删除行`)
        } else if (L.startsWith(' ')) {
          contentLines.push(L.slice(1))
        } else if (L === '') {
          contentLines.push('')
        } else {
          // 无前缀：当作内容行（兼容松散格式）
          contentLines.push(L)
        }
        i++
      }
      let content = contentLines.join('\n')
      if (content.length && !content.endsWith('\n')) content += '\n'
      ops.push({ kind: 'add', path: filePath, content })
      continue
    }
    if (line.startsWith(DELETE)) {
      const filePath = line.slice(DELETE.length).trim()
      if (!filePath) throw new WorkspaceError('Delete File 缺少路径')
      ops.push({ kind: 'delete', path: filePath })
      i++
      continue
    }
    if (line.startsWith(UPDATE)) {
      const filePath = line.slice(UPDATE.length).trim()
      if (!filePath) throw new WorkspaceError('Update File 缺少路径')
      i++
      const hunks: PatchHunk[] = []
      let current: PatchHunk['lines'] = []
      const flushHunk = () => {
        if (current.length) {
          hunks.push({ lines: current })
          current = []
        }
      }
      while (i < lines.length) {
        const L = lines[i] ?? ''
        if (L.startsWith('*** ')) break
        if (L.startsWith('@@')) {
          flushHunk()
          i++
          continue
        }
        if (L.startsWith('+') || L.startsWith('-') || L.startsWith(' ')) {
          current.push({ tag: L[0] as ' ' | '-' | '+', text: L.slice(1) })
          i++
          continue
        }
        if (L === '') {
          current.push({ tag: ' ', text: '' })
          i++
          continue
        }
        // 松散：无前缀当 context
        current.push({ tag: ' ', text: L })
        i++
      }
      flushHunk()
      if (!hunks.length) {
        throw new WorkspaceError(`Update File「${filePath}」缺少 hunk`)
      }
      ops.push({ kind: 'update', path: filePath, hunks })
      continue
    }
    throw new WorkspaceError(`无法识别的 patch 行：${line.slice(0, 80)}`)
  }

  if (!ops.length) {
    throw new WorkspaceError('patch 未包含任何 Add/Update/Delete')
  }
  return { ops }
}

function findHunkIndex(haystack: string[], needle: string[], startAt: number): number {
  if (!needle.length) return startAt
  for (let i = startAt; i <= haystack.length - needle.length; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false
        break
      }
    }
    if (ok) return i
  }
  return -1
}

/**
 * 将单个 Update hunk 应用到行数组（就地）；失败抛 WorkspaceError。
 */
export function applyUpdateHunks(content: string, hunks: PatchHunk[]): string {
  const normalized = normalizeLf(content)
  const trailingNewline = normalized.endsWith('\n')
  const body = trailingNewline && normalized.length ? normalized.slice(0, -1) : normalized
  let lines = body.length === 0 ? [] : body.split('\n')
  let cursor = 0

  for (const hunk of hunks) {
    const oldLines: string[] = []
    const newLines: string[] = []
    for (const row of hunk.lines) {
      if (row.tag === ' ' || row.tag === '-') oldLines.push(row.text)
      if (row.tag === ' ' || row.tag === '+') newLines.push(row.text)
    }
    const at = findHunkIndex(lines, oldLines, cursor)
    if (at < 0) {
      const preview = oldLines.slice(0, 3).join('\\n')
      throw new WorkspaceError(`patch hunk 未匹配到上下文：${preview}`)
    }
    lines = [
      ...lines.slice(0, at),
      ...newLines,
      ...lines.slice(at + oldLines.length),
    ]
    cursor = at + newLines.length
  }

  if (lines.length === 0) return trailingNewline ? '\n' : ''
  const out = lines.join('\n')
  return trailingNewline ? `${out}\n` : out
}

export type ApplyPatchIo = {
  readFile: (relPath: string) => Promise<string>
  writeFile: (relPath: string, content: string) => Promise<void>
  deletePath: (relPath: string) => Promise<void>
  fileExists: (relPath: string) => Promise<boolean>
}

/**
 * 按序应用解析后的 patch（失败则停止；已写入不回滚——调用方应先校验）。
 */
export async function applyParsedPatch(
  parsed: ParsedPatch,
  io: ApplyPatchIo,
): Promise<ApplyPatchResult> {
  const results: ApplyPatchFileResult[] = []
  let applied = 0

  for (const op of parsed.ops) {
    try {
      if (op.kind === 'add') {
        const exists = await io.fileExists(op.path)
        if (exists) {
          results.push({
            path: op.path,
            action: 'add',
            ok: false,
            message: '文件已存在，Add 失败（请改用 Update 或先 Delete）',
          })
          return { ok: false, applied, results, error: results[results.length - 1]?.message }
        }
        await io.writeFile(op.path, op.content)
        results.push({ path: op.path, action: 'add', ok: true })
        applied++
        continue
      }
      if (op.kind === 'delete') {
        const exists = await io.fileExists(op.path)
        if (!exists) {
          results.push({
            path: op.path,
            action: 'delete',
            ok: false,
            message: '文件不存在，无法 Delete',
          })
          return { ok: false, applied, results, error: results[results.length - 1]?.message }
        }
        await io.deletePath(op.path)
        results.push({ path: op.path, action: 'delete', ok: true })
        applied++
        continue
      }
      // update
      const exists = await io.fileExists(op.path)
      if (!exists) {
        results.push({
          path: op.path,
          action: 'update',
          ok: false,
          message: '文件不存在，无法 Update',
        })
        return { ok: false, applied, results, error: results[results.length - 1]?.message }
      }
      const original = await io.readFile(op.path)
      const next = applyUpdateHunks(original, op.hunks)
      await io.writeFile(op.path, next)
      results.push({ path: op.path, action: 'update', ok: true })
      applied++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        path: op.path,
        action: op.kind === 'add' ? 'add' : op.kind === 'delete' ? 'delete' : 'update',
        ok: false,
        message,
      })
      return { ok: false, applied, results, error: message }
    }
  }

  return { ok: true, applied, results }
}

export function applyOpenCodePatchText(
  raw: string,
  io: ApplyPatchIo,
): Promise<ApplyPatchResult> {
  const parsed = parseOpenCodePatch(raw)
  return applyParsedPatch(parsed, io)
}
