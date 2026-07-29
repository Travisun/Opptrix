import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  parseLaunchArgs,
  hasScheduleTickArg,
  hasBackgroundArg,
} = require('../apps/desktop/electron/launch-args.cjs')

describe('parseLaunchArgs', () => {
  it('defaults to foreground (no background / schedule-tick)', () => {
    assert.deepEqual(parseLaunchArgs(['node', 'main.cjs']), {
      background: false,
      scheduleTick: false,
    })
  })

  it('detects login-item quiet start (--background only)', () => {
    const args = parseLaunchArgs(['Opptrix.exe', '--background'])
    assert.equal(args.background, true)
    assert.equal(args.scheduleTick, false)
    assert.equal(hasBackgroundArg(['--background']), true)
    assert.equal(hasScheduleTickArg(['--background']), false)
  })

  it('detects ephemeral OS tick worker (--background --schedule-tick)', () => {
    const args = parseLaunchArgs([
      'Opptrix.exe',
      '--background',
      '--schedule-tick',
    ])
    assert.equal(args.background, true)
    assert.equal(args.scheduleTick, true)
    assert.equal(hasScheduleTickArg(['a', '--schedule-tick']), true)
  })

  it('detects schedule-tick without background (second-instance forward)', () => {
    const args = parseLaunchArgs(['Opptrix.exe', '--schedule-tick'])
    assert.equal(args.background, false)
    assert.equal(args.scheduleTick, true)
  })
})
