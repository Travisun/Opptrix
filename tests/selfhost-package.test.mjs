/**
 * @opptrix/selfhost package — build, paths, CLI surface.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
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
  assert.equal(pkg.version, '0.1.7')
  assert.equal(pkg.opptrixSelfhost?.minAppTag, 'opptrix-selfhost-v1.3.6')
  assert.equal(pkg.opptrixSelfhost?.preferredAppTag, 'opptrix-selfhost-v1.4.2')
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
  assert.doesNotMatch(wf, /tags:\s*\n\s*-\s*'opptrix-selfhost-v\*'/)
})

test('Dockerfile materializes ABI vendor and enables boot CDN check', async () => {
  const df = await fs.promises.readFile(path.join(ROOT, 'Dockerfile'), 'utf8')
  assert.match(df, /materialize-vendor\.mjs/)
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
  assert.equal(meta.preferredAppTag, 'opptrix-selfhost-v1.4.2')
  assert.equal(meta.imageRepository, 'ghcr.io/travisun/opptrix')
})

test('docker-compose supports OPPTRIX_IMAGE override', async () => {
  const yml = await fs.promises.readFile(path.join(ROOT, 'docker-compose.yml'), 'utf8')
  assert.match(yml, /\$\{OPPTRIX_IMAGE:-opptrix:local\}/)
  assert.match(yml, /build:/)
})
