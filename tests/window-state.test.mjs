import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  computeDefaultSize,
  clampWindowSize,
  parseWindowState,
  isBoundsVisibleOnAnyDisplay,
  resolveWindowPlacement,
  buildStateToSave,
  readWindowStateFile,
  writeWindowStateFile,
  windowStateFilePath,
  createPersistScheduler,
} = require('../apps/desktop/electron/window-state.cjs')

describe('window-state defaults', () => {
  it('default size is smaller than legacy 1100×740 and ≥ mins', () => {
    assert.ok(DEFAULT_WIDTH < 1100)
    assert.ok(DEFAULT_HEIGHT < 740)
    assert.ok(DEFAULT_WIDTH >= MIN_WIDTH)
    assert.ok(DEFAULT_HEIGHT >= MIN_HEIGHT)
  })

  it('computeDefaultSize falls back without work area', () => {
    assert.deepEqual(computeDefaultSize(null), {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    })
  })

  it('computeDefaultSize caps by work-area ratios', () => {
    const size = computeDefaultSize({ width: 1280, height: 800 })
    assert.ok(size.width <= DEFAULT_WIDTH)
    assert.ok(size.height <= DEFAULT_HEIGHT)
    assert.ok(size.width >= MIN_WIDTH)
    assert.ok(size.height >= MIN_HEIGHT)
    assert.ok(size.width <= Math.round(1280 * 0.7))
  })
})

describe('window-state parse / clamp', () => {
  it('parseWindowState rejects invalid payloads', () => {
    assert.equal(parseWindowState(null), null)
    assert.equal(parseWindowState({}), null)
    assert.equal(parseWindowState({ width: 'x', height: 700 }), null)
  })

  it('parseWindowState accepts size + optional position / maximize', () => {
    assert.deepEqual(parseWindowState({ width: 1000.4, height: 700.6, x: 10, y: 20, isMaximized: true }), {
      width: 1000,
      height: 701,
      x: 10,
      y: 20,
      isMaximized: true,
    })
  })

  it('clampWindowSize enforces mins and work-area caps', () => {
    assert.deepEqual(clampWindowSize(100, 100, null), {
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
    })
    const capped = clampWindowSize(2000, 2000, { width: 1200, height: 900 })
    assert.equal(capped.width, 1200)
    assert.equal(capped.height, 900)
  })
})

describe('window-state visibility / placement', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1080 }
  const secondary = { x: 1920, y: 0, width: 1600, height: 900 }

  it('detects on-screen and off-screen bounds', () => {
    assert.equal(
      isBoundsVisibleOnAnyDisplay({ x: 100, y: 100, width: 960, height: 680 }, [primary]),
      true,
    )
    assert.equal(
      isBoundsVisibleOnAnyDisplay({ x: -5000, y: -5000, width: 960, height: 680 }, [primary, secondary]),
      false,
    )
    assert.equal(
      isBoundsVisibleOnAnyDisplay({ x: 2000, y: 50, width: 800, height: 600 }, [primary, secondary]),
      true,
    )
  })

  it('restores position when visible; otherwise centers', () => {
    const saved = { width: 1000, height: 700, x: 120, y: 80, isMaximized: false }
    const ok = resolveWindowPlacement(saved, primary, [primary])
    assert.equal(ok.center, false)
    assert.equal(ok.x, 120)
    assert.equal(ok.y, 80)
    assert.equal(ok.width, 1000)

    const off = resolveWindowPlacement(
      { ...saved, x: -9000, y: -9000 },
      primary,
      [primary],
    )
    assert.equal(off.center, true)
    assert.equal(off.width, 1000)
    assert.equal('x' in off, false)
  })

  it('preserves isMaximized flag for restore', () => {
    const placement = resolveWindowPlacement(
      { width: 960, height: 680, isMaximized: true },
      primary,
      [primary],
    )
    assert.equal(placement.isMaximized, true)
    assert.equal(placement.center, true)
  })
})

describe('window-state maximize must not pollute normal bounds', () => {
  it('keeps previous normal size while maximized', () => {
    const prev = { width: 960, height: 680, x: 40, y: 50, isMaximized: false }
    const next = buildStateToSave(
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isMaximized: true,
        isFullScreen: false,
      },
      prev,
    )
    assert.equal(next.width, 960)
    assert.equal(next.height, 680)
    assert.equal(next.x, 40)
    assert.equal(next.y, 50)
    assert.equal(next.isMaximized, true)
  })

  it('saves normal bounds when not maximized', () => {
    const next = buildStateToSave(
      {
        bounds: { x: 12, y: 24, width: 1024, height: 720 },
        isMaximized: false,
        isFullScreen: false,
      },
      null,
    )
    assert.deepEqual(next, {
      width: 1024,
      height: 720,
      x: 12,
      y: 24,
      isMaximized: false,
    })
  })

  it('fullscreen keeps prior normal bounds and maximize flag', () => {
    const prev = { width: 900, height: 700, x: 1, y: 2, isMaximized: true }
    const next = buildStateToSave(
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1200 },
        isMaximized: false,
        isFullScreen: true,
      },
      prev,
    )
    assert.equal(next.width, 900)
    assert.equal(next.isMaximized, true)
  })
})

describe('window-state file I/O', () => {
  it('round-trips under an injected userData dir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-winstate-'))
    try {
      assert.equal(readWindowStateFile(tmp), null)
      const written = writeWindowStateFile(tmp, {
        width: 1000,
        height: 700,
        x: 30,
        y: 40,
        isMaximized: false,
      })
      assert.ok(written)
      assert.equal(fs.existsSync(windowStateFilePath(tmp)), true)
      assert.deepEqual(readWindowStateFile(tmp), written)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('window-state persist scheduler', () => {
  it('debounces schedule and flush runs immediately', async () => {
    let count = 0
    const scheduler = createPersistScheduler(() => {
      count += 1
    }, 50)
    scheduler.schedule()
    scheduler.schedule()
    assert.equal(count, 0)
    await new Promise((r) => setTimeout(r, 80))
    assert.equal(count, 1)
    scheduler.flush()
    assert.equal(count, 2)
  })
})
