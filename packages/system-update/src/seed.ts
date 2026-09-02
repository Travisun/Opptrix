/**
 * First-boot seed: copy runtime tree into `slots/<ver>` and point `boot`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { setPendingVersion } from './activate.js'
import { RUNTIME_MARKER_FILENAME } from './constants.js'
import { ensureLayout, pointBootToVersion, readBootVersion } from './layout.js'
import {
  assertSafeVersion,
  resolveSeedRoot,
  resolveSystemDir,
  resolveSystemPaths,
  slotPath,
} from './paths.js'
import {
  DEFAULT_RUNTIME_NODE_RANGE,
  readRuntimeMarker,
  writeRuntimeMarker,
} from './runtime-marker.js'
import { compareSemver } from './semver.js'
import { patchState, readState } from './state.js'
import { materializeExternalSymlinks } from './materialize-tree.js'
import { fuseVendorAbiIntoSlot } from './vendor-fuse.js'
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

export interface StageSeedPendingOptions {
  systemDir?: string
  seedRoot?: string
  version: string
}

export interface StageSeedPendingResult {
  staged: boolean
  pendingSet: boolean
  skipped: boolean
  reason: string
  version: string
  slotPath: string
  seedRoot: string
  /** True when a previous hot-update pending was discarded in favor of the image seed. */
  flushedPending: boolean
  flushedPendingVersion: string | null
}

function looksLikeRuntimeTree(root: string): boolean {
  const marker = path.join(root, RUNTIME_MARKER_FILENAME)
  const server = path.join(root, 'apps', 'server', 'dist', 'index.js')
  return fs.existsSync(marker) || fs.existsSync(server)
}

/**
 * Ensure slot has `opptrix-runtime.json` with `requires.minBaseImage` (底座依赖记录).
 * Hot-update packs already write this; Docker `/app` seed often does not until here.
 */
export function ensureRuntimeMarkerForSeed(slotDir: string, version: string): void {
  assertSafeVersion(version)
  const existing = readRuntimeMarker(slotDir)
  const fromEnv = process.env.OPPTRIX_MIN_BASE_IMAGE?.trim()
    || process.env.OPPTRIX_BASE_VERSION?.trim()
    || (process.env.OPPTRIX_RELEASE_TAG?.trim()?.startsWith('opptrix-selfhost-v')
      ? process.env.OPPTRIX_RELEASE_TAG.trim()
      : undefined)
  const minBaseImage = existing?.requires?.minBaseImage?.trim()
    || fromEnv
    || `opptrix-selfhost-v${version.trim()}`

  writeRuntimeMarker(slotDir, {
    version,
    requires: {
      node: existing?.requires?.node?.trim() || DEFAULT_RUNTIME_NODE_RANGE,
      ...(existing?.requires?.platforms?.length
        ? { platforms: existing.requires.platforms }
        : {}),
      minBaseImage,
      ...(existing?.requires?.requiresBaseRefresh === true
        ? { requiresBaseRefresh: true }
        : {}),
    },
    hooks: existing?.hooks ?? { postActivate: [] },
  })
}

function copySeedTree(seedRoot: string, dest: string, version: string): void {
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
  // Node may leave workspace package symlinks pointing outside `dest` even with
  // dereference:true — materialize so slot resolution never loads /app packages.
  materializeExternalSymlinks(dest)
  ensureRuntimeMarkerForSeed(dest, version)
  const check = verifySlotDirectory(dest)
  if (!check.ok) {
    throw new Error(check.reason ?? 'seeded slot failed verification')
  }
}

/** Drop hot-update pending / download job so Docker image seed becomes the authority. */
export function flushPendingUpdateState(systemDir?: string): {
  flushed: boolean
  previousPending: string | null
} {
  const root = resolveSystemDir(systemDir)
  const state = readState(root)
  const previousPending = state.pendingVersion
  if (!previousPending && !state.downloadJob) {
    return { flushed: false, previousPending: null }
  }
  patchState(
    {
      pendingVersion: null,
      downloadJob: null,
      uiPhase: state.uiPhase === 'wizard_apply' || state.uiPhase === 'first_boot_hooks'
        ? 'normal'
        : state.uiPhase,
      firstBootUpgrade: state.uiPhase === 'first_boot_hooks' ? null : state.firstBootUpgrade,
    },
    root,
  )
  return { flushed: Boolean(previousPending || state.downloadJob), previousPending }
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

  copySeedTree(seedRoot, dest, opts.version)
  fuseVendorAbiIntoSlot(dest)

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

/**
 * Docker 镜像升级路径：镜像种子版本高于当前 boot 时，**冲掉**旧热更新 pending，
 * 以 `/app` 种子写入 `slots/<ver>` 并设 pending，再由 `activate-pending` + first-boot
 *（库迁移 / postActivate；底座依赖见 marker `requires.minBaseImage`）。
 *
 * - 镜像版本 ≤ boot → noop（不冲 pending）
 * - 无 boot → 调用方应走 `seedCurrentSlot`
 */
export function stageSeedVersionAsPending(
  opts: StageSeedPendingOptions,
): StageSeedPendingResult {
  assertSafeVersion(opts.version)
  const systemDir = resolveSystemDir(opts.systemDir)
  const seedRoot = resolveSeedRoot(opts.seedRoot)
  const dest = slotPath(systemDir, opts.version)
  ensureLayout(systemDir)

  const bootVer = readBootVersion(systemDir)
  if (!bootVer) {
    return {
      staged: false,
      pendingSet: false,
      skipped: true,
      reason: 'no-boot-use-seedCurrentSlot',
      version: opts.version,
      slotPath: dest,
      seedRoot,
      flushedPending: false,
      flushedPendingVersion: null,
    }
  }

  if (compareSemver(opts.version, bootVer) <= 0) {
    return {
      staged: false,
      pendingSet: false,
      skipped: true,
      reason: 'image-not-newer',
      version: opts.version,
      slotPath: dest,
      seedRoot,
      flushedPending: false,
      flushedPendingVersion: null,
    }
  }

  const flushed = flushPendingUpdateState(systemDir)

  let staged = false
  const existingOk = fs.existsSync(dest) && verifySlotDirectory(dest).ok
  if (!existingOk) {
    copySeedTree(seedRoot, dest, opts.version)
    staged = true
  } else {
    ensureRuntimeMarkerForSeed(dest, opts.version)
  }
  fuseVendorAbiIntoSlot(dest)

  setPendingVersion(opts.version, systemDir)
  return {
    staged,
    pendingSet: true,
    skipped: false,
    reason: flushed.flushed
      ? (staged ? 'flushed-pending-seeded-image' : 'flushed-pending-reused-image-slot')
      : (staged ? 'seeded-as-pending' : 'reused-slot-as-pending'),
    version: opts.version,
    slotPath: dest,
    seedRoot,
    flushedPending: flushed.flushed,
    flushedPendingVersion: flushed.previousPending,
  }
}

export function ensureSeedLayoutDirs(systemDir?: string): ReturnType<typeof resolveSystemPaths> {
  ensureLayout(systemDir)
  return resolveSystemPaths(systemDir)
}
