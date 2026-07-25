#!/usr/bin/env node
/**
 * Purge prior experts/ objects on Cloudflare R2, then upload experts/*.json.
 * Prefix is hardcoded to `experts` — never touches desktop/.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  contentTypeForFileName,
  createR2Client,
  deleteObjectKeys,
  explainR2Error,
  listObjectKeys,
  putObjectFile,
  requireR2Env,
  verifyR2Credentials,
} from './lib/r2-client.mjs'

const EXPERTS_PREFIX = 'experts'
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const EXPERTS_DIR = path.join(REPO_ROOT, 'experts')

function collectJsonFiles() {
  if (!fs.existsSync(EXPERTS_DIR)) {
    throw new Error(`Missing experts directory: ${EXPERTS_DIR}`)
  }
  const names = fs.readdirSync(EXPERTS_DIR)
    .filter(name => name.endsWith('.json'))
    .sort()
  if (names.length === 0) {
    throw new Error(`No JSON files under ${EXPERTS_DIR}`)
  }
  return names.map(name => ({
    name,
    filePath: path.join(EXPERTS_DIR, name),
    size: fs.statSync(path.join(EXPERTS_DIR, name)).size,
  }))
}

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID?.trim()) {
    console.log('[r2:experts] R2_ACCESS_KEY_ID not set — skipping sync')
    return
  }

  const r2Env = requireR2Env()
  const client = createR2Client(r2Env)
  const files = collectJsonFiles()

  console.log(`[r2:experts] bucket: ${r2Env.bucket}  prefix: ${EXPERTS_PREFIX}/`)
  console.log(`[r2:experts] uploading ${files.length} JSON file(s)`)

  await verifyR2Credentials(client, r2Env.bucket)
  console.log('[r2:experts] credentials OK')

  const existingKeys = await listObjectKeys(client, r2Env.bucket, EXPERTS_PREFIX)
  if (existingKeys.length > 0) {
    console.log(`[r2:experts] purging ${existingKeys.length} existing object(s) under ${EXPERTS_PREFIX}/`)
    await deleteObjectKeys(client, r2Env.bucket, existingKeys)
  }

  for (const file of files) {
    const key = `${EXPERTS_PREFIX}/${file.name}`
    await putObjectFile(
      client,
      r2Env.bucket,
      key,
      file.filePath,
      contentTypeForFileName(file.name),
    )
    console.log(`[r2:experts] uploaded ${key}`)
  }

  console.log('[r2:experts] sync complete')
}

main().catch((err) => {
  console.error('[r2:experts] sync failed:', explainR2Error(err))
  process.exit(1)
})
