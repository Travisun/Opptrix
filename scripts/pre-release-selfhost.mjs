#!/usr/bin/env node
/**
 * One-shot self-host pre-release: bump CLI npm, sync app preferred tag, build bundle.
 *
 * After commit, create and push tags:
 *   selfhost-v{cli}             → publish-selfhost.yml (npm)
 *   opptrix-selfhost-v{app}     → base snapshot only (Docker image: manual workflow_dispatch)
 *   runtime-v{app}              → publish-runtime-assets.yml (CDN / Release assets)
 *
 * Usage:
 *   node scripts/pre-release-selfhost.mjs --cli 0.1.7 --app 1.4.0
 *   node scripts/pre-release-selfhost.mjs patch --app 1.4.0
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_PATH = path.join(ROOT, 'packages/selfhost/package.json')

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', shell: false })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
}

function writePkg(pkg) {
  fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

function bumpSemver(ver, part) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(ver)
  if (!m) throw new Error(`invalid version: ${ver}`)
  let major = Number(m[1])
  let minor = Number(m[2])
  let patch = Number(m[3])
  if (part === 'major') { major += 1; minor = 0; patch = 0 }
  else if (part === 'minor') { minor += 1; patch = 0 }
  else { patch += 1 }
  return `${major}.${minor}.${patch}`
}

function parseArgs(argv) {
  /** @type {{ cli?: string, app?: string, bump: string | null }} */
  const out = { bump: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--cli') out.cli = argv[++i]
    else if (a === '--app') out.app = argv[++i]
    else if (!a.startsWith('--')) out.bump = a
  }
  return out
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.app || !/^\d+\.\d+\.\d+/.test(opts.app)) {
    console.error('Usage: node scripts/pre-release-selfhost.mjs [--cli x.y.z] --app x.y.z [patch|minor|major]')
    process.exit(2)
  }

  const pkg = readPkg()
  const cliVer = opts.cli
    ?? (opts.bump && /^\d+\.\d+\.\d+/.test(opts.bump)
      ? opts.bump
      : bumpSemver(pkg.version, opts.bump || 'patch'))

  if (!/^\d+\.\d+\.\d+/.test(cliVer)) {
    console.error('[pre-release-selfhost] invalid CLI semver')
    process.exit(2)
  }

  const appTag = `opptrix-selfhost-v${opts.app}`
  pkg.version = cliVer
  const block = pkg.opptrixSelfhost && typeof pkg.opptrixSelfhost === 'object'
    ? pkg.opptrixSelfhost
    : {}
  block.preferredAppTag = appTag
  pkg.opptrixSelfhost = block
  writePkg(pkg)

  console.log(`[pre-release-selfhost] @opptrix/selfhost → ${cliVer}`)
  console.log(`[pre-release-selfhost] preferredAppTag → ${appTag}`)

  run('npm', ['run', 'build', '-w', '@opptrix/selfhost'])

  const cliTag = `selfhost-v${cliVer}`
  const runtimeTag = `runtime-v${opts.app}`
  console.log('\n[pre-release-selfhost] Next:')
  console.log('  git add -A && git commit -m "chore(selfhost): pre-release …"')
  console.log(`  git tag -a ${cliTag} -m "Release @opptrix/selfhost ${cliVer}"`)
  console.log(`  git tag -a ${appTag} -m "Release ${appTag}"`)
  console.log(`  git tag -a ${runtimeTag} -m "Release ${runtimeTag}"`)
  console.log('  git push origin main && git push gitee main')
  console.log(`  git push origin ${cliTag} ${appTag} ${runtimeTag} && git push gitee ${cliTag} ${appTag} ${runtimeTag}`)
  console.log('\nCI: npm publish (selfhost-v*) + runtime CDN (runtime-v*)')
  console.log(`Docker image: Actions → Publish selfhost image (workflow_dispatch, tag=${appTag})`)
}

main()
