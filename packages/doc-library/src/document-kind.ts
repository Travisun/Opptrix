/**
 * MIME / 扩展名 → DocumentKind（入库路由用）。
 */
import type { DocumentKind } from './types.js'

const TEXT_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
])

const DOCX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const DOC_MIME = new Set([
  'application/msword',
])

const PPTX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const PPT_MIME = new Set([
  'application/vnd.ms-powerpoint',
])

export function extOfFilename(filename?: string): string {
  if (!filename) return ''
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return ''
  return filename.slice(dot).toLowerCase()
}

export function documentKindFromMime(mime: string, filename?: string): DocumentKind {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? ''
  const ext = extOfFilename(filename)

  if (m === 'application/pdf' || ext === '.pdf') return 'pdf'
  if (m.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
    return 'image'
  }
  if (DOCX_MIME.has(m) || ext === '.docx') return 'docx'
  if (DOC_MIME.has(m) || ext === '.doc') return 'doc'
  if (PPTX_MIME.has(m) || ext === '.pptx') return 'pptx'
  if (PPT_MIME.has(m) || ext === '.ppt') return 'ppt'
  if (
    TEXT_MIME.has(m)
    || ['.txt', '.md', '.markdown', '.csv', '.json', '.xml', '.html', '.htm', '.log'].includes(ext)
  ) {
    return 'text'
  }
  return 'other'
}
