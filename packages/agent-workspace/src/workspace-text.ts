import os from 'node:os'

/**
 * 规范化写入工作区的文本换行：
 * - 先统一为 LF
 * - `.bat` / `.cmd` / `.ps1` 再换成当前平台 EOL（Windows 上为 CRLF）
 * - 其它代码/文本保持 LF（跨平台 Python/Node 友好）
 */
export function normalizeWorkspaceTextContent(relPath: string, content: string): string {
  let text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (/\.(bat|cmd|ps1)$/i.test(relPath.replace(/\\/g, '/'))) {
    if (os.EOL !== '\n') {
      text = text.split('\n').join(os.EOL)
    }
  }
  return text
}
