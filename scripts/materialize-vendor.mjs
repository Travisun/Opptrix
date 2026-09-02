#!/usr/bin/env node
/**
 * Move ABI-pinned packages from an app tree's node_modules into the Docker
 * vendor directory, then remove them from the app tree (incl. nested copies).
 *
 * Used at image build time so /app (bundled seed / hot-update shape) stays slim
 * while `/opt/opptrix/vendor/node_modules` holds natives.
 *
 * Usage:
 *   node scripts/materialize-vendor.mjs --app /app --vendor /opt/opptrix/vendor/node_modules
 *   node scripts/materialize-vendor.mjs --dry-run --app .
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ABI_PINNED_PACKAGE_NAMES,
  findAbiPinnedInTree,
  isAbiPinnedPackageName,
  listInstalledPackageNames,
  packageInstallPath,
  scrubNestedAbiPinnedCopies,
} from './lib/runtime-vendor.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  /** @type {{ app: string, vendor: string, dryRun: boolean, help: boolean }} */
  const opts = {
    app: process.cwd(),
    vendor: '/opt/opptrix/vendor/node_modules',
    dryRun: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--app') opts.app = path.resolve(String(argv[++i] ?? ''))
    else if (a === '--vendor') opts.vendor = path.resolve(String(argv[++i] ?? ''))
    else throw new Error(`unknown argument: ${a}`)
  }
  return opts
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {boolean} dryRun
 */
function movePackage(src, dest, dryRun) {
  if (!fs.existsSync(src)) return false
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
    fs.cpSync(src, dest, { recursive: true, dereference: true })
    fs.rmSync(src, { recursive: true, force: true })
  }
  return true
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(
      'Usage: node scripts/materialize-vendor.mjs --app <dir> --vendor <node_modules> [--dry-run]\n',
    )
    process.exit(0)
  }

  const appNm = path.join(opts.app, 'node_modules')
  if (!fs.existsSync(appNm)) {
    console.error(`[materialize-vendor] missing ${appNm}`)
    process.exit(1)
  }

  /** @type {string[]} */
  const moved = []
  const topNames = listInstalledPackageNames(appNm).filter((n) => isAbiPinnedPackageName(n))
  // Also pick prefix matches that listInstalled already returns (@img/sharp-*)
  for (const name of new Set([...ABI_PINNED_PACKAGE_NAMES, ...topNames])) {
    if (!isAbiPinnedPackageName(name)) continue
    const src = packageInstallPath(appNm, name)
    const dest = packageInstallPath(opts.vendor, name)
    if (!fs.existsSync(src)) continue
    if (movePackage(src, dest, opts.dryRun)) moved.push(name)
  }

  const scrubbed = scrubNestedAbiPinnedCopies(opts.app, appNm, { dryRun: opts.dryRun })
  const remaining = findAbiPinnedInTree(opts.app)

  console.log(
    `[materialize-vendor] app=${opts.app} vendor=${opts.vendor}`
      + ` moved=${moved.length} scrubbed=${scrubbed.length} remaining=${remaining.length}`
      + (opts.dryRun ? ' (dry-run)' : ''),
  )
  if (moved.length) console.log(`[materialize-vendor] moved: ${moved.join(', ')}`)
  if (remaining.length) {
    console.warn(`[materialize-vendor] WARNING still present: ${remaining.join(', ')}`)
    process.exitCode = 2
  }
}

try {
  main()
} catch (err) {
  console.error(`[materialize-vendor] ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
