import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

describe('hands-port Wave 57A browser.navigate', () => {
  /** @type {typeof import('../apps/server/dist/platform/index.js')} */
  let platform

  beforeEach(async () => {
    platform = await import(platformModUrl)
    platform.resetPlatformContextForTests()
    platform.resetBrowserDetectCacheForTests()
  })

  afterEach(() => {
    platform.resetPlatformContextForTests()
    platform.resetBrowserDetectCacheForTests()
  })

  it('injected browser adapter navigate → ok with url/title', async () => {
    /** @type {{ url?: string, waitUntil?: string }} */
    const calls = {}
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      browser: {
        async navigate(url, waitUntil) {
          calls.url = url
          calls.waitUntil = waitUntil
          return { url, title: 'Example', status: 200 }
        },
      },
    })
    const issued = hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'https://example.com/', waitUntil: 'domcontentloaded' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')

    const before = platform.createPlatformContext().meter.snapshot().submitCount
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error('expected invoke ok')
    const data = /** @type {{ url?: string, title?: string, status?: number }} */ (
      obs.data
    )
    assert.equal(data.url, 'https://example.com/')
    assert.equal(data.title, 'Example')
    assert.equal(data.status, 200)
    assert.equal(calls.url, 'https://example.com/')
    assert.equal(calls.waitUntil, 'domcontentloaded')
    assert.equal(typeof obs.auditId, 'string')
    assert.equal(
      platform.createPlatformContext().meter.snapshot().submitCount,
      before + 1,
    )
  })

  it('reject javascript: and file: → HandsObservation ok:false', async () => {
    let navigated = false
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      browser: {
        async navigate() {
          navigated = true
          return { url: 'x', title: 'x' }
        },
      },
    })

    for (const url of ['javascript:alert(1)', 'file:///etc/passwd']) {
      const issued = hands.issue({
        token: 'hands.browser.navigate',
        args: { url },
      })
      assert.equal(issued.ok, true, url)
      if (!issued.ok) throw new Error(`expected issue ok for ${url}`)
      const obs = await hands.invoke(issued.ticket)
      assert.equal(obs.ok, false, url)
      assert.match(String(obs.error ?? ''), /not allowed|Only http|protocol/i)
    }
    assert.equal(navigated, false)
  })

  it('adapter throw → HandsObservation ok:false', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      browser: {
        async navigate() {
          throw new Error('navigate failed: boom')
        },
      },
    })
    const issued = hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'https://example.com' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, false)
    assert.match(String(obs.error ?? ''), /navigate failed/)
  })

  it('click / type / screenshot / goto still denied at issue', () => {
    const ctx = platform.createPlatformContext()
    for (const token of [
      'hands.browser.click',
      'hands.browser.type',
      'hands.browser.screenshot',
      'hands.browser.goto',
    ]) {
      const bad = ctx.hands.issue({ token, args: { url: 'https://example.com' } })
      assert.equal(bad.ok, false, token)
      if (bad.ok) throw new Error(`expected fail for ${token}`)
      assert.match(bad.error, /unsupported hands token/)
    }
  })

  it('capabilities / ping still work', async () => {
    const hands = platform.createHandsPort({
      gate: platform.createPlatformContext().gate,
      browserDetect: () => ({
        available: true,
        engine: 'agent-browser',
        reason: 'package_present',
      }),
      browser: {
        async navigate() {
          throw new Error('should not navigate')
        },
      },
    })
    for (const token of ['hands.browser.capabilities', 'hands.browser.ping']) {
      const issued = hands.issue({ token })
      assert.equal(issued.ok, true, token)
      if (!issued.ok) throw new Error(`expected issue ok for ${token}`)
      const obs = await hands.invoke(issued.ticket)
      assert.equal(obs.ok, true, token)
      if (!obs.ok) throw new Error(`expected invoke ok for ${token}`)
      const data = /** @type {{ available?: boolean, reason?: string }} */ (obs.data)
      assert.equal(data.available, true)
      assert.equal(data.reason, 'package_present')
    }
  })

  it('real path optional skip if no chromium / no OPPTRIX_HANDS_BROWSER_REAL', async () => {
    let chromiumOk = false
    try {
      const { isChromiumAvailable } = await import('@opptrix/agent-browser')
      chromiumOk = isChromiumAvailable()
    } catch {
      chromiumOk = false
    }
    // Opt-in: avoids CI hang when Chromium exists but network/example.com is slow.
    if (!chromiumOk || process.env.OPPTRIX_HANDS_BROWSER_REAL !== '1') {
      return
    }

    const ctx = platform.createPlatformContext()
    const issued = ctx.hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'https://example.com', waitUntil: 'domcontentloaded' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected issue ok')
    const obs = await ctx.hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
    if (!obs.ok) throw new Error(`expected real navigate ok: ${obs.error}`)
    const data = /** @type {{ url?: string, title?: string }} */ (obs.data)
    assert.match(String(data.url ?? ''), /example\.com/)
    assert.equal(typeof data.title, 'string')
  })

  it('C-HANDS-BROWSER-NAVIGATE + ABI 0.8.43-w58', async () => {
    assert.equal(platform.PLATFORM_ABI_VERSION, '0.8.43-w58')
    const ctx = platform.createPlatformContext()
    assert.equal(ctx.abiVersion, '0.8.43-w58')

    const hands = platform.createHandsPort({
      gate: ctx.gate,
      browser: {
        async navigate(url) {
          return { url, title: 't', status: 200 }
        },
      },
    })
    const issued = hands.issue({
      token: 'hands.browser.navigate',
      args: { url: 'https://example.com' },
    })
    assert.equal(issued.ok, true)
    if (!issued.ok) throw new Error('expected navigate ticket')
    const obs = await hands.invoke(issued.ticket)
    assert.equal(obs.ok, true)
  })
})
