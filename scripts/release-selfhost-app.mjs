#!/usr/bin/env node
/**
 * Tag opptrix-selfhost-v{version} for Docker / app snapshot (base image).
 *
 * Does NOT auto-publish: GHCR image workflow is workflow_dispatch only.
 * Runtime hot-update uses a separate tag: runtime-v{version} → publish-runtime-assets.yml
 *
 * Does NOT publish @opptrix/selfhost npm (use release-selfhost.mjs → selfhost-v*).
 *
 * Usage:
 *   node scripts/release-selfhost-app.mjs 1.4.0
 *   node scripts/release-selfhost-app.mjs 1.4.0 --sync-preferred
 *   node scripts/release-selfhost-app.mjs --no-bump 1.4.0   # tag only (version already set)
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_PATH = path.join(ROOT, 'packages/selfhost/package.json')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.stdio || 'inherit',
    shell: false,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
  return r
}

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
}

function writePkg(pkg) {
  fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

function parseSemver(ver) {
  if (!/^\d+\.\d+\.\d+([-+].*)?$/.test(ver)) {
    throw new Error(`invalid semver: ${ver}`)
  }
  return ver
}

function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')))
  const syncPreferred = flags.has('--sync-preferred')
  const noBump = flags.has('--no-bump')

  const rawVer = args[0]
  if (!rawVer) {
    console.error('Usage: node scripts/release-selfhost-app.mjs <x.y.z> [--sync-preferred] [--no-bump]')
    process.exit(2)
  }
  const version = parseSemver(rawVer)
  const tag = `opptrix-selfhost-v${version}`

  if (syncPreferred && !noBump) {
    const pkg = readPkg()
    const block = pkg.opptrixSelfhost && typeof pkg.opptrixSelfhost === 'object'
      ? pkg.opptrixSelfhost
      : {}
    block.preferredAppTag = tag
    pkg.opptrixSelfhost = block
    writePkg(pkg)
    console.log(`[release-selfhost-app] preferredAppTag → ${tag}`)
  }

  console.log(`[release-selfhost-app] base/app snapshot tag ${tag}`)
  console.log('[release-selfhost-app] Docker image: Actions → Publish selfhost image (workflow_dispatch)')
  console.log(`[release-selfhost-app] Runtime CDN: tag runtime-v${version} → publish-runtime-assets.yml`)

  const status = run('git', ['status', '--porcelain'], { stdio: 'pipe' })
  const dirty = (status.stdout || '').trim()
  if (dirty) {
    console.log('[release-selfhost-app] commit pending changes before tagging:')
    console.log(dirty.split('\n').slice(0, 40).join('\n'))
    console.log(`\nThen:\n  git tag -a ${tag} -m "Release ${tag}"`)
    console.log(`  git push origin main && git push gitee main`)
    console.log(`  git push origin ${tag} && git push gitee ${tag}`)
    console.log(`  # Manual: workflow_dispatch publish-selfhost-image with tag=${tag}`)
    console.log(`  # Runtime: git tag -a runtime-v${version} && push both remotes`)
    return
  }

  const existing = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (existing.status === 0) {
    console.error(`[release-selfhost-app] tag already exists: ${tag}`)
    process.exit(1)
  }

  run('git', ['tag', '-a', tag, '-m', `Release ${tag}`])
  console.log(`[release-selfhost-app] created ${tag}`)
  console.log(`Push:\n  git push origin main && git push gitee main`)
  console.log(`  git push origin ${tag} && git push gitee ${tag}`)
  console.log(`Then: workflow_dispatch publish-selfhost-image (tag=${tag})`)
  console.log(`Runtime pack: git tag -a runtime-v${version} -m "Release runtime-v${version}" && push both remotes`)
}

main()
