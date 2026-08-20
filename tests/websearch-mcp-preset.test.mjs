/**
 * 网页搜索本机 MCP 预设：无密钥 stdio、apply 仅在有 secret key 时要求 apiKey。
 * hydrate 对无密钥 stdio 预设默认落库 enabled；已有记录不改开关。
 * 落盘为 builtin-node 哨兵；连接时 materialize。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  MCP_BUILTIN_PRESETS,
  mcpPresetSecretKey,
  mcpPresetRequiresApiKey,
} from '../packages/shared/dist/mcp-servers.js'
import {
  ensureDefaultKeylessMcpServers,
} from '../packages/agent/dist/mcp/external/ensure-default-keyless.js'
import {
  BUILTIN_NODE_COMMAND,
  buildBuiltinNodeTransportSentinel,
  materializeBuiltinStdioTransport,
  resolveBuiltinStdioTransport,
} from '../packages/agent/dist/mcp/builtin/resolve-builtin-stdio.js'

test('MCP_BUILTIN_PRESETS includes websearch stdio with no apiKeyEnv', () => {
  const preset = MCP_BUILTIN_PRESETS.find(p => p.id === 'websearch')
  assert.ok(preset)
  assert.equal(preset.title, '网页搜索')
  assert.equal(preset.sortOrder, 3)
  assert.equal(preset.services.length, 1)
  const svc = preset.services[0]
  assert.equal(svc.serverId, 'websearch')
  assert.equal(svc.transport, 'stdio')
  assert.equal(svc.apiKeyEnv, undefined)
  assert.equal(svc.apiKeyHeader, undefined)
  assert.equal(svc.url, undefined)
  assert.equal(mcpPresetSecretKey(svc), '')
  assert.equal(mcpPresetRequiresApiKey(preset), false)
})

test('iwencai and HTTP presets still require apiKey; websearch does not', () => {
  const iwencai = MCP_BUILTIN_PRESETS.find(p => p.id === 'iwencai')
  const fuyao = MCP_BUILTIN_PRESETS.find(p => p.id === 'fuyao')
  const eastmoney = MCP_BUILTIN_PRESETS.find(p => p.id === 'eastmoney')
  const websearch = MCP_BUILTIN_PRESETS.find(p => p.id === 'websearch')
  assert.ok(iwencai && fuyao && eastmoney && websearch)
  assert.equal(mcpPresetRequiresApiKey(iwencai), true)
  assert.equal(mcpPresetRequiresApiKey(fuyao), true)
  assert.equal(mcpPresetRequiresApiKey(eastmoney), true)
  assert.equal(mcpPresetRequiresApiKey(websearch), false)
  assert.equal(mcpPresetSecretKey(iwencai.services[0]), 'IWENCAI_API_KEY')
})

test('resolveBuiltinStdioTransport returns null for unknown serverId', () => {
  assert.equal(resolveBuiltinStdioTransport('not-a-preset'), null)
})

test('resolveBuiltinStdioTransport websearch materializes to execPath + absolute entry', () => {
  const tc = resolveBuiltinStdioTransport('websearch')
  assert.ok(tc)
  assert.equal(tc.transport, 'stdio')
  assert.equal(tc.command, process.execPath)
  assert.ok(Array.isArray(tc.args) && tc.args.length >= 1)
  const entry = tc.args[tc.args.length - 1]
  assert.ok(path.isAbsolute(entry), 'entry must be absolute')
  assert.match(entry, /stdio-entry\.(js|ts)$/)
})

function fakeStdio(serverId) {
  return { transport: 'stdio', command: 'node', args: [`/tmp/${serverId}.js`] }
}

test('empty repo seeds websearch with builtin-node sentinel (not absolute path)', () => {
  const store = new Map()
  const created = []
  const seeded = ensureDefaultKeylessMcpServers({
    get: id => store.get(id) ?? null,
    create: input => {
      created.push(input)
      const row = {
        ...input,
        enabled: input.enabled ?? true,
        paused: input.paused ?? false,
        secrets: input.secrets ?? {},
      }
      store.set(input.id, row)
      return row
    },
    resolveStdio: id => (id === 'websearch' || id === 'iwencai' ? fakeStdio(id) : null),
  })
  assert.deepEqual(seeded, ['websearch'])
  assert.equal(created.length, 1)
  const row = created[0]
  assert.equal(row.id, 'websearch')
  assert.equal(row.title, '网页搜索')
  assert.equal(row.enabled, true)
  assert.equal(row.paused, false)
  assert.deepEqual(row.secrets, {})
  assert.equal(row.installSource, 'registry')
  assert.deepEqual(row.transportConfig, buildBuiltinNodeTransportSentinel())
  assert.equal(row.transportConfig.command, BUILTIN_NODE_COMMAND)
  assert.deepEqual(row.transportConfig.args, [])
  assert.equal(store.has('iwencai'), false)
  assert.equal(store.has('fuyao-a-share'), false)
})

test('materializeBuiltinStdioTransport heals websearch sentinel and legacy paths', () => {
  const expected = resolveBuiltinStdioTransport('websearch')
  assert.ok(expected)

  const fromSentinel = materializeBuiltinStdioTransport(
    'websearch',
    buildBuiltinNodeTransportSentinel(),
  )
  assert.equal(fromSentinel.command, process.execPath)
  assert.deepEqual(fromSentinel.args, expected.args)
  assert.match(fromSentinel.args[fromSentinel.args.length - 1], /stdio-entry\.(js|ts)$/)

  const legacy = {
    transport: 'stdio',
    command: '/Users/mac/.nvm/versions/node/v22.0.0/bin/node',
    args: ['/Users/mac/Library/Caches/old/stdio-entry.js'],
  }
  const healed = materializeBuiltinStdioTransport('websearch', legacy)
  assert.equal(healed.command, process.execPath)
  assert.match(healed.args[healed.args.length - 1], /stdio-entry\.(js|ts)$/)
  assert.notEqual(healed.command, legacy.command)
})

test('materializeBuiltinStdioTransport keeps custom args when builtin-node has user path', () => {
  const customArgs = ['/opt/custom/mcp-entry.mjs']
  const materialized = materializeBuiltinStdioTransport('websearch', {
    transport: 'stdio',
    command: BUILTIN_NODE_COMMAND,
    args: customArgs,
  })
  assert.equal(materialized.command, process.execPath)
  assert.deepEqual(materialized.args, customArgs)
  assert.ok(!/websearch.*stdio-entry/.test(materialized.args[0]))
})

test('existing websearch enabled=false is not flipped on', () => {
  const existing = {
    id: 'websearch',
    title: '网页搜索',
    enabled: false,
    paused: true,
    secrets: {},
    installSource: 'registry',
  }
  const store = new Map([['websearch', existing]])
  let createCalls = 0
  const seeded = ensureDefaultKeylessMcpServers({
    get: id => store.get(id) ?? null,
    create: input => {
      createCalls += 1
      throw new Error(`should not create ${input.id}`)
    },
    resolveStdio: id => fakeStdio(id),
  })
  assert.deepEqual(seeded, [])
  assert.equal(createCalls, 0)
  assert.equal(store.get('websearch').enabled, false)
  assert.equal(store.get('websearch').paused, true)
})
