import { createHash } from 'node:crypto'

export type MediaKind = 'image' | 'audio' | 'video'

export type ScannedMedia = {
  id: string
  kind: MediaKind
  src: string
  tag: string
}

const IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
const AUDIO_RE = /<audio\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
const VIDEO_RE = /<video\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi
const SOURCE_RE = /<source\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi

function pickSrc(m: RegExpExecArray): string | null {
  const src = (m[1] || m[2] || m[3] || '').trim()
  return src || null
}

function mediaId(kind: MediaKind, src: string): string {
  const hash = createHash('sha1').update(`${kind}:${src}`).digest('hex').slice(0, 12)
  return `${kind}:${hash}`
}

function collect(regex: RegExp, kind: MediaKind, tag: string, html: string, seen: Set<string>): ScannedMedia[] {
  const out: ScannedMedia[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(regex.source, regex.flags)
  while ((m = re.exec(html)) !== null) {
    const src = pickSrc(m)
    if (!src || src.startsWith('data:')) continue
    const id = mediaId(kind, src)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, kind, src, tag })
  }
  return out
}

export function scanHtmlMedia(html: string): ScannedMedia[] {
  const body = String(html ?? '')
  if (!body.trim()) return []

  const seen = new Set<string>()
  const items: ScannedMedia[] = [
    ...collect(IMG_RE, 'image', 'img', body, seen),
    ...collect(AUDIO_RE, 'audio', 'audio', body, seen),
    ...collect(VIDEO_RE, 'video', 'video', body, seen),
  ]

  // video/audio 内嵌 source
  let m: RegExpExecArray | null
  const sourceRe = new RegExp(SOURCE_RE.source, SOURCE_RE.flags)
  while ((m = sourceRe.exec(body)) !== null) {
    const src = pickSrc(m)
    if (!src || src.startsWith('data:')) continue
    const kind: MediaKind = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src) ? 'video' : 'audio'
    const id = mediaId(kind, src)
    if (seen.has(id)) continue
    seen.add(id)
    items.push({ id, kind, src, tag: 'source' })
  }

  return items
}
