/**
 * 外部 MCP：hydrate 有界并发 + tools schema 缓存。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  mapPool,
  resolveMcpHydrateConcurrency,
  ExternalMcpRegistry,
  resetExternalMcpRegistry,
} from '../packages/agent/dist/mcp/external/index.js'

test('resolveMcpHydrateConcurrency defaults to 2 and clamps to ≤3', () => {
  const prev = process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY
  try {
    delete process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY
    assert.equal(resolveMcpHydrateConcurrency(), 2)

    process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY = '3'
    assert.equal(resolveMcpHydrateConcurrency(), 3)

    process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY = '99'
    assert.equal(resolveMcpHydrateConcurrency(), 3)

    process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY = '1'
    assert.equal(resolveMcpHydrateConcurrency(), 1)

    process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY = '0'
    assert.equal(resolveMcpHydrateConcurrency(), 2)

    process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY = 'nope'
    assert.equal(resolveMcpHydrateConcurrency(), 2)
  } finally {
    if (prev === undefined) delete process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY
    else process.env.OPPTRIX_MCP_HYDRATE_CONCURRENCY = prev
  }
})

test('mapPool respects concurrency ceiling across mock servers', async () => {
  const servers = ['a', 'b', 'c', 'd', 'e']
  let inflight = 0
  let peak = 0
  const concurrency = 2

  const order = await mapPool(servers, concurrency, 0, async (id) => {
    inflight++
    peak = Math.max(peak, inflight)
    await new Promise(r => setTimeout(r, 40))
    inflight--
    return id
  })

  assert.deepEqual(order, servers)
  assert.ok(peak <= concurrency, `peak concurrency ${peak} exceeded limit ${concurrency}`)
  assert.ok(peak >= 2, `expected parallel work, peak=${peak}`)
})

test('listNamespacedOpenAiTools prefers schema cache (no listTools on hit)', async () => {
  const prevDir = process.env.OPPTRIX_DATA_DIR
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-mcp-cache-'))
  process.env.OPPTRIX_DATA_DIR = dir

  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  try {
    try { getUserDataStore().close() } catch { /* first open */ }
    resetExternalMcpRegistry()

    const store = getUserDataStore()
    store.mcpServers.create({
      id: 'alpha',
      title: 'Alpha',
      enabled: true,
      paused: false,
      sortOrder: 0,
      transportConfig: { transport: 'http', url: 'http://127.0.0.1:9/mcp' },
      capabilityBindings: { local_bound: 'remote_bound' },
    })
    store.mcpServers.create({
      id: 'beta',
      title: 'Beta',
      enabled: true,
      paused: false,
      sortOrder: 1,
      transportConfig: { transport: 'http', url: 'http://127.0.0.1:9/mcp2' },
      capabilityBindings: {},
    })

    const reg = new ExternalMcpRegistry()
    const alphaProbe = reg.seedConnectedServerForTest('alpha', [
      {
        name: 'remote_bound',
        description: 'bound',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'unique_alpha',
        description: 'alpha only',
        inputSchema: {
          type: 'object',
          properties: { q: { type: 'string' } },
          required: ['q'],
        },
      },
    ])
    const betaProbe = reg.seedConnectedServerForTest('beta', [
      {
        name: 'unique_beta',
        description: 'beta only',
        inputSchema: { type: 'object', properties: { n: { type: 'number' } } },
      },
    ])

    const tools1 = await reg.listNamespacedOpenAiTools()
    const tools2 = await reg.listNamespacedOpenAiTools()

    assert.equal(alphaProbe.listToolsCalls(), 0)
    assert.equal(betaProbe.listToolsCalls(), 0)

    const names1 = tools1.map(t => t.function.name).sort()
    assert.deepEqual(names1, ['alpha__unique_alpha', 'beta__unique_beta'])
    assert.equal(tools1[0]?.function.parameters?.properties?.q?.type, 'string')
    assert.deepEqual(
      tools2.map(t => t.function.name).sort(),
      names1,
    )

    // 删除 server 后清缓存；仅剩余 beta，仍走缓存
    reg.delete('alpha')
    const afterDelete = await reg.listNamespacedOpenAiTools()
    assert.deepEqual(afterDelete.map(t => t.function.name), ['beta__unique_beta'])
    assert.equal(betaProbe.listToolsCalls(), 0)

    // 清空 schema 缓存后应回落 listTools RPC 一次，随后再命中缓存
    reg['toolSchemas'].delete('beta')
    const afterMiss = await reg.listNamespacedOpenAiTools()
    assert.equal(afterMiss.length, 1)
    assert.equal(afterMiss[0]?.function.name, 'beta__unique_beta')
    assert.equal(betaProbe.listToolsCalls(), 1)
    await reg.listNamespacedOpenAiTools()
    assert.equal(betaProbe.listToolsCalls(), 1)
  } finally {
    try { getUserDataStore().close() } catch { /* ignore */ }
    resetExternalMcpRegistry()
    if (prevDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDir
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('cache miss triggers listTools once then hits cache', async () => {
  const prevDir = process.env.OPPTRIX_DATA_DIR
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-mcp-miss-'))
  process.env.OPPTRIX_DATA_DIR = dir

  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  try {
    try { getUserDataStore().close() } catch { /* first open */ }
    resetExternalMcpRegistry()

    getUserDataStore().mcpServers.create({
      id: 'gamma',
      title: 'Gamma',
      enabled: true,
      paused: false,
      sortOrder: 0,
      transportConfig: { transport: 'http', url: 'http://127.0.0.1:9/mcp3' },
      capabilityBindings: {},
    })

    const reg = new ExternalMcpRegistry()
    let rpcTools = 0
    const probe = reg.seedConnectedServerForTest(
      'gamma',
      [{
        name: 'g_tool',
        description: 'g',
        inputSchema: { type: 'object', properties: {} },
      }],
      async () => {
        rpcTools++
        return {
          tools: [{
            name: 'g_tool',
            description: 'g',
            inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
          }],
        }
      },
    )
    // 清掉 seed 写入的 schema，强制 miss
    reg['toolSchemas'].delete('gamma')

    const first = await reg.listNamespacedOpenAiTools()
    assert.equal(first.length, 1)
    assert.equal(first[0]?.function.name, 'gamma__g_tool')
    assert.equal(rpcTools, 1)
    assert.equal(probe.listToolsCalls(), 1)

    const second = await reg.listNamespacedOpenAiTools()
    assert.equal(second.length, 1)
    assert.equal(rpcTools, 1)
    assert.equal(probe.listToolsCalls(), 1)
    assert.equal(second[0]?.function.parameters?.properties?.x?.type, 'string')
  } finally {
    try { getUserDataStore().close() } catch { /* ignore */ }
    resetExternalMcpRegistry()
    if (prevDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDir
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
