#!/usr/bin/env node
/**
 * Upload self-host hot-update runtime (.bin + .sha256) and hot/check-update to R2.
 *
 * Usage:
 *   node scripts/sync-hot-to-r2.mjs --dir dist-runtime --version 1.4.0
 *   node scripts/sync-hot-to-r2.mjs --dir dist-runtime --version 1.4.0 --dry-run
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * Optional: OPPTRIX_UPDATE_CDN_BASE (default https://update.opptrix.org)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertObjectPresent,
  createR2Client,
  explainR2Error,
  putObjectFile,
  requireR2Env,
  verifyR2Credentials,
} from '../apps/desktop/scripts/lib/r2-client.mjs'
import {
  HOT_CHECK_UPDATE_KEY,
  buildCheckUpdatePayload,
  contentTypeForHotObjectKey,
  hotCheckUpdateUrl,
  normalizeCdnBase,
  resolveHotUploadPlan,
} from './lib/hot-cdn.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const HELP = `Usage: node scripts/sync-hot-to-r2.mjs [options]

Upload hot-update runtime package + check-update manifest to Cloudflare R2.

Options:
  --dir <dir>          Directory with pack output (default: dist-runtime)
  --version <semver>   Runtime version (X.Y.Z)
  --cdn-base <url>     Public CDN base (default: OPPTRIX_UPDATE_CDN_BASE or update.opptrix.org)
  --dry-run            Print plan; do not upload
  --help, -h

Env:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
  OPPTRIX_UPDATE_CDN_BASE
  OPPTRIX_RUNTIME_NODE_RANGE   Override requires.node in check-update
  OPPTRIX_MIN_BASE_IMAGE       Override requires.minBaseImage
`

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ dir: string, version: string | null, cdnBase: string | null, dryRun: boolean, help: boolean }} */
  const opts = {
    dir: path.resolve(__dirname, '..', 'dist-runtime'),
    version: process.env.OPPTRIX_APP_VERSION?.trim() || null,
    cdnBase: process.env.OPPTRIX_UPDATE_CDN_BASE?.trim() || null,
    dryRun: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--dir') opts.dir = path.resolve(String(argv[++i] ?? ''))
    else if (a === '--version') opts.version = String(argv[++i] ?? '').trim() || null
    else if (a === '--cdn-base') opts.cdnBase = String(argv[++i] ?? '').trim() || null
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return opts
}

/**
 * @param {import('@aws-sdk/client-s3').S3Client} client
 * @param {string} bucket
 * @param {string} key
 * @param {string} body
 * @param {string} contentType
 */
async function putObjectText(client, bucket, key, body, contentType) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3')
  const buf = Buffer.from(body, 'utf8')
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buf,
    ContentLength: buf.length,
    ContentType: contentType,
  }))
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  if (!opts.version) {
    console.error('Need --version or OPPTRIX_APP_VERSION')
    process.exit(2)
  }

  const cdnBase = normalizeCdnBase(opts.cdnBase)
  const plan = resolveHotUploadPlan(opts.dir, opts.version)
  const payload = buildCheckUpdatePayload({
    version: plan.version,
    cdnBase,
    binSize: plan.binSize,
    nodeRange: process.env.OPPTRIX_RUNTIME_NODE_RANGE?.trim(),
    minBaseImage: process.env.OPPTRIX_MIN_BASE_IMAGE?.trim(),
  })
  const checkUpdateJson = `${JSON.stringify(payload, null, 2)}\n`

  console.log(`[r2:hot] version=${plan.version} cdn=${cdnBase}`)
  console.log(`[r2:hot] bin key=${plan.files.packageKey} (${plan.binSize} bytes)`)
  console.log(`[r2:hot] sha256 key=${plan.files.sha256Key}`)
  console.log(`[r2:hot] manifest key=${HOT_CHECK_UPDATE_KEY}`)
  console.log(`[r2:hot] check-update URL=${hotCheckUpdateUrl(cdnBase)}`)

  if (opts.dryRun) {
    console.log('[r2:hot] dry-run: no upload')
    console.log('[r2:hot] check-update payload preview:')
    process.stdout.write(checkUpdateJson)
    process.exit(0)
  }

  const r2Env = requireR2Env()
  const client = createR2Client(r2Env)

  console.log(`[r2:hot] bucket=${r2Env.bucket}`)
  await verifyR2Credentials(client, r2Env.bucket)
  console.log('[r2:hot] credentials OK')

  await putObjectFile(
    client,
    r2Env.bucket,
    plan.files.packageKey,
    plan.files.binPath,
    contentTypeForHotObjectKey(plan.files.packageKey),
  )
  console.log(`[r2:hot] uploaded ${plan.files.packageKey}`)
  await assertObjectPresent(client, r2Env.bucket, plan.files.packageKey, plan.binSize)

  const sha256Size = fs.statSync(plan.files.sha256Path).size
  await putObjectFile(
    client,
    r2Env.bucket,
    plan.files.sha256Key,
    plan.files.sha256Path,
    contentTypeForHotObjectKey(plan.files.sha256Key),
  )
  console.log(`[r2:hot] uploaded ${plan.files.sha256Key}`)
  await assertObjectPresent(client, r2Env.bucket, plan.files.sha256Key, sha256Size)

  const manifestType = contentTypeForHotObjectKey(HOT_CHECK_UPDATE_KEY)
  await putObjectText(client, r2Env.bucket, HOT_CHECK_UPDATE_KEY, checkUpdateJson, manifestType)
  console.log(`[r2:hot] uploaded ${HOT_CHECK_UPDATE_KEY}`)
  await assertObjectPresent(client, r2Env.bucket, HOT_CHECK_UPDATE_KEY)

  console.log('[r2:hot] sync complete')
}

main().catch((err) => {
  console.error('[r2:hot] sync failed:', explainR2Error(err))
  process.exit(1)
})
