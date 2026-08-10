#!/usr/bin/env node
/**
 * Purge Cloudflare edge cache for desktop update metadata + current release
 * installers (stale 404 HIT on AppImage/deb blocks Linux CDN after R2 upload).
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, OPPTRIX_UPDATE_BASE_URL
 * Optional: ASSET_DIR (release download dir) or argv[2] — when set, also purge
 *           AppImage / deb / *.opptrix-cms / *.blockmap present in that dir.
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveUpdateFeedUrl } from './lib/update-feed-url.mjs'
import { UPDATE_YML_PUBLIC } from './lib/release-metadata-policy.mjs'

const YML_FILES = [...UPDATE_YML_PUBLIC]
const EXTRA_NAME = /\.(AppImage|deb|opptrix-cms|blockmap)$/i

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function collectAssetNames(dir) {
  if (!dir || !fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => EXTRA_NAME.test(name))
}

async function purgeFiles(zoneId, token, urls) {
  // Cloudflare allows up to 30 URLs per files purge request on most plans.
  const chunkSize = 30
  let last = null
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize)
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: chunk }),
    })

    const data = await resp.json()
    if (!resp.ok || !data.success) {
      const detail = data.errors?.map((e) => e.message).join('; ') || resp.statusText
      throw new Error(`Cloudflare purge failed: ${detail}`)
    }
    last = data
  }
  return last
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    console.log('[cdn] CLOUDFLARE_API_TOKEN not set — skipping cache purge')
    return
  }

  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const base = resolveUpdateFeedUrl()
  const assetDir = process.argv[2] || process.env.ASSET_DIR || ''
  const extraNames = collectAssetNames(assetDir)
  const names = [...new Set([...YML_FILES, ...extraNames])]
  const urls = names.map((name) => new URL(name, base).href)

  console.log(`[cdn] purging ${urls.length} URL(s) on zone ${zoneId}`)
  if (assetDir) console.log(`[cdn] asset dir: ${path.resolve(assetDir)} (${extraNames.length} installer/CMS keys)`)
  for (const url of urls) console.log(`  - ${url}`)

  const result = await purgeFiles(zoneId, token, urls)
  console.log(`[cdn] purge OK (${result?.result?.id ?? 'done'})`)
}

main().catch((err) => {
  console.error('[cdn] purge failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
