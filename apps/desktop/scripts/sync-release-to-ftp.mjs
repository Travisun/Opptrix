#!/usr/bin/env node
/**
 * Upload current release assets to FTP (primary desktop distribution path).
 *
 * Upload order: binaries first, then latest-*.yml.
 * Then prune obsolete release artifacts under the remote directory.
 *
 * Env:
 *   FTP_HOST (required in CI; local may skip if unset)
 *   FTP_USERNAME / FTP_PASSWORD
 *   FTP_REMOTE_DIR (optional; default from OPPTRIX_UPDATE_BASE_URL path, e.g. /desktop)
 *   FTP_PORT (optional; default 21)
 *   FTP_SECURE (optional; "true" / "1" for explicit TLS)
 *   OPPTRIX_UPDATE_BASE_URL (optional; used for default remote dir)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'basic-ftp'
import { r2KeyPrefixFromFeedUrl, resolveUpdateFeedUrl } from './lib/update-feed-url.mjs'
import { UPDATE_YML_PUBLIC } from './lib/release-metadata-policy.mjs'
import { compareUploadOrder, shouldUpload } from './sync-release-to-r2.mjs'

function usage() {
  console.error('Usage: sync-release-to-ftp.mjs <release-assets-dir>')
  process.exit(1)
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function resolveRemoteDir() {
  const raw = String(process.env.FTP_REMOTE_DIR ?? '').trim()
  if (raw) {
    return raw.startsWith('/') ? raw.replace(/\/+$/, '') || '/' : `/${raw.replace(/\/+$/, '')}`
  }
  const prefix = r2KeyPrefixFromFeedUrl(resolveUpdateFeedUrl())
  return `/${prefix}`
}

function collectUploadFiles(dir) {
  const names = fs.readdirSync(dir).filter(shouldUpload).sort(compareUploadOrder)
  if (names.length === 0) {
    throw new Error(`No release artifacts to upload under ${dir}`)
  }
  for (const yml of UPDATE_YML_PUBLIC) {
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

function requireFtpEnv() {
  const host = String(process.env.FTP_HOST ?? '').trim()
  const user = String(process.env.FTP_USERNAME ?? '').trim()
  const password = String(process.env.FTP_PASSWORD ?? '')
  if (!host) throw new Error('FTP_HOST is required')
  if (!user) throw new Error('FTP_USERNAME is required')
  if (!password) throw new Error('FTP_PASSWORD is required')
  const port = Number(process.env.FTP_PORT ?? '21')
  const secureRaw = String(process.env.FTP_SECURE ?? '').trim().toLowerCase()
  const secure = secureRaw === '1' || secureRaw === 'true' || secureRaw === 'yes'
  return { host, user, password, port: Number.isFinite(port) && port > 0 ? port : 21, secure }
}

async function main() {
  const sourceDir = process.argv[2]
  if (!sourceDir) usage()

  if (!String(process.env.FTP_HOST ?? '').trim()) {
    console.log('[ftp] FTP_HOST not set — skipping sync')
    return
  }

  const ftp = requireFtpEnv()
  const remoteDir = resolveRemoteDir()
  const files = collectUploadFiles(sourceDir)
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const keepNames = new Set(files.map((f) => f.name))

  console.log(`[ftp] host: ${ftp.host}:${ftp.port} secure=${ftp.secure}`)
  console.log(`[ftp] remote dir: ${remoteDir}`)
  console.log(`[ftp] uploading ${files.length} file(s), ${formatBytes(totalBytes)} total`)

  const client = new Client(60 * 60 * 1000)
  client.ftp.verbose = process.env.FTP_VERBOSE === '1'
  try {
    await client.access({
      host: ftp.host,
      user: ftp.user,
      password: ftp.password,
      port: ftp.port,
      secure: ftp.secure,
    })
    await client.ensureDir(remoteDir)
    await client.cd(remoteDir)

    for (const file of files) {
      console.log(`[ftp] uploading ${file.name} (${formatBytes(file.size)})…`)
      await client.uploadFrom(file.filePath, file.name)
      console.log(`[ftp] uploaded ${file.name}`)
    }

    const listing = await client.list()
    const obsolete = listing
      .filter((entry) => entry.isFile && shouldUpload(entry.name) && !keepNames.has(entry.name))
      .map((entry) => entry.name)
    for (const name of obsolete) {
      console.log(`[ftp] removing obsolete ${name}`)
      await client.remove(name)
    }

    console.log(`[ftp] sync complete — ${files.length} file(s) under ${remoteDir}`)
  } finally {
    client.close()
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  main().catch((err) => {
    console.error('[ftp] sync failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
