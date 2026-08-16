#!/usr/bin/env node
/**
 * Stage bundled Opptrix-managed Python for electron-builder extraResources.
 *
 * Target: apps/desktop/resources/python/
 * Artifact: same catalog as online ensure_python (Win embed; mac/linux Miniconda).
 * Failure: hard fail (same bar as ffmpeg / sensevoice staging).
 *
 * Env:
 *   OPPTRIX_RUNTIME_PLATFORM / OPPTRIX_RUNTIME_ARCH — packaging target
 *   OPPTRIX_SKIP_STAGE_PYTHON=1 — skip (dev only; packaging must not set this)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { hostMatchesTarget, normalizeArch, resolveRuntimeTarget } from './lib/runtime-target.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '../..')
const TARGET_DIR = path.join(DESKTOP_ROOT, 'resources/python')
const CACHE_DIR = path.join(DESKTOP_ROOT, '.cache/python-artifacts')

function fail(msg) {
  console.error(`stage-python: FAILED — ${msg}`)
  process.exit(1)
}

function ok(msg) {
  console.log(`stage-python: ${msg}`)
}

function platformKeyFromTarget(platform, arch) {
  const a = normalizeArch(arch)
  if (platform === 'win32') return a === 'arm64' ? 'win-arm64' : 'win-amd64'
  if (platform === 'darwin') return a === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  if (platform === 'linux') return a === 'arm64' ? 'linux-arm64' : 'linux-x64'
  return null
}

async function importAgentPython() {
  const catalogUrl = pathToFileURL(
    path.join(REPO_ROOT, 'packages/agent-workspace/dist/python/catalog.js'),
  ).href
  const downloadUrl = pathToFileURL(
    path.join(REPO_ROOT, 'packages/agent-workspace/dist/python/download.js'),
  ).href
  const installerUrl = pathToFileURL(
    path.join(REPO_ROOT, 'packages/agent-workspace/dist/python/installer.js'),
  ).href
  const catalog = await import(catalogUrl)
  const download = await import(downloadUrl)
  const installer = await import(installerUrl)
  return { catalog, download, installer }
}

function assertPythonTree(root, platform) {
  const candidates = platform === 'win32'
    ? [path.join(root, 'python.exe'), path.join(root, 'Scripts', 'python.exe')]
    : [path.join(root, 'bin', 'python3'), path.join(root, 'bin', 'python')]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

async function main() {
  if (process.env.OPPTRIX_SKIP_STAGE_PYTHON === '1') {
    ok('skipped (OPPTRIX_SKIP_STAGE_PYTHON=1)')
    return
  }

  const target = resolveRuntimeTarget()
  const platformKey = platformKeyFromTarget(target.platform, target.arch)
  if (!platformKey) {
    fail(`unsupported target ${target.platform}-${target.arch}`)
  }

  ok(`target ${target.platform}-${target.arch} → ${platformKey}`)

  let catalog
  let download
  let installer
  try {
    ;({ catalog, download, installer } = await importAgentPython())
  } catch (err) {
    fail(
      `cannot import agent-workspace dist python modules — run build:packages first (${
        err instanceof Error ? err.message : err
      })`,
    )
  }

  const artifact = catalog.getPythonPlatformArtifact(platformKey)
  if (!artifact) {
    fail(`no catalog artifact for ${platformKey}`)
  }

  // Miniconda installer must run on matching OS; Win embed zip extracts anywhere.
  if (artifact.kind === 'miniconda' && target.platform !== process.platform) {
    fail(
      `cannot stage miniconda for ${target.platform} on host ${process.platform} — build on matching OS`,
    )
  }
  if (artifact.kind === 'miniconda' && !hostMatchesTarget(target)) {
    // Same OS, cross-arch: allow when Rosetta / qemu may run; still try and hard-fail on error.
    ok(`cross-arch miniconda stage (${process.arch} → ${target.arch}); probing host capability…`)
  }

  const existingBin = assertPythonTree(TARGET_DIR, target.platform)
  const manifestPath = path.join(TARGET_DIR, 'bundle-manifest.json')
  if (existingBin && fs.existsSync(manifestPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (prev.platformKey === platformKey && prev.version === artifact.version) {
        // Re-prune so CI reuse of a pre-fix fat tree still drops terminfo/pkgs (EMFILE).
        if (artifact.kind === 'miniconda') {
          await installer.pruneMinicondaStagedTree(TARGET_DIR)
          ok(`reuse existing tree (${existingBin}); re-pruned miniconda extras`)
        } else {
          ok(`reuse existing tree (${existingBin})`)
        }
        return
      }
    } catch {
      /* re-stage */
    }
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const archivePath = path.join(CACHE_DIR, artifact.filename)

  ok(`downloading ${artifact.filename}…`)
  try {
    await download.downloadPythonArtifact(artifact, archivePath)
  } catch (err) {
    fail(`download failed: ${err instanceof Error ? err.message : err}`)
  }

  const skipVersionProbe = artifact.kind === 'miniconda'
    ? !hostMatchesTarget(target)
    : target.platform !== process.platform

  ok(`materializing into ${TARGET_DIR}…`)
  try {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true })
    await installer.materializePythonArtifact(artifact, archivePath, TARGET_DIR, {
      clean: true,
      skipVersionProbe,
    })
  } catch (err) {
    fail(`materialize failed: ${err instanceof Error ? err.message : err}`)
  }

  const bin = assertPythonTree(TARGET_DIR, target.platform)
  if (!bin) {
    fail(`staged tree missing python binary under ${TARGET_DIR}`)
  }

  // Align with installer.pruneMinicondaStagedTree — pkgs/terminfo/docs/headers inflate
  // file count (~10k+) and trigger electron-builder EMFILE on macOS CI.
  if (artifact.kind === 'miniconda') {
    await installer.pruneMinicondaStagedTree(TARGET_DIR)
    ok('pruned miniconda install-only dirs (pkgs/terminfo/docs/headers/…)')
  }

  const bundleManifest = {
    version: artifact.version,
    platformKey: artifact.platformKey,
    kind: artifact.kind,
    stagedAt: new Date().toISOString(),
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(bundleManifest, null, 2)}\n`, 'utf8')

  // Size note for pack logs — lstat only; never follow symlinks (dangling → ENOENT).
  let totalBytes = 0
  const walk = (dir) => {
    let names
    try {
      names = fs.readdirSync(dir)
    } catch (err) {
      console.warn(`stage-python: walk skip ${dir}: ${err instanceof Error ? err.message : err}`)
      return
    }
    for (const name of names) {
      const p = path.join(dir, name)
      try {
        const st = fs.lstatSync(p)
        if (st.isSymbolicLink()) continue
        if (st.isDirectory()) walk(p)
        else totalBytes += st.size
      } catch (err) {
        console.warn(`stage-python: walk skip ${p}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }
  try {
    walk(TARGET_DIR)
    ok(`OK — ${bin} (~${(totalBytes / 1024 / 1024).toFixed(1)} MiB tree, kind=${artifact.kind})`)
  } catch (err) {
    console.warn(`stage-python: size walk failed: ${err instanceof Error ? err.message : err}`)
    ok(`OK — ${bin} (kind=${artifact.kind}; size unknown)`)
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})
