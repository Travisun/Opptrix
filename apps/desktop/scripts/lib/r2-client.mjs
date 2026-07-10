import fs from 'node:fs'
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

/** Strip whitespace / accidental wrapping quotes from GitHub Secrets paste. */
export function cleanSecret(value) {
  return String(value ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
}

export function requireR2Env() {
  const names = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ]
  const missing = names.filter((name) => !cleanSecret(process.env[name]))
  if (missing.length > 0) {
    throw new Error(`Missing R2 env: ${missing.join(', ')}`)
  }

  const accountId = cleanSecret(process.env.R2_ACCOUNT_ID)
  const accessKeyId = cleanSecret(process.env.R2_ACCESS_KEY_ID)
  const secretAccessKey = cleanSecret(process.env.R2_SECRET_ACCESS_KEY)
  const bucket = cleanSecret(process.env.R2_BUCKET)

  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error(
      'R2_ACCOUNT_ID must be the 32-char Cloudflare Account ID (Dashboard → Overview), not Zone ID or bucket name',
    )
  }
  if (accessKeyId.startsWith('cfut_')) {
    throw new Error(
      'R2_ACCESS_KEY_ID looks like a Cloudflare API Token (cfut_…). Use R2 → Manage R2 API Tokens → S3 Access Key ID instead',
    )
  }
  if (secretAccessKey.length < 20) {
    throw new Error('R2_SECRET_ACCESS_KEY looks too short — re-copy the S3 Secret Access Key from R2 API Tokens')
  }

  return { accountId, accessKeyId, secretAccessKey, bucket }
}

export function r2Endpoint(accountId) {
  const override = cleanSecret(process.env.R2_ENDPOINT)
  if (override) return override
  const jurisdiction = cleanSecret(process.env.R2_JURISDICTION).toLowerCase()
  if (jurisdiction === 'eu') {
    return `https://${accountId}.eu.r2.cloudflarestorage.com`
  }
  return `https://${accountId}.r2.cloudflarestorage.com`
}

export function createR2Client({ accountId, accessKeyId, secretAccessKey }) {
  return new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(accountId),
    credentials: { accessKeyId, secretAccessKey },
  })
}

export function explainR2Error(err) {
  const name = err?.name ?? ''
  const message = err instanceof Error ? err.message : String(err)
  if (name === 'SignatureDoesNotMatch' || /signature we calculated does not match/i.test(message)) {
    return `${message}\n`
      + 'Hint: R2 S3 credentials mismatch — in GitHub Secrets re-set R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY '
      + 'as a pair from Cloudflare R2 → Manage R2 API Tokens (Object Read & Write). '
      + 'Do not use CLOUDFLARE_API_TOKEN or cfut_* tokens here. Also verify R2_ACCOUNT_ID is Account ID (32 hex).'
  }
  if (name === 'NoSuchBucket' || /NoSuchBucket/i.test(message)) {
    return `${message}\nHint: check R2_BUCKET matches the bucket name exactly.`
  }
  return message
}

/** Lightweight preflight: list bucket root (validates Account ID + key pair + bucket). */
export async function verifyR2Credentials(client, bucket) {
  await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    MaxKeys: 1,
  }))
}

export async function listObjectKeys(client, bucket, prefix) {
  const keys = []
  let continuationToken
  const normalized = prefix ? `${prefix.replace(/\/+$/, '')}/` : ''

  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalized || undefined,
      ContinuationToken: continuationToken,
    }))
    for (const item of resp.Contents ?? []) {
      if (item.Key) keys.push(item.Key)
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

export async function deleteObjectKeys(client, bucket, keys) {
  if (keys.length === 0) return 0
  let deleted = 0
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: chunk.map((Key) => ({ Key })),
        Quiet: true,
      },
    }))
    deleted += chunk.length
  }
  return deleted
}

export async function putObjectFile(client, bucket, key, filePath, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.readFileSync(filePath),
    ContentType: contentType,
  }))
}

export function contentTypeForFileName(name) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.yml')) return 'text/yaml; charset=utf-8'
  if (lower.endsWith('.blockmap')) return 'application/octet-stream'
  if (lower.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable'
  if (lower.endsWith('.dmg')) return 'application/x-apple-diskimage'
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.appimage')) return 'application/x-executable'
  if (lower.endsWith('.deb')) return 'application/vnd.debian.binary-package'
  return 'application/octet-stream'
}
