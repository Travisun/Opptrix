/**
 * Auth path normalization regression tests (pre-release audit F-02).
 *
 * The router (find-my-way) matches the percent-DECODED path; the auth hook's
 * `/api` prefix check must therefore operate on the decoded + normalized path
 * or variants like `/%61pi/…` or `//api/…` bypass authentication entirely.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const modUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/auth-cookies.js'),
).href

const { requestPath } = await import(modUrl)

/** Minimal FastifyRequest stand-in — requestPath only reads `url`. */
function req(url) {
  return { url }
}

describe('auth path normalization (F-02 regression)', () => {
  it('decodes percent-encoded /api so the hook cannot be bypassed', () => {
    assert.equal(requestPath(req('/%61pi/platform/extensions')), '/api/platform/extensions')
    assert.equal(requestPath(req('/%61pi/health')), '/api/health')
  })

  it('normalizes dot segments and duplicate slashes', () => {
    assert.equal(requestPath(req('//api/platform/extensions')), '/api/platform/extensions')
    assert.equal(requestPath(req('/api/./platform/extensions')), '/api/platform/extensions')
    assert.equal(requestPath(req('/api/platform/x/%2e%2e/y')), '/api/platform/y')
  })

  it('strips query strings', () => {
    assert.equal(requestPath(req('/api/platform/extensions?x=1')), '/api/platform/extensions')
  })

  it('plain paths unchanged', () => {
    assert.equal(requestPath(req('/api/health')), '/api/health')
    assert.equal(requestPath(req('/')), '/')
    assert.equal(requestPath(req(undefined)), '/')
  })

  it('isUnclaimedPlatformMutate still locks platform writes (sanity)', async () => {
    const hookUrl = pathToFileURL(
      path.join(here, '../apps/server/dist/auth-hook.js'),
    ).href
    const { isUnclaimedPlatformMutate } = await import(hookUrl)
    assert.equal(isUnclaimedPlatformMutate('POST', '/api/platform/extensions/install'), true)
    // Encoded variants normalize into the platform prefix → still locked.
    assert.equal(isUnclaimedPlatformMutate('POST', requestPath(req('/%61pi/platform/extensions/install'))), true)
    assert.equal(isUnclaimedPlatformMutate('GET', '/api/platform/extensions'), false)
    assert.equal(isUnclaimedPlatformMutate('POST', '/api/chat'), false)
  })
})
