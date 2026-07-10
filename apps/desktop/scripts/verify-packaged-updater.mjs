#!/usr/bin/env node
/**
 * Fail CI if electron-builder output omits the staged updater vendor.
 * Run after `electron-builder` against apps/desktop/release/.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { UPDATER_ENTRY_MARKER } from './lib/updater-vendor-paths.mjs'

const ASAR_MARKER = `/${UPDATER_ENTRY_MARKER.replace(/\\/g, '/')}`

function fail(msg) {
  console.error(`verify-packaged-updater: ${msg}`)
  process.exit(1)
}

function findAsarFiles(releaseDir) {
  const found = []
  const stack = [releaseDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.name === 'app.asar') {
        found.push(full)
      }
    }
  }
  return found
}

function listAsar(asarPath) {
  const attempts = [
    ['npx', ['--yes', '@electron/asar', 'list', asarPath]],
    ['npx', ['--yes', 'asar', 'list', asarPath]],
  ]
  for (const [cmd, args] of attempts) {
    const result = spawnSync(cmd, args, { encoding: 'utf8' })
    if (result.status === 0 && result.stdout) {
      return result.stdout.split('\n')
    }
  }
  fail(`cannot list ${asarPath} — install @electron/asar or asar`)
}

function checkUnpacked(asarPath) {
  const unpackedRoot = asarPath.replace(/app\.asar$/, 'app.asar.unpacked')
  const markerOnDisk = path.join(unpackedRoot, UPDATER_ENTRY_MARKER)
  return fs.existsSync(markerOnDisk)
}

function verifyAsar(asarPath) {
  if (checkUnpacked(asarPath)) {
    console.log(`verify-packaged-updater: OK unpacked ${UPDATER_ENTRY_MARKER} (${asarPath})`)
    return true
  }

  const lines = listAsar(asarPath)
  const hit = lines.some((line) => line === ASAR_MARKER || line.endsWith(ASAR_MARKER))
  if (hit) {
    console.log(`verify-packaged-updater: OK asar ${ASAR_MARKER} (${asarPath})`)
    return true
  }
  return false
}

function main() {
  const releaseDir = process.argv[2] ?? path.resolve('release')
  if (!fs.existsSync(releaseDir)) {
    fail(`release dir not found: ${releaseDir}`)
  }

  const asarFiles = findAsarFiles(releaseDir)
  if (asarFiles.length === 0) {
    fail(`no app.asar under ${releaseDir} — run electron-builder first`)
  }

  let ok = 0
  for (const asarPath of asarFiles) {
    if (verifyAsar(asarPath)) ok++
  }

  if (ok === 0) {
    fail(
      `electron-updater vendor missing in all ${asarFiles.length} app.asar bundle(s). `
        + `Expected ${ASAR_MARKER}. `
        + 'Ensure stage-updater-deps.mjs runs before electron-builder and '
        + 'files includes build/updater-deps/**/* (not under a node_modules directory name).',
    )
  }

  console.log(`verify-packaged-updater: ${ok}/${asarFiles.length} bundle(s) contain updater vendor`)
}

main()
