import os from 'node:os'
import { WorkspaceError } from './errors.js'

/** 工作区文本换行风格（读侧检测；写侧按策略还原） */
export type WorkspaceEol = 'lf' | 'crlf' | 'cr' | 'mixed'

export interface DecodedWorkspaceText {
  /** 逻辑用文本：已剥 BOM，换行统一为 LF */
  text: string
  eol: WorkspaceEol
  hadBom: boolean
}

/** 非法 UTF-8 / 编码失败时给 Agent 的可行动提示（与 SPAWN_ENOENT_HINT 同级） */
export const WORKSPACE_TEXT_ENCODING_HINT =
  '工作区文本须为合法 UTF-8（无 BOM）。'
  + '请先将文件转为 UTF-8 再 workspace_read / replace_lines / apply_patch；'
  + '勿用系统默认代码页或含 BOM 的编码覆盖。'

export class WorkspaceTextEncodingError extends WorkspaceError {
  readonly hint = WORKSPACE_TEXT_ENCODING_HINT

  constructor(message?: string) {
    super(message ?? `文件不是合法 UTF-8。${WORKSPACE_TEXT_ENCODING_HINT}`)
    this.name = 'WorkspaceTextEncodingError'
  }
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])

function isWindowsScriptPath(relPath: string): boolean {
  return /\.(bat|cmd|ps1)$/i.test(relPath.replace(/\\/g, '/'))
}

function stripUtf8Bom(buf: Buffer): { body: Buffer; hadBom: boolean } {
  if (
    buf.length >= 3
    && buf[0] === UTF8_BOM[0]
    && buf[1] === UTF8_BOM[1]
    && buf[2] === UTF8_BOM[2]
  ) {
    return { body: buf.subarray(3), hadBom: true }
  }
  return { body: buf, hadBom: false }
}

function decodeUtf8Strict(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    throw new WorkspaceTextEncodingError()
  }
}

/** 检测换行风格（在剥 BOM 后的原始字符串上，含 \r\n） */
export function detectWorkspaceEol(raw: string): WorkspaceEol {
  const hasCrlf = raw.includes('\r\n')
  const withoutCrlf = raw.replace(/\r\n/g, '')
  const hasCr = withoutCrlf.includes('\r')
  const hasLf = withoutCrlf.includes('\n')
  if (hasCrlf && !hasCr && !hasLf) return 'crlf'
  if (!hasCrlf && hasCr && !hasLf) return 'cr'
  if (!hasCrlf && !hasCr) return 'lf'
  if (!hasCrlf && hasLf && !hasCr) return 'lf'
  return 'mixed'
}

function toLf(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 读盘：严格 UTF-8；剥 BOM；记录 eol；逻辑文本为 LF。
 */
export function decodeWorkspaceText(buf: Buffer): DecodedWorkspaceText {
  const { body, hadBom } = stripUtf8Bom(buf)
  const raw = decodeUtf8Strict(body)
  const eol = detectWorkspaceEol(raw)
  return { text: toLf(raw), eol, hadBom }
}

function resolveWriteEol(relPath: string, eol?: WorkspaceEol): '\n' | '\r\n' | '\r' {
  if (isWindowsScriptPath(relPath)) {
    return os.EOL === '\r\n' ? '\r\n' : '\n'
  }
  if (eol === 'crlf' || eol === 'mixed') return '\r\n'
  if (eol === 'cr') return '\r'
  return '\n'
}

/**
 * 落盘：无 BOM；按原 eol 还原（新建默认 LF）；`.bat`/`.cmd`/`.ps1` 仍平台 EOL。
 * 入参可为任意换行，先规范为 LF 再按目标 eol 写出。
 */
export function encodeWorkspaceText(
  content: string,
  opts: { relPath: string; eol?: WorkspaceEol },
): Buffer {
  const lf = toLf(content)
  const target = resolveWriteEol(opts.relPath, opts.eol)
  const text = target === '\n' ? lf : lf.split('\n').join(target)
  return Buffer.from(text, 'utf8')
}

/**
 * 规范化写入工作区的文本换行（新建/无原 eol 语义）：
 * - 先统一为 LF
 * - `.bat` / `.cmd` / `.ps1` 再换成当前平台 EOL
 * - 其它保持 LF；永不写 BOM
 */
export function normalizeWorkspaceTextContent(relPath: string, content: string): string {
  return encodeWorkspaceText(content, { relPath }).toString('utf8')
}
