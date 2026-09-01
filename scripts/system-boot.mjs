#!/usr/bin/env node
/**
 * CLI for Docker / bare-Node bootloader steps using `@opptrix/system-update`.
 *
 * Subcommands:
 *   ensure            — mkdir layout; seed slots/<ver> from OPPTRIX_SEED_ROOT if no boot
 *   activate-pending  — if state.pendingVersion set, activate (boot←pending, backup←old)
 *   print-boot        — print absolute runtime root (boot symlink / pointer)
 *
 * Exit codes: 0 ok; 1 usage/error. Never touches OPPTRIX_DATA_DIR (user private data).
 *
 * ensure: first boot seeds slots/<ver>; when image seed > boot, flushes old hot pending
 * and stages image seed as pending. activate-pending skips if needsBaseRefresh.
 * Usage:
 *   node scripts/system-boot.mjs ensure [--version X]
 *   node scripts/system-boot.mjs activate-pending
 *   node scripts/system-boot.mjs print-boot
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

async function loadSystemUpdate() {
  const candidates = [
    path.join(REPO_ROOT, 'packages', 'system-update', 'dist', 'index.js'),
    path.join(process.cwd(), 'packages', 'system-update', 'dist', 'index.js'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return import(pathToFileURL(p).href)
    }
  }
  throw new Error(
    'Cannot load @opptrix/system-update dist (run npm run build -w @opptrix/system-update)',
  )
}

/**
 * Resolve seed version: --version > OPPTRIX_APP_VERSION > OPPTRIX_SEED_VERSION >
 * apps/desktop/package.json > package.json > 0.0.0-seed
 * @param {string | undefined} seedRoot
 * @param {string | undefined} fromArg
 */
function resolveSeedVersion(seedRoot, fromArg) {
  const arg = fromArg?.trim()
  if (arg) return arg

  const fromApp = process.env.OPPTRIX_APP_VERSION?.trim()
  if (fromApp) return fromApp

  const fromSeedEnv = process.env.OPPTRIX_SEED_VERSION?.trim()
  if (fromSeedEnv) return fromSeedEnv

  const root = seedRoot || process.env.OPPTRIX_SEED_ROOT?.trim() || REPO_ROOT
  for (const rel of ['apps/desktop/package.json', 'package.json']) {
    const pkgPath = path.join(root, rel)
    if (!fs.existsSync(pkgPath)) continue
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const v = typeof pkg.version === 'string' ? pkg.version.trim() : ''
      if (v) return v
    } catch {
      /* try next */
    }
  }
  return '0.0.0-seed'
}

function parseArgs(argv) {
  const args = [...argv]
  const cmd = args.shift()?.trim() || ''
  /** @type {Record<string, string | boolean>} */
  const flags = {}
  while (args.length) {
    const a = args.shift()
    if (!a) break
    if (a === '--version' || a === '-v') {
      flags.version = args.shift()?.trim() || ''
      continue
    }
    if (a.startsWith('--version=')) {
      flags.version = a.slice('--version='.length).trim()
      continue
    }
    if (a === '--help' || a === '-h') {
      flags.help = true
      continue
    }
    throw new Error(`unknown argument: ${a}`)
  }
  return { cmd, flags }
}

function usage() {
  process.stderr.write(`Usage:
  node scripts/system-boot.mjs ensure [--version X]
  node scripts/system-boot.mjs activate-pending
  node scripts/system-boot.mjs print-boot
`)
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {string | undefined} versionFlag
 */
function cmdEnsure(su, versionFlag) {
  const paths = su.ensureSeedLayoutDirs()
  const seedRoot = su.resolveSeedRoot()
  const version = resolveSeedVersion(seedRoot, typeof versionFlag === 'string' ? versionFlag : undefined)
  const bootVer = su.readBootVersion(paths.systemDir)

  if (!bootVer) {
    process.stderr.write(
      `[system-boot] ensure: seeding ${version} from ${seedRoot} → ${paths.systemDir}\n`,
    )
    const result = su.seedCurrentSlot({
      systemDir: paths.systemDir,
      seedRoot,
      version,
    })
    process.stderr.write(
      `[system-boot] ensure: ${result.seeded ? 'seeded' : 'skipped'} slot=${result.slotPath}\n`,
    )
    return
  }

  process.stderr.write(
    `[system-boot] ensure: boot already → ${bootVer} (${su.readDirectoryPointer(paths.bootLink)})\n`,
  )

  // Docker / 镜像升级：种子版本高于 boot 时写入 slots 并挂 pending，供 activate-pending + first-boot
  const promote = su.stageSeedVersionAsPending({
    systemDir: paths.systemDir,
    seedRoot,
    version,
  })
  if (promote.skipped) {
    process.stderr.write(
      `[system-boot] ensure: promote skipped (${promote.reason}) image=${version}\n`,
    )
    return
  }
  const flushNote = promote.flushedPending
    ? ` flushedOldPending=${promote.flushedPendingVersion ?? 'job'}`
    : ''
  process.stderr.write(
    `[system-boot] ensure: image ${version} > boot ${bootVer} → pending`
      + ` (${promote.reason})${flushNote} slot=${promote.slotPath}\n`,
  )
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 * @param {string} version
 */
function pendingNeedsBaseRefresh(su, version) {
  const root = su.resolveSystemDir()
  const dir = su.slotPath(root, version)
  const marker = su.readRuntimeMarker(dir)
  return su.evaluateRuntimeRequires(marker, {
    isDocker: su.isDockerEnv(),
    baseVersion: su.resolveHostBaseVersion(),
  })
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 */
function cmdActivatePending(su) {
  const root = su.resolveSystemDir()
  su.ensureLayout(root)
  const state = su.readState(root)
  if (!state.pendingVersion) {
    process.stderr.write('[system-boot] activate-pending: no pendingVersion — noop\n')
    return
  }
  const check = pendingNeedsBaseRefresh(su, state.pendingVersion)
  if (check.needsBaseRefresh) {
    process.stderr.write(
      `[system-boot] activate-pending: skip ${state.pendingVersion}`
        + ` (needsBaseRefresh: ${(check.reasons || []).join('; ') || 'host base incompatible'})\n`,
    )
    return
  }
  process.stderr.write(
    `[system-boot] activate-pending: ${state.pendingVersion} (was ${state.currentVersion ?? 'none'})\n`,
  )
  const result = su.activatePending({ systemDir: root })
  process.stderr.write(
    `[system-boot] activated → ${result.currentVersion} path=${result.slotPath}\n`,
  )
}

/**
 * @param {Awaited<ReturnType<typeof loadSystemUpdate>>} su
 */
function cmdPrintBoot(su) {
  const paths = su.resolveSystemPaths()
  const boot = su.readDirectoryPointer(paths.bootLink)
  if (!boot) {
    // Fallback: slots/<currentVersion> from state
    const state = su.readState(paths.systemDir)
    if (state.currentVersion) {
      const slot = su.slotPath(paths.systemDir, state.currentVersion)
      if (fs.existsSync(slot)) {
        process.stdout.write(`${slot}\n`)
        return
      }
    }
    throw new Error(
      `no boot pointer under ${paths.systemDir} (run ensure first)`,
    )
  }
  process.stdout.write(`${boot}\n`)
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2))
  if (flags.help || !cmd) {
    usage()
    process.exit(flags.help ? 0 : 1)
  }

  const su = await loadSystemUpdate()

  switch (cmd) {
    case 'ensure':
      cmdEnsure(su, typeof flags.version === 'string' ? flags.version : undefined)
      break
    case 'activate-pending':
      cmdActivatePending(su)
      break
    case 'print-boot':
      cmdPrintBoot(su)
      break
    default:
      usage()
      throw new Error(`unknown subcommand: ${cmd}`)
  }
}

main().catch((err) => {
  process.stderr.write(
    `[system-boot] ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
