#!/usr/bin/env node
/**
 * Purge Cloudflare edge cache for remote expert catalog JSON.
 * Only purges experts/ URLs — never desktop/ update metadata.
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, OPPTRIX_EXPERT_CATALOG_BASE_URL
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_EXPERT_BASE_URL = 'https://update.opptrix.org/experts/'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const EXPERTS_DIR = path.join(REPO_ROOT, 'experts')

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function resolveExpertBaseUrl() {
  const raw = (process.env.OPPTRIX_EXPERT_CATALOG_BASE_URL ?? DEFAULT_EXPERT_BASE_URL).trim()
  return raw.endsWith('/') ? raw : `${raw}/`
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

function collectExpertJsonNames() {
  return fs.readdirSync(EXPERTS_DIR)
    .filter(name => name.endsWith('.json'))
    .sort()
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    console.log('[cdn:experts] CLOUDFLARE_API_TOKEN not set — skipping cache purge')
    return
  }

  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const base = resolveExpertBaseUrl()
  const names = collectExpertJsonNames()
  const urls = names.map(name => new URL(name, base).href)

  console.log(`[cdn:experts] purging ${urls.length} URL(s) on zone ${zoneId}`)
  for (const url of urls) console.log(`  - ${url}`)

  const result = await purgeFiles(zoneId, token, urls)
  console.log(`[cdn:experts] purge OK (${result.result?.id ?? 'done'})`)
}

main().catch((err) => {
  console.error('[cdn:experts] purge failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
