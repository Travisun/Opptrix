/**
 * @opptrix/system-update — platform requires + postActivate hooks.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

/** @type {typeof import('../packages/system-update/dist/index.js')} */
let su

/** @type {string} */
let tmpRoot

before(async () => {
  su = await import('../packages/system-update/dist/index.js')
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-hooks-'))
})

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('evaluateRuntimeRequires', () => {
  it('ok when marker has no requires', () => {
    const r = su.evaluateRuntimeRequires({
      app: 'opptrix',
      kind: 'runtime',
      version: '1.0.0',
    })
    assert.equal(r.ok, true)
    assert.equal(r.needsBaseRefresh, false)
    assert.deepEqual(r.reasons, [])
  })

  it('rejects node 22 when requires >=24 <25', () => {
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '1.0.0',
        requires: { node: '>=24 <25' },
      },
      { nodeVersion: '22.11.0', platform: 'linux', arch: 'x64' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.needsBaseRefresh, true)
    assert.ok(r.reasons.some(s => s.includes('22.11.0')))
  })

  it('ok for node 24 with range >=24 <25', () => {
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '1.0.0',
        requires: { node: '>=24 <25' },
      },
      { nodeVersion: '24.0.0', platform: 'linux', arch: 'x64' },
    )
    assert.equal(r.ok, true)
    assert.equal(r.needsBaseRefresh, false)
  })

  it('ok for current process node when range matches engines', () => {
    const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
    if (major < 24 || major >= 25) {
      // Skip assertion shape when not on Node 24 CI/dev — still exercise call
      const r = su.evaluateRuntimeRequires(
        {
          app: 'opptrix',
          kind: 'runtime',
          version: '1.0.0',
          requires: { node: '>=24 <25' },
        },
      )
      assert.equal(typeof r.ok, 'boolean')
      return
    }
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '1.0.0',
        requires: { node: '>=24 <25' },
      },
    )
    assert.equal(r.ok, true)
    assert.equal(r.needsBaseRefresh, false)
  })

  it('needsBaseRefresh when requiresBaseRefresh is true', () => {
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '1.0.0',
        requires: {
          node: '>=24 <25',
          requiresBaseRefresh: true,
        },
      },
      { nodeVersion: '24.1.0', platform: 'darwin', arch: 'arm64' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.needsBaseRefresh, true)
    assert.ok(r.reasons.some(s => /base refresh/i.test(s)))
  })

  it('rejects mismatched platform', () => {
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '1.0.0',
        requires: {
          platforms: ['linux-x64', 'linux-arm64'],
        },
      },
      { nodeVersion: '24.0.0', platform: 'darwin', arch: 'arm64' },
    )
    assert.equal(r.ok, false)
    assert.equal(r.needsBaseRefresh, true)
    assert.ok(r.reasons.some(s => s.includes('darwin-arm64')))
  })

  it('nodeVersionSatisfies bare major and operators', () => {
    assert.equal(su.nodeVersionSatisfies('24.5.0', '24'), true)
    assert.equal(su.nodeVersionSatisfies('23.0.0', '24'), false)
    assert.equal(su.nodeVersionSatisfies('24.0.0', '>=24.0.0'), true)
    assert.equal(su.nodeVersionSatisfies('25.0.0', '>=24 <25'), false)
  })

  it('needsBaseRefresh when host base is below minBaseImage', () => {
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '2.0.0',
        requires: {
          node: '>=24 <25',
          minBaseImage: 'opptrix-selfhost-v1.5.0',
        },
      },
      {
        nodeVersion: '24.0.0',
        platform: 'linux',
        arch: 'x64',
        baseVersion: 'opptrix-selfhost-v1.4.0',
      },
    )
    assert.equal(r.ok, false)
    assert.equal(r.needsBaseRefresh, true)
    assert.ok(r.reasons.some(s => /below required minBaseImage/i.test(s)))
  })

  it('ok when host base meets minBaseImage', () => {
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '2.0.0',
        requires: {
          node: '>=24 <25',
          minBaseImage: '1.5.0',
        },
      },
      {
        nodeVersion: '24.0.0',
        platform: 'linux',
        arch: 'x64',
        baseVersion: 'opptrix-selfhost-v1.5.0',
      },
    )
    assert.equal(r.ok, true)
    assert.equal(r.needsBaseRefresh, false)
  })

  it('needsBaseRefresh when minBaseImage set and host base missing in Docker', () => {
    const r = su.evaluateRuntimeRequires(
      {
        app: 'opptrix',
        kind: 'runtime',
        version: '2.0.0',
        requires: { minBaseImage: 'opptrix-selfhost-v1.5.0' },
      },
      {
        nodeVersion: '24.0.0',
        platform: 'linux',
        arch: 'x64',
        baseVersion: null,
        isDocker: true,
      },
    )
    assert.equal(r.needsBaseRefresh, true)
    assert.ok(r.reasons.some(s => /host base version unknown/i.test(s)))
  })

  it('resolveHostBaseVersion prefers OPPTRIX_BASE_VERSION', () => {
    const prevBase = process.env.OPPTRIX_BASE_VERSION
    const prevTag = process.env.OPPTRIX_RELEASE_TAG
    process.env.OPPTRIX_BASE_VERSION = '1.4.0'
    process.env.OPPTRIX_RELEASE_TAG = 'opptrix-selfhost-v9.9.9'
    try {
      assert.equal(su.resolveHostBaseVersion(), '1.4.0')
    } finally {
      if (prevBase === undefined) delete process.env.OPPTRIX_BASE_VERSION
      else process.env.OPPTRIX_BASE_VERSION = prevBase
      if (prevTag === undefined) delete process.env.OPPTRIX_RELEASE_TAG
      else process.env.OPPTRIX_RELEASE_TAG = prevTag
    }
  })
})

describe('runtime marker read/write', () => {
  it('writeRuntimeMarker adds richer defaults when version set', () => {
    const dir = path.join(tmpRoot, 'marker-rich')
    su.writeRuntimeMarker(dir, { version: '9.9.9' })
    const marker = su.readRuntimeMarker(dir)
    assert.ok(marker)
    assert.equal(marker.version, '9.9.9')
    assert.equal(marker.requires?.node, su.DEFAULT_RUNTIME_NODE_RANGE)
    assert.equal(marker.requires?.minBaseImage, 'opptrix-selfhost-v9.9.9')
    assert.deepEqual(marker.hooks?.postActivate, [])
  })

  it('readRuntimeMarker returns null for missing file', () => {
    assert.equal(su.readRuntimeMarker(path.join(tmpRoot, 'no-such')), null)
  })
})

describe('postActivate hooks', () => {
  it('no-op success when no scripts', async () => {
    const dir = path.join(tmpRoot, 'hooks-empty')
    fs.mkdirSync(dir, { recursive: true })
    su.writeRuntimeMarker(dir, { version: '1.0.0' })
    const result = await su.runPostActivateHooks(dir)
    assert.equal(result.ok, true)
    assert.equal(result.ran, 0)
    assert.deepEqual(result.scripts, [])
  })

  it('lists scanned hooks when marker postActivate empty', () => {
    const dir = path.join(tmpRoot, 'hooks-scan')
    const hookDir = path.join(dir, 'hooks', 'post-activate')
    fs.mkdirSync(hookDir, { recursive: true })
    su.writeRuntimeMarker(dir, { version: '1.0.0', hooks: { postActivate: [] } })
    fs.writeFileSync(path.join(hookDir, '02-b.mjs'), 'export {}\n')
    fs.writeFileSync(path.join(hookDir, '01-a.mjs'), 'export {}\n')
    const listed = su.listPostActivateHooks(dir)
    assert.equal(listed.length, 2)
    assert.ok(listed[0].endsWith('01-a.mjs'))
    assert.ok(listed[1].endsWith('02-b.mjs'))
  })

  it('prefers marker.hooks.postActivate order', () => {
    const dir = path.join(tmpRoot, 'hooks-listed')
    const hookDir = path.join(dir, 'hooks', 'post-activate')
    fs.mkdirSync(hookDir, { recursive: true })
    fs.writeFileSync(path.join(hookDir, 'a.mjs'), 'export {}\n')
    fs.writeFileSync(path.join(hookDir, 'b.mjs'), 'export {}\n')
    su.writeRuntimeMarker(dir, {
      version: '1.0.0',
      hooks: {
        postActivate: [
          'hooks/post-activate/b.mjs',
          'hooks/post-activate/a.mjs',
        ],
      },
    })
    const listed = su.listPostActivateHooks(dir)
    assert.equal(listed.length, 2)
    assert.ok(listed[0].endsWith('b.mjs'))
    assert.ok(listed[1].endsWith('a.mjs'))
  })

  it('runs hook scripts and fails closed on non-zero', async () => {
    const dir = path.join(tmpRoot, 'hooks-run')
    const hookDir = path.join(dir, 'hooks', 'post-activate')
    fs.mkdirSync(hookDir, { recursive: true })
    fs.writeFileSync(
      path.join(hookDir, '01-ok.mjs'),
      'console.log("ok"); process.exit(0)\n',
    )
    su.writeRuntimeMarker(dir, {
      version: '1.0.0',
      hooks: { postActivate: ['hooks/post-activate/01-ok.mjs'] },
    })
    const ok = await su.runPostActivateHooks(dir)
    assert.equal(ok.ok, true)
    assert.equal(ok.ran, 1)

    fs.writeFileSync(
      path.join(hookDir, '02-fail.mjs'),
      'console.error("boom"); process.exit(2)\n',
    )
    su.writeRuntimeMarker(dir, {
      version: '1.0.0',
      hooks: {
        postActivate: [
          'hooks/post-activate/01-ok.mjs',
          'hooks/post-activate/02-fail.mjs',
        ],
      },
    })
    await assert.rejects(
      () => su.runPostActivateHooks(dir),
      /postActivate hook failed/,
    )
  })
})
