/**
 * 外部 MCP：路由 failover、熔断、命名空间、install 确认门闩。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isMcpServerFailoverError,
  namespacedMcpTool,
  parseNamespacedMcpTool,
  isValidMcpServerId,
} from '../packages/shared/dist/mcp-servers.js'
import { ExternalMcpHealth } from '../packages/agent/dist/mcp/external/health.js'
import {
  annotateMcpResult,
  AggregatingToolBroker,
} from '../packages/agent/dist/mcp/external/index.js'

test('namespaced tool round-trip', () => {
  const name = namespacedMcpTool('alpha', 'get_quotes')
  assert.equal(name, 'alpha__get_quotes')
  assert.deepEqual(parseNamespacedMcpTool(name), { serverId: 'alpha', toolName: 'get_quotes' })
  assert.equal(parseNamespacedMcpTool('local_tool'), null)
})

test('isValidMcpServerId', () => {
  assert.equal(isValidMcpServerId('my-server'), true)
  assert.equal(isValidMcpServerId('A1'), false)
  assert.equal(isValidMcpServerId('_bad'), false)
})

test('isMcpServerFailoverError classifies quota and network', () => {
  assert.equal(isMcpServerFailoverError(new Error('rate limit 429')), true)
  assert.equal(isMcpServerFailoverError(new Error('ETIMEDOUT')), true)
  assert.equal(isMcpServerFailoverError(new Error('invalid argument foo')), false)
})

test('isMcpServerFailoverError classifies schema -32602 and auth', () => {
  assert.equal(
    isMcpServerFailoverError(new Error('MCP error -32602: Structured content does not match')),
    true,
  )
  assert.equal(
    isMcpServerFailoverError(new Error('Failed to validate structured content -32602')),
    true,
  )
  assert.equal(
    isMcpServerFailoverError(new Error('-32600 output schema but did not return structured content')),
    true,
  )
  assert.equal(isMcpServerFailoverError(new Error('Missing X-api-key header')), true)
  assert.equal(isMcpServerFailoverError(new Error('invalid api key')), true)
  assert.equal(isMcpServerFailoverError(new Error('unknown symbol XYZ')), false)
})

test('ExternalMcpHealth opens after consecutive failover failures', () => {
  const h = new ExternalMcpHealth()
  assert.equal(h.shouldSkip('s1', false), false)
  h.recordFailure('s1', new Error('timeout'))
  h.recordFailure('s1', new Error('timeout'))
  assert.equal(h.getState('s1', false), 'degraded')
  h.recordFailure('s1', new Error('timeout'))
  assert.equal(h.getState('s1', false), 'open')
  assert.equal(h.shouldSkip('s1', false), true)
  h.recordSuccess('s1')
  assert.equal(h.shouldSkip('s1', false), false)
  assert.equal(h.getState('s1', false), 'healthy')
})

test('ExternalMcpHealth does not trip on business errors', () => {
  const h = new ExternalMcpHealth()
  h.recordFailure('s1', new Error('unknown symbol XYZ'))
  h.recordFailure('s1', new Error('unknown symbol XYZ'))
  h.recordFailure('s1', new Error('unknown symbol XYZ'))
  assert.notEqual(h.getState('s1', false), 'open')
  assert.equal(h.shouldSkip('s1', false), false)
})

test('quota error opens circuit immediately', () => {
  const h = new ExternalMcpHealth()
  h.recordFailure('s1', new Error('quota exceeded 429'))
  assert.equal(h.getState('s1', false), 'open')
  assert.equal(h.shouldSkip('s1', false), true)
})

test('annotateMcpResult marks source and degraded', () => {
  const a = annotateMcpResult({ price: 1 }, 'ext-a')
  assert.equal(a.price, 1)
  assert.equal(a._mcp.source, 'ext-a')
  assert.equal(a._mcp.degraded, false)
  const b = annotateMcpResult('raw', 'local', { degraded: true })
  assert.equal(b.data, 'raw')
  assert.equal(b._mcp.source, 'local')
  assert.equal(b._mcp.degraded, true)
})

test('AggregatingToolBroker failover: skip failed external then local', async () => {
  const calls = []
  const local = {
    async openAiTools() {
      return [{
        type: 'function',
        function: { name: 'get_quotes', description: 'local', parameters: { type: 'object' } },
      }]
    },
    async call(name, args) {
      calls.push(`local:${name}`)
      return { price: 42, args }
    },
    async close() {},
  }

  const external = {
    async hydrate() {},
    listNamespacedOpenAiTools() { return [] },
    resolveBindingChain(name) {
      if (name !== 'get_quotes') return []
      return [
        { serverId: 'a', remoteTool: 'quotes' },
        { serverId: 'b', remoteTool: 'quotes' },
      ]
    },
    resolveAutoBindChain() { return [] },
    async callExternal(serverId, toolName) {
      calls.push(`${serverId}:${toolName}`)
      if (serverId === 'a') throw new Error('ETIMEDOUT')
      if (serverId === 'b') throw new Error('503 unavailable')
      return { ok: true }
    },
    async callNamespaced() {
      throw new Error('unused')
    },
  }

  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_quotes', { code: '600519' })
  assert.deepEqual(calls, ['a:quotes', 'b:quotes', 'local:get_quotes'])
  assert.equal(result.price, 42)
  assert.equal(result._mcp.source, 'local')
  assert.equal(result._mcp.degraded, true)
  await broker.close()
})

test('AggregatingToolBroker schema -32602 error failover to local', async () => {
  const calls = []
  const local = {
    async openAiTools() { return [] },
    async call(name) {
      calls.push(`local:${name}`)
      return { price: 99 }
    },
    async close() {},
  }
  const external = {
    async hydrate() {},
    listNamespacedOpenAiTools() { return [] },
    resolveBindingChain() {
      return [{ serverId: 'a', remoteTool: 'quotes' }]
    },
    resolveAutoBindChain() { return [] },
    async callExternal(serverId, toolName) {
      calls.push(`${serverId}:${toolName}`)
      throw new Error('MCP error -32602: Structured content does not match output schema')
    },
    async callNamespaced() { throw new Error('unused') },
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_quotes', { code: '600519' })
  assert.deepEqual(calls, ['a:quotes', 'local:get_quotes'])
  assert.equal(result.price, 99)
  assert.equal(result._mcp.source, 'local')
  assert.equal(result._mcp.degraded, true)
  await broker.close()
})

test('AggregatingToolBroker Missing X-api-key failover to local with configHint', async () => {
  const calls = []
  const local = {
    async openAiTools() { return [] },
    async call(name) {
      calls.push(`local:${name}`)
      return { price: 88 }
    },
    async close() {},
  }
  const external = {
    async hydrate() {},
    listNamespacedOpenAiTools() { return [] },
    resolveBindingChain() {
      return [{ serverId: 'a', remoteTool: 'quotes' }]
    },
    resolveAutoBindChain() { return [] },
    async callExternal(serverId, toolName) {
      calls.push(`${serverId}:${toolName}`)
      throw new Error('Missing X-api-key header')
    },
    async callNamespaced() { throw new Error('unused') },
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_quotes', { code: '600519' })
  assert.deepEqual(calls, ['a:quotes', 'local:get_quotes'])
  assert.equal(result.price, 88)
  assert.equal(result._mcp.degraded, true)
  assert.equal(result._mcp.configHint, '请在 MCP 服务器设置中配置 API Key')
  await broker.close()
})

test('AggregatingToolBroker business error does not failover', async () => {
  const calls = []
  const local = {
    async openAiTools() { return [] },
    async call() {
      calls.push('local')
      return { from: 'local' }
    },
    async close() {},
  }
  const external = {
    async hydrate() {},
    listNamespacedOpenAiTools() { return [] },
    resolveBindingChain() {
      return [{ serverId: 'a', remoteTool: 't' }]
    },
    resolveAutoBindChain() { return [] },
    async callExternal(serverId) {
      calls.push(serverId)
      throw new Error('invalid argument')
    },
    async callNamespaced() { throw new Error('unused') },
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_quotes', {})
  assert.deepEqual(calls, ['a'])
  assert.ok(result.error)
  assert.equal(result._mcp?.source, 'a')
  await broker.close()
})

test('AggregatingToolBroker namespaced tool calls external only', async () => {
  const local = {
    async openAiTools() { return [] },
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('local should not run') },
    async close() {},
  }
  const external = {
    async hydrate() {},
    listNamespacedOpenAiTools() {
      return [{
        type: 'function',
        function: {
          name: 'ext__special',
          description: 'x',
          parameters: { type: 'object' },
        },
      }]
    },
    resolveBindingChain() { return [] },
    async callExternal() { throw new Error('unused') },
    async callNamespaced(name, args) {
      assert.equal(name, 'ext__special')
      return { args, ok: true }
    },
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const tools = await broker.openAiTools()
  assert.equal(tools.some(t => t.function.name === 'ext__special'), true)
  const result = await broker.call('ext__special', { q: 1 })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'ext')
  await broker.close()
})

test('install_mcp_server requires confirmed=true', async () => {
  const { ToolRegistry } = await import('../packages/agent/dist/tools.js')
  const { ResearchHub } = await import('../packages/research-hub/dist/hub.js')
  const registry = new ToolRegistry(new ResearchHub())
  const tool = registry.list().find(t => t.name === 'install_mcp_server')
  assert.ok(tool)
  const draft = await tool.handler({
    title: 'Test MCP',
    transport: 'stdio',
    command: 'echo',
    args: ['hi'],
  })
  assert.equal(draft.needs_confirmation, true)
  assert.ok(draft.summary)

  const uninstall = registry.list().find(t => t.name === 'uninstall_mcp_server')
  assert.ok(uninstall)
  // without existing server still gates on confirmed
  const u = await uninstall.handler({ server_id: 'nope' })
  assert.ok(u.error)
})
