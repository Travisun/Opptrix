/**
 * Capability Orchestrator：能力两层回退、会话隔离、disabled_list、429。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyMcpServerError,
  parseMcpRetryAfterMs,
  isMcpServerFailoverError,
} from '../packages/shared/dist/mcp-servers.js'
import { ExternalMcpHealth } from '../packages/agent/dist/mcp/external/health.js'
import {
  AggregatingToolBroker,
  adaptCapabilityArgs,
  buildDisabledMcpTurnTail,
  clearMcpSessionQuarantine,
  clearMcpSessionQuarantineServer,
  EXTERNAL_MCP_CAPABILITY_GUIDE,
  extractTabular,
  LOCAL_ONLY_TOOL_NAMES,
  relatedCapabilities,
  resetSessionMcpQuarantineForTests,
  resolveToolCapability,
  setMcpRateLimitWaitForTests,
  resetMcpRateLimitWaitForTests,
  SufficiencyChecker,
  synthesizeMarketListQuery,
  TOOL_SUFFICIENCY_SPECS,
} from '../packages/agent/dist/mcp/external/index.js'
import { runInToolSession } from '../packages/agent/dist/mcp/tool-session-context.js'

test.beforeEach(() => {
  resetSessionMcpQuarantineForTests()
  resetMcpRateLimitWaitForTests()
  setMcpRateLimitWaitForTests(() => Promise.resolve())
})

test.afterEach(() => {
  resetSessionMcpQuarantineForTests()
  resetMcpRateLimitWaitForTests()
})

test('classifyMcpServerError: 429 vs 401 vs timeout vs invalid argument', () => {
  assert.equal(classifyMcpServerError(new Error('rate limit 429')), 'rate_limited')
  assert.equal(classifyMcpServerError(new Error('quota exceeded')), 'rate_limited')
  assert.equal(classifyMcpServerError(new Error('401 unauthorized')), 'hard_unavailable')
  assert.equal(classifyMcpServerError(new Error('invalid api key')), 'hard_unavailable')
  assert.equal(classifyMcpServerError(new Error('Missing X-api-key header')), 'hard_unavailable')
  assert.equal(classifyMcpServerError(new Error('handshake failed')), 'hard_unavailable')
  assert.equal(classifyMcpServerError(new Error('握手失败')), 'hard_unavailable')
  assert.equal(classifyMcpServerError(new Error('ETIMEDOUT')), 'transient')
  assert.equal(classifyMcpServerError(new Error('503 unavailable')), 'transient')
  assert.equal(classifyMcpServerError(new Error('无法连接 MCP Server x')), 'transient')
  assert.equal(classifyMcpServerError(new Error('Connection refused')), 'transient')
  assert.equal(classifyMcpServerError(new Error('ECONNRESET')), 'transient')
  assert.equal(classifyMcpServerError(new Error('socket hang up')), 'transient')
  assert.equal(classifyMcpServerError(new Error('connect failed')), 'transient')
  assert.equal(classifyMcpServerError(new Error('invalid argument foo')), 'business')
  assert.equal(isMcpServerFailoverError(new Error('429')), true)
  assert.equal(isMcpServerFailoverError(new Error('401')), true)
  assert.equal(isMcpServerFailoverError(new Error('invalid argument')), false)
  const ms = parseMcpRetryAfterMs(new Error('retry-after: 3'))
  assert.ok(ms >= 1000 && ms <= 5000)
})

test('ExternalMcpHealth: 429 does not open; 3x timeout still opens', () => {
  const h = new ExternalMcpHealth()
  h.recordFailure('s1', new Error('429 Too Many Requests'))
  assert.equal(h.getState('s1', false), 'degraded')
  assert.equal(h.shouldSkip('s1', false), false)

  const h2 = new ExternalMcpHealth()
  h2.recordFailure('s1', new Error('timeout'))
  h2.recordFailure('s1', new Error('timeout'))
  assert.equal(h2.getState('s1', false), 'degraded')
  h2.recordFailure('s1', new Error('timeout'))
  assert.equal(h2.getState('s1', false), 'open')
})

test('resolveToolCapability maps query2data and search_instruments', () => {
  assert.equal(resolveToolCapability('iwencai__query2data'), 'search_nl')
  assert.equal(resolveToolCapability('search_instruments'), 'search_symbol')
  assert.equal(resolveToolCapability('get_instrument_snapshot'), 'snapshot')
  assert.equal(resolveToolCapability('batch_instrument_snapshots'), 'snapshot')
  assert.equal(resolveToolCapability('get_instrument_profile'), 'profile')
  assert.equal(resolveToolCapability('get_instrument_financials'), 'financials')
  assert.equal(resolveToolCapability('get_instrument_shareholders'), 'financials')
  assert.equal(resolveToolCapability('get_instrument_institution_holdings'), 'financials')
  assert.equal(resolveToolCapability('get_instrument_dividend'), 'financials')
  assert.equal(resolveToolCapability('get_limit_updown'), 'market_lists')
  assert.equal(resolveToolCapability('get_dragon_tiger'), 'market_lists')
  assert.equal(resolveToolCapability('get_cn_market_special'), 'market_lists')
  assert.equal(resolveToolCapability('get_market_dynamics'), 'market_lists')
  assert.equal(resolveToolCapability('get_trade_calendar'), 'market_lists')
  assert.equal(resolveToolCapability('get_market_session'), 'market_lists')
  assert.equal(resolveToolCapability('get_market_sentiment'), 'market_lists')
  assert.equal(resolveToolCapability('get_market_regime'), 'market_lists')
  assert.equal(resolveToolCapability('get_sector_list'), 'constituents')
  assert.equal(resolveToolCapability('get_sector_constituents'), 'constituents')
  assert.deepEqual(relatedCapabilities('market_lists'), ['search_nl'])
  assert.equal(resolveToolCapability('evaluate_instrument'), null)
  assert.equal(resolveToolCapability('get_instrument_cyq'), 'cyq')
  assert.deepEqual(relatedCapabilities('cyq'), ['search_nl'])
  assert.equal(resolveToolCapability('chip_distribution'), 'cyq')
  assert.equal(resolveToolCapability('opaque_cyq', '查询筹码分布'), 'cyq')
  assert.equal(resolveToolCapability('dragon_tiger_list'), 'market_lists')
  assert.equal(resolveToolCapability('limit_up_pool'), 'market_lists')
  assert.equal(resolveToolCapability('trade_calendar_api', '交易日历'), 'market_lists')
  assert.equal(resolveToolCapability('sector_list_remote', '板块目录'), 'constituents')
  assert.equal(resolveToolCapability('get_instrument_strategy_signal'), null)
  assert.equal(resolveToolCapability('get_instrument_institution_rating'), null)
  assert.equal(resolveToolCapability('run_backtest'), null)
  assert.equal(resolveToolCapability('verify_instrument_strategy'), null)
  assert.equal(resolveToolCapability('strategy_report'), null)
  assert.equal(resolveToolCapability('get_instrument_latest_evaluation'), null)
  assert.equal(resolveToolCapability('get_instrument_institution_report'), null)
  assert.equal(resolveToolCapability('get_watchlist'), null)
  assert.equal(resolveToolCapability('ext__snapshot_quote'), 'snapshot')
  assert.equal(resolveToolCapability('ext__special'), null)
  assert.notEqual(resolveToolCapability('foo_symbol_meta'), 'search_symbol')
})

test('class-method listCapabilityCandidates keeps this (iwencai this.repo)', async () => {
  class RegistryLike {
    constructor() {
      this.calls = []
      this.health = { shouldSkip: () => false }
    }
    get repo() {
      return {
        listAll: () => [{
          id: 'iwencai',
          enabled: true,
          paused: false,
          sortOrder: 0,
          capabilityBindings: {},
        }],
      }
    }
    listCapabilityCandidates(cap) {
      const rows = this.repo.listAll()
      if (cap !== 'search_nl' && cap !== 'search_symbol') return []
      return rows.map(r => ({
        serverId: r.id,
        remoteTool: 'query2data',
        sortOrder: r.sortOrder,
      }))
    }
    async hydrate() {}
    listNamespacedOpenAiTools() { return [] }
    resolveBindingChain() { return [] }
    resolveAutoBindChain() { return [] }
    async callExternal(serverId, toolName) {
      this.calls.push(`${serverId}:${toolName}`)
      return { ok: true, datas: [{ code: '000858' }] }
    }
    async callNamespaced(name, args) {
      const i = name.indexOf('__')
      return this.callExternal(name.slice(0, i), name.slice(i + 2), args)
    }
  }
  const external = new RegistryLike()
  const local = {
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('local should not run') },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('iwencai__query2data', { query: '五粮液' })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.deepEqual(external.calls, ['iwencai:query2data'])
  await broker.close()
})

function makeCatalogFake(opts) {
  const {
    candidatesByCap = {},
    callExternalImpl,
    namespacedTools = [],
  } = opts
  const calls = []
  return {
    calls,
    async hydrate() {},
    listNamespacedOpenAiTools() {
      return namespacedTools
    },
    listCapabilityCandidates(cap) {
      return candidatesByCap[cap] ?? []
    },
    resolveBindingChain() { return [] },
    resolveAutoBindChain() { return [] },
    health: {
      shouldSkip() { return false },
    },
    async callExternal(serverId, toolName, args) {
      calls.push(`${serverId}:${toolName}`)
      return callExternalImpl(serverId, toolName, args, calls)
    },
    async callNamespaced(name, args) {
      const i = name.indexOf('__')
      return this.callExternal(name.slice(0, i), name.slice(i + 2), args)
    },
  }
}

test('session quarantine: hard_unavailable skips server; tools[] still lists it', async () => {
  const external = makeCatalogFake({
    candidatesByCap: {
      search_nl: [
        { serverId: 'a', remoteTool: 'query2data', sortOrder: 0 },
        { serverId: 'b', remoteTool: 'query2data', sortOrder: 1 },
      ],
      search_symbol: [],
    },
    namespacedTools: [
      {
        type: 'function',
        function: { name: 'a__query2data', description: 'a', parameters: { type: 'object' } },
      },
      {
        type: 'function',
        function: { name: 'b__query2data', description: 'b', parameters: { type: 'object' } },
      },
    ],
    callExternalImpl(serverId) {
      if (serverId === 'a') throw new Error('401 unauthorized')
      return { rows: [{ code: '600519' }], ok: true }
    },
  })
  const local = {
    async openAiTools() { return [] },
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('local should not run') },
    async close() {},
  }

  const broker = await AggregatingToolBroker.create(async () => local, external)
  await runInToolSession('s1', async () => {
    const result = await broker.call('a__query2data', { query: '茅台' })
    assert.equal(result.ok, true)
    assert.equal(result._mcp.source, 'b')
    assert.deepEqual(external.calls, ['a:query2data', 'b:query2data'])

    external.calls.length = 0
    const again = await broker.call('a__query2data', { query: '茅台' })
    assert.equal(again.ok, true)
    assert.equal(again._mcp.source, 'b')
    // A 被会话隔离，不再 callExternal A
    assert.deepEqual(external.calls, ['b:query2data'])
  })

  const tools = await broker.openAiTools()
  assert.equal(tools.some(t => t.function.name === 'a__query2data'), true)

  const tail = buildDisabledMcpTurnTail('s1')
  assert.match(tail, /a/)
  assert.match(tail, /本轮勿用的外部数据源/)

  await broker.close()
})

test('connection refused is transient: A fails, B same capability succeeds', async () => {
  const external = makeCatalogFake({
    candidatesByCap: {
      search_nl: [
        { serverId: 'a', remoteTool: 'query2data', sortOrder: 0 },
        { serverId: 'b', remoteTool: 'query2data', sortOrder: 1 },
      ],
    },
    callExternalImpl(serverId) {
      if (serverId === 'a') throw new Error('无法连接 MCP Server a')
      return { ok: true, from: 'b' }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('local should not run') },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('a__query2data', { query: '茅台' })
  assert.equal(result.from, 'b')
  assert.equal(result._mcp.source, 'b')
  assert.deepEqual(external.calls, ['a:query2data', 'b:query2data'])
  await broker.close()
})

test('clearSession clears quarantine so turn-tail is empty', () => {
  return runInToolSession('clear-sess', async () => {
    const { disableMcpServerHard, isMcpServerSessionDisabled } =
      await import('../packages/agent/dist/mcp/external/index.js')
    disableMcpServerHard('clear-sess', 'iwencai')
    assert.equal(isMcpServerSessionDisabled('clear-sess', 'iwencai'), true)
    assert.match(buildDisabledMcpTurnTail('clear-sess'), /iwencai/)
    clearMcpSessionQuarantine('clear-sess')
    assert.equal(isMcpServerSessionDisabled('clear-sess', 'iwencai'), false)
    assert.equal(buildDisabledMcpTurnTail('clear-sess'), '')
  })
})

test('429 wait respects AbortSignal and does not sleep full retry-after', async () => {
  setMcpRateLimitWaitForTests(() => new Promise(() => {}))
  const ac = new AbortController()
  const external = makeCatalogFake({
    candidatesByCap: {
      search_nl: [{ serverId: 'a', remoteTool: 'query2data', sortOrder: 0 }],
    },
    callExternalImpl() {
      throw new Error('429 rate limit')
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('no local') },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const started = Date.now()
  const pending = runInToolSession('s-abort', () =>
    broker.call('a__query2data', { query: 'x' }, { signal: ac.signal }),
  )
  setTimeout(() => ac.abort(), 20)
  await assert.rejects(pending, (err) => {
    assert.equal(err instanceof Error ? err.name : '', 'AbortError')
    return true
  })
  assert.ok(Date.now() - started < 1000)
  await broker.close()
})

test('429 path does not enter disabled_list', async () => {
  let attempts = 0
  const external = makeCatalogFake({
    candidatesByCap: {
      search_nl: [
        { serverId: 'a', remoteTool: 'query2data', sortOrder: 0 },
        { serverId: 'b', remoteTool: 'query2data', sortOrder: 1 },
      ],
    },
    callExternalImpl(serverId) {
      if (serverId === 'a') {
        attempts += 1
        throw new Error('429 rate limit')
      }
      return { ok: true, from: 'b' }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('no local') },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  await runInToolSession('s429', async () => {
    const result = await broker.call('a__query2data', { query: 'x' })
    assert.equal(result.from, 'b')
    // 同候选短重试 1 次 → 至少 2 次打 A，再 B
    assert.ok(attempts >= 2)
    const tail = buildDisabledMcpTurnTail('s429')
    assert.equal(tail.includes('a'), false)
  })
  await broker.close()
})

test('iwencai__query2data 401 → other search_nl external succeeds', async () => {
  const external = makeCatalogFake({
    candidatesByCap: {
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
        { serverId: 'other', remoteTool: 'nl_search', sortOrder: 1 },
      ],
    },
    callExternalImpl(serverId, toolName) {
      if (serverId === 'iwencai') throw new Error('invalid api key')
      assert.equal(toolName, 'nl_search')
      return { hits: [1], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('local unused') },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('iwencai__query2data', { query: '白酒' })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'other')
  assert.deepEqual(external.calls, ['iwencai:query2data', 'other:nl_search'])
  await broker.close()
})

test('iwencai__query2data both externals fail → local search_instruments with keyword', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
        { serverId: 'other', remoteTool: 'query2data', sortOrder: 1 },
      ],
      search_symbol: [],
    },
    callExternalImpl() {
      throw new Error('503 unavailable')
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { items: [{ symbol: '600519' }] }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('iwencai__query2data', { query: '茅台' })
  assert.equal(result._mcp.source, 'local')
  assert.equal(result._mcp.degraded, true)
  assert.equal(localCalls.length, 1)
  assert.equal(localCalls[0].name, 'search_instruments')
  assert.equal(localCalls[0].args.keyword, '茅台')
  await broker.close()
})

test('get_instrument_snapshot prefers external query2data first', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      snapshot: [],
      quotes: [],
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, args) {
      assert.equal(serverId, 'iwencai')
      assert.equal(toolName, 'query2data')
      assert.equal(args.query, '600519')
      return { symbol: '600519', name: '贵州茅台', ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_snapshot', {
    instrument: { symbol: '600519' },
  })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.equal(localCalls.length, 0)
  await broker.close()
})

test('get_instrument_snapshot prefers external quotes when catalog has quotes', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      snapshot: [],
      quotes: [
        { serverId: 'fuyao', remoteTool: 'quotes', sortOrder: 0 },
      ],
      search_nl: [],
    },
    callExternalImpl(serverId, toolName, args) {
      assert.equal(serverId, 'fuyao')
      assert.equal(toolName, 'quotes')
      assert.equal(args.instrument.symbol, '600519')
      return { symbol: '600519', name: '贵州茅台', price: 1800, ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_snapshot', {
    instrument: { symbol: '600519' },
  })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'fuyao')
  assert.equal(localCalls.length, 0)
  await broker.close()
})

test('get_instrument_quotes prefers external query2data when catalog only has search_nl', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      quotes: [],
      snapshot: [],
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, args) {
      assert.equal(serverId, 'iwencai')
      assert.equal(toolName, 'query2data')
      assert.equal(args.query, '600519')
      return { symbol: '600519', price: 1800, ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_quotes', {
    instruments: [{ symbol: '600519' }],
    instrument: { symbol: '600519' },
  })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.equal(localCalls.length, 0)
  await broker.close()
})

test('get_instrument_chart prefers external query2data when catalog only has search_nl', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      kline: [],
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, args) {
      assert.equal(serverId, 'iwencai')
      assert.equal(toolName, 'query2data')
      assert.equal(args.query, '000858')
      return { bars: [{ close: 100 }], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_chart', {
    instrument: { symbol: '000858' },
  })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.equal(localCalls.length, 0)
  await broker.close()
})

test('get_instrument_shareholders maps financials and prefers query2data L1', async () => {
  assert.equal(resolveToolCapability('get_instrument_shareholders'), 'financials')
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      financials: [],
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, args) {
      assert.equal(serverId, 'iwencai')
      assert.equal(toolName, 'query2data')
      assert.equal(args.query, '600519')
      return { holders: [{ name: '机构A' }], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_shareholders', {
    instrument: { symbol: '600519' },
  })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.equal(localCalls.length, 0)
  await broker.close()
})

test('search_instruments prefers external query2data first', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
      ],
      search_symbol: [],
    },
    callExternalImpl(serverId, toolName, args) {
      assert.equal(serverId, 'iwencai')
      assert.equal(toolName, 'query2data')
      assert.equal(args.query, '宁德时代')
      return { rows: [{ code: '300750' }], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('search_instruments', { keyword: '宁德时代' })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.equal(localCalls.length, 0)
  await broker.close()
})

async function assertMarketListL1(toolName, args, expectedQuery) {
  const localCalls = []
  const captured = []
  const external = makeCatalogFake({
    candidatesByCap: {
      market_lists: [],
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, callArgs) {
      captured.push({ serverId, toolName, args: callArgs })
      assert.equal(serverId, 'iwencai')
      assert.equal(toolName, 'query2data')
      assert.equal(typeof callArgs.query, 'string')
      assert.ok(String(callArgs.query).trim().length > 0, 'query must be non-empty')
      assert.equal(callArgs.query, expectedQuery)
      return { rows: [{ name: '榜单' }], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, callArgs) {
      localCalls.push({ name, args: callArgs })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call(toolName, args)
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.equal(localCalls.length, 0)
  assert.equal(captured.length, 1)
  await broker.close()
}

test('get_limit_updown prefers query2data L1 with synthesized Chinese query', async () => {
  await assertMarketListL1('get_limit_updown', {}, '今日涨停跌停')
  await assertMarketListL1('get_limit_updown', { date: '2026-08-17' }, '2026-08-17涨停跌停')
  await assertMarketListL1('get_limit_updown', { query: '自定义涨停池' }, '自定义涨停池')
})

test('get_dragon_tiger prefers query2data L1 with synthesized Chinese query', async () => {
  await assertMarketListL1('get_dragon_tiger', {}, '今日龙虎榜')
  await assertMarketListL1('get_dragon_tiger', { date: '2026-08-17' }, '2026-08-17龙虎榜')
})

test('get_cn_market_special prefers query2data L1 with kind-based query', async () => {
  await assertMarketListL1(
    'get_cn_market_special',
    { kind: 'limit_up_ladder' },
    '连板天梯',
  )
})

test('get_market_dynamics prefers query2data L1 with synthesized Chinese query', async () => {
  await assertMarketListL1('get_market_dynamics', {}, '今日市场概况 主要指数 涨跌家数')
})

test('get_trade_calendar / session / sentiment / regime prefer query2data L1 with synthesized Chinese query', async () => {
  await assertMarketListL1('get_trade_calendar', {}, '当年交易日历')
  await assertMarketListL1('get_trade_calendar', { year: '2026' }, '2026年交易日历')
  await assertMarketListL1('get_market_session', {}, '是否开盘')
  await assertMarketListL1('get_market_sentiment', {}, '市场情绪')
  await assertMarketListL1('get_market_regime', {}, '市场牛熊风险偏好')
})

test('get_sector_list prefers query2data L1 with synthesized Chinese query', async () => {
  const localCalls = []
  const captured = []
  const external = makeCatalogFake({
    candidatesByCap: {
      constituents: [],
      search_nl: [
        { serverId: 'iwencai', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, callArgs) {
      captured.push({ serverId, toolName, args: callArgs })
      assert.equal(serverId, 'iwencai')
      assert.equal(toolName, 'query2data')
      assert.equal(callArgs.query, 'A股板块行业目录')
      return { rows: [{ name: '目录' }], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, callArgs) {
      localCalls.push({ name, args: callArgs })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_sector_list', {})
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'iwencai')
  assert.equal(localCalls.length, 0)
  assert.equal(captured.length, 1)
  await broker.close()
})

test('local-only analytics tools stay unmapped and must not claim MCP-first', async () => {
  const { TOOL_META } = await import('../packages/agent/dist/tool-meta.js')
  const names = [
    'evaluate_instrument',
    'get_instrument_strategy_signal',
    'get_instrument_institution_rating',
    'verify_instrument_strategy',
    'strategy_report',
    'get_instrument_latest_evaluation',
    'get_instrument_institution_report',
    'run_backtest',
  ]
  for (const name of names) {
    assert.equal(resolveToolCapability(name), null)
    const guide = TOOL_META[name]?.usageGuide ?? ''
    assert.ok(!/必须先调外部/.test(guide), `${name} must not use MCP_FIRST`)
    assert.match(guide, /本机评分\/策略\/风格共识/)
    assert.ok(LOCAL_ONLY_TOOL_NAMES.includes(name), `${name} in LOCAL_ONLY_TOOL_NAMES`)
  }
  assert.ok(!LOCAL_ONLY_TOOL_NAMES.includes('get_instrument_cyq'))
})

test('MCP-first market catalog tools claim external priority', async () => {
  const { TOOL_META } = await import('../packages/agent/dist/tool-meta.js')
  for (const name of [
    'get_sector_list',
    'get_trade_calendar',
    'get_market_session',
    'get_market_sentiment',
    'get_market_regime',
  ]) {
    const guide = TOOL_META[name]?.usageGuide ?? ''
    assert.match(guide, /必须先调外部/, `${name} must use MCP_FIRST`)
  }
})

test('EXTERNAL_MCP_CAPABILITY_GUIDE is the SSOT including cyq', () => {
  const ids = EXTERNAL_MCP_CAPABILITY_GUIDE.map(c => c.id)
  assert.ok(ids.includes('cyq'))
  assert.ok(ids.includes('search_nl'))
  assert.ok(ids.includes('market_lists'))
  assert.ok(ids.includes('constituents'))
  const constituents = EXTERNAL_MCP_CAPABILITY_GUIDE.find(c => c.id === 'constituents')
  assert.match(String(constituents?.summary), /板块|目录/)
  const marketLists = EXTERNAL_MCP_CAPABILITY_GUIDE.find(c => c.id === 'market_lists')
  assert.match(String(marketLists?.summary), /日历|开盘|情绪|市况|牛熊/)
  for (const row of EXTERNAL_MCP_CAPABILITY_GUIDE) {
    assert.equal(row.localFirst, false)
    assert.ok(row.title)
    assert.ok(row.summary)
  }
})

test('get_instrument_cyq TOOL_META is MCP-first', async () => {
  const { TOOL_META } = await import('../packages/agent/dist/tool-meta.js')
  const guide = TOOL_META.get_instrument_cyq?.usageGuide ?? ''
  assert.match(guide, /必须先调外部/)
  assert.ok(!/本机评分\/策略\/筹码/.test(guide))
})

test('adaptCapabilityArgs cyq → search_nl query includes 筹码', () => {
  const fromCode = adaptCapabilityArgs('get_instrument_cyq', 'query2data', {
    instrument: { symbol: '600519' },
  })
  assert.match(String(fromCode.query), /筹码/)
  assert.match(String(fromCode.query), /600519/)

  const keep = adaptCapabilityArgs('get_instrument_cyq', 'iwencai__query2data', {
    query: '茅台筹码分布',
  })
  assert.equal(keep.query, '茅台筹码分布')

  const fromBareCode = adaptCapabilityArgs('get_instrument_cyq', 'query2data', {
    code: '000858',
  })
  assert.equal(fromBareCode.query, '000858筹码 获利盘 平均成本')
})

test('get_instrument_cyq prefers exact chip tool over earlier-sort search_nl', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      cyq: [
        { serverId: 'brokerB', remoteTool: 'chip_distribution', sortOrder: 5 },
      ],
      search_nl: [
        { serverId: 'brokerA', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, args) {
      if (serverId === 'brokerB') {
        assert.equal(toolName, 'chip_distribution')
        return { profitRatio: 0.62, ok: true }
      }
      assert.equal(toolName, 'query2data')
      assert.match(String(args.query), /筹码/)
      return { rows: [], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_cyq', {
    instrument: { symbol: '600519' },
  })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'brokerB')
  assert.deepEqual(external.calls, ['brokerB:chip_distribution'])
  assert.equal(localCalls.length, 0)
  await broker.close()
})

test('get_instrument_cyq falls back to search_nl with 筹码 query when exact chip fails', async () => {
  const external = makeCatalogFake({
    candidatesByCap: {
      cyq: [
        { serverId: 'brokerB', remoteTool: 'chip_distribution', sortOrder: 5 },
      ],
      search_nl: [
        { serverId: 'brokerA', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(serverId, toolName, args) {
      if (serverId === 'brokerB') throw new Error('503 unavailable')
      assert.equal(toolName, 'query2data')
      assert.match(String(args.query), /筹码/)
      assert.match(String(args.query), /600519/)
      return { datas: [{ code: '600519' }], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call() { throw new Error('local unused') },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_cyq', {
    instrument: { symbol: '600519' },
  })
  assert.equal(result.ok, true)
  assert.equal(result._mcp.source, 'brokerA')
  assert.deepEqual(external.calls, ['brokerB:chip_distribution', 'brokerA:query2data'])
  await broker.close()
})

test('clearServer removes quarantine entry', () => {
  // 通过 orchestrator 路径写入隔离后再 clear
  return runInToolSession('clear-s', async () => {
    const { disableMcpServerHard, isMcpServerSessionDisabled } =
      await import('../packages/agent/dist/mcp/external/index.js')
    disableMcpServerHard('clear-s', 'iwencai')
    assert.equal(isMcpServerSessionDisabled('clear-s', 'iwencai'), true)
    clearMcpSessionQuarantineServer('iwencai')
    assert.equal(isMcpServerSessionDisabled('clear-s', 'iwencai'), false)
    assert.equal(buildDisabledMcpTurnTail('clear-s'), '')
  })
})

test('legacy path: namespaced without capability still external-only (no catalog method)', async () => {
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
    resolveAutoBindChain() { return [] },
    health: { shouldSkip() { return false } },
    // 故意不实现 listCapabilityCandidates → 旧路径
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

test('sufficiency: tabular datas/rows with identity columns is enough for snapshot/quotes/financials', () => {
  const checker = new SufficiencyChecker(TOOL_SUFFICIENCY_SPECS)
  const table = {
    datas: [{ 股票代码: '600519', 名称: '贵州茅台', 最新价: 1800, 净利润: 1 }],
  }
  for (const tool of [
    'get_instrument_snapshot',
    'get_instrument_quotes',
    'get_instrument_financials',
  ]) {
    const r = checker.check(tool, table)
    assert.equal(r.sufficient, true, `${tool} tabular should be sufficient`)
    assert.equal(r.shouldSupplement, false, `${tool} should not supplement`)
  }

  const nested = checker.check('get_instrument_snapshot', {
    result: { datas: [{ code: '000858' }] },
  })
  assert.equal(nested.sufficient, true)

  const rows = checker.check('get_instrument_quotes', {
    rows: [{ 证券代码: '600519' }],
  })
  assert.equal(rows.sufficient, true)
})

test('sufficiency: empty tabular lists are insufficient even without a spec', () => {
  const checker = new SufficiencyChecker(TOOL_SUFFICIENCY_SPECS)
  for (const empty of [{ datas: [] }, { data: [] }, { items: [] }, { list: [] }, { rows: [] }, []]) {
    const named = checker.check('opaque_remote_tool', empty)
    assert.equal(named.sufficient, false, `no-spec empty ${JSON.stringify(empty)}`)
    assert.equal(named.shouldSupplement, true)
  }
  assert.equal(checker.check('get_instrument_snapshot', { datas: [] }).sufficient, false)
  assert.equal(checker.check('get_instrument_quotes', { data: [] }).sufficient, false)
  assert.equal(checker.check('get_limit_updown', { datas: [] }).sufficient, false)
})

test('sufficiency: get_instrument_* covers cyq; empty cyq is insufficient', () => {
  const checker = new SufficiencyChecker(TOOL_SUFFICIENCY_SPECS)
  assert.equal(checker.check('get_instrument_cyq', { datas: [] }).sufficient, false)
  assert.equal(checker.check('get_instrument_cyq', { data: [] }).sufficient, false)
  const chipObj = checker.check('get_instrument_cyq', { profitRatio: 0.62 })
  assert.equal(chipObj.sufficient, true)
  const cyqTable = checker.check('get_instrument_cyq', {
    datas: [{ 获利盘: 0.5 }],
  })
  assert.equal(cyqTable.sufficient, true)
})

test('extractTabular recognizes nested generic list shapes', () => {
  assert.deepEqual(extractTabular({ payload: { list: [1] } }).items, [1])
  assert.equal(extractTabular({ datas: [] }).found, true)
  assert.equal(extractTabular({ ok: true }).found, false)
})

test('adaptCapabilityArgs market_lists → search_nl synthesizes even when code is present', () => {
  const limit = adaptCapabilityArgs('get_limit_updown', 'query2data', { code: '600519' })
  assert.match(String(limit.query), /涨停|跌停/)
  assert.notEqual(String(limit.query).trim(), '600519')
  assert.match(String(limit.query), /600519/)

  const tiger = adaptCapabilityArgs('get_dragon_tiger', 'query2data', { code: '600519' })
  assert.match(String(tiger.query), /龙虎/)
  assert.notEqual(String(tiger.query).trim(), '600519')

  const cal = adaptCapabilityArgs('get_trade_calendar', 'query2data', { symbol: '600519' })
  assert.match(String(cal.query), /交易日历/)
  assert.notEqual(String(cal.query).trim(), '600519')

  const mood = adaptCapabilityArgs('get_market_sentiment', 'query2data', { code: '600519' })
  assert.match(String(mood.query), /情绪/)
  assert.notEqual(String(mood.query).trim(), '600519')

  const hinted = adaptCapabilityArgs('limit_up_pool', 'query2data', { code: '600519' })
  assert.match(String(hinted.query), /涨停|跌停/)
  assert.notEqual(String(hinted.query).trim(), '600519')

  const keep = adaptCapabilityArgs('get_limit_updown', 'query2data', {
    query: '自定义涨停池',
    code: '600519',
  })
  assert.equal(keep.query, '自定义涨停池')

  assert.match(String(synthesizeMarketListQuery('get_limit_updown', {})), /涨停/)
})

test('get_instrument_snapshot tabular datas does not fall back to local', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      snapshot: [],
      quotes: [],
      search_nl: [
        { serverId: 'remoteA', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl(_serverId, toolName, args) {
      assert.equal(toolName, 'query2data')
      assert.equal(args.query, '600519')
      return { datas: [{ 股票代码: '600519', 名称: '贵州茅台' }], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_snapshot', {
    instrument: { symbol: '600519' },
  })
  assert.equal(result._mcp.source, 'remoteA')
  assert.equal(localCalls.length, 0)
  await broker.close()
})

test('get_instrument_snapshot empty datas supplements local', async () => {
  const localCalls = []
  const external = makeCatalogFake({
    candidatesByCap: {
      snapshot: [],
      quotes: [],
      search_nl: [
        { serverId: 'remoteA', remoteTool: 'query2data', sortOrder: 0 },
      ],
    },
    callExternalImpl() {
      return { datas: [], ok: true }
    },
  })
  const local = {
    async openAiFilteredTools() { return [] },
    async call(name, args) {
      localCalls.push({ name, args })
      return { symbol: '600519', name: '贵州茅台', from: 'local' }
    },
    async close() {},
  }
  const broker = await AggregatingToolBroker.create(async () => local, external)
  const result = await broker.call('get_instrument_snapshot', {
    instrument: { symbol: '600519' },
  })
  assert.ok(localCalls.length >= 1)
  assert.equal(localCalls[0].name, 'get_instrument_snapshot')
  assert.equal(result._mcp.supplemented, true)
  await broker.close()
})

test('sufficiency/adapt sources have no vendor-specific branches', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const files = [
    'packages/agent/src/mcp/external/sufficiency.ts',
    'packages/agent/src/mcp/external/capability-catalog.ts',
  ]
  for (const rel of files) {
    const src = readFileSync(join(root, rel), 'utf8')
    assert.equal(/iwencai/i.test(src), false, `${rel} must not mention iwencai`)
  }
})
