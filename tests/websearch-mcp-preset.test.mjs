/**
 * 网页搜索本机 MCP 预设：无密钥 stdio、apply 仅在有 secret key 时要求 apiKey。
 * hydrate 对无密钥 stdio 预设默认落库 enabled；已有记录不改开关。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MCP_BUILTIN_PRESETS,
  mcpPresetSecretKey,
  mcpPresetRequiresApiKey,
} from '../packages/shared/dist/mcp-servers.js'
import {
  ensureDefaultKeylessMcpServers,
} from '../packages/agent/dist/mcp/external/ensure-default-keyless.js'
import { resolveBuiltinStdioTransport } from '../packages/agent/dist/mcp/builtin/resolve-builtin-stdio.js'

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

function fakeStdio(serverId) {
  return { transport: 'stdio', command: 'node', args: [`/tmp/${serverId}.js`] }
}

test('empty repo seeds websearch enabled and does not create iwencai', () => {
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
  assert.deepEqual(row.transportConfig, fakeStdio('websearch'))
  assert.equal(store.has('iwencai'), false)
  assert.equal(store.has('fuyao-a-share'), false)
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
