#!/usr/bin/env node
/**
 * Self-host release preflight: npm pack, runtime pack, optional Docker build smoke.
 * Mirrors publish-selfhost.yml + publish-runtime-assets pack + publish-selfhost-image context checks.
 *
 * Usage:
 *   node scripts/audit-selfhost-release.mjs
 *   node scripts/audit-selfhost-release.mjs --all
 *   node scripts/audit-selfhost-release.mjs --npm --runtime
 *   node scripts/audit-selfhost-release.mjs --docker --version 9.9.9-ci
 *   node scripts/audit-selfhost-release.mjs --skip-build
 *
 * npm script:
 *   npm run audit:selfhost-release
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertCheckUpdateSmokeShape,
  verifyDockerBuildContext,
  verifyRuntimePackLayout,
  verifySelfhostBundle,
} from './lib/selfhost-release-checks.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SELFHOST = path.join(ROOT, 'packages/selfhost')

const HELP = `Usage: node scripts/audit-selfhost-release.mjs [options]

Preflight @opptrix/selfhost npm pack, runtime hot-update pack, and optional Docker build.

Options:
  --all              npm + runtime + docker context (+ docker build if docker CLI present)
  --npm              Verify selfhost bundle + npm pack --dry-run (default when no flags)
  --runtime          Build monorepo, pack runtime, verify CDN manifests (dry-run sync)
  --docker           docker build smoke (linux/amd64, load only)
  --skip-build       Skip npm run build / pack (reuse dist-runtime + existing bundle)
  --version <ver>    Runtime pack version (default: 9.9.9-ci)
  --platform-key <k> linux-x64 | linux-arm64 (default: linux-x64)
  --out-dir <dir>    Runtime output dir (default: dist-runtime)
  --help, -h
`

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, ...opts.env },
    shell: false,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{
   *   npm: boolean,
   *   runtime: boolean,
   *   docker: boolean,
   *   skipBuild: boolean,
   *   version: string,
   *   platformKey: string,
   *   outDir: string,
   *   help: boolean,
   * }} */
  const opts = {
    npm: false,
    runtime: false,
    docker: false,
    skipBuild: false,
    version: '9.9.9-ci',
    platformKey: process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64',
    outDir: path.join(ROOT, 'dist-runtime'),
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--all') { opts.npm = true; opts.runtime = true; opts.docker = true }
    else if (a === '--npm') opts.npm = true
    else if (a === '--runtime') opts.runtime = true
    else if (a === '--docker') opts.docker = true
    else if (a === '--skip-build') opts.skipBuild = true
    else if (a === '--version') opts.version = String(argv[++i] ?? '').trim() || opts.version
    else if (a === '--platform-key') opts.platformKey = String(argv[++i] ?? '').trim() || opts.platformKey
    else if (a === '--out-dir') opts.outDir = path.resolve(String(argv[++i] ?? ''))
    else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  if (!opts.npm && !opts.runtime && !opts.docker) opts.npm = true
  return opts
}

function step(label) {
  console.log(`\n[audit:selfhost] === ${label} ===`)
}

function auditNpm() {
  step('npm pack (@opptrix/selfhost)')
  run('npm', ['run', 'build', '-w', '@opptrix/selfhost'])
  verifySelfhostBundle(SELFHOST)
  console.log('[audit:selfhost] bundle checks OK')

  const pack = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: SELFHOST,
    encoding: 'utf8',
    shell: false,
  })
  if (pack.status !== 0) {
    process.stderr.write(pack.stderr || pack.stdout)
    process.exit(pack.status ?? 1)
  }
  const out = `${pack.stdout}${pack.stderr}`
  for (const needle of ['bin/opptrix.js', 'bundle/docker-compose.yml', 'bundle/Dockerfile']) {
    if (!out.includes(needle)) {
      throw new Error(`npm pack --dry-run output missing ${needle}`)
    }
  }
  console.log('[audit:selfhost] npm pack --dry-run OK')
}

function auditRuntime(opts) {
  step(`runtime pack (${opts.platformKey})`)
  if (!opts.skipBuild) {
    run('npm', ['run', 'build:packages'])
    run('npm', ['run', 'build', '-w', 'opptrix-client'])
    run('npm', ['prune', '--omit=dev'])
  }

  fs.mkdirSync(opts.outDir, { recursive: true })
  run(process.execPath, [
    path.join(ROOT, 'scripts/pack-opptrix-runtime.mjs'),
    '--version', opts.version,
    '--platform-key', opts.platformKey,
    '--out-dir', opts.outDir,
    '--also-platform-name',
  ], {
    env: {
      OPPTRIX_APP_VERSION: opts.version,
      OPPTRIX_RELEASE_TAG: `opptrix-selfhost-v${opts.version}`,
      OPPTRIX_MIN_BASE_IMAGE: `opptrix-selfhost-v${opts.version}`,
    },
  })

  const { plan, payload } = verifyRuntimePackLayout(opts.outDir, opts.version)
  assertCheckUpdateSmokeShape(payload, plan.version, Object.keys(plan.packages))
  console.log(`[audit:selfhost] runtime artifacts OK (${Object.keys(plan.packages).join(', ')})`)

  step('sync-hot-to-r2 dry-run')
  run(process.execPath, [
    path.join(ROOT, 'scripts/sync-hot-to-r2.mjs'),
    '--dir', opts.outDir,
    '--version', opts.version,
    '--dry-run',
  ])
  console.log('[audit:selfhost] CDN sync dry-run OK')
}

function auditDocker(opts) {
  step('Docker build context')
  verifyDockerBuildContext(ROOT)
  console.log('[audit:selfhost] Dockerfile context checks OK')

  const docker = spawnSync('docker', ['version'], { encoding: 'utf8', shell: false })
  if (docker.status !== 0) {
    console.log('[audit:selfhost] docker CLI unavailable — skipping image build (context checks passed)')
    return
  }

  step('docker build smoke (linux/amd64, load only)')
  const tag = `opptrix-audit:${opts.version}`
  run('docker', [
    'buildx', 'build',
    '--platform', 'linux/amd64',
    '--load',
    '-t', tag,
    '-f', 'Dockerfile',
    '--build-arg', 'NODE_VERSION=24',
    '--build-arg', `OPPTRIX_BASE_VERSION=opptrix-selfhost-v${opts.version}`,
    '--build-arg', `OPPTRIX_RELEASE_TAG=opptrix-selfhost-v${opts.version}`,
    '.',
  ])
  console.log(`[audit:selfhost] docker build OK → ${tag}`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  console.log('[audit:selfhost] preflight start')
  if (opts.npm) auditNpm()
  if (opts.runtime) auditRuntime(opts)
  if (opts.docker) auditDocker(opts)
  console.log('\n[audit:selfhost] all requested checks passed')
}

main().catch((err) => {
  console.error('[audit:selfhost] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
