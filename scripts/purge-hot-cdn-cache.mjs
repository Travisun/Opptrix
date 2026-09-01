#!/usr/bin/env node
/**
 * Purge Cloudflare edge cache for self-host hot-update CDN objects.
 * Only purges hot/check-update and version-specific package URLs.
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID
 * Args: --version X.Y.Z [--cdn-base URL]
 */
import {
  hotCheckUpdateUrl,
  hotPurgeUrls,
  normalizeCdnBase,
  normalizeHotVersion,
} from './lib/hot-cdn.mjs'

const HELP = `Usage: node scripts/purge-hot-cdn-cache.mjs --version X.Y.Z [--cdn-base URL]

Purge Cloudflare cache for hot/check-update and package URLs for the version.
`

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ version: string | null, cdnBase: string | null, help: boolean }} */
  const opts = {
    version: process.env.OPPTRIX_APP_VERSION?.trim() || null,
    cdnBase: process.env.OPPTRIX_UPDATE_CDN_BASE?.trim() || null,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--version') opts.version = String(argv[++i] ?? '').trim() || null
    else if (a === '--cdn-base') opts.cdnBase = String(argv[++i] ?? '').trim() || null
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return opts
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

/**
 * @param {string} zoneId
 * @param {string} token
 * @param {string[]} urls
 */
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
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    console.log('[cdn:hot] CLOUDFLARE_API_TOKEN not set — skipping cache purge')
    return
  }

  if (!opts.version) {
    console.error('Need --version or OPPTRIX_APP_VERSION')
    process.exit(2)
  }

  const version = normalizeHotVersion(opts.version)
  const cdnBase = normalizeCdnBase(opts.cdnBase)
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const urls = hotPurgeUrls(version, cdnBase)

  console.log(`[cdn:hot] purging ${urls.length} URL(s) on zone ${zoneId}`)
  console.log(`[cdn:hot] check-update=${hotCheckUpdateUrl(cdnBase)}`)
  for (const url of urls) console.log(`  - ${url}`)

  const result = await purgeFiles(zoneId, token, urls)
  console.log(`[cdn:hot] purge OK (${result.result?.id ?? 'done'})`)
}

main().catch((err) => {
  console.error('[cdn:hot] purge failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
