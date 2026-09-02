#!/usr/bin/env node
/**
 * Upload runtime tarball + .sha256 sidecar to a Gitee release for tag
 * `runtime-v{VER}` (or explicit --tag).
 *
 * Requires GITEE_TOKEN (private token with projects write).
 * If token is absent, prints mirror steps and exits 0 (no-op) unless --require-token.
 *
 * Creates the Gitee Release when the git tag exists but no release row yet.
 *
 * Usage:
 *   GITEE_TOKEN=… node scripts/upload-runtime-gitee.mjs \
 *     --version 1.4.0 --dir dist-runtime
 *   node scripts/upload-runtime-gitee.mjs --help
 *
 * Gitee OpenAPI:
 *   GET  /api/v5/repos/{owner}/{repo}/releases/tags/{tag}
 *   POST /api/v5/repos/{owner}/{repo}/releases
 *   POST /api/v5/repos/{owner}/{repo}/releases/{id}/attach_files  (multipart)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = path.resolve(__dirname, '..')

const HELP = `Usage: node scripts/upload-runtime-gitee.mjs [options]

Upload opptrix-runtime assets to a Gitee Release.

Options:
  --version <semver>   Version → tag runtime-v{VER}
  --tag <tag>          Explicit release tag (overrides --version)
  --dir <dir>          Directory containing archives (default: dist-runtime)
  --repo <owner/repo>  Default: OPPTRIX_UPDATE_GITEE_REPO or Travisun/Opptrix
  --require-token      Exit 1 if GITEE_TOKEN missing (default: skip with instructions)
  --dry-run            List files that would upload
  --help, -h

Env:
  GITEE_TOKEN / OPPTRIX_UPDATE_GITEE_TOKEN
  OPPTRIX_UPDATE_GITEE_REPO
  OPPTRIX_UPDATE_GITEE_TARGET  Branch/SHA for create-release (default: main)
  OPPTRIX_APP_VERSION
`

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ version: string | null, tag: string | null, dir: string, repo: string, requireToken: boolean, dryRun: boolean, help: boolean }} */
  const opts = {
    version: process.env.OPPTRIX_APP_VERSION?.trim() || null,
    tag: null,
    dir: path.join(DEFAULT_ROOT, 'dist-runtime'),
    repo:
      (process.env.OPPTRIX_UPDATE_GITEE_REPO ?? 'Travisun/Opptrix').trim()
      || 'Travisun/Opptrix',
    requireToken: false,
    dryRun: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--require-token') opts.requireToken = true
    else if (a === '--version') opts.version = String(argv[++i] ?? '').trim() || null
    else if (a === '--tag') opts.tag = String(argv[++i] ?? '').trim() || null
    else if (a === '--dir') opts.dir = path.resolve(String(argv[++i] ?? ''))
    else if (a === '--repo') opts.repo = String(argv[++i] ?? '').trim() || opts.repo
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return opts
}

/**
 * @param {string} version
 */
function tagForVersion(version) {
  const v = version.trim().replace(/^v/, '')
  return `runtime-v${v}`
}

/**
 * @param {string} dir
 * @param {string} version
 */
function collectAssets(dir, version) {
  const v = version.trim().replace(/^v/, '')
  const names = [
    `opptrix-runtime-v${v}.bin`,
    `opptrix-runtime-v${v}.sha256`,
    `opptrix-runtime-linux-x64-v${v}.bin`,
    `opptrix-runtime-linux-x64-v${v}.sha256`,
    `opptrix-runtime-linux-arm64-v${v}.bin`,
    `opptrix-runtime-linux-arm64-v${v}.sha256`,
    `opptrix-runtime-v${v}.tar.gz`,
    `opptrix-runtime-v${v}.tar.gz.sha256`,
    `opptrix-runtime-linux-x64-v${v}.tar.gz`,
    `opptrix-runtime-linux-x64-v${v}.tar.gz.sha256`,
    `opptrix-runtime-linux-arm64-v${v}.tar.gz`,
    `opptrix-runtime-linux-arm64-v${v}.tar.gz.sha256`,
  ]
  /** @type {string[]} */
  const files = []
  for (const name of names) {
    const p = path.join(dir, name)
    if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p)
  }
  return files
}

function printManualMirror(tag, files) {
  console.log('')
  console.log('=== Manual Gitee mirror (no GITEE_TOKEN) ===')
  console.log(`1. Open https://gitee.com and ensure release tag exists: ${tag}`)
  console.log('2. Upload these files as release attachments:')
  for (const f of files) console.log(`   - ${f}`)
  console.log('3. Or set GITEE_TOKEN and re-run this script.')
  console.log('')
}

/**
 * @param {unknown} json
 * @returns {number | null}
 */
export function parseGiteeReleaseId(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const id = /** @type {{ id?: unknown }} */ (json).id
  return typeof id === 'number' && Number.isFinite(id) ? id : null
}

/**
 * @param {string} repo
 * @returns {{ owner: string, name: string }}
 */
function splitRepo(repo) {
  const [owner, name] = repo.split('/').filter(Boolean)
  if (!owner || !name) throw new Error(`invalid repo: ${repo}`)
  return { owner, name }
}

/**
 * @param {string} tag
 * @param {{ token: string, targetCommitish?: string, body?: string }} opts
 * @returns {URLSearchParams}
 */
export function buildGiteeCreateReleaseForm(tag, opts) {
  const target =
    (opts.targetCommitish ?? process.env.OPPTRIX_UPDATE_GITEE_TARGET ?? 'main').trim()
    || 'main'
  const body = new URLSearchParams()
  body.set('access_token', opts.token)
  body.set('tag_name', tag)
  body.set('name', tag)
  body.set('body', opts.body ?? `Opptrix runtime hot-update assets for ${tag}`)
  body.set('prerelease', 'false')
  // Gitee OpenAPI requires target_commitish (branch or commit SHA).
  body.set('target_commitish', target)
  return body
}

/**
 * @param {string} repo
 * @param {string} tag
 * @param {string} token
 */
async function createRelease(repo, tag, token) {
  const { owner, name } = splitRepo(repo)
  const url = `https://gitee.com/api/v5/repos/${owner}/${name}/releases`
  const body = buildGiteeCreateReleaseForm(tag, { token })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Opptrix-runtime-upload',
    },
    body,
  })
  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  const id = parseGiteeReleaseId(json)
  if (!res.ok || id == null) {
    // Race / already created: re-lookup by tag before failing hard.
    if (res.status === 400 || res.status === 422) {
      const again = await fetchReleaseByTag(repo, tag, token)
      if (again) return again
    }
    throw new Error(
      `Gitee release create failed (${res.status}): ${(text || '').slice(0, 300)}`,
    )
  }
  console.log(
    `[upload-runtime-gitee] created Gitee release id=${id} for ${tag}`
      + ` (target_commitish=${body.get('target_commitish')})`,
  )
  return { owner, name, id }
}

/**
 * @param {string} repo
 * @param {string} tag
 * @param {string} token
 * @returns {Promise<{ owner: string, name: string, id: number } | null>}
 */
async function fetchReleaseByTag(repo, tag, token) {
  const { owner, name } = splitRepo(repo)
  const url =
    `https://gitee.com/api/v5/repos/${owner}/${name}/releases/tags/${encodeURIComponent(tag)}`
    + `?access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Opptrix-runtime-upload' },
  })
  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) return null
  const id = parseGiteeReleaseId(json)
  if (id == null) return null
  return { owner, name, id }
}

/**
 * Lookup release by tag; create when missing (404 / empty id).
 * @param {string} repo
 * @param {string} tag
 * @param {string} token
 */
async function ensureRelease(repo, tag, token) {
  const existing = await fetchReleaseByTag(repo, tag, token)
  if (existing) return existing

  console.warn(
    `[upload-runtime-gitee] no Gitee release for ${tag}; creating…`,
  )
  return createRelease(repo, tag, token)
}

/**
 * @param {{ owner: string, name: string, id: number }} release
 * @param {string} filePath
 * @param {string} token
 */
async function uploadAttach(release, filePath, token) {
  const url =
    `https://gitee.com/api/v5/repos/${release.owner}/${release.name}/releases/`
    + `${release.id}/attach_files?access_token=${encodeURIComponent(token)}`
  const buf = fs.readFileSync(filePath)
  const blob = new Blob([buf])
  const form = new FormData()
  form.append('file', blob, path.basename(filePath))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': 'Opptrix-runtime-upload' },
    body: form,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Gitee attach failed for ${path.basename(filePath)} (${res.status}): ${body.slice(0, 300)}`,
    )
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  const version = (opts.version || '').trim().replace(/^v/, '')
  const tag = opts.tag || (version ? tagForVersion(version) : null)
  if (!tag) {
    console.error('Need --version or --tag')
    process.exit(2)
  }
  if (!version && !opts.tag) {
    console.error('Need --version to discover asset filenames (or --tag with matching files)')
    process.exit(2)
  }

  const verForFiles = version || tag.replace(/^(?:opptrix-selfhost-v|runtime-v)/, '')
  const files = collectAssets(opts.dir, verForFiles)
  if (files.length === 0) {
    console.error(`No runtime assets found in ${opts.dir}`)
    process.exit(1)
  }

  console.log(`[upload-runtime-gitee] tag=${tag} repo=${opts.repo}`)
  for (const f of files) console.log(`  asset ${path.basename(f)}`)

  if (opts.dryRun) {
    console.log('[upload-runtime-gitee] dry-run: no upload')
    process.exit(0)
  }

  const token =
    process.env.GITEE_TOKEN?.trim()
    || process.env.OPPTRIX_UPDATE_GITEE_TOKEN?.trim()
    || ''

  if (!token) {
    printManualMirror(tag, files)
    if (opts.requireToken) process.exit(1)
    process.exit(0)
  }

  const release = await ensureRelease(opts.repo, tag, token)
  for (const f of files) {
    console.log(`[upload-runtime-gitee] uploading ${path.basename(f)} …`)
    await uploadAttach(release, f, token)
  }
  console.log('[upload-runtime-gitee] done')
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
