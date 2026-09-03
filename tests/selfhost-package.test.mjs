/**
 * @opptrix/selfhost package — build, paths, CLI surface.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findFullSourceTree,
  isFullSourceTree,
  readPackageMeta,
  resolvePackageRoot,
} from '../packages/selfhost/src/paths.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI = path.join(ROOT, 'packages/selfhost/bin/opptrix.js')

test('selfhost package.json exposes bin opptrix', async () => {
  const pkg = JSON.parse(
    await fs.promises.readFile(path.join(ROOT, 'packages/selfhost/package.json'), 'utf8'),
  )
  assert.equal(pkg.name, '@opptrix/selfhost')
  assert.equal(pkg.bin.opptrix, 'bin/opptrix.js')
  assert.equal(pkg.publishConfig?.access, 'public')
  assert.equal(pkg.version, '0.1.9')
  assert.equal(pkg.opptrixSelfhost?.minAppTag, 'opptrix-selfhost-v1.3.6')
  assert.equal(pkg.opptrixSelfhost?.preferredAppTag, 'opptrix-selfhost-v1.4.5')
  assert.equal(pkg.opptrixSelfhost?.imageRepository, 'ghcr.io/travisun/opptrix')
})

test('root package.json bin points at packages/selfhost', async () => {
  const pkg = JSON.parse(await fs.promises.readFile(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.bin.opptrix, 'packages/selfhost/bin/opptrix.js')
})

test('build-bundle copies deploy assets', () => {
  const r = spawnSync('npm', ['run', 'build', '-w', '@opptrix/selfhost'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const bundle = path.join(ROOT, 'packages/selfhost/bundle')
  for (const rel of [
    'docker-compose.yml',
    'Dockerfile',
    'compose.env.example',
    '.dockerignore',
    'scripts/docker-entrypoint.sh',
    'BUILD.json',
  ]) {
    assert.ok(fs.existsSync(path.join(bundle, rel)), rel)
  }
})

test('resolvePackageRoot / monorepo detection', () => {
  const pkgRoot = resolvePackageRoot()
  assert.match(pkgRoot, /packages[/\\]selfhost$/)
  assert.equal(readPackageMeta().name, '@opptrix/selfhost')
  assert.equal(isFullSourceTree(ROOT), true)
  assert.equal(findFullSourceTree(path.join(ROOT, 'packages/selfhost/src')), ROOT)
})

test('opptrix help mentions prebuilt pull and --build', () => {
  const r = spawnSync(process.execPath, [CLI, 'help'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /@opptrix\/selfhost/)
  assert.match(r.stdout, /install-cli/)
  assert.match(r.stdout, /\btags\b/)
  assert.match(r.stdout, /opptrix-selfhost-v1\.4\.\d+/)
  assert.match(r.stdout, /预构建/)
  assert.match(r.stdout, /--build/)
  assert.match(r.stdout, /ghcr\.io\/travisun\/opptrix/)
  assert.match(r.stdout, /\bsetup\b/)
  assert.match(r.stdout, /\bdata\b/)
  assert.match(r.stdout, /\bport\b/)
  assert.match(r.stdout, /env keys|keys/)
  assert.match(r.stdout, /--agree-tos/)
})

test('opptrix env keys lists compose.env.example catalog', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-cli-env-keys-'))
  try {
    const r = spawnSync(process.execPath, [CLI, 'env', 'keys'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, OPPTRIX_DEPLOY_DIR: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /OPPTRIX_HOST_HTTPS_PORT/)
    assert.match(r.stdout, /已知环境变量|compose\.env\.example/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('opptrix port help lists status and set', () => {
  const r = spawnSync(process.execPath, [CLI, 'port', 'help'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /port status/)
  assert.match(r.stdout, /port set/)
})

test('opptrix setup --help lists options', () => {
  const r = spawnSync(process.execPath, [CLI, 'setup', '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /opptrix setup/)
  assert.match(r.stdout, /--mirror/)
  assert.match(r.stdout, /--data/)
  assert.match(r.stdout, /--agree-tos/)
  assert.match(r.stdout, /Docker/)
})

test('opptrix data help lists migrate', () => {
  const r = spawnSync(process.execPath, [CLI, 'data', 'help'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /data path/)
  assert.match(r.stdout, /migrate/)
  assert.match(r.stdout, /--dry-run/)
})

test('opptrix setup non-TTY writes defaults under OPPTRIX_DEPLOY_DIR', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-cli-setup-'))
  try {
    const r = spawnSync(process.execPath, [CLI, 'setup', '--agree-tos'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, OPPTRIX_DEPLOY_DIR: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /默认部署设置|部署设置已写入|非 TTY/)
    assert.ok(fs.existsSync(path.join(dir, '.opptrix.json')))
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.opptrix.json'), 'utf8'))
    assert.equal(cfg.setupCompleted, true)
    assert.equal(cfg.dataStorage, 'volume')
    assert.equal(cfg.userAgreementVersion, '2026-03')
    assert.ok(fs.existsSync(path.join(dir, 'compose.env')))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('opptrix data migrate --dry-run plans without Docker copy', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-cli-data-'))
  try {
    // seed host config as named volume
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.opptrix.json'),
      JSON.stringify({ setupCompleted: true, dataStorage: 'volume' }, null, 2),
    )
    // minimal compose so ensureThinDeploy / resolve may work — overlay from bundle via setup not required if we only dry-run
    const r = spawnSync(
      process.execPath,
      [CLI, 'data', 'migrate', '--to', path.join(dir, 'home'), '--dry-run'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, OPPTRIX_DEPLOY_DIR: dir },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /dry-run/)
    assert.match(r.stdout, /迁移计划|volume/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('publish-selfhost-image workflow is manual-only', async () => {
  const wf = await fs.promises.readFile(
    path.join(ROOT, '.github/workflows/publish-selfhost-image.yml'),
    'utf8',
  )
  assert.match(wf, /opptrix-selfhost-v/)
  assert.match(wf, /ghcr\.io/)
  assert.match(wf, /packages:\s*write/)
  assert.match(wf, /linux\/amd64/)
  assert.match(wf, /workflow_dispatch/)
  assert.doesNotMatch(wf, /^\s*push:\s*$/m)
  assert.doesNotMatch(wf, /tags:\s*\n\s*-\s*'opptrix-selfhost-v\*'/)
})

test('publish-runtime-assets workflow triggers on runtime-v*', async () => {
  const wf = await fs.promises.readFile(
    path.join(ROOT, '.github/workflows/publish-runtime-assets.yml'),
    'utf8',
  )
  assert.match(wf, /runtime-v\*/)
  assert.match(wf, /OPPTRIX_MIN_BASE_IMAGE/)
  assert.match(wf, /OPPTRIX_RUNTIME_RELEASE_TAG/)
  assert.match(wf, /preferredAppTag/)
  assert.match(wf, /materialize-vendor/)
  assert.match(wf, /OPPTRIX_PACK_ASSERT_NO_ABI/)
  assert.match(wf, /opptrix-runtime-\$\{\{\s*matrix\.platform_key\s*\}\}-v\*\.bin/)
  assert.match(wf, /Synthesize legacy x64 alias/)
  assert.doesNotMatch(wf, /tags:\s*\n\s*-\s*'opptrix-selfhost-v\*'/)
})

test('Dockerfile materializes ABI vendor and enables boot CDN check', async () => {
  const df = await fs.promises.readFile(path.join(ROOT, 'Dockerfile'), 'utf8')
  assert.match(df, /materialize-vendor\.mjs/)
  assert.match(df, /fuseVendorAbiIntoSlot\('\/app'/)
  assert.match(df, /OPPTRIX_VENDOR_NODE_MODULES=\/opt\/opptrix\/vendor\/node_modules/)
  assert.match(df, /OPPTRIX_BOOT_CDN_CHECK=1/)
  assert.match(df, /bootstrap-cdn-runtime\.mjs/)
})

test('entrypoint runs CDN bootstrap before system-boot ensure', async () => {
  const sh = await fs.promises.readFile(path.join(ROOT, 'scripts/docker-entrypoint.sh'), 'utf8')
  assert.match(sh, /bootstrap-cdn-runtime\.mjs/)
  assert.match(sh, /OPPTRIX_VENDOR_NODE_MODULES/)
  const bootIdx = sh.indexOf('BOOTSTRAP_CDN')
  const ensureIdx = sh.indexOf('"$SYSTEM_BOOT" ensure')
  assert.ok(bootIdx >= 0 && ensureIdx > bootIdx)
})

test('readPackageMeta exposes imageRepository', async () => {
  const { readPackageMeta } = await import('../packages/selfhost/src/paths.mjs')
  const meta = readPackageMeta()
  assert.equal(meta.minAppTag, 'opptrix-selfhost-v1.3.6')
  assert.equal(meta.preferredAppTag, 'opptrix-selfhost-v1.4.5')
  assert.equal(meta.imageRepository, 'ghcr.io/travisun/opptrix')
})

test('docker-compose supports OPPTRIX_IMAGE override', async () => {
  const yml = await fs.promises.readFile(path.join(ROOT, 'docker-compose.yml'), 'utf8')
  assert.match(yml, /\$\{OPPTRIX_IMAGE:-opptrix:local\}/)
  assert.match(yml, /build:/)
})

test('docker-compose publishes https 8712 only by default', async () => {
  const yml = await fs.promises.readFile(path.join(ROOT, 'docker-compose.yml'), 'utf8')
  assert.match(yml, /OPPTRIX_HOST_HTTPS_PORT:-8712/)
  assert.match(yml, /OPPTRIX_HTTPS_PORT/)
  assert.match(yml, /OPPTRIX_ENABLE_HTTP: "\$\{OPPTRIX_ENABLE_HTTP:-0\}"/)
  assert.match(yml, /CMD-SHELL.*curl -fsk https:\/\/127\.0\.0\.1:\$\{OPPTRIX_HTTPS_PORT:-8712\}\/api\/health/)
  assert.doesNotMatch(yml, /^\s+- "\$\{OPPTRIX_HOST_HTTP_PORT:-8711\}:8711"/m)
})

test('resolveHealthProbe defaults to https 8712', async () => {
  const { resolveHealthProbe } = await import('../packages/selfhost/src/compose.mjs')
  const probe = resolveHealthProbe(path.join(os.tmpdir(), 'opptrix-no-such-deploy'))
  assert.equal(probe.proto, 'https')
  assert.equal(probe.port, 8712)
  assert.equal(probe.url, 'https://127.0.0.1:8712/api/health')
})
