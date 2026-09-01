/**
 * Snapshot / restore the main user-store SQLite file (+ WAL/SHM sidecars).
 */
import fs from 'node:fs'
import path from 'node:path'

export const MAIN_DB_BASENAME = 'opptrix.db'

export interface DbSnapshotManifest {
  files: string[]
  createdAt: string
}

const MANIFEST_NAME = 'manifest.json'

/** Collect main DB path and existing SQLite sidecar files. */
export function collectSqliteDataFiles(dbPath: string): string[] {
  const files = [dbPath]
  for (const suffix of ['.wal', '-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`
    if (fs.existsSync(sidecar)) files.push(sidecar)
  }
  return files
}

export function snapshotMainDatabase(opts: {
  dataFiles: string[]
  snapshotDir: string
}): DbSnapshotManifest {
  fs.mkdirSync(opts.snapshotDir, { recursive: true })
  const basenames: string[] = []
  for (const src of opts.dataFiles) {
    if (!fs.existsSync(src)) continue
    const base = path.basename(src)
    fs.copyFileSync(src, path.join(opts.snapshotDir, base))
    basenames.push(base)
  }
  const manifest: DbSnapshotManifest = {
    files: basenames,
    createdAt: new Date().toISOString(),
  }
  fs.writeFileSync(
    path.join(opts.snapshotDir, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  return manifest
}

export function restoreMainDatabase(opts: {
  snapshotDir: string
  dataFiles: string[]
}): void {
  const manifestPath = path.join(opts.snapshotDir, MANIFEST_NAME)
  if (!fs.existsSync(manifestPath)) {
    throw new Error('no snapshot manifest')
  }
  let manifest: DbSnapshotManifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DbSnapshotManifest
  } catch {
    throw new Error('invalid snapshot manifest')
  }
  const targetByBase = new Map<string, string>()
  for (const file of opts.dataFiles) {
    targetByBase.set(path.basename(file), file)
  }
  for (const base of manifest.files ?? []) {
    const src = path.join(opts.snapshotDir, base)
    const dest = targetByBase.get(base)
    if (!dest || !fs.existsSync(src)) continue
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

export function readDbSnapshotManifest(
  snapshotDir: string,
): DbSnapshotManifest | null {
  const manifestPath = path.join(snapshotDir, MANIFEST_NAME)
  if (!fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DbSnapshotManifest
  } catch {
    return null
  }
}

export function deleteDbSnapshotDir(snapshotDir: string): void {
  if (!fs.existsSync(snapshotDir)) return
  fs.rmSync(snapshotDir, { recursive: true, force: true })
}
