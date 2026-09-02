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
  HOT_CHECK_UPDATE_KEY,
  HOT_RELEASES_KEY,
  contentTypeForHotObjectKey,
  hotCheckUpdateUrl,
  hotReleasesUrl,
  normalizeCdnBase,
  prepareHotReleaseSync,
  resolveHotMultiArchUploadPlan,
} from './lib/hot-cdn.mjs'
import { loadReleaseNotesForVersion } from './lib/release-notes.mjs'

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
  const plan = resolveHotMultiArchUploadPlan(opts.dir, opts.version)
  const description = loadReleaseNotesForVersion(plan.version)
  const { releasesManifest, checkUpdate: payload } = await prepareHotReleaseSync({
    version: plan.version,
    cdnBase,
    packages: plan.packages,
    description,
    nodeRange: process.env.OPPTRIX_RUNTIME_NODE_RANGE?.trim(),
    minBaseImage: process.env.OPPTRIX_MIN_BASE_IMAGE?.trim(),
  })
  const checkUpdateJson = `${JSON.stringify(payload, null, 2)}\n`
  const releasesJson = `${JSON.stringify(releasesManifest, null, 2)}\n`

  console.log(`[r2:hot] version=${plan.version} cdn=${cdnBase}`)
  for (const archPlan of plan.archPlans) {
    console.log(
      `[r2:hot] ${archPlan.archKey} key=${archPlan.files.packageKey} (${archPlan.binSize} bytes)`,
    )
  }
  if (plan.legacy) {
    console.log(`[r2:hot] legacy x64 alias key=${plan.legacy.packageKey}`)
  }
  console.log(`[r2:hot] manifest key=${HOT_CHECK_UPDATE_KEY}`)
  console.log(`[r2:hot] releases key=${HOT_RELEASES_KEY} (${releasesManifest.releases.length} versions, max ${releasesManifest.retention.max})`)
  console.log(`[r2:hot] check-update URL=${hotCheckUpdateUrl(cdnBase)}`)
  console.log(`[r2:hot] releases URL=${hotReleasesUrl(cdnBase)}`)
  if (description.features.length || description.fixes.length) {
    console.log(`[r2:hot] release notes: ${description.features.length} features, ${description.fixes.length} fixes`)
  }

  if (opts.dryRun) {
    console.log('[r2:hot] dry-run: no upload')
    console.log('[r2:hot] check-update payload preview:')
    process.stdout.write(checkUpdateJson)
    console.log('[r2:hot] releases payload preview:')
    process.stdout.write(releasesJson)
    process.exit(0)
  }

  const {
    assertObjectPresent,
    createR2Client,
    explainR2Error,
    putObjectFile,
    requireR2Env,
    verifyR2Credentials,
  } = await import('../apps/desktop/scripts/lib/r2-client.mjs')

  const r2Env = requireR2Env()
  const client = createR2Client(r2Env)

  console.log(`[r2:hot] bucket=${r2Env.bucket}`)
  await verifyR2Credentials(client, r2Env.bucket)
  console.log('[r2:hot] credentials OK')

  /** @type {Array<{ packageKey: string, localPath: string, expectedSize?: number }>} */
  const uploads = []
  for (const archPlan of plan.archPlans) {
    uploads.push({
      packageKey: archPlan.files.packageKey,
      localPath: archPlan.files.binPath,
      expectedSize: archPlan.binSize,
    })
    uploads.push({
      packageKey: archPlan.files.sha256Key,
      localPath: archPlan.files.sha256Path,
    })
  }
  if (plan.legacy) {
    const legacyBin = plan.legacy.binPath
    const legacyAlreadyUploaded = plan.archPlans.some(
      (p) => p.archKey === 'linux-x64' && p.files.binPath === legacyBin,
    )
    if (!legacyAlreadyUploaded) {
      uploads.push({
        packageKey: plan.legacy.packageKey,
        localPath: plan.legacy.binPath,
        expectedSize: fs.statSync(plan.legacy.binPath).size,
      })
      uploads.push({
        packageKey: plan.legacy.sha256Key,
        localPath: plan.legacy.sha256Path,
      })
    }
  }

  for (const item of uploads) {
    await putObjectFile(
      client,
      r2Env.bucket,
      item.packageKey,
      item.localPath,
      contentTypeForHotObjectKey(item.packageKey),
    )
    console.log(`[r2:hot] uploaded ${item.packageKey}`)
    await assertObjectPresent(
      client,
      r2Env.bucket,
      item.packageKey,
      item.expectedSize,
    )
  }

  const manifestType = contentTypeForHotObjectKey(HOT_CHECK_UPDATE_KEY)
  await putObjectText(client, r2Env.bucket, HOT_CHECK_UPDATE_KEY, checkUpdateJson, manifestType)
  console.log(`[r2:hot] uploaded ${HOT_CHECK_UPDATE_KEY}`)
  await assertObjectPresent(client, r2Env.bucket, HOT_CHECK_UPDATE_KEY)

  const releasesType = contentTypeForHotObjectKey(HOT_RELEASES_KEY)
  await putObjectText(client, r2Env.bucket, HOT_RELEASES_KEY, releasesJson, releasesType)
  console.log(`[r2:hot] uploaded ${HOT_RELEASES_KEY}`)
  await assertObjectPresent(client, r2Env.bucket, HOT_RELEASES_KEY)

  console.log('[r2:hot] sync complete')
}

main().catch(async (err) => {
  let message = err instanceof Error ? err.message : String(err)
  try {
    const { explainR2Error } = await import('../apps/desktop/scripts/lib/r2-client.mjs')
    message = explainR2Error(err)
  } catch {
    // r2 helper may be unavailable after npm prune — keep raw message
  }
  console.error('[r2:hot] sync failed:', message)
  process.exit(1)
})
