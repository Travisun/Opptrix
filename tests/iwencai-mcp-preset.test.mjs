/**
 * 问财本机 MCP：headers/body 形状、工具注册、内置预设与 stdio resolve / 可移植落盘。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  MCP_BUILTIN_PRESETS,
  mcpPresetSecretKey,
} from '../packages/shared/dist/mcp-servers.js'
import {
  buildIwencaiHeaders,
  buildQuery2DataBody,
  buildComprehensiveSearchBody,
  IWENCAI_MCP_TOOLS,
  resolveIwencaiMcpStdioTransport,
} from '../packages/agent/dist/mcp/builtin/iwencai/index.js'
import {
  BUILTIN_NODE_COMMAND,
  buildBuiltinNodeTransportSentinel,
  materializeBuiltinStdioTransport,
} from '../packages/agent/dist/mcp/builtin/resolve-builtin-stdio.js'
import { buildPresetServiceRecord, flatToCreateInput, splitStdioEnvSecrets } from '../apps/server/dist/mcp-server-routes.js'

test('MCP_BUILTIN_PRESETS includes iwencai stdio with IWENCAI_API_KEY', () => {
  const preset = MCP_BUILTIN_PRESETS.find(p => p.id === 'iwencai')
  assert.ok(preset)
  assert.equal(preset.title, '问财')
  assert.equal(preset.homepage, 'https://opptrix.net/t/topic/203')
  assert.equal(preset.services.length, 1)
  const svc = preset.services[0]
  assert.equal(svc.serverId, 'iwencai')
  assert.equal(svc.transport, 'stdio')
  assert.equal(svc.apiKeyEnv, 'IWENCAI_API_KEY')
  assert.equal(svc.apiKeyHeader, undefined)
  assert.equal(mcpPresetSecretKey(svc), 'IWENCAI_API_KEY')
})

test('fuyao preset still uses X-api-key header (not IWENCAI_API_KEY)', () => {
  const fuyao = MCP_BUILTIN_PRESETS.find(p => p.id === 'fuyao')
  assert.ok(fuyao)
  for (const svc of fuyao.services) {
    assert.equal(svc.apiKeyHeader, 'X-api-key')
    assert.notEqual(mcpPresetSecretKey(svc), 'IWENCAI_API_KEY')
  }
})

test('buildIwencaiHeaders uses Bearer and X-Claw-* (no X-api-key)', () => {
  const headers = buildIwencaiHeaders('test-key-value', { skillId: 'news-search', traceId: 'abc' })
  assert.equal(headers.Authorization, 'Bearer test-key-value')
  assert.equal(headers['Content-Type'], 'application/json')
  assert.equal(headers['X-Claw-Skill-Id'], 'news-search')
  assert.equal(headers['X-Claw-Trace-Id'], 'abc')
  assert.equal(headers['X-api-key'], undefined)
  assert.equal(headers['X-Api-Key'], undefined)
})

test('buildQuery2DataBody clamps page/limit and stringifies fields', () => {
  const body = buildQuery2DataBody({ query: ' 今日涨幅 ', page: 0, limit: 100 })
  assert.equal(body.query, '今日涨幅')
  assert.equal(body.page, '1')
  assert.equal(body.limit, '50')
  assert.equal(body.is_cache, '1')
  assert.equal(body.expand_index, 'true')
})

test('buildComprehensiveSearchBody includes channels and app_id', () => {
  const body = buildComprehensiveSearchBody({
    query: '茅台 公告',
    channels: ['announcement'],
    size: 5,
  })
  assert.equal(body.query, '茅台 公告')
  assert.deepEqual(body.channels, ['announcement'])
  assert.equal(body.size, 5)
  assert.equal(body.app_id, 'AIME_SKILL')
})

test('IWENCAI_MCP_TOOLS registers exactly four tools', () => {
  const names = IWENCAI_MCP_TOOLS.map(t => t.name).sort()
  assert.deepEqual(names, [
    'announcement_search',
    'news_search',
    'query2data',
    'report_search',
  ])
  for (const t of IWENCAI_MCP_TOOLS) {
    assert.ok(t.description.length > 400, `${t.name} description too short`)
    assert.equal(t.inputSchema.type, 'object')
    assert.ok(t.inputSchema.required?.includes('query'))
    assert.doesNotMatch(t.description, /curl|X-Claw|Header|IWENCAI_API_KEY|Skill-Id/i)
  }

  const byName = Object.fromEntries(IWENCAI_MCP_TOOLS.map(t => [t.name, t.description]))

  assert.match(byName.query2data, /选股/)
  assert.match(byName.query2data, /ETF/)
  assert.match(byName.query2data, /宏观|GDP|CPI/)
  assert.match(byName.query2data, /指数/)
  assert.match(byName.query2data, /行业/)
  assert.match(byName.query2data, /数据来源/)
  assert.match(byName.query2data, /news_search|不要[\s\S]*新闻/)

  assert.match(byName.news_search, /新闻/)
  assert.match(byName.news_search, /政策/)
  assert.match(byName.news_search, /数据来源/)

  assert.match(byName.announcement_search, /公告/)
  assert.match(byName.announcement_search, /分红|回购/)
  assert.match(byName.announcement_search, /数据来源/)

  assert.match(byName.report_search, /研报/)
  assert.match(byName.report_search, /评级/)
  assert.match(byName.report_search, /数据来源/)
})

test('resolveIwencaiMcpStdioTransport uses node + absolute entry', () => {
  const tc = resolveIwencaiMcpStdioTransport()
  assert.equal(tc.transport, 'stdio')
  assert.equal(tc.command, process.execPath)
  assert.ok(Array.isArray(tc.args) && tc.args.length >= 1)
  const entry = tc.args[tc.args.length - 1]
  assert.ok(path.isAbsolute(entry), 'entry must be absolute')
  assert.match(entry, /stdio-entry\.(js|ts)$/)
})

test('buildPresetServiceRecord persists builtin-node sentinel (not absolute path)', () => {
  const preset = MCP_BUILTIN_PRESETS.find(p => p.id === 'iwencai')
  assert.ok(preset)
  const { transportConfig, secrets } = buildPresetServiceRecord(preset.services[0], 'test-key')
  assert.deepEqual(transportConfig, buildBuiltinNodeTransportSentinel())
  assert.equal(transportConfig.command, BUILTIN_NODE_COMMAND)
  assert.deepEqual(transportConfig.args, [])
  assert.equal(secrets.IWENCAI_API_KEY, 'test-key')
  assert.equal(transportConfig.env, undefined)
})

test('import peels IWENCAI_API_KEY from env into secrets (not transportConfig.env)', () => {
  const peeled = splitStdioEnvSecrets({
    IWENCAI_API_KEY: 'secret-key',
    FOO: 'bar',
  })
  assert.deepEqual(peeled.secrets, { IWENCAI_API_KEY: 'secret-key' })
  assert.deepEqual(peeled.env, { FOO: 'bar' })

  const input = flatToCreateInput('iwencai', {
    type: 'stdio',
    command: BUILTIN_NODE_COMMAND,
    args: [],
    env: { IWENCAI_API_KEY: 'from-export', DEBUG: '1' },
  })
  assert.ok(input)
  assert.equal(input.transportConfig.transport, 'stdio')
  assert.equal(input.transportConfig.command, BUILTIN_NODE_COMMAND)
  assert.deepEqual(input.transportConfig.env, { DEBUG: '1' })
  assert.equal(input.secrets?.IWENCAI_API_KEY, 'from-export')
})

test('materializeBuiltinStdioTransport heals sentinel and legacy absolute paths', async () => {
  const expected = resolveIwencaiMcpStdioTransport()

  const fromSentinel = await materializeBuiltinStdioTransport(
    'iwencai',
    buildBuiltinNodeTransportSentinel(),
  )
  assert.equal(fromSentinel.command, process.execPath)
  assert.deepEqual(fromSentinel.args, expected.args)
  assert.match(fromSentinel.args[fromSentinel.args.length - 1], /stdio-entry\.(js|ts)$/)

  const legacy = {
    transport: 'stdio',
    command: '/opt/homebrew/Cellar/node/22.0.0/bin/node',
    args: ['/Users/someone/.opptrix/old/stdio-entry.js'],
  }
  const healed = await materializeBuiltinStdioTransport('iwencai', legacy)
  assert.equal(healed.command, process.execPath)
  assert.ok(path.isAbsolute(healed.args[healed.args.length - 1]))
  assert.match(healed.args[healed.args.length - 1], /stdio-entry\.(js|ts)$/)
  assert.notEqual(healed.command, legacy.command)
  assert.notDeepEqual(healed.args, legacy.args)
})

test('materializeBuiltinStdioTransport keeps custom args when builtin-node has user path', async () => {
  const customArgs = ['/Users/someone/local-mcp/server.mjs', '--port', '0']
  const materialized = await materializeBuiltinStdioTransport('my-local-mcp', {
    transport: 'stdio',
    command: BUILTIN_NODE_COMMAND,
    args: customArgs,
    cwd: '/Users/someone/local-mcp',
    env: { FOO: 'bar' },
  })
  assert.equal(materialized.command, process.execPath)
  assert.deepEqual(materialized.args, customArgs)
  assert.equal(materialized.cwd, '/Users/someone/local-mcp')
  assert.deepEqual(materialized.env, { FOO: 'bar' })

  const passthrough = await materializeBuiltinStdioTransport('custom-node', {
    transport: 'stdio',
    command: '/usr/local/bin/node',
    args: ['/abs/path/to/mcp.js'],
  })
  assert.equal(passthrough.command, '/usr/local/bin/node')
  assert.deepEqual(passthrough.args, ['/abs/path/to/mcp.js'])
})
