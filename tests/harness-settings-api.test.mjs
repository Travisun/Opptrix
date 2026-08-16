/**
 * Self-Harness Phase 2/3 — settings REST：versions / active / rollback / auto-promote / audit
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-harness-settings-api-'))
const prevData = process.env.OPPTRIX_DATA_DIR
process.env.OPPTRIX_DATA_DIR = tmp

const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
getUserDataStore().close()

const agent = await import('../packages/agent/dist/index.js')
const {
  promoteHarnessProposal,
  rollbackHarnessToDefault,
  clearHarnessOverlayCache,
  loadHarnessStore,
} = agent

function goodProposal(summary = '取数纪律') {
  return {
    id: `p-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    targetWeaknessCodes: ['tool_error'],
    summary,
    patches: [
      {
        kind: 'skill_body_append',
        skillName: 'morning-market-brief',
        text: '\n## 测试纪律\n- 必须先取数再报价。\n',
      },
    ],
  }
}

async function buildApp() {
  const Fastify = (await import('fastify')).default
  const routesUrl = pathToFileURL(
    path.join(repoRoot, 'apps/server/dist/harness-settings-routes.js'),
  ).href
  const { registerHarnessSettingsRoutes } = await import(routesUrl)
  const app = Fastify({ logger: false })
  registerHarnessSettingsRoutes(app)
  await app.ready()
  return app
}

test.after(() => {
  try {
    getUserDataStore().close()
  } catch {
    /* ignore */
  }
  if (prevData == null) delete process.env.OPPTRIX_DATA_DIR
  else process.env.OPPTRIX_DATA_DIR = prevData
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('GET versions / active / rollback / auto-promote / audit happy path', async () => {
  clearHarnessOverlayCache()
  rollbackHarnessToDefault()

  const app = await buildApp()
  try {
    const emptyActive = await app.inject({
      method: 'GET',
      url: '/api/settings/harness/active?modelRef=',
    })
    assert.equal(emptyActive.statusCode, 200)
    const emptyBody = emptyActive.json()
    assert.equal(emptyBody.modelRef, '*')
    assert.equal(emptyBody.version, null)

    const promoted = promoteHarnessProposal(goodProposal(), {
      modelBucket: 'openai:gpt-4o',
      source: 'manual',
    })

    const versions = await app.inject({
      method: 'GET',
      url: '/api/settings/harness/versions?modelRef=openai:gpt-4o',
    })
    assert.equal(versions.statusCode, 200)
    const vBody = versions.json()
    assert.ok(vBody.versions.some(v => v.id === promoted.id))
    assert.ok(vBody.versions.every(v =>
      v.modelBucket === 'openai:gpt-4o' || v.modelBucket === '*',
    ))

    const active = await app.inject({
      method: 'GET',
      url: '/api/settings/harness/active?modelRef=openai:gpt-4o',
    })
    assert.equal(active.statusCode, 200)
    const aBody = active.json()
    assert.equal(aBody.modelRef, 'openai:gpt-4o')
    assert.equal(aBody.resolvedBucket, 'openai:gpt-4o')
    assert.equal(aBody.version?.id, promoted.id)

    const autoGet = await app.inject({ method: 'GET', url: '/api/settings/harness/auto-promote' })
    assert.equal(autoGet.statusCode, 200)
    assert.equal(typeof autoGet.json().enabled, 'boolean')
    assert.equal(typeof autoGet.json().updatedAt, 'string')
    assert.equal(autoGet.json().envForcedOff, undefined)

    const autoPut = await app.inject({
      method: 'PUT',
      url: '/api/settings/harness/auto-promote',
      payload: { enabled: false },
    })
    assert.equal(autoPut.statusCode, 200)
    assert.equal(autoPut.json().enabled, false)
    assert.equal(autoPut.json().envForcedOff, undefined)

    const rollback = await app.inject({
      method: 'POST',
      url: '/api/settings/harness/rollback',
      payload: { modelRef: 'openai:gpt-4o' },
    })
    assert.equal(rollback.statusCode, 200)
    assert.deepEqual(rollback.json(), { ok: true, modelRef: 'openai:gpt-4o' })

    const after = await app.inject({
      method: 'GET',
      url: '/api/settings/harness/active?modelRef=openai:gpt-4o',
    })
    assert.equal(after.json().version, null)

    const audit = await app.inject({
      method: 'GET',
      url: '/api/settings/harness/audit?limit=10',
    })
    assert.equal(audit.statusCode, 200)
    assert.ok(Array.isArray(audit.json().entries))
    assert.ok(audit.json().entries.length >= 1)

    // store still loadable after API writes
    assert.ok(loadHarnessStore())
  } finally {
    await app.close()
  }
})

test('illegal body / missing modelRef → 400', async () => {
  const app = await buildApp()
  try {
    const missingActive = await app.inject({
      method: 'GET',
      url: '/api/settings/harness/active',
    })
    assert.equal(missingActive.statusCode, 400)
    assert.match(String(missingActive.json().error || ''), /模型/)

    const badRollback = await app.inject({
      method: 'POST',
      url: '/api/settings/harness/rollback',
      payload: { modelRef: 123 },
    })
    assert.equal(badRollback.statusCode, 400)

    const badAuto = await app.inject({
      method: 'PUT',
      url: '/api/settings/harness/auto-promote',
      payload: { enabled: 'yes' },
    })
    assert.equal(badAuto.statusCode, 400)

    const badLimit = await app.inject({
      method: 'GET',
      url: '/api/settings/harness/audit?limit=abc',
    })
    assert.equal(badLimit.statusCode, 400)
  } finally {
    await app.close()
  }
})

test('auto-promote: env forced off → enabled false + envForcedOff; PUT still writes store', async () => {
  const prevEnv = process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
  process.env.OPPTRIX_HARNESS_AUTO_PROMOTE = '0'
  clearHarnessOverlayCache()
  rollbackHarnessToDefault()

  const app = await buildApp()
  try {
    const getForced = await app.inject({ method: 'GET', url: '/api/settings/harness/auto-promote' })
    assert.equal(getForced.statusCode, 200)
    assert.equal(getForced.json().enabled, false)
    assert.equal(getForced.json().envForcedOff, true)

    const putOn = await app.inject({
      method: 'PUT',
      url: '/api/settings/harness/auto-promote',
      payload: { enabled: true },
    })
    assert.equal(putOn.statusCode, 200)
    assert.equal(putOn.json().enabled, false)
    assert.equal(putOn.json().envForcedOff, true)
    // store preference written even while env forces off
    assert.equal(loadHarnessStore().autoPromote.enabled, true)
  } finally {
    await app.close()
    if (prevEnv == null) delete process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
    else process.env.OPPTRIX_HARNESS_AUTO_PROMOTE = prevEnv
  }
})
