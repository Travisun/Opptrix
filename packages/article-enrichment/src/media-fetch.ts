import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ensureDirAsync, getMediaCacheDir } from '@opptrix/local-inference'
import type { ScannedMedia } from './html-media-scan.js'

function extFromUrl(src: string, fallback: string): string {
  try {
    const u = new URL(src)
    const base = path.basename(u.pathname)
    const ext = path.extname(base)
    if (ext && ext.length <= 8) return ext
  } catch { /* ignore */ }
  return fallback
}

export async function fetchMediaToCache(item: ScannedMedia): Promise<string> {
  const hash = createHash('sha1').update(item.src).digest('hex')
  const ext = item.kind === 'image'
    ? extFromUrl(item.src, '.jpg')
    : extFromUrl(item.src, '.bin')
  const cacheDir = getMediaCacheDir()
  await ensureDirAsync(cacheDir)
  const target = path.join(cacheDir, `${item.id.replace(':', '_')}_${hash.slice(0, 10)}${ext}`)

  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    return target
  }

  const resp = await fetch(item.src, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Opptrix-Desktop/1.0' },
  })
  if (!resp.ok) {
    throw new Error(`下载媒体失败 HTTP ${resp.status}`)
  }
  const buf = Buffer.from(await resp.arrayBuffer())
  if (!buf.length) throw new Error('媒体文件为空')
  await fs.promises.writeFile(target, buf)
  return target
}
