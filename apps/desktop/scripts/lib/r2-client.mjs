import fs from 'node:fs'
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

export function requireR2Env() {
  const names = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ]
  const missing = names.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`Missing R2 env: ${missing.join(', ')}`)
  }
  return {
    accountId: process.env.R2_ACCOUNT_ID.trim(),
    accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim(),
    bucket: process.env.R2_BUCKET.trim(),
  }
}

export function createR2Client({ accountId, accessKeyId, secretAccessKey }) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
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
