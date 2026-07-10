#!/usr/bin/env node
/** Preflight R2 S3 credentials (Account ID + access key pair + bucket). */
import {
  createR2Client,
  explainR2Error,
  requireR2Env,
  r2Endpoint,
  verifyR2Credentials,
} from './lib/r2-client.mjs'

async function main() {
  if (!process.env.R2_ACCESS_KEY_ID?.trim()) {
    console.log('[r2] R2_ACCESS_KEY_ID not set — skip verify')
    return
  }

  const env = requireR2Env()
  const client = createR2Client(env)
  console.log(`[r2] endpoint: ${r2Endpoint(env.accountId)}`)
  console.log(`[r2] bucket: ${env.bucket}`)
  await verifyR2Credentials(client, env.bucket)
  console.log('[r2] credentials OK')
}

main().catch((err) => {
  console.error('[r2] verify failed:', explainR2Error(err))
  process.exit(1)
})
