/**
 * Phase A hooks + route contributions tests.
 *
 * Hooks: extensions register read-only observers via callGate('hooks.register').
 * Routes: extensions register /api/ext/{id}/* sub-routes via callGate('routes.register').
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const platformModUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/platform/index.js'),
).href

let tmpRoot
let dataDir
let platform

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-ext-hook-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  platform = await import(`${platformModUrl}?t=${Date.now()}`)
  platform.resetPlatformContextForTests()
})
afterEach(() => {
  platform.resetPlatformContextForTests()
  delete process.env.OPPTRIX_DATA_DIR
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('Phase A — hooks', () => {
  it('extension registers a hook and receives dispatched events', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'hook.1', permissions: ['events.subscribe'] },
      { trusted: true },
    )
    await ctx.extensions.activate('hook.1')

    const observed = []
    const regResult = await ctx.extensions.run('hook.1', async (api) => {
      return api.callGate('hooks.register', {
        point: 'session.messageCommitted',
        priority: 10,
        handler: (payload) => {
          observed.push(payload)
          return { observed: true }
        },
      })
    })
    assert.equal(regResult.data.ok, true)
    assert.equal(regResult.data.data.ok, true)
    const hookId = regResult.data.data.id
    assert.equal(typeof hookId, 'string')

    // Dispatch via the manager (simulates platform firing the hook).
    const results = await ctx.extensions.hooksDispatch('session.messageCommitted', {
      sessionId: 's1',
      role: 'assistant',
      text: 'hello',
    })
    assert.equal(results.length, 1)
    assert.equal(results[0].pluginId, 'hook.1')
    assert.equal(results[0].observation.ok, true)
    assert.equal(observed.length, 1)
    assert.equal(observed[0].text, 'hello')
  })

  it('hook dispatch is isolated: a hook only receives its own point', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'hook.2', permissions: ['events.subscribe'] },
      { trusted: true },
    )
    await ctx.extensions.activate('hook.2')

    await ctx.extensions.run('hook.2', async (api) => {
      return api.callGate('hooks.register', {
        point: 'agent.toolPreExecute',
        handler: () => ({ ok: true }),
      })
    })

    // Dispatching a different point should not trigger this hook.
    const results = await ctx.extensions.hooksDispatch('session.messageCommitted', {})
    assert.equal(results.length, 0)
  })

  it('deactivate unregisters all hooks for the plugin', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'hook.3', permissions: ['events.subscribe'] },
      { trusted: true },
    )
    await ctx.extensions.activate('hook.3')

    await ctx.extensions.run('hook.3', async (api) => {
      await api.callGate('hooks.register', {
        point: 'session.messageCommitted',
        handler: () => ({ ok: true }),
      })
      await api.callGate('hooks.register', {
        point: 'agent.toolPreExecute',
        handler: () => ({ ok: true }),
      })
    })
    assert.equal(ctx.extensions.getHookRegistry().list().length, 2)

    await ctx.extensions.deactivate('hook.3')
    assert.equal(ctx.extensions.getHookRegistry().list().length, 0)
  })

  it('hook timeout does not block dispatch (R0)', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'hook.4', permissions: ['events.subscribe'] },
      { trusted: true },
    )
    await ctx.extensions.activate('hook.4')

    await ctx.extensions.run('hook.4', async (api) => {
      return api.callGate('hooks.register', {
        point: 'session.messageCommitted',
        timeoutMs: 1, // force a timeout
        handler: () => new Promise((resolve) => setTimeout(resolve, 50)),
      })
    })

    const results = await ctx.extensions.hooksDispatch('session.messageCommitted', {})
    assert.equal(results.length, 1)
    // Timed out → observation ok:false, but dispatch itself succeeds (R0).
    assert.equal(results[0].observation.ok, false)
    assert.match(results[0].observation.message, /timed out/)
  })
})

describe('Phase A — route contributions', () => {
  it('extension registers a route and it can be matched', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'route.1', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('route.1')

    const regResult = await ctx.extensions.run('route.1', async (api) => {
      return api.callGate('routes.register', {
        path: '/hello',
        methods: ['GET', 'POST'],
        handler: (req) => {
          return { status: 200, body: { msg: 'hi', method: req.method } }
        },
      })
    })
    assert.equal(regResult.data.data.ok, true)
    const routeId = regResult.data.data.id

    // Match the route.
    const routeRegistry = ctx.extensions.getRouteRegistry()
    const matched = routeRegistry.match('GET', '/hello')
    assert.ok(matched, 'route should match')
    assert.equal(matched.route.pluginId, 'route.1')
    assert.ok(matched.route.methods.includes('POST'))

    // Invoke the handler.
    const { invokeRouteHandler } = await import(
      pathToFileURL(path.join(here, '../apps/server/dist/platform/extensions/route-contributions.js')).href
    )
    const response = await invokeRouteHandler(matched.route.handle, {
      method: 'GET',
      path: '/hello',
      query: {},
      body: null,
      headers: {},
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.msg, 'hi')
  })

  it('route matching supports path params', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'route.2', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('route.2')

    await ctx.extensions.run('route.2', async (api) => {
      return api.callGate('routes.register', {
        path: '/items/:id',
        handler: (req) => ({ status: 200, body: req }),
      })
    })

    const routeRegistry = ctx.extensions.getRouteRegistry()
    const matched = routeRegistry.match('GET', '/items/42')
    assert.ok(matched, 'route with param should match')
    assert.equal(matched.params.id, '42')

    const notMatched = routeRegistry.match('GET', '/items/42/extra')
    assert.equal(notMatched, null)
  })

  it('deactivate unregisters all routes for the plugin', async () => {
    const ctx = platform.createPlatformContext()
    await ctx.extensions.registerFromManifest(
      { id: 'route.3', permissions: ['storage'] },
      { trusted: true },
    )
    await ctx.extensions.activate('route.3')

    await ctx.extensions.run('route.3', async (api) => {
      await api.callGate('routes.register', { path: '/a', handler: () => ({ status: 200 }) })
      await api.callGate('routes.register', { path: '/b', handler: () => ({ status: 200 }) })
    })
    assert.equal(ctx.extensions.getRouteRegistry().list().length, 2)

    await ctx.extensions.deactivate('route.3')
    assert.equal(ctx.extensions.getRouteRegistry().list().length, 0)
  })
})
