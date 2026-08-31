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
  assert.equal(pkg.version, '0.1.5')
  assert.equal(pkg.opptrixSelfhost?.minAppTag, 'opptrix-selfhost-v1.3.6')
  assert.equal(pkg.opptrixSelfhost?.preferredAppTag, 'opptrix-selfhost-v1.3.6')
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

test('opptrix help mentions @opptrix/selfhost', () => {
  const r = spawnSync(process.execPath, [CLI, 'help'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /@opptrix\/selfhost/)
  assert.match(r.stdout, /install-cli/)
  assert.match(r.stdout, /\btags\b/)
  assert.match(r.stdout, /opptrix-selfhost-v1\.3\.6/)
})

test('readPackageMeta exposes app tag prefs', async () => {
  const { readPackageMeta } = await import('../packages/selfhost/src/paths.mjs')
  const meta = readPackageMeta()
  assert.equal(meta.minAppTag, 'opptrix-selfhost-v1.3.6')
  assert.equal(meta.preferredAppTag, 'opptrix-selfhost-v1.3.6')
})
