/**
 * 外部 MCP parseToolResult：structuredContent 优先、鉴权载荷、text 回退。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseToolResult } from '../packages/agent/dist/mcp/external/connection.js'

test('structuredContent takes priority over text', () => {
  const result = parseToolResult('srv', 'tool', {
    structuredContent: { price: 100 },
    content: [{ type: 'text', text: '{"price": 1}' }],
  })
  assert.deepEqual(result, { price: 100 })
})

test('structuredContent auth payload data:null throws', () => {
  assert.throws(
    () => parseToolResult('srv', 'tool', {
      structuredContent: { data: null, message: 'Missing X-api-key' },
    }),
    /Missing X-api-key/,
  )
})

test('structuredContent error field throws', () => {
  assert.throws(
    () => parseToolResult('srv', 'tool', {
      structuredContent: { error: 'invalid api key' },
    }),
    /invalid api key/,
  )
})

test('empty result returns ok placeholder', () => {
  const result = parseToolResult('my-server', 'fetch', {})
  assert.deepEqual(result, { ok: true, source: 'my-server' })
})

test('text JSON fallback when no structuredContent', () => {
  const result = parseToolResult('srv', 'tool', {
    content: [{ type: 'text', text: '{"ok":true,"count":3}' }],
  })
  assert.deepEqual(result, { ok: true, count: 3 })
})

test('non-JSON text returns raw string', () => {
  const result = parseToolResult('srv', 'tool', {
    content: [{ type: 'text', text: 'plain text response' }],
  })
  assert.equal(result, 'plain text response')
})

test('isError with auth JSON in text throws', () => {
  assert.throws(
    () => parseToolResult('srv', 'tool', {
      isError: true,
      content: [{ type: 'text', text: '{"data":null,"message":"Unauthorized"}' }],
    }),
    /Unauthorized/,
  )
})
