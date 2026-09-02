/**
 * runtime-update-cli.mjs — in-container runtime ops (host-independent unit tests).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const ROOT = process.cwd()
const SCRIPT = path.join(ROOT, 'scripts/runtime-update-cli.mjs')

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

test('load system-update build', async () => {
  su = await import('../packages/system-update/dist/index.js')
  assert.ok(su.extractUpdateArchive)
})

test('runtime-update-cli status on empty layout', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-rt-cli-'))
  const prev = process.env.OPPTRIX_SYSTEM_DIR
  process.env.OPPTRIX_SYSTEM_DIR = path.join(tmp, 'system')
  try {
    su.ensureLayout(process.env.OPPTRIX_SYSTEM_DIR)
    const r = spawnSync(process.execPath, [SCRIPT, 'status', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, OPPTRIX_DOCKER: '1', OPPTRIX_BASE_VERSION: 'opptrix-selfhost-v1.4.0' },
    })
    assert.equal(r.status, 0, r.stderr || r.stdout)
    const payload = JSON.parse(String(r.stdout).trim().split('\n').pop() ?? '')
    assert.equal(payload.ok, true)
    assert.equal(payload.command, 'status')
    assert.ok(Array.isArray(payload.slots))
  } finally {
    if (prev === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prev
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('runtime use local slot + apply + rollback preserves layout', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-rt-flow-'))
  const systemDir = path.join(tmp, 'system')
  const prev = process.env.OPPTRIX_SYSTEM_DIR
  process.env.OPPTRIX_SYSTEM_DIR = systemDir
  process.env.OPPTRIX_DOCKER = '1'
  process.env.OPPTRIX_BASE_VERSION = 'opptrix-selfhost-v9.0.0'

  try {
    su.ensureLayout(systemDir)
    const seedRoot = path.join(tmp, 'seed')
    for (const ver of ['9.0.0', '9.1.0']) {
      const slot = path.join(systemDir, 'slots', ver)
      fs.mkdirSync(path.join(slot, 'apps', 'server', 'dist'), { recursive: true })
      fs.writeFileSync(path.join(slot, 'apps', 'server', 'dist', 'index.js'), `// ${ver}\n`)
      su.writeRuntimeMarker(slot, {
        version: ver,
        requires: { minBaseImage: 'opptrix-selfhost-v9.0.0' },
      })
    }
    su.pointBootToVersion(systemDir, '9.0.0')
    su.patchState({ currentVersion: '9.0.0', backupVersion: null }, systemDir)

    const use = spawnSync(process.execPath, [SCRIPT, 'use', '9.1.0', '--json'], {
      encoding: 'utf8',
      env: process.env,
    })
    assert.equal(use.status, 0, use.stderr || use.stdout)
    const usePayload = JSON.parse(String(use.stdout).trim().split('\n').pop() ?? '')
    assert.equal(usePayload.version, '9.1.0')
    assert.equal(usePayload.source, 'local-slot')

    const apply = spawnSync(process.execPath, [SCRIPT, 'apply', '--json'], {
      encoding: 'utf8',
      env: process.env,
    })
    assert.equal(apply.status, 0, apply.stderr || apply.stdout)
    const applyPayload = JSON.parse(String(apply.stdout).trim().split('\n').pop() ?? '')
    assert.equal(applyPayload.currentVersion, '9.1.0')

    const stateAfterApply = su.readState(systemDir)
    assert.equal(stateAfterApply.currentVersion, '9.1.0')
    assert.equal(stateAfterApply.backupVersion, '9.0.0')

    const rollback = spawnSync(process.execPath, [SCRIPT, 'rollback', '--json'], {
      encoding: 'utf8',
      env: process.env,
    })
    assert.equal(rollback.status, 0, rollback.stderr || rollback.stdout)
    const rb = JSON.parse(String(rollback.stdout).trim().split('\n').pop() ?? '')
    assert.equal(rb.toVersion, '9.0.0')

    const boot = su.readBootVersion(systemDir)
    assert.equal(boot, '9.0.0')
  } finally {
    if (prev === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prev
    delete process.env.OPPTRIX_DOCKER
    delete process.env.OPPTRIX_BASE_VERSION
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('runtime apply refuses when minBaseImage not satisfied', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-rt-base-'))
  const systemDir = path.join(tmp, 'system')
  const prevSystem = process.env.OPPTRIX_SYSTEM_DIR
  const prevBase = process.env.OPPTRIX_BASE_VERSION
  process.env.OPPTRIX_SYSTEM_DIR = systemDir
  process.env.OPPTRIX_DOCKER = '1'
  process.env.OPPTRIX_BASE_VERSION = 'opptrix-selfhost-v1.0.0'

  try {
    su.ensureLayout(systemDir)
    const slot = path.join(systemDir, 'slots', '9.9.0')
    fs.mkdirSync(path.join(slot, 'apps', 'server', 'dist'), { recursive: true })
    fs.writeFileSync(path.join(slot, 'apps', 'server', 'dist', 'index.js'), 'export {}\n')
    su.writeRuntimeMarker(slot, {
      version: '9.9.0',
      requires: { minBaseImage: 'opptrix-selfhost-v9.9.9' },
    })
    su.setPendingVersion('9.9.0', systemDir)

    const apply = spawnSync(process.execPath, [SCRIPT, 'apply', '--json'], {
      encoding: 'utf8',
      env: process.env,
    })
    assert.equal(apply.status, 2)
    const payload = JSON.parse(String(apply.stdout).trim().split('\n').pop() ?? '')
    assert.equal(payload.code, 'needs_base_refresh')
  } finally {
    if (prevSystem === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
    else process.env.OPPTRIX_SYSTEM_DIR = prevSystem
    if (prevBase === undefined) delete process.env.OPPTRIX_BASE_VERSION
    else process.env.OPPTRIX_BASE_VERSION = prevBase
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
