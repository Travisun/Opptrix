/**
 * Unit tests for system-update enablement (desktop / monorepo exempt).
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

const svc = await import('../apps/server/dist/system-update-service.js')

describe('isRunningFromSelfhostSystemTree', () => {
  it('matches entries under systemDir slots/boot', () => {
    const systemDir = path.join(os.tmpdir(), 'opptrix-system-enabled-test')
    const slotEntry = path.join(systemDir, 'slots', '1.2.3', 'apps', 'server', 'dist', 'index.js')
    const bootEntry = path.join(systemDir, 'boot', 'apps', 'server', 'dist', 'index.js')
    assert.equal(svc.isRunningFromSelfhostSystemTree(slotEntry, systemDir), true)
    assert.equal(svc.isRunningFromSelfhostSystemTree(bootEntry, systemDir), true)
  })

  it('rejects monorepo apps/server entry outside systemDir', () => {
    const systemDir = path.join(os.homedir(), '.opptrix', 'system')
    const monoEntry = path.join(
      os.homedir(),
      'Documents',
      'Opptrix',
      'apps',
      'server',
      'dist',
      'index.js',
    )
    assert.equal(svc.isRunningFromSelfhostSystemTree(monoEntry, systemDir), false)
  })

  it('rejects empty entry', () => {
    assert.equal(svc.isRunningFromSelfhostSystemTree('', '/tmp/system'), false)
    assert.equal(svc.isRunningFromSelfhostSystemTree(null, '/tmp/system'), false)
  })
})

describe('isSystemUpdateEnabled / auto', () => {
  const keys = [
    'OPPTRIX_UPDATE_ENABLED',
    'OPPTRIX_UPDATE_AUTO',
    'OPPTRIX_DESKTOP',
    'OPPTRIX_DOCKER',
  ]
  /** @type {Record<string, string | undefined>} */
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]))

  function restore() {
    for (const k of keys) {
      if (prev[k] == null) delete process.env[k]
      else process.env[k] = prev[k]
    }
  }

  function clearAll() {
    for (const k of keys) delete process.env[k]
  }

  it('honors OPPTRIX_UPDATE_ENABLED force flags', () => {
    try {
      clearAll()
      process.env.OPPTRIX_UPDATE_ENABLED = '0'
      assert.equal(svc.isSystemUpdateEnabled(), false)

      process.env.OPPTRIX_UPDATE_ENABLED = '1'
      process.env.OPPTRIX_DESKTOP = '1'
      assert.equal(svc.isSystemUpdateEnabled(), true)
    } finally {
      restore()
    }
  })

  it('disables for OPPTRIX_DESKTOP when not forced on', () => {
    try {
      clearAll()
      process.env.OPPTRIX_DESKTOP = '1'
      assert.equal(svc.isSystemUpdateEnabled(), false)
      assert.equal(svc.isSystemUpdateAutoCheckEnabled(), false)
    } finally {
      restore()
    }
  })

  it('disables for monorepo local process (no auto download)', () => {
    try {
      clearAll()
      // This test file runs via node from the monorepo, not from ~/.opptrix/system.
      assert.equal(svc.isSystemUpdateDevRuntime(), true)
      assert.equal(svc.isSystemUpdateEnabled(), false)
      assert.equal(svc.isSystemUpdateAutoCheckEnabled(), false)
    } finally {
      restore()
    }
  })

  it('ENABLED=1 in monorepo enables manual path but not auto download', () => {
    try {
      clearAll()
      process.env.OPPTRIX_UPDATE_ENABLED = '1'
      assert.equal(svc.isSystemUpdateEnabled(), true)
      assert.equal(svc.isSystemUpdateAutoCheckEnabled(), false)

      process.env.OPPTRIX_UPDATE_AUTO = '1'
      assert.equal(svc.isSystemUpdateAutoCheckEnabled(), true)
    } finally {
      restore()
    }
  })

  it('enables under Docker including auto check', () => {
    try {
      clearAll()
      process.env.OPPTRIX_DOCKER = '1'
      assert.equal(svc.isSystemUpdateDevRuntime(), false)
      assert.equal(svc.isSystemUpdateEnabled(), true)
      assert.equal(svc.isSystemUpdateAutoCheckEnabled(), true)
    } finally {
      restore()
    }
  })
})
