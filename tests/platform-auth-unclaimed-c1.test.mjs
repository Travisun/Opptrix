import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const authHookUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/auth-hook.js'),
).href

describe('platform auth unclaimed C1', () => {
  /** @type {typeof import('../apps/server/dist/auth-hook.js')} */
  let authHook

  it('loads helpers', async () => {
    authHook = await import(authHookUrl)
    assert.equal(typeof authHook.isUnclaimedPlatformMutate, 'function')
    assert.equal(typeof authHook.isSensitiveRoute, 'function')
  })

  it('unclaimed: blocks platform mutates; allows GET/HEAD', async () => {
    authHook = await import(authHookUrl)
    assert.equal(authHook.isUnclaimedPlatformMutate('POST', '/api/platform/packs/x'), true)
    assert.equal(authHook.isUnclaimedPlatformMutate('PUT', '/api/platform/approvals/1/resolve'), true)
    assert.equal(authHook.isUnclaimedPlatformMutate('PATCH', '/api/platform/foo'), true)
    assert.equal(authHook.isUnclaimedPlatformMutate('DELETE', '/api/platform/foo'), true)
    assert.equal(authHook.isUnclaimedPlatformMutate('GET', '/api/platform/info'), false)
    assert.equal(authHook.isUnclaimedPlatformMutate('HEAD', '/api/platform/info'), false)
    assert.equal(authHook.isUnclaimedPlatformMutate('POST', '/api/auth/setup'), false)
    assert.equal(authHook.isUnclaimedPlatformMutate('POST', '/api/config'), false)
  })

  it('isSensitiveRoute: platform mutates are NOT sensitive (SF1); other step-up routes hold', async () => {
    authHook = await import(authHookUrl)
    assert.equal(authHook.isSensitiveRoute('POST', '/api/platform/packs/coding'), false)
    assert.equal(authHook.isSensitiveRoute('DELETE', '/api/platform/extensions/x'), false)
    assert.equal(authHook.isSensitiveRoute('PUT', '/api/platform/foo'), false)
    assert.equal(authHook.isSensitiveRoute('PATCH', '/api/platform/foo'), false)
    assert.equal(authHook.isSensitiveRoute('GET', '/api/platform/info'), false)
    assert.equal(authHook.isSensitiveRoute('HEAD', '/api/platform/approvals'), false)
    // Existing sensitive routes still hold
    assert.equal(authHook.isSensitiveRoute('PATCH', '/api/config'), true)
    assert.equal(authHook.isSensitiveRoute('POST', '/api/providers'), true)
    assert.equal(authHook.isSensitiveRoute('POST', '/api/auth/password'), true)
    assert.equal(authHook.isSensitiveRoute('POST', '/api/auth/totp/disable'), true)
    assert.equal(authHook.isSensitiveRoute('POST', '/api/auth/sessions/revoke-all'), true)
    assert.equal(authHook.isSensitiveRoute('PUT', '/api/settings/sandbox'), true)
  })
})
