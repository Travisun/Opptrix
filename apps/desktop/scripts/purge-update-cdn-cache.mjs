#!/usr/bin/env node
/**
 * Purge Cloudflare edge cache for desktop update metadata (latest-*.yml).
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, OPPTRIX_UPDATE_BASE_URL
 */
import { resolveUpdateFeedUrl } from './lib/update-feed-url.mjs'
import { UPDATE_YML_PUBLIC } from './lib/release-metadata-policy.mjs'

const YML_FILES = [...UPDATE_YML_PUBLIC]

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function purgeFiles(zoneId, token, urls) {
  const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: urls }),
  })

  const data = await resp.json()
  if (!resp.ok || !data.success) {
    const detail = data.errors?.map((e) => e.message).join('; ') || resp.statusText
    throw new Error(`Cloudflare purge failed: ${detail}`)
  }

  return data
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    console.log('[cdn] CLOUDFLARE_API_TOKEN not set — skipping cache purge')
    return
  }

  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const base = resolveUpdateFeedUrl()
  const urls = YML_FILES.map((name) => new URL(name, base).href)

  console.log(`[cdn] purging ${urls.length} URL(s) on zone ${zoneId}`)
  for (const url of urls) console.log(`  - ${url}`)

  const result = await purgeFiles(zoneId, token, urls)
  console.log(`[cdn] purge OK (${result.result?.id ?? 'done'})`)
}

main().catch((err) => {
  console.error('[cdn] purge failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
