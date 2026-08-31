#!/usr/bin/env node
/**
 * Bump @opptrix/selfhost, build bundle, create tag selfhost-v{version}.
 *
 * Tag lanes (do not confuse):
 *   selfhost-v*           — THIS script: CLI npm publish only
 *   opptrix-selfhost-v*   — App installable snapshots (clone/upgrade); NOT created here
 *   desktop-v*            — Desktop releases
 *
 * Usage:
 *   node scripts/release-selfhost.mjs           # patch bump
 *   node scripts/release-selfhost.mjs minor
 *   node scripts/release-selfhost.mjs 0.2.0
 *   node scripts/release-selfhost.mjs --no-bump # tag current version only
 *
 * Then: git push origin main && git push gitee main
 *       git push origin selfhost-vX.Y.Z && git push gitee selfhost-vX.Y.Z
 * CI (.github/workflows/publish-selfhost.yml) publishes to npm on the tag.
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
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
  return r
}

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
}

function writePkg(pkg) {
  fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

/**
 * @param {string} ver
 * @param {'major' | 'minor' | 'patch'} part
 */
function bumpSemver(ver, part) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(ver)
  if (!m) throw new Error(`invalid version: ${ver}`)
  let major = Number(m[1])
  let minor = Number(m[2])
  let patch = Number(m[3])
  if (part === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (part === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `${major}.${minor}.${patch}`
}

function main() {
  const args = process.argv.slice(2)
  const noBump = args.includes('--no-bump')
  const partOrVer = args.find((a) => !a.startsWith('--')) || 'patch'

  const pkg = readPkg()
  let next = pkg.version
  if (!noBump) {
    if (/^\d+\.\d+\.\d+/.test(partOrVer)) {
      next = partOrVer
    } else if (partOrVer === 'major' || partOrVer === 'minor' || partOrVer === 'patch') {
      next = bumpSemver(pkg.version, partOrVer)
    } else {
      console.error('Usage: node scripts/release-selfhost.mjs [patch|minor|major|x.y.z] [--no-bump]')
      process.exit(2)
    }
    pkg.version = next
    writePkg(pkg)
    console.log(`[release-selfhost] version ${next}`)
  } else {
    console.log(`[release-selfhost] keep version ${next}`)
  }

  run('npm', ['run', 'build', '-w', '@opptrix/selfhost'])

  const tag = `selfhost-v${next}`
  const status = run('git', ['status', '--porcelain'], { stdio: 'pipe' })
  const dirty = (status.stdout || '').trim()
  if (dirty) {
    console.log('[release-selfhost] working tree has changes — stage & commit before tagging:')
    console.log(dirty.split('\n').slice(0, 40).join('\n'))
    console.log(`\nAfter commit:\n  git tag -a ${tag} -m "Release @opptrix/selfhost ${next}"`)
    console.log(`  git push origin main && git push gitee main`)
    console.log(`  git push origin ${tag} && git push gitee ${tag}`)
    return
  }

  const existing = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (existing.status === 0) {
    console.error(`[release-selfhost] tag already exists: ${tag}`)
    process.exit(1)
  }

  run('git', ['tag', '-a', tag, '-m', `Release @opptrix/selfhost ${next}`])
  console.log(`[release-selfhost] created ${tag}`)
  console.log(`Push:\n  git push origin main && git push gitee main`)
  console.log(`  git push origin ${tag} && git push gitee ${tag}`)
}

main()
