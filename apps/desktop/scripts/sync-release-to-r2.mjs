#!/usr/bin/env node
/**
 * Upload current GitHub Release artifacts + latest-*.yml to Cloudflare R2 for
 * electron-updater (generic provider), then remove obsolete keys under the feed prefix.
 *
 * Upload order: binaries / signatures first (bounded concurrency), then latest-*.yml —
 * so the public feed never points at missing files, and the feed is not wiped before
 * uploads finish.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *      OPPTRIX_UPDATE_BASE_URL (public CDN URL, e.g. https://pub-xxx.r2.dev/desktop/),
 *      OPPTRIX_R2_UPLOAD_CONCURRENCY (default 4, clamped 1–8)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { r2KeyPrefixFromFeedUrl, resolveUpdateFeedUrl } from './lib/update-feed-url.mjs'
import { UPDATE_YML_PUBLIC } from './lib/release-metadata-policy.mjs'
import {
  assertObjectPresent,
  contentTypeForFileName,
  createR2Client,
  deleteObjectKeys,
  listObjectKeys,
  putObjectFile,
  requireR2Env,
  verifyR2Credentials,
  explainR2Error,
} from './lib/r2-client.mjs'

/** Includes Linux detached CMS signatures (`*.opptrix-cms`). */
const RELEASE_FILE = /\.(dmg|zip|exe|AppImage|deb|yml|blockmap|opptrix-cms)$/i
const DEFAULT_UPLOAD_CONCURRENCY = 4
const MIN_UPLOAD_CONCURRENCY = 1
const MAX_UPLOAD_CONCURRENCY = 8

function usage() {
  console.error('Usage: sync-release-to-r2.mjs <release-assets-dir>')
  process.exit(1)
}

export function shouldUpload(name) {
  if (!RELEASE_FILE.test(name)) return false
  if (/^latest-mac-(arm64|x64)\.yml$/i.test(name)) return false
  return true
}

/** Binaries / CMS / blockmaps before public latest-*.yml. */
export function compareUploadOrder(a, b) {
  const aYml = /\.yml$/i.test(a)
  const bYml = /\.yml$/i.test(b)
  if (aYml !== bYml) return aYml ? 1 : -1
  return a.localeCompare(b)
}

function isYmlName(name) {
  return /\.yml$/i.test(name)
}

/**
 * Split upload list into non-yml then yml batches (yml only after all binaries succeed).
 * @template {{ name: string }} T
 * @param {T[]} files
 * @returns {{ binaries: T[], ymls: T[] }}
 */
export function partitionUploadBatches(files) {
  const binaries = []
  const ymls = []
  for (const file of files) {
    if (isYmlName(file.name)) ymls.push(file)
    else binaries.push(file)
  }
  return { binaries, ymls }
}

/**
 * Resolve upload concurrency from env (default 4, clamped 1–8).
 * @param {string | undefined} raw
 */
export function resolveUploadConcurrency(raw = process.env.OPPTRIX_R2_UPLOAD_CONCURRENCY) {
  if (raw == null || String(raw).trim() === '') return DEFAULT_UPLOAD_CONCURRENCY
  const n = Number.parseInt(String(raw).trim(), 10)
  if (!Number.isFinite(n)) return DEFAULT_UPLOAD_CONCURRENCY
  return Math.min(MAX_UPLOAD_CONCURRENCY, Math.max(MIN_UPLOAD_CONCURRENCY, n))
}

/**
 * Run async work over items with a fixed concurrency pool.
 * Rejects on the first worker failure (remaining in-flight work may still settle).
 * @template T
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<unknown>} worker
 */
export async function mapPool(items, concurrency, worker) {
  if (items.length === 0) return
  const limit = Math.min(
    Math.max(MIN_UPLOAD_CONCURRENCY, Math.floor(concurrency) || DEFAULT_UPLOAD_CONCURRENCY),
    items.length,
  )
  let nextIndex = 0

  async function runWorker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()))
}

function collectUploadFiles(dir) {
  const names = fs.readdirSync(dir).filter(shouldUpload).sort(compareUploadOrder)
  if (names.length === 0) {
    throw new Error(`No release artifacts to upload under ${dir}`)
  }
  const required = [...UPDATE_YML_PUBLIC]
  for (const yml of required) {
    if (!names.includes(yml)) {
      throw new Error(`Missing ${yml} in ${dir} — finalize-release must complete first`)
    }
  }
  return names.map((name) => ({
    name,
    filePath: path.join(dir, name),
    size: fs.statSync(path.join(dir, name)).size,
  }))
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

async function main() {
  const sourceDir = process.argv[2]
  if (!sourceDir) usage()

  if (!process.env.R2_ACCESS_KEY_ID?.trim()) {
    console.log('[r2] R2_ACCESS_KEY_ID not set — skipping sync')
    return
  }

  const feedUrl = resolveUpdateFeedUrl()
  const prefix = r2KeyPrefixFromFeedUrl(feedUrl)
  const r2Env = requireR2Env()
  const client = createR2Client(r2Env)
  const files = collectUploadFiles(sourceDir)
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const keepKeys = new Set(files.map((f) => `${prefix}/${f.name}`))
  const concurrency = resolveUploadConcurrency()
  const { binaries, ymls } = partitionUploadBatches(files)

  console.log(`[r2] feed URL: ${feedUrl}`)
  console.log(`[r2] bucket: ${r2Env.bucket}  prefix: ${prefix}/`)
  console.log(`[r2] uploading ${files.length} file(s), ${formatBytes(totalBytes)} total`)
  console.log(
    `[r2] upload concurrency: ${concurrency} `
    + `(${binaries.length} binary/other, then ${ymls.length} yml)`,
  )

  await verifyR2Credentials(client, r2Env.bucket)
  console.log('[r2] credentials OK')

  async function uploadOne(file) {
    const key = `${prefix}/${file.name}`
    await putObjectFile(
      client,
      r2Env.bucket,
      key,
      file.filePath,
      contentTypeForFileName(file.name),
    )
    await assertObjectPresent(client, r2Env.bucket, key, file.size)
    console.log(`[r2] uploaded ${key} (${formatBytes(file.size)})`)
  }

  // All non-yml must succeed before any public feed yml is published.
  await mapPool(binaries, concurrency, uploadOne)
  await mapPool(ymls, concurrency, uploadOne)

  const existingKeys = await listObjectKeys(client, r2Env.bucket, prefix)
  const obsolete = existingKeys.filter((key) => !keepKeys.has(key))
  if (obsolete.length > 0) {
    console.log(`[r2] removing ${obsolete.length} obsolete object(s) under ${prefix}/`)
    await deleteObjectKeys(client, r2Env.bucket, obsolete)
  }

  // Prune must not remove the release we just published (key mismatch / listing bugs).
  for (const file of files) {
    const key = `${prefix}/${file.name}`
    await assertObjectPresent(client, r2Env.bucket, key, file.size)
  }
  console.log(`[r2] verified ${files.length} object(s) still present after prune`)

  console.log('[r2] sync complete — clients should read update metadata from:')
  console.log(`  macOS:   ${feedUrl}latest-mac.yml`)
  console.log(`  Windows: ${feedUrl}latest.yml`)
  console.log(`  Linux:   ${feedUrl}latest-linux.yml`)
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((err) => {
    console.error('[r2] sync failed:', explainR2Error(err))
    process.exit(1)
  })
}
