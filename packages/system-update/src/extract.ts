/**
 * Extract update archives into slots and verify sha256 sidecars.
 * Supports `.tar.gz` always; `.tar.zst` when `zstd` is on PATH.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setPendingVersion } from './activate.js'
import { ensureLayout } from './layout.js'
import {
  assertSafeVersion,
  resolveSystemDir,
  resolveSystemPaths,
  slotPath,
} from './paths.js'
import { verifySlotDirectory } from './verify.js'

export interface ExtractOptions {
  archivePath: string
  version: string
  systemDir?: string
  /** Sidecar path; default `<archive>.sha256` or `<archivePath>.sha256`. */
  sha256Path?: string
  /** When set, compare to this hex instead of reading the sidecar (tests / callers). */
  expectedSha256?: string
  /** After extract+verify, set state.pendingVersion. Default true. */
  markPending?: boolean
}

export interface ExtractResult {
  version: string
  slotPath: string
  archivePath: string
  sha256: string
}

function readExpectedSha256(shaPath: string): string {
  const text = fs.readFileSync(shaPath, 'utf8').trim()
  const first = text.split(/\s+/)[0] ?? ''
  const hex = first.toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`invalid sha256 sidecar: ${shaPath}`)
  }
  return hex
}

export function sha256File(filePath: string): string {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

export function verifyArchiveSha256(
  archivePath: string,
  sha256Path?: string,
  expectedSha256?: string,
): string {
  const abs = path.resolve(archivePath)
  if (!fs.existsSync(abs)) throw new Error(`archive missing: ${abs}`)
  let expected: string
  if (expectedSha256 != null && String(expectedSha256).trim() !== '') {
    const hex = String(expectedSha256).trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      throw new Error(`invalid expected sha256: ${hex}`)
    }
    expected = hex
  } else {
    const sidecar = path.resolve(sha256Path ?? `${abs}.sha256`)
    if (!fs.existsSync(sidecar)) {
      throw new Error(`sha256 sidecar missing: ${sidecar}`)
    }
    expected = readExpectedSha256(sidecar)
  }
  const actual = sha256File(abs)
  if (actual !== expected) {
    throw new Error(`sha256 mismatch for ${abs}: expected ${expected}, got ${actual}`)
  }
  return actual
}

export function isZstdAvailable(): boolean {
  const r = spawnSync('zstd', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

function detectArchiveKind(archivePath: string): 'tar.gz' | 'tar.zst' {
  const lower = archivePath.toLowerCase()
  if (lower.endsWith('.tar.zst') || lower.endsWith('.tzst')) return 'tar.zst'
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.bin')) {
    return 'tar.gz'
  }
  throw new Error(`unsupported archive type (need .tar.gz, .bin, or .tar.zst): ${archivePath}`)
}

function runTarExtract(archivePath: string, destDir: string, kind: 'tar.gz' | 'tar.zst'): void {
  fs.mkdirSync(destDir, { recursive: true })
  if (kind === 'tar.gz') {
    const r = spawnSync(
      'tar',
      ['-xzf', archivePath, '-C', destDir],
      { encoding: 'utf8' },
    )
    if (r.status !== 0) {
      throw new Error(`tar extract failed: ${r.stderr || r.stdout || `exit ${r.status}`}`)
    }
    return
  }

  if (!isZstdAvailable()) {
    throw new Error('zstd not available; provide a .tar.gz archive instead')
  }
  // GNU/BSD tar: --use-compress-program=zstd
  const r = spawnSync(
    'tar',
    ['--use-compress-program=zstd', '-xf', archivePath, '-C', destDir],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`tar+zstd extract failed: ${r.stderr || r.stdout || `exit ${r.status}`}`)
  }
}

/** If archive contains a single top-level dir, return its path; else return destDir. */
function unwrapSingleRoot(destDir: string): string {
  const entries = fs.readdirSync(destDir).filter(n => !n.startsWith('.'))
  if (entries.length !== 1) return destDir
  const only = path.join(destDir, entries[0]!)
  if (fs.statSync(only).isDirectory()) return only
  return destDir
}

export function extractUpdateArchive(opts: ExtractOptions): ExtractResult {
  assertSafeVersion(opts.version)
  const root = resolveSystemDir(opts.systemDir)
  ensureLayout(root)
  const absArchive = path.resolve(opts.archivePath)
  const sha = verifyArchiveSha256(absArchive, opts.sha256Path, opts.expectedSha256)
  const kind = detectArchiveKind(absArchive)

  const { updateDir, slotsDir } = resolveSystemPaths(root)
  const staging = path.join(updateDir, `${opts.version}.staging`)
  const ready = path.join(updateDir, `${opts.version}.ready`)
  const destSlot = slotPath(root, opts.version)

  for (const p of [staging, ready]) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
  }
  fs.mkdirSync(staging, { recursive: true })

  runTarExtract(absArchive, staging, kind)
  const contentRoot = unwrapSingleRoot(staging)

  if (fs.existsSync(ready)) fs.rmSync(ready, { recursive: true, force: true })
  fs.renameSync(contentRoot, ready)

  const check = verifySlotDirectory(ready)
  if (!check.ok) {
    throw new Error(check.reason ?? 'extracted tree failed verification')
  }

  fs.mkdirSync(slotsDir, { recursive: true })
  if (fs.existsSync(destSlot)) fs.rmSync(destSlot, { recursive: true, force: true })
  fs.renameSync(ready, destSlot)

  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })

  if (opts.markPending !== false) {
    setPendingVersion(opts.version, root)
  }

  return {
    version: opts.version,
    slotPath: destSlot,
    archivePath: absArchive,
    sha256: sha,
  }
}
