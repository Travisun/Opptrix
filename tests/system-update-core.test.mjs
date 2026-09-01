/**
 * @opptrix/system-update — seed → activate → rollback on temp fs.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

/** @type {string} */
let tmpRoot
/** @type {string} */
let systemDir
/** @type {string | undefined} */
let prevSystemDir

function makeSeedTree(dir, versionLabel) {
  fs.mkdirSync(dir, { recursive: true })
  su.writeRuntimeMarker(dir, { version: versionLabel })
  const entry = path.join(dir, 'apps', 'server', 'dist')
  fs.mkdirSync(entry, { recursive: true })
  fs.writeFileSync(path.join(entry, 'index.js'), `export const v = ${JSON.stringify(versionLabel)}\n`)
}

before(async () => {
  su = await import('../packages/system-update/dist/index.js')
})

describe('system-update paths', () => {
  it('resolveSystemDir prefers OPPTRIX_SYSTEM_DIR', () => {
    const prev = process.env.OPPTRIX_SYSTEM_DIR
    process.env.OPPTRIX_SYSTEM_DIR = '/tmp/opptrix-sys-override-test'
    try {
      assert.equal(su.resolveSystemDir(), path.resolve('/tmp/opptrix-sys-override-test'))
    } finally {
      if (prev === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
      else process.env.OPPTRIX_SYSTEM_DIR = prev
    }
  })

  it('sibling of OPPTRIX_DATA_DIR when system unset', () => {
    const prevSys = process.env.OPPTRIX_SYSTEM_DIR
    const prevData = process.env.OPPTRIX_DATA_DIR
    const prevDocker = process.env.OPPTRIX_DOCKER
    delete process.env.OPPTRIX_SYSTEM_DIR
    delete process.env.OPPTRIX_DOCKER
    process.env.OPPTRIX_DATA_DIR = '/var/opptrix/data'
    try {
      assert.equal(su.resolveSystemDir(), path.resolve('/var/opptrix/system'))
    } finally {
      if (prevSys === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
      else process.env.OPPTRIX_SYSTEM_DIR = prevSys
      if (prevData === undefined) delete process.env.OPPTRIX_DATA_DIR
      else process.env.OPPTRIX_DATA_DIR = prevData
      if (prevDocker === undefined) delete process.env.OPPTRIX_DOCKER
      else process.env.OPPTRIX_DOCKER = prevDocker
    }
  })
})

describe('system-update seed → activate → rollback', () => {
  before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-'))
    systemDir = path.join(tmpRoot, 'system')
    prevSystemDir = process.env.OPPTRIX_SYSTEM_DIR
    process.env.OPPTRIX_SYSTEM_DIR = systemDir
  })

  after(() => {
    if (prevSystemDir === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prevSystemDir
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('seeds first slot and points boot', () => {
    const seedRoot = path.join(tmpRoot, 'seed-v1')
    makeSeedTree(seedRoot, '1.0.0')

    const result = su.seedCurrentSlot({
      systemDir,
      seedRoot,
      version: '1.0.0',
    })
    assert.equal(result.seeded, true)
    assert.equal(result.version, '1.0.0')
    assert.equal(su.readBootVersion(systemDir), '1.0.0')

    const state = su.readState(systemDir)
    assert.equal(state.currentVersion, '1.0.0')
    assert.equal(state.uiPhase, 'normal')
    assert.equal(state.firstBootUpgrade, null)

    const skip = su.seedCurrentSlot({
      systemDir,
      seedRoot,
      version: '1.0.0',
    })
    assert.equal(skip.skipped, true)
  })

  it('activates pending then rollbacks to backup', async () => {
    const seedV2 = path.join(tmpRoot, 'seed-v2')
    makeSeedTree(seedV2, '2.0.0')
    const dest = path.join(systemDir, 'slots', '2.0.0')
    fs.cpSync(seedV2, dest, { recursive: true })

    su.setPendingVersion('2.0.0', systemDir)
    assert.equal(su.readState(systemDir).pendingVersion, '2.0.0')
    assert.equal(su.readState(systemDir).uiPhase, 'wizard_apply')

    const act = su.activatePending({ systemDir })
    assert.equal(act.currentVersion, '2.0.0')
    assert.equal(act.previousVersion, '1.0.0')
    assert.equal(su.readBootVersion(systemDir), '2.0.0')
    assert.equal(su.readBackupVersion(systemDir), '1.0.0')

    const afterAct = su.readState(systemDir)
    assert.equal(afterAct.currentVersion, '2.0.0')
    assert.equal(afterAct.backupVersion, '1.0.0')
    assert.equal(afterAct.pendingVersion, null)
    assert.equal(afterAct.uiPhase, 'first_boot_hooks')
    assert.ok(afterAct.firstBootUpgrade)
    assert.equal(afterAct.firstBootUpgrade.version, '2.0.0')
    assert.equal(afterAct.firstBootUpgrade.phase, 'pending')

    su.markFirstBootUpgradeProgress({ phase: 'running', progress: 40 }, systemDir)
    assert.equal(su.readState(systemDir).firstBootUpgrade?.phase, 'running')

    const rb = await su.rollbackToBackup({
      systemDir,
      schemaCompatible: () => true,
    })
    assert.equal(rb.rolledBack, true)
    assert.equal(rb.toVersion, '1.0.0')
    assert.equal(su.readBootVersion(systemDir), '1.0.0')

    const afterRb = su.readState(systemDir)
    assert.equal(afterRb.currentVersion, '1.0.0')
    assert.equal(afterRb.uiPhase, 'normal')
    assert.equal(afterRb.firstBootUpgrade, null)
  })

  it('rollback refuses when schemaCompatible returns false', async () => {
    // Re-activate 2.0.0 so backup is 1.0.0 again
    su.setPendingVersion('2.0.0', systemDir)
    su.activatePending({ systemDir })
    assert.equal(su.readBootVersion(systemDir), '2.0.0')

    await assert.rejects(
      () => su.rollbackToBackup({
        systemDir,
        schemaCompatible: () => false,
      }),
      /schema incompatible/,
    )
    assert.equal(su.readBootVersion(systemDir), '2.0.0')
  })
})

describe('system-update extract + sha256', () => {
  /** @type {string} */
  let extractTmp
  /** @type {string | undefined} */
  let prevSys

  before(() => {
    extractTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-x-'))
    prevSys = process.env.OPPTRIX_SYSTEM_DIR
    process.env.OPPTRIX_SYSTEM_DIR = path.join(extractTmp, 'system')
  })

  after(() => {
    if (prevSys === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prevSys
    fs.rmSync(extractTmp, { recursive: true, force: true })
  })

  it('verifies sidecar and extracts .tar.gz into slot', () => {
    const sys = process.env.OPPTRIX_SYSTEM_DIR
    const tree = path.join(extractTmp, 'tree-3.0.0')
    makeSeedTree(tree, '3.0.0')

    const archive = path.join(extractTmp, 'opptrix-runtime-v3.0.0.tar.gz')
    const pack = spawnSync(
      'tar',
      ['-czf', archive, '-C', tree, '.'],
      { encoding: 'utf8' },
    )
    assert.equal(pack.status, 0, pack.stderr)

    const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
    fs.writeFileSync(`${archive}.sha256`, `${digest}  ${path.basename(archive)}\n`)

    assert.equal(su.runtimeArchiveFilename('3.0.0'), 'opptrix-runtime-v3.0.0.tar.gz')

    const result = su.extractUpdateArchive({
      archivePath: archive,
      version: '3.0.0',
      systemDir: sys,
    })
    assert.equal(result.version, '3.0.0')
    assert.equal(result.sha256, digest)
    assert.ok(fs.existsSync(path.join(result.slotPath, 'opptrix-runtime.json')))
    assert.equal(su.readState(sys).pendingVersion, '3.0.0')
  })

  it('accepts expectedSha256 without sidecar file', () => {
    const sys = process.env.OPPTRIX_SYSTEM_DIR
    const tree = path.join(extractTmp, 'tree-3.1.0')
    makeSeedTree(tree, '3.1.0')

    const archive = path.join(extractTmp, 'opptrix-runtime-v3.1.0.tar.gz')
    const pack = spawnSync(
      'tar',
      ['-czf', archive, '-C', tree, '.'],
      { encoding: 'utf8' },
    )
    assert.equal(pack.status, 0, pack.stderr)

    const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
    const result = su.extractUpdateArchive({
      archivePath: archive,
      version: '3.1.0',
      systemDir: sys,
      expectedSha256: digest,
      markPending: false,
    })
    assert.equal(result.sha256, digest)
    assert.ok(fs.existsSync(path.join(result.slotPath, 'opptrix-runtime.json')))
  })

  it('exports exit code constants', () => {
    assert.equal(su.OPPTRIX_EXIT_RESTART_APPLY, 42)
    assert.equal(su.OPPTRIX_EXIT_RESTART_POST_HOOK, 43)
    assert.equal(su.OPPTRIX_EXIT_RESTART_ROLLBACK, 44)
  })
})
