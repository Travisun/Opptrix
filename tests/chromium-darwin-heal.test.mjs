import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chromeAppNeedsEntitlementsHeal,
  collectBrowserAppsToResign,
  findChromeForTestingApp,
} from '../packages/agent-browser/dist/chromium-darwin-heal.js'

describe('chromium-darwin-heal', () => {
  it('findChromeForTestingApp returns null for missing dir', () => {
    assert.equal(findChromeForTestingApp('/nonexistent/playwright-browsers'), null)
  })

  it('collectBrowserAppsToResign skips nested Helper.apps', () => {
    assert.deepEqual(collectBrowserAppsToResign('/nonexistent/playwright-browsers'), [])
  })

  it('chromeAppNeedsEntitlementsHeal is false on non-darwin', () => {
    if (process.platform === 'darwin') return
    assert.equal(chromeAppNeedsEntitlementsHeal('/tmp/Google Chrome for Testing.app'), false)
  })

  it('chromeAppNeedsEntitlementsHeal is false for missing app', () => {
    assert.equal(chromeAppNeedsEntitlementsHeal('/nonexistent/Google Chrome for Testing.app'), false)
  })
})
