import path from 'node:path'
import type { PreflightLanguage, PreflightLanguageOpt } from './types.js'

const PY_EXTS = new Set(['.py'])
const JS_EXTS = new Set(['.js', '.mjs', '.cjs'])
const TS_EXTS = new Set(['.ts'])
const TSX_EXTS = new Set(['.tsx'])

export function detectLanguageFromPath(
  relPath: string,
  override: PreflightLanguageOpt = 'auto',
): {
  language: PreflightLanguage | null
  ext: string
  /** .tsx 等：尽力按 js 语法检查，或 skip 语法 */
  syntaxKind: 'python' | 'javascript' | 'typescript' | 'tsx' | 'unknown'
} {
  const ext = path.extname(relPath).toLowerCase()
  if (override !== 'auto') {
    return {
      language: override,
      ext,
      syntaxKind: override === 'python' ? 'python' : override === 'typescript' ? 'typescript' : 'javascript',
    }
  }
  if (PY_EXTS.has(ext)) {
    return { language: 'python', ext, syntaxKind: 'python' }
  }
  if (JS_EXTS.has(ext)) {
    return { language: 'javascript', ext, syntaxKind: 'javascript' }
  }
  if (TS_EXTS.has(ext)) {
    return { language: 'typescript', ext, syntaxKind: 'typescript' }
  }
  if (TSX_EXTS.has(ext)) {
    return { language: 'javascript', ext, syntaxKind: 'tsx' }
  }
  return { language: null, ext, syntaxKind: 'unknown' }
}

/** 像脚本：有扩展或 shebang，可跑平台规则 */
export function looksLikeScriptContent(relPath: string, content: string): boolean {
  const ext = path.extname(relPath).toLowerCase()
  if (ext && (PY_EXTS.has(ext) || JS_EXTS.has(ext) || TS_EXTS.has(ext) || TSX_EXTS.has(ext))) {
    return true
  }
  if (ext === '.sh' || ext === '.bash' || ext === '.ps1' || ext === '.bat' || ext === '.cmd') {
    return true
  }
  return /^#!/.test(content.slice(0, 80))
}
