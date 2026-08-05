import JSZip from 'jszip'
import {
  MAX_EMBEDDED_IMAGES,
  MIN_IMAGE_BYTES,
  type EmbeddedMedia,
} from './types.js'
import { sha256Of } from './ocr-batch.js'

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|bmp|webp|tiff?|emf|wmf)$/i
const REL_IMAGE_TYPE = /\/image$/i
const BLIP_EMBED_RE = /(?:r:embed|r:link)\s*=\s*"([^"]+)"/gi
const RELATIONSHIP_RE =
  /<Relationship\b[^>]*\bId\s*=\s*"([^"]+)"[^>]*\bTarget\s*=\s*"([^"]+)"[^>]*\/?>/gi
const RELATIONSHIP_RE_ALT =
  /<Relationship\b[^>]*\bTarget\s*=\s*"([^"]+)"[^>]*\bId\s*=\s*"([^"]+)"[^>]*\/?>/gi

function normalizeZipPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

function resolveRelTarget(baseDir: string, target: string): string {
  const t = target.replace(/\\/g, '/')
  if (t.startsWith('/')) return t.slice(1)
  const parts = [...baseDir.split('/').filter(Boolean), ...t.split('/')]
  const stack: string[] = []
  for (const part of parts) {
    if (part === '..') stack.pop()
    else if (part && part !== '.') stack.push(part)
  }
  return stack.join('/')
}

function parseRelationships(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  RELATIONSHIP_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RELATIONSHIP_RE.exec(xml)) !== null) {
    const id = m[1]
    const target = m[2]
    if (id && target) map.set(id, target)
  }
  RELATIONSHIP_RE_ALT.lastIndex = 0
  while ((m = RELATIONSHIP_RE_ALT.exec(xml)) !== null) {
    const target = m[1]
    const id = m[2]
    if (id && target && !map.has(id)) map.set(id, target)
  }
  // Type=image 的关系也收录（无 blip 时兜底）
  const typeRe =
    /<Relationship\b[^>]*Type\s*=\s*"([^"]+)"[^>]*>/gi
  typeRe.lastIndex = 0
  while ((m = typeRe.exec(xml)) !== null) {
    const full = m[0]
    if (!REL_IMAGE_TYPE.test(m[1] ?? '')) continue
    const idM = /\bId\s*=\s*"([^"]+)"/i.exec(full)
    const tgtM = /\bTarget\s*=\s*"([^"]+)"/i.exec(full)
    if (idM?.[1] && tgtM?.[1]) map.set(idM[1], tgtM[1])
  }
  return map
}

function collectEmbedIds(slideXml: string): string[] {
  const ids: string[] = []
  BLIP_EMBED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BLIP_EMBED_RE.exec(slideXml)) !== null) {
    if (m[1]) ids.push(m[1])
  }
  return ids
}

function slideIndexFromPath(name: string): number | null {
  const m = /ppt\/slides\/slide(\d+)\.xml$/i.exec(normalizeZipPath(name))
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

async function loadMediaIfEligible(
  zip: JSZip,
  mediaPath: string,
  page: number,
  out: EmbeddedMedia[],
  seen: Set<string>,
): Promise<void> {
  if (out.length >= MAX_EMBEDDED_IMAGES) return
  const path = normalizeZipPath(mediaPath)
  if (!IMAGE_EXT_RE.test(path)) return
  const file = zip.file(path)
  if (!file) return
  const bytes = Buffer.from(await file.async('uint8array'))
  if (bytes.length < MIN_IMAGE_BYTES) return
  const key = `${page}:${sha256Of(bytes)}`
  if (seen.has(key)) return
  seen.add(key)
  out.push({
    page,
    sha256: sha256Of(bytes),
    bytes,
  })
}

/** 从 .pptx ZIP 按 slide 抽取内嵌图 */
export async function extractPptxEmbeddedImages(blob: Buffer): Promise<EmbeddedMedia[]> {
  const zip = await JSZip.loadAsync(blob)
  const out: EmbeddedMedia[] = []
  const seen = new Set<string>()

  const slideEntries = Object.keys(zip.files)
    .map(name => ({ name: normalizeZipPath(name), idx: slideIndexFromPath(name) }))
    .filter((e): e is { name: string; idx: number } => e.idx !== null)
    .sort((a, b) => a.idx - b.idx)

  for (const entry of slideEntries) {
    if (out.length >= MAX_EMBEDDED_IMAGES) break
    const slideFile = zip.file(entry.name)
    if (!slideFile) continue
    const slideXml = await slideFile.async('string')
    const relsPath = entry.name.replace(
      /ppt\/slides\/(slide\d+\.xml)$/i,
      'ppt/slides/_rels/$1.rels',
    )
    const relsFile = zip.file(relsPath)
    const relMap = relsFile
      ? parseRelationships(await relsFile.async('string'))
      : new Map<string, string>()

    const embedIds = collectEmbedIds(slideXml)
    const targets = new Set<string>()
    for (const id of embedIds) {
      const t = relMap.get(id)
      if (t) targets.add(t)
    }
    // 关系表里声明为 image 但未在 blip 中引用的也纳入
    for (const [id, target] of relMap) {
      if (IMAGE_EXT_RE.test(target) || embedIds.includes(id)) {
        targets.add(target)
      }
    }

    const baseDir = entry.name.replace(/\/[^/]+$/, '')
    for (const target of targets) {
      const mediaPath = resolveRelTarget(baseDir, target)
      await loadMediaIfEligible(zip, mediaPath, entry.idx, out, seen)
      if (out.length >= MAX_EMBEDDED_IMAGES) break
    }
  }

  return out
}

/** 从 .docx ZIP 抽取内嵌图（一律挂 page=1） */
export async function extractDocxEmbeddedImages(blob: Buffer): Promise<EmbeddedMedia[]> {
  const zip = await JSZip.loadAsync(blob)
  const out: EmbeddedMedia[] = []
  const seen = new Set<string>()

  // 优先走 document 关系中的 image
  const relsFile = zip.file('word/_rels/document.xml.rels')
  if (relsFile) {
    const relMap = parseRelationships(await relsFile.async('string'))
    for (const target of relMap.values()) {
      if (!IMAGE_EXT_RE.test(target) && !/media\//i.test(target)) continue
      const mediaPath = resolveRelTarget('word', target)
      await loadMediaIfEligible(zip, mediaPath, 1, out, seen)
      if (out.length >= MAX_EMBEDDED_IMAGES) return out
    }
  }

  // 兜底：扫描 word/media/*
  for (const name of Object.keys(zip.files)) {
    if (out.length >= MAX_EMBEDDED_IMAGES) break
    const path = normalizeZipPath(name)
    if (!/^word\/media\//i.test(path)) continue
    await loadMediaIfEligible(zip, path, 1, out, seen)
  }

  return out
}
