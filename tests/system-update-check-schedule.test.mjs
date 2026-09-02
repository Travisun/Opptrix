import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/** @type {typeof import('../apps/server/dist/system-update-check-schedule.js')} */
let schedule
/** @type {typeof import('../apps/server/dist/system-update-user-agent.js')} */
let ua

describe('system-update check schedule', () => {
  it('loads built server modules', async () => {
    schedule = await import('../apps/server/dist/system-update-check-schedule.js')
    ua = await import('../apps/server/dist/system-update-user-agent.js')
    assert.ok(schedule.resolveUpdateCheckIntervalMs)
    assert.ok(ua.buildSystemUpdateUserAgent)
  })

  it('defaults to 24h interval', () => {
    const ms = schedule.resolveUpdateCheckIntervalMs({})
    assert.equal(ms, 24 * 60 * 60 * 1000)
  })

  it('respects OPPTRIX_UPDATE_CHECK_INTERVAL_HOURS', () => {
    const ms = schedule.resolveUpdateCheckIntervalMs({
      OPPTRIX_UPDATE_CHECK_INTERVAL_HOURS: '12',
    })
    assert.equal(ms, 12 * 60 * 60 * 1000)
  })

  it('respects OPPTRIX_UPDATE_CHECK_INTERVAL_MS', () => {
    const ms = schedule.resolveUpdateCheckIntervalMs({
      OPPTRIX_UPDATE_CHECK_INTERVAL_MS: '3600000',
    })
    assert.equal(ms, 3_600_000)
  })
})

describe('system-update user agent', () => {
  it('includes explicit version and linux arch key', () => {
    assert.equal(
      ua.buildSystemUpdateUserAgent('1.4.2', 'linux-x64'),
      'Opptrix-system-update/1.4.2 (linux-x64)',
    )
    assert.equal(
      ua.buildSystemUpdateUserAgent('v1.4.2', 'linux-arm64'),
      'Opptrix-system-update/1.4.2 (linux-arm64)',
    )
  })

  it('falls back to product token when version unknown', () => {
    assert.match(ua.buildSystemUpdateUserAgent('unknown'), /Opptrix-system-update \(/)
    assert.match(ua.buildSystemUpdateUserAgent(''), /Opptrix-system-update \(/)
  })
})
