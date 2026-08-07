/**
 * Browser-safe mirror of @opptrix/shared opptrix-ws-uri (avoid shared barrel → node:path).
 * Keep in sync with packages/shared/src/opptrix-ws-uri.ts
 */
import { sessionWorkspaceFileUrl } from '../api/client'

export const OPPTRIX_WS_SCHEME = 'opptrix-ws'

const GRANT_ROOT_RE = /^grant_[a-zA-Z0-9]+$/

function isValidRootId(rootId: string): boolean {
  return rootId === 'default' || rootId === 'shared' || GRANT_ROOT_RE.test(rootId)
}

function normalizeRelPath(relPath: string): { ok: true; path: string } | { ok: false; reason: string } {
  const raw = String(relPath ?? '').trim()
  if (!raw) return { ok: false, reason: 'path 不能为空' }
  if (raw.includes('\0')) return { ok: false, reason: 'path 含非法字符' }
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\') || raw.startsWith('//')) {
    return { ok: false, reason: '不允许使用绝对路径' }
  }
  const withSlashes = raw.replace(/\\/g, '/')
  if (withSlashes.startsWith('/')) {
    return { ok: false, reason: '不允许使用绝对路径' }
  }
  const segments = withSlashes.split('/').filter(seg => seg.length > 0 && seg !== '.')
  if (!segments.length) return { ok: false, reason: 'path 不能为空' }
  for (const seg of segments) {
    if (seg === '..') return { ok: false, reason: '不允许使用 .. 穿越目录' }
  }
  return { ok: true, path: segments.join('/') }
}

export function parseOpptrixWsUri(uri: string):
  | { ok: true; rootId: string; relPath: string }
  | { ok: false; reason: string } {
  const input = String(uri ?? '').trim()
  if (!input) return { ok: false, reason: 'URI 为空' }
  const schemePrefix = `${OPPTRIX_WS_SCHEME}://`
  if (!input.toLowerCase().startsWith(schemePrefix)) {
    return { ok: false, reason: `须以 ${schemePrefix} 开头` }
  }
  const rest = input.slice(schemePrefix.length)
  const slash = rest.indexOf('/')
  if (slash < 0) return { ok: false, reason: '缺少相对路径' }
  const rootId = rest.slice(0, slash)
  const pathPart = rest.slice(slash + 1)
  if (!isValidRootId(rootId)) {
    return { ok: false, reason: 'root_id 无效' }
  }
  const norm = normalizeRelPath(pathPart)
  if (!norm.ok) return { ok: false, reason: norm.reason }
  return { ok: true, rootId, relPath: norm.path }
}

export function hintOpptrixWsKind(relPath: string): 'image' | 'video' | 'audio' | 'file' {
  const lower = relPath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot) : ''
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image'
  if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) return 'video'
  if (['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext)) return 'audio'
  return 'file'
}

const WS_URI_RE = new RegExp(
  `${OPPTRIX_WS_SCHEME}:\\/\\/[a-zA-Z0-9_]+\\/[^\\s"'<>\\)]+`,
  'gi',
)

export function isWorkspaceFileHttpUrl(url: string | undefined | null): boolean {
  if (!url) return false
  return /\/sessions\/[^/]+\/workspace\/file\?/i.test(url)
}

export function rewriteOpptrixWsUrisInMarkdown(
  content: string,
  sessionId: string | null | undefined,
): string {
  if (!content || !content.includes(`${OPPTRIX_WS_SCHEME}://`)) return content
  return content.replace(WS_URI_RE, match => {
    const parsed = parseOpptrixWsUri(match)
    if (!parsed.ok) return match
    if (!sessionId) {
      return '/opptrix-ws-unavailable'
    }
    return sessionWorkspaceFileUrl(sessionId, parsed.rootId, parsed.relPath)
  })
}

export function workspaceFileBasenameFromUrl(url: string): string {
  try {
    const u = new URL(url, 'http://local.invalid')
    const p = u.searchParams.get('path') || ''
    const parts = p.split('/').filter(Boolean)
    return parts[parts.length - 1] || '文件'
  } catch {
    return '文件'
  }
}

export function workspaceMediaKindFromUrl(url: string): 'image' | 'video' | 'audio' | 'file' {
  try {
    const u = new URL(url, 'http://local.invalid')
    const p = u.searchParams.get('path') || ''
    return hintOpptrixWsKind(p)
  } catch {
    return 'file'
  }
}

export function isOpptrixWsUnavailableHref(href: string | undefined | null): boolean {
  if (!href) return false
  return href === '/opptrix-ws-unavailable' || href.startsWith('/opptrix-ws-unavailable?')
}
