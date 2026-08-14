import type { PreflightCheck, PreflightDiagnostic } from './types.js'
import { pushDiagnostic } from './diagnostics.js'

const MAX_HINT_SNIP = 120
const MAX_ABS_PATH_DIAGNOSTICS = 10

function pushCheck(
  checks: PreflightCheck[],
  id: string,
  status: PreflightCheck['status'],
  message: string,
): void {
  checks.push({ id, level: 'l0', status, message })
}

function lineColOfOffset(content: string, index: number): { line: number; column: number } {
  let line = 1
  let lastNl = -1
  const end = Math.max(0, Math.min(index, content.length))
  for (let i = 0; i < end; i++) {
    if (content[i] === '\n') {
      line++
      lastNl = i
    }
  }
  return { line, column: end - lastNl }
}

function pathTailHint(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean)
  const tail = parts[parts.length - 1] ?? ''
  return tail ? `…/${tail}` : '<绝对路径>'
}

/** UTF-8 BOM / NUL / 可读性 */
export function checkEncoding(
  buf: Buffer,
  checks: PreflightCheck[],
  diagnostics: PreflightDiagnostic[] = [],
): void {
  if (buf.length === 0) {
    pushCheck(checks, 'l0_empty', 'fail', '文件为空，请写入有效脚本内容后再检查')
    pushDiagnostic(diagnostics, {
      id: 'l0_empty',
      level: 'l0',
      severity: 'error',
      message: '文件为空，请写入有效脚本内容后再检查',
    })
    return
  }
  const nulAt = buf.indexOf(0)
  if (nulAt >= 0) {
    const prefix = buf.subarray(0, nulAt).toString('utf8')
    const loc = lineColOfOffset(prefix, prefix.length)
    pushCheck(checks, 'l0_encoding_nul', 'fail', '文件含 NUL 字节，不是可用的文本脚本')
    pushDiagnostic(diagnostics, {
      id: 'l0_encoding_nul',
      level: 'l0',
      severity: 'error',
      message: '文件含 NUL 字节，不是可用的文本脚本',
      line: loc.line,
      column: loc.column,
    })
    return
  }
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  if (hasBom) {
    pushCheck(checks, 'l0_encoding_bom', 'warn', '检测到 UTF-8 BOM；建议保存为无 BOM 的 UTF-8')
    pushDiagnostic(diagnostics, {
      id: 'l0_encoding_bom',
      level: 'l0',
      severity: 'warning',
      message: '检测到 UTF-8 BOM；建议保存为无 BOM 的 UTF-8',
      line: 1,
      column: 1,
    })
  } else {
    pushCheck(checks, 'l0_encoding', 'pass', '文本编码可读（UTF-8）')
  }
}

/** shebang + win32 CRLF */
export function checkNewlines(
  content: string,
  checks: PreflightCheck[],
  diagnostics: PreflightDiagnostic[] = [],
): void {
  const hasShebang = content.startsWith('#!')
  const hasCrlf = content.includes('\r\n')
  if (hasShebang && hasCrlf && process.platform === 'win32') {
    const msg = '脚本含 shebang 且为 CRLF 换行；在 Windows 上可能影响直接执行，建议改用 LF'
    pushCheck(checks, 'l0_newline_shebang_crlf', 'warn', msg)
    pushDiagnostic(diagnostics, {
      id: 'l0_newline_shebang_crlf',
      level: 'l0',
      severity: 'warning',
      message: msg,
      line: 1,
      column: 1,
    })
  } else if (hasShebang && hasCrlf) {
    const msg = '脚本含 shebang 且含 CRLF；跨平台建议统一为 LF'
    pushCheck(checks, 'l0_newline_shebang_crlf', 'warn', msg)
    pushDiagnostic(diagnostics, {
      id: 'l0_newline_shebang_crlf',
      level: 'l0',
      severity: 'warning',
      message: msg,
      line: 1,
      column: 1,
    })
  } else {
    pushCheck(checks, 'l0_newlines', 'pass', '换行检查通过')
  }
}

const ABS_PATH_RE =
  /(?:^|[\s"'`=(])(\/(?:Users|home|tmp|var|opt|usr)\/[^\s"'`)\]]+|[A-Za-z]:\\(?:Users|Users\\|Windows|Program Files)[^\s"'`)\]]*|\\\\[^\s"'`)\]]+)/g

const DOTDOT_RE = /(?:^|[^a-zA-Z0-9_])\.\.(?:[\\/]|$)/

const SHELL_WHOLE_RE =
  /\b(?:bash|zsh|sh)\s+-c\b|\b(?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh)\s+(?:\/c|-Command|-c)\b/i

/** 平台路径 / 危险片段 / shell 整串（内容扫描，warn） */
export function checkPlatformPathRules(
  content: string,
  checks: PreflightCheck[],
  diagnostics: PreflightDiagnostic[] = [],
): void {
  const absHits: { hint: string; index: number }[] = []
  ABS_PATH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ABS_PATH_RE.exec(content)) !== null) {
    const hit = (m[1] ?? m[0]).trim()
    if (!hit) continue
    if (absHits.length >= MAX_ABS_PATH_DIAGNOSTICS) break
    absHits.push({
      hint: pathTailHint(hit.slice(0, MAX_HINT_SNIP)),
      index: m.index,
    })
  }
  if (absHits.length) {
    pushCheck(
      checks,
      'l0_hardcoded_abs_path',
      'warn',
      `内容疑似硬编码绝对路径（${absHits.length} 处）；请改用相对路径或 pathlib/path 拼接`,
    )
    for (const hit of absHits) {
      const loc = lineColOfOffset(content, hit.index)
      pushDiagnostic(diagnostics, {
        id: 'l0_hardcoded_abs_path',
        level: 'l0',
        severity: 'warning',
        line: loc.line,
        column: loc.column,
        message: `内容疑似硬编码绝对路径（${hit.hint}）；请改用相对路径或 pathlib/path 拼接`,
      })
    }
  } else {
    pushCheck(checks, 'l0_hardcoded_abs_path', 'pass', '未发现常见硬编码绝对路径模式')
  }

  if (DOTDOT_RE.test(content)) {
    const msg = '内容含「..」路径片段；请确认不会越出授权工作区'
    pushCheck(checks, 'l0_path_dotdot', 'warn', msg)
    const idx = content.search(DOTDOT_RE)
    const loc = idx >= 0 ? lineColOfOffset(content, idx) : undefined
    pushDiagnostic(diagnostics, {
      id: 'l0_path_dotdot',
      level: 'l0',
      severity: 'warning',
      line: loc?.line,
      column: loc?.column,
      message: msg,
    })
  } else {
    pushCheck(checks, 'l0_path_dotdot', 'pass', '未发现危险的「..」路径片段')
  }

  SHELL_WHOLE_RE.lastIndex = 0
  const shellMatch = SHELL_WHOLE_RE.exec(content)
  if (shellMatch) {
    const msg = '内容疑似 bash/cmd/powershell 整串调用；请用结构化 argv 经 opptrix_run，勿整串绕过'
    pushCheck(checks, 'l0_shell_whole_string', 'warn', msg)
    const loc = lineColOfOffset(content, shellMatch.index)
    pushDiagnostic(diagnostics, {
      id: 'l0_shell_whole_string',
      level: 'l0',
      severity: 'warning',
      line: loc.line,
      column: loc.column,
      message: msg,
    })
  } else {
    pushCheck(checks, 'l0_shell_whole_string', 'pass', '未发现 shell 整串绕过模式')
  }
}

/**
 * @deprecated 多问题场景请用 diagnostics 解析器；勿再用本函数把多行压成一行。
 * 保留给超时等单行摘要。
 */
export function truncateOutput(text: string, max = 800): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}
