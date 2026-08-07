/**
 * Chat message workspace path protocol.
 * Form: opptrix-ws://{root_id}/{relPath}
 * Examples: opptrix-ws://shared/charts/a.png, opptrix-ws://default/out/x.mp4
 */

export const OPPTRIX_WS_SCHEME = 'opptrix-ws'

const GRANT_ROOT_RE = /^grant_[a-zA-Z0-9]+$/

export type OpptrixWsUriOk = { ok: true; rootId: string; relPath: string }
export type OpptrixWsUriErr = { ok: false; reason: string }
export type OpptrixWsUriParseResult = OpptrixWsUriOk | OpptrixWsUriErr

export function isValidOpptrixWsRootId(rootId: string): boolean {
  return rootId === 'default' || rootId === 'shared' || GRANT_ROOT_RE.test(rootId)
}

/** Normalize relPath: backslashes → `/`, strip leading `/`, reject `..` / absolute / empty. */
export function normalizeOpptrixWsRelPath(relPath: string): { ok: true; path: string } | { ok: false; reason: string } {
  const raw = String(relPath ?? '').trim()
  if (!raw) return { ok: false, reason: 'path 不能为空' }
  if (raw.includes('\0')) return { ok: false, reason: 'path 含非法字符' }
  // Reject Windows drive / UNC-style absolute before slash normalize
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

export function parseOpptrixWsUri(uri: string): OpptrixWsUriParseResult {
  const input = String(uri ?? '').trim()
  if (!input) return { ok: false, reason: 'URI 为空' }

  const schemePrefix = `${OPPTRIX_WS_SCHEME}://`
  if (!input.toLowerCase().startsWith(schemePrefix)) {
    return { ok: false, reason: `须以 ${schemePrefix} 开头` }
  }

  const rest = input.slice(schemePrefix.length)
  const slash = rest.indexOf('/')
  if (slash < 0) {
    return { ok: false, reason: '缺少相对路径' }
  }
  const rootId = rest.slice(0, slash)
  const pathPart = rest.slice(slash + 1)

  if (!isValidOpptrixWsRootId(rootId)) {
    return { ok: false, reason: 'root_id 无效（仅允许 default、shared 或 grant_*）' }
  }

  const norm = normalizeOpptrixWsRelPath(pathPart)
  if (!norm.ok) return { ok: false, reason: norm.reason }

  return { ok: true, rootId, relPath: norm.path }
}

export function buildOpptrixWsUri(rootId: string, relPath: string): string {
  const id = String(rootId ?? '').trim()
  if (!isValidOpptrixWsRootId(id)) {
    throw new Error('root_id 无效（仅允许 default、shared 或 grant_*）')
  }
  const norm = normalizeOpptrixWsRelPath(relPath)
  if (!norm.ok) {
    throw new Error(norm.reason)
  }
  return `${OPPTRIX_WS_SCHEME}://${id}/${norm.path}`
}

/** Guess media kind from relative path extension (for Agent hint only). */
export function hintOpptrixWsKind(relPath: string): 'image' | 'video' | 'audio' | 'file' {
  const lower = relPath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot) : ''
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image'
  if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) return 'video'
  if (['.mp3', '.wav', '.m4a', '.ogg', '.aac'].includes(ext)) return 'audio'
  return 'file'
}
