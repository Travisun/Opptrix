/**
 * Offline import validation for CDN-format hot-update packages.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

/** @type {typeof import('../apps/server/dist/system-update-import.js')} */
let imp

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

/** @type {string} */
let tmpRoot
/** @type {string | undefined} */
let prevSystemDir

function makeSeedTree(dir, versionLabel) {
  fs.mkdirSync(dir, { recursive: true })
  su.writeRuntimeMarker(dir, { version: versionLabel })
  const entry = path.join(dir, 'apps', 'server', 'dist')
  fs.mkdirSync(entry, { recursive: true })
  fs.writeFileSync(path.join(entry, 'index.js'), `export const v = ${JSON.stringify(versionLabel)}\n`)
}

function packArchive(treeDir, outPath) {
  const pack = spawnSync('tar', ['-czf', outPath, '-C', treeDir, '.'], { encoding: 'utf8' })
  assert.equal(pack.status, 0, pack.stderr)
  const digest = createHash('sha256').update(fs.readFileSync(outPath)).digest('hex')
  return digest
}

before(async () => {
  imp = await import('../apps/server/dist/system-update-import.js')
  su = await import('../packages/system-update/dist/index.js')
})

describe('system-update import helpers', () => {
  it('parseVersionFromArchiveFilename accepts .bin and .tar.gz', () => {
    assert.equal(
      imp.parseVersionFromArchiveFilename('opptrix-runtime-v1.4.0.bin'),
      '1.4.0',
    )
    assert.equal(
      imp.parseVersionFromArchiveFilename('/tmp/opptrix-runtime-v2.0.1.tar.gz'),
      '2.0.1',
    )
    assert.equal(imp.parseVersionFromArchiveFilename('other.bin'), null)
  })

  it('parseVersionFromSha256Filename', () => {
    assert.equal(
      imp.parseVersionFromSha256Filename('opptrix-runtime-v1.4.0.sha256'),
      '1.4.0',
    )
    assert.equal(imp.parseVersionFromSha256Filename('foo.sha256'), null)
  })

  it('assertImportVersionAllowed rejects blocked and older-than-blocked', () => {
    const state = su.normalizeState({
      blockedVersions: ['1.4.0'],
    })
    assert.throws(
      () => imp.assertImportVersionAllowed(state, '1.4.0'),
      (err) => err instanceof imp.SystemUpdateImportError && err.status === 409,
    )
    assert.throws(
      () => imp.assertImportVersionAllowed(state, '1.3.9'),
      (err) => err instanceof imp.SystemUpdateImportError && err.status === 409,
    )
    imp.assertImportVersionAllowed(state, '1.4.1')
  })
})

describe('system-update import from files', () => {
  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-imp-'))
    prevSystemDir = process.env.OPPTRIX_SYSTEM_DIR
    process.env.OPPTRIX_SYSTEM_DIR = path.join(tmpRoot, 'system')
    su.ensureLayout(process.env.OPPTRIX_SYSTEM_DIR)
  })

  after(() => {
    if (prevSystemDir === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prevSystemDir
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('imports valid package + sha256 sidecar', async () => {
    const version = '3.2.0'
    const tree = path.join(tmpRoot, 'tree')
    makeSeedTree(tree, version)
    const archive = path.join(tmpRoot, `opptrix-runtime-v${version}.bin`)
    const digest = packArchive(tree, archive)
    const shaPath = path.join(tmpRoot, `opptrix-runtime-v${version}.sha256`)
    fs.writeFileSync(shaPath, `${digest}  opptrix-runtime-v${version}.bin\n`)

    const result = await imp.importUpdateFromFiles({
      packagePath: archive,
      packageOriginalName: path.basename(archive),
      sha256Path: shaPath,
      sha256OriginalName: path.basename(shaPath),
    })

    assert.equal(result.version, version)
    assert.equal(result.status.pendingVersion, version)
    assert.equal(result.status.download?.status, 'done')
    assert.ok(result.status.readyToApply || result.status.needsBaseRefresh)
    assert.ok(fs.existsSync(su.slotPath(process.env.OPPTRIX_SYSTEM_DIR, version)))
  })

  it('rejects sha256 mismatch', async () => {
    const version = '3.2.1'
    const tree = path.join(tmpRoot, 'tree-321')
    makeSeedTree(tree, version)
    const archive = path.join(tmpRoot, `opptrix-runtime-v${version}.bin`)
    packArchive(tree, archive)
    const shaPath = path.join(tmpRoot, `opptrix-runtime-v${version}.sha256`)
    fs.writeFileSync(shaPath, `${'a'.repeat(64)}  opptrix-runtime-v${version}.bin\n`)

    await assert.rejects(
      () => imp.importUpdateFromFiles({
        packagePath: archive,
        packageOriginalName: path.basename(archive),
        sha256Path: shaPath,
        sha256OriginalName: path.basename(shaPath),
      }),
      (err) => err instanceof imp.SystemUpdateImportError && err.code === 'bad_digest',
    )
  })
})
