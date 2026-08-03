/** Skill name rules per https://agentskills.io/specification */
import path from 'node:path'
import { skillContentHasInjection, sanitizeSkillMarkdown } from './sanitize.js'

export const ALLOWED_ATTACHMENT_PREFIXES = ['references/', 'scripts/', 'assets/'] as const
export const MAX_ATTACHMENT_FILE_BYTES = 200 * 1024
export const MAX_ATTACHMENT_FILES = 16

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSkillName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 64) return false
  if (name.startsWith('-') || name.endsWith('-')) return false
  if (name.includes('--')) return false
  return NAME_RE.test(name)
}

export function validateDescription(description: string): string | null {
  const d = description.trim()
  if (!d) return 'description 不能为空'
  if (d.length > 1024) return 'description 最长 1024 字符'
  return null
}

export function validateCompatibility(compatibility: string): string | null {
  const c = compatibility.trim()
  if (!c) return 'compatibility 不能为空'
  if (c.length > 500) return 'compatibility 最长 500 字符'
  return null
}

/**
 * 校验 references 路径列表：每条非空、无 `..`、无绝对路径、无 NUL、≤16 条。
 * 路径穿越最终在 resolveConfinedPath 复检；此处仅做前置过滤。
 */
export function validateReferences(refs: unknown): string | null {
  if (!Array.isArray(refs)) return null
  if (refs.length > 16) return 'references 最多 16 条'
  for (const raw of refs) {
    if (typeof raw !== 'string') return 'references 每条须为字符串'
    const r = raw.trim()
    if (!r) return 'references 不能包含空字符串'
    if (r.includes('\0')) return 'references 不能包含 NUL 字符'
    if (path.isAbsolute(r)) return 'references 不允许绝对路径'
    const parts = r.replace(/\\/g, '/').split('/')
    if (parts.some(p => p === '..')) return 'references 不允许包含 .. 路径穿越'
  }
  return null
}

/** 附件路径须在 references/、scripts/、assets/ 下，且不含 .. 与绝对路径 */
export function validateAttachmentPath(relPath: string): string | null {
  const r = relPath.replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!r || r === '.' || r.includes('\0')) return '文件路径无效'
  if (path.isAbsolute(r)) return '附件不允许绝对路径'
  const parts = r.split('/')
  if (parts.some(p => p === '..')) return '附件路径不允许包含 ..'
  if (!ALLOWED_ATTACHMENT_PREFIXES.some(prefix => r.startsWith(prefix))) {
    return '附件路径须在 references/、scripts/ 或 assets/ 下'
  }
  return null
}

function validateAttachmentContent(relPath: string, content: string): string | null {
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > MAX_ATTACHMENT_FILE_BYTES) {
    return `单文件不得超过 ${Math.floor(MAX_ATTACHMENT_FILE_BYTES / 1024)}KB`
  }
  const lower = relPath.toLowerCase()
  if (lower.endsWith('.md')) {
    if (skillContentHasInjection(content)) return '附件内容包含不允许的指令'
    const sanitized = sanitizeSkillMarkdown(content)
    if (sanitized == null && content.trim()) return '附件内容包含不允许的指令'
  }
  return null
}

/** 校验创建时附带的 files 数组（路径 confine + 大小 + markdown injection） */
export function validateSkillAttachmentFiles(files: unknown): string | null {
  if (files == null) return null
  if (!Array.isArray(files)) return 'files 须为数组'
  if (files.length > MAX_ATTACHMENT_FILES) return `附件最多 ${MAX_ATTACHMENT_FILES} 个`
  const seen = new Set<string>()
  for (const raw of files) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'files 每项须为 { path, content }'
    const pathRaw = (raw as { path?: unknown }).path
    const contentRaw = (raw as { content?: unknown }).content
    if (typeof pathRaw !== 'string') return 'files.path 须为字符串'
    if (typeof contentRaw !== 'string') return 'files.content 须为字符串'
    const rel = pathRaw.replace(/\\/g, '/').replace(/^\/+/, '').trim()
    const pathErr = validateAttachmentPath(rel)
    if (pathErr) return pathErr
    if (seen.has(rel)) return `重复的附件路径：${rel}`
    seen.add(rel)
    const contentErr = validateAttachmentContent(rel, contentRaw)
    if (contentErr) return contentErr
  }
  return null
}

export function mergeSkillReferences(
  explicit?: string[],
  filePaths?: string[],
): string[] | undefined {
  const set = new Set<string>()
  for (const r of explicit ?? []) {
    const t = r.trim()
    if (t) set.add(t)
  }
  for (const p of filePaths ?? []) {
    const t = p.trim()
    if (t) set.add(t)
  }
  const merged = [...set]
  if (!merged.length) return undefined
  const refsErr = validateReferences(merged)
  if (refsErr) throw new Error(refsErr)
  if (merged.length > MAX_ATTACHMENT_FILES) {
    throw new Error(`references 与 files 合计最多 ${MAX_ATTACHMENT_FILES} 条`)
  }
  return merged
}
