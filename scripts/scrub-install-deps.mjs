#!/usr/bin/env node
/**
 * After npm install: drop real browser ORT / ffmpeg-static and nested
 * duplicate transformers / onnxruntime-node trees that npm optionalDeps leave
 * behind (e.g. @lancedb/lancedb → transformers@3.0.2 → onnxruntime-node@1.19.2).
 *
 * Keeps the tiny `onnxruntime-web` file: stub (0.0.0-opptrix-stub) so npm does
 * not re-download the ~90MB browser package every install. Pack / Docker still
 * scrub *all* onnxruntime-web (including stub) via materialize + pack.
 *
 * Does **not** scrub nested ABI packages that may be the only install
 * (e.g. @lancedb/lancedb under packages/doc-library).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR_DIST = path.join(ROOT, 'packages/system-update/dist/vendor-fuse.js')
const STUB_ORT_WEB_VERSION = '0.0.0-opptrix-stub'

const NESTED_DEDUP_NAMES = new Set([
  '@huggingface/transformers',
  'onnxruntime-node',
  'onnxruntime-common',
])

/**
 * @param {string} pkgPath
 */
function isOrtWebStub(pkgPath) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8'))
    return j.name === 'onnxruntime-web' && j.version === STUB_ORT_WEB_VERSION
  } catch {
    return false
  }
}

/**
 * @param {string} root
 * @param {(dir: string) => string[]} listInstalled
 * @param {(dir: string, name: string) => string} packageInstallPath
 * @returns {string[]}
 */
function scrubRealForbidden(root, listInstalled, packageInstallPath) {
  const abs = path.resolve(root)
  const scrubbed = []

  function walk(dir, depth) {
    if (depth > 24) return
    let ents
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === '.git' || ent.name === 'dist-runtime') continue
      const full = path.join(dir, ent.name)
      if (ent.name === 'node_modules' && (ent.isDirectory() || ent.isSymbolicLink())) {
        for (const name of listInstalled(full)) {
          if (name !== 'onnxruntime-web' && name !== 'ffmpeg-static') continue
          const pkgPath = packageInstallPath(full, name)
          if (!fs.existsSync(pkgPath)) continue
          if (name === 'onnxruntime-web' && isOrtWebStub(pkgPath)) continue
          fs.rmSync(pkgPath, { recursive: true, force: true })
          scrubbed.push(name)
        }
        for (const name of listInstalled(full)) {
          const pkgPath = packageInstallPath(full, name)
          try {
            if (fs.statSync(pkgPath).isDirectory()) walk(pkgPath, depth + 1)
          } catch {
            /* ignore */
          }
        }
        continue
      }
      if (ent.isDirectory() && !ent.isSymbolicLink()) walk(full, depth + 1)
    }
  }

  walk(abs, 0)
  return scrubbed
}

/**
 * @param {string} root
 * @param {(dir: string) => string[]} listInstalled
 * @param {(dir: string, name: string) => string} packageInstallPath
 * @returns {string[]}
 */
function scrubNestedDedupCopies(root, listInstalled, packageInstallPath) {
  const abs = path.resolve(root)
  const rootNm = path.join(abs, 'node_modules')
  const scrubbed = []

  function rootHas(name) {
    return fs.existsSync(packageInstallPath(rootNm, name))
  }

  function walk(dir, depth) {
    if (depth > 24) return
    let ents
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name === '.git' || ent.name === 'dist-runtime') continue
      const full = path.join(dir, ent.name)
      if (ent.name === 'node_modules' && (ent.isDirectory() || ent.isSymbolicLink())) {
        const nmAbs = path.resolve(full)
        if (nmAbs !== path.resolve(rootNm)) {
          for (const name of listInstalled(full)) {
            if (!NESTED_DEDUP_NAMES.has(name)) continue
            if (name !== '@huggingface/transformers' && !rootHas(name)) continue
            const pkgPath = packageInstallPath(full, name)
            if (!fs.existsSync(pkgPath)) continue
            fs.rmSync(pkgPath, { recursive: true, force: true })
            scrubbed.push(name)
          }
        }
        for (const name of listInstalled(full)) {
          const pkgPath = packageInstallPath(full, name)
          try {
            if (fs.statSync(pkgPath).isDirectory()) walk(pkgPath, depth + 1)
          } catch {
            /* ignore */
          }
        }
        continue
      }
      if (ent.isDirectory() && !ent.isSymbolicLink()) walk(full, depth + 1)
    }
  }

  walk(abs, 0)
  return scrubbed
}

async function main() {
  const appNm = path.join(ROOT, 'node_modules')
  if (!fs.existsSync(appNm)) {
    console.log('[scrub-install-deps] skip (no node_modules)')
    return
  }
  if (!fs.existsSync(VENDOR_DIST)) {
    console.log('[scrub-install-deps] skip (build @opptrix/system-update first)')
    return
  }

  const vendor = await import(pathToFileURL(VENDOR_DIST).href)
  const { listInstalledPackageNames, packageInstallPath } = vendor

  const forbidden = scrubRealForbidden(ROOT, listInstalledPackageNames, packageInstallPath)
  const nestedDedup = scrubNestedDedupCopies(ROOT, listInstalledPackageNames, packageInstallPath)

  console.log(
    `[scrub-install-deps] forbidden=${forbidden.length} nestedDedup=${nestedDedup.length}`,
  )
  if (forbidden.length) {
    console.log(`[scrub-install-deps] removed forbidden: ${[...new Set(forbidden)].join(', ')}`)
  }
  if (nestedDedup.length) {
    console.log(`[scrub-install-deps] removed nested: ${[...new Set(nestedDedup)].join(', ')}`)
  }
}

main().catch((err) => {
  console.error(`[scrub-install-deps] ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
