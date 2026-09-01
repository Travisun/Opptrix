/**
 * First-boot seed: copy runtime tree into `slots/<ver>` and point `boot`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME_MARKER_FILENAME } from './constants.js'
import { ensureLayout, pointBootToVersion, readBootVersion } from './layout.js'
import {
  assertSafeVersion,
  resolveSeedRoot,
  resolveSystemDir,
  resolveSystemPaths,
  slotPath,
} from './paths.js'
import { patchState, readState } from './state.js'
import { verifySlotDirectory } from './verify.js'

export { writeRuntimeMarker } from './runtime-marker.js'
export type { WriteRuntimeMarkerMeta } from './runtime-marker.js'

export interface SeedOptions {
  systemDir?: string
  seedRoot?: string
  version: string
  /** Force re-seed even if boot already points at a slot. */
  force?: boolean
}

export interface SeedResult {
  seeded: boolean
  skipped: boolean
  version: string
  slotPath: string
  seedRoot: string
}

function looksLikeRuntimeTree(root: string): boolean {
  const marker = path.join(root, RUNTIME_MARKER_FILENAME)
  const server = path.join(root, 'apps', 'server', 'dist', 'index.js')
  return fs.existsSync(marker) || fs.existsSync(server)
}

export function seedCurrentSlot(opts: SeedOptions): SeedResult {
  assertSafeVersion(opts.version)
  const systemDir = resolveSystemDir(opts.systemDir)
  const seedRoot = resolveSeedRoot(opts.seedRoot)
  const dest = slotPath(systemDir, opts.version)

  ensureLayout(systemDir)

  const bootVer = readBootVersion(systemDir)
  if (bootVer && !opts.force) {
    return {
      seeded: false,
      skipped: true,
      version: bootVer,
      slotPath: slotPath(systemDir, bootVer),
      seedRoot,
    }
  }

  if (!fs.existsSync(seedRoot) || !fs.statSync(seedRoot).isDirectory()) {
    throw new Error(`seed root missing: ${seedRoot}`)
  }

  if (!looksLikeRuntimeTree(seedRoot)) {
    throw new Error(
      `seed root is not an Opptrix runtime tree (missing marker or apps/server/dist/index.js): ${seedRoot}`,
    )
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true })
  }
  fs.cpSync(seedRoot, dest, { recursive: true, dereference: true })

  const check = verifySlotDirectory(dest)
  if (!check.ok) {
    throw new Error(check.reason ?? 'seeded slot failed verification')
  }

  pointBootToVersion(systemDir, opts.version)
  const prev = readState(systemDir)
  patchState(
    {
      currentVersion: opts.version,
      pendingVersion: prev.pendingVersion,
      backupVersion: prev.backupVersion,
      uiPhase: 'normal',
      firstBootUpgrade: null,
    },
    systemDir,
  )

  return {
    seeded: true,
    skipped: false,
    version: opts.version,
    slotPath: dest,
    seedRoot,
  }
}

export function ensureSeedLayoutDirs(systemDir?: string): ReturnType<typeof resolveSystemPaths> {
  ensureLayout(systemDir)
  return resolveSystemPaths(systemDir)
}
