/**
 * Unit tests for system-update upgrade allowlist + channel URL/tag helpers.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const allow = await import('../apps/server/dist/system-update-allowlist.js')
const channel = await import('../apps/server/dist/system-update-channel.js')

describe('isApiAllowedDuringUpgrade', () => {
  it('allows health, auth/status, system-update during first_boot_hooks', () => {
    const phase = 'first_boot_hooks'
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/health', phase), true)
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/auth/status', phase), true)
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/system-update/status', phase), true)
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/system-update/apply', phase), true)
  })

  it('blocks /api/config during first_boot_hooks', () => {
    assert.equal(
      allow.isApiAllowedDuringUpgrade('/api/config', 'first_boot_hooks'),
      false,
    )
  })

  it('blocks unrelated APIs during wizard_apply but allows login', () => {
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/config', 'wizard_apply'), false)
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/watchlist', 'wizard_apply'), false)
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/auth/login', 'wizard_apply'), true)
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/auth/login/totp', 'wizard_apply'), true)
  })

  it('does not allow login during first_boot_hooks', () => {
    assert.equal(allow.isApiAllowedDuringUpgrade('/api/auth/login', 'first_boot_hooks'), false)
  })

  it('allows non-api (static UI) paths', () => {
    assert.equal(allow.isApiAllowedDuringUpgrade('/', 'wizard_apply'), true)
    assert.equal(allow.isApiAllowedDuringUpgrade('/assets/app.js', 'first_boot_hooks'), true)
  })

  it('isUpgradeLockPhase only for wizard/first_boot', () => {
    assert.equal(allow.isUpgradeLockPhase('wizard_apply'), true)
    assert.equal(allow.isUpgradeLockPhase('first_boot_hooks'), true)
    assert.equal(allow.isUpgradeLockPhase('normal'), false)
    assert.equal(allow.isUpgradeLockPhase('failed'), false)
  })
})

describe('channel tag + CDN helpers', () => {
  it('parseSelfhostTag', () => {
    assert.deepEqual(channel.parseSelfhostTag('opptrix-selfhost-v1.4.0'), {
      tag: 'opptrix-selfhost-v1.4.0',
      version: '1.4.0',
    })
    assert.equal(channel.parseSelfhostTag('desktop-v1.4.0'), null)
    assert.equal(channel.parseSelfhostTag('opptrix-selfhost-vbad'), null)
  })

  it('selfhostTagForVersion + compareSemver', () => {
    assert.equal(channel.selfhostTagForVersion('1.4.0'), 'opptrix-selfhost-v1.4.0')
    assert.equal(channel.compareSemver('1.4.0', '1.3.6'), 1)
    assert.equal(channel.compareSemver('1.3.6', '1.3.6'), 0)
  })

  it('readChannelEnv uses OPPTRIX_UPDATE_CDN_BASE', () => {
    const prev = process.env.OPPTRIX_UPDATE_CDN_BASE
    process.env.OPPTRIX_UPDATE_CDN_BASE = 'https://cdn.example.com/'
    try {
      assert.deepEqual(channel.readChannelEnv(), {
        cdnBase: 'https://cdn.example.com',
        channel: 'selfhost',
      })
    } finally {
      if (prev === undefined) delete process.env.OPPTRIX_UPDATE_CDN_BASE
      else process.env.OPPTRIX_UPDATE_CDN_BASE = prev
    }
  })

  it('hotCheckUpdateUrl + hotPackageUrls', () => {
    assert.equal(
      channel.hotCheckUpdateUrl('https://update.opptrix.org'),
      'https://update.opptrix.org/hot/check-update',
    )
    const urls = channel.hotPackageUrls('1.4.0', 'https://update.opptrix.org')
    assert.equal(urls.binName, 'opptrix-runtime-v1.4.0.bin')
    assert.equal(urls.sha256Name, 'opptrix-runtime-v1.4.0.sha256')
    assert.equal(
      urls.binUrl,
      'https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.bin',
    )
    assert.equal(
      urls.sha256Url,
      'https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.sha256',
    )
  })

  it('parseHotLatestPayload resolves absolute and relative bin/sha256', () => {
    const base = 'https://update.opptrix.org'
    const parsed = channel.parseHotLatestPayload(
      {
        channel: 'selfhost',
        latest: {
          version: '1.4.0',
          bin: '/hot/packages/opptrix-runtime-v1.4.0.bin',
          sha256: 'https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.sha256',
          size: 123,
        },
      },
      base,
      { archKey: 'linux-x64' },
    )
    assert.ok(parsed)
    assert.equal(parsed.version, '1.4.0')
    assert.equal(parsed.size, 123)
    assert.equal(parsed.archKey, 'linux-x64')
    assert.equal(
      parsed.binUrl,
      'https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.bin',
    )
    assert.equal(
      parsed.sha256Url,
      'https://update.opptrix.org/hot/packages/opptrix-runtime-v1.4.0.sha256',
    )
    assert.deepEqual(parsed.description, { features: [], fixes: [] })

    const withNotes = channel.parseHotLatestPayload(
      {
        latest: {
          version: '1.4.0',
          packages: {
            'linux-x64': {
              bin: '/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin',
              sha256: '/hot/packages/opptrix-runtime-linux-x64-v1.4.0.sha256',
              size: 123,
            },
          },
          description: { features: ['新功能 A'], fixes: ['修复 B'] },
        },
      },
      base,
      { archKey: 'linux-x64' },
    )
    assert.ok(withNotes)
    assert.deepEqual(withNotes.description, { features: ['新功能 A'], fixes: ['修复 B'] })

    const withMirrors = channel.parseHotLatestPayload(
      {
        latest: {
          version: '1.4.0',
          packages: {
            'linux-x64': {
              bin: '/hot/packages/opptrix-runtime-linux-x64-v1.4.0.bin',
              sha256: '/hot/packages/opptrix-runtime-linux-x64-v1.4.0.sha256',
              size: 123,
              mirrors: {
                github: {
                  bin: 'https://github.com/Travisun/Opptrix/releases/download/opptrix-selfhost-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.bin',
                  sha256: 'https://github.com/Travisun/Opptrix/releases/download/opptrix-selfhost-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.sha256',
                },
                gitee: {
                  bin: 'https://gitee.com/Travisun/Opptrix/releases/download/opptrix-selfhost-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.bin',
                  sha256: 'https://gitee.com/Travisun/Opptrix/releases/download/opptrix-selfhost-v1.4.0/opptrix-runtime-linux-x64-v1.4.0.sha256',
                },
              },
            },
          },
        },
      },
      base,
      { archKey: 'linux-x64' },
    )
    assert.ok(withMirrors?.mirrors?.github?.bin?.includes('github.com'))
    assert.ok(withMirrors?.mirrors?.gitee?.bin?.includes('gitee.com'))

    const arm64 = channel.parseHotLatestPayload(
      {
        latest: {
          version: '1.4.0',
          packages: {
            'linux-arm64': {
              bin: '/hot/packages/opptrix-runtime-linux-arm64-v1.4.0.bin',
              sha256: '/hot/packages/opptrix-runtime-linux-arm64-v1.4.0.sha256',
              size: 456,
            },
          },
        },
      },
      base,
      { archKey: 'linux-arm64' },
    )
    assert.ok(arm64)
    assert.equal(arm64.archKey, 'linux-arm64')
    assert.equal(arm64.size, 456)
    assert.equal(
      arm64.binUrl,
      'https://update.opptrix.org/hot/packages/opptrix-runtime-linux-arm64-v1.4.0.bin',
    )

    const fromTag = channel.parseHotLatestPayload(
      { latest: { tag: 'opptrix-selfhost-v1.5.0' } },
      base,
      { archKey: 'linux-x64' },
    )
    assert.ok(fromTag)
    assert.equal(fromTag.version, '1.5.0')
    assert.equal(fromTag.binName, 'opptrix-runtime-v1.5.0.bin')

    const defaults = channel.parseHotLatestPayload(
      { latest: { version: '2.0.0' } },
      base,
      { archKey: 'linux-x64' },
    )
    assert.ok(defaults)
    assert.equal(
      defaults.binUrl,
      'https://update.opptrix.org/hot/packages/opptrix-runtime-v2.0.0.bin',
    )
    assert.equal(channel.parseHotLatestPayload({ latest: {} }, base), null)
    assert.equal(
      channel.parseHotLatestPayload(
        { latest: { version: '2.0.0' } },
        base,
        { archKey: 'linux-arm64' },
      ),
      null,
    )
  })

  it('parseHotReleasesPayload returns catalog with descriptions', () => {
    const base = 'https://update.opptrix.org'
    const rows = channel.parseHotReleasesPayload(
      {
        channel: 'selfhost',
        retention: { max: 8 },
        releases: [
          {
            version: '1.3.0',
            publishedAt: '2026-01-01T00:00:00.000Z',
            description: { features: ['A'], fixes: [] },
            packages: {
              'linux-x64': {
                bin: '/hot/packages/opptrix-runtime-linux-x64-v1.3.0.bin',
                sha256: '/hot/packages/opptrix-runtime-linux-x64-v1.3.0.sha256',
                size: 10,
              },
            },
            requires: { node: '>=24 <25', minBaseImage: 'opptrix-selfhost-v1.3.0', platforms: ['linux-x64'] },
          },
        ],
      },
      base,
      { archKey: 'linux-x64' },
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].version, '1.3.0')
    assert.deepEqual(rows[0].description, { features: ['A'], fixes: [] })
    assert.equal(rows[0].requires.minBaseImage, 'opptrix-selfhost-v1.3.0')
  })
})

describe('apply exit injection', () => {
  it('applyPendingUpdate schedules exit 42 without process.exit', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const su = await import('../packages/system-update/dist/index.js')
    const svc = await import('../apps/server/dist/system-update-service.js')

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-api-'))
    const systemDir = path.join(tmp, 'system')
    const prev = process.env.OPPTRIX_SYSTEM_DIR
    process.env.OPPTRIX_SYSTEM_DIR = systemDir

    const exits = /** @type {number[]} */ ([])
    svc.setSystemUpdateProcessExit((code) => {
      exits.push(code)
    })

    try {
      su.ensureLayout(systemDir)
      const slot = path.join(systemDir, 'slots', '9.9.9')
      fs.mkdirSync(path.join(slot, 'apps', 'server', 'dist'), { recursive: true })
      // Empty requires: fixtures must not inherit DEFAULT_RUNTIME_NODE_RANGE (>=24),
      // which fails on Node 22 CI/dev hosts even though Docker images use 24.
      su.writeRuntimeMarker(slot, { version: '9.9.9', requires: {} })
      fs.writeFileSync(path.join(slot, 'apps', 'server', 'dist', 'index.js'), 'export {}\n')
      su.patchState({ pendingVersion: '9.9.9', uiPhase: 'normal' }, systemDir)

      const status = svc.buildSystemUpdateStatus(su.readState(systemDir), true)
      assert.equal(status.readyToApply, true)
      assert.equal(status.needsBaseRefresh, false)

      const result = await svc.applyPendingUpdate()
      assert.equal(result.exitCode, 42)
      assert.equal(su.readState(systemDir).uiPhase, 'wizard_apply')

      await new Promise((r) => setTimeout(r, 500))
      assert.deepEqual(exits, [42])
    } finally {
      svc.resetSystemUpdateProcessExit()
      if (prev === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
      else process.env.OPPTRIX_SYSTEM_DIR = prev
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('applyPendingUpdate refuses when pending slot needs base refresh', async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const su = await import('../packages/system-update/dist/index.js')
    const svc = await import('../apps/server/dist/system-update-service.js')

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-su-base-'))
    const systemDir = path.join(tmp, 'system')
    const prev = process.env.OPPTRIX_SYSTEM_DIR
    process.env.OPPTRIX_SYSTEM_DIR = systemDir

    const exits = /** @type {number[]} */ ([])
    svc.setSystemUpdateProcessExit((code) => {
      exits.push(code)
    })

    try {
      su.ensureLayout(systemDir)
      const slot = path.join(systemDir, 'slots', '9.9.10')
      fs.mkdirSync(path.join(slot, 'apps', 'server', 'dist'), { recursive: true })
      su.writeRuntimeMarker(slot, {
        version: '9.9.10',
        requires: { requiresBaseRefresh: true },
      })
      fs.writeFileSync(path.join(slot, 'apps', 'server', 'dist', 'index.js'), 'export {}\n')
      su.patchState({ pendingVersion: '9.9.10', uiPhase: 'normal' }, systemDir)

      const status = svc.buildSystemUpdateStatus(su.readState(systemDir), true)
      assert.equal(status.needsBaseRefresh, true)
      assert.equal(status.readyToApply, false)
      assert.equal(status.cliCommand, 'opptrix update')
      assert.ok(status.baseRefreshHint)

      await assert.rejects(
        () => svc.applyPendingUpdate(),
        (err) => {
          assert.equal(err?.code, 'needs_base_refresh')
          assert.equal(err?.cliCommand, 'opptrix update')
          return true
        },
      )
      assert.deepEqual(exits, [])
      assert.equal(su.readState(systemDir).uiPhase, 'normal')
    } finally {
      svc.resetSystemUpdateProcessExit()
      if (prev === undefined) delete process.env.OPPTRIX_SYSTEM_DIR
      else process.env.OPPTRIX_SYSTEM_DIR = prev
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
