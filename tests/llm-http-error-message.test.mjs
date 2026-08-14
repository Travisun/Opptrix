/**
 * LLM HTTP 错误 → 用户可见文案（无 HTTP/JSON/API Key）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LLM_ERR_AUTH,
  LLM_ERR_BALANCE,
  LLM_ERR_GENERIC,
  LLM_ERR_MODEL_UNAVAILABLE,
  LLM_ERR_OVERFLOW,
  LLM_ERR_RATE_LIMIT,
  assertUserSafeLlmErrorMessage,
  classifyLlmHttpError,
  extractUpstreamErrorHaystack,
  formatLlmHttpUserMessage,
  sanitizeBodyForLog,
} from '../packages/agent/dist/llm/llm-error-message.js'

function assertChatSafe(msg) {
  assertUserSafeLlmErrorMessage(msg)
  assert.equal(/\bHTTP\s+\d/i.test(msg), false)
  assert.equal(msg.includes('{'), false)
  assert.equal(/API\s*Key/i.test(msg), false)
}

test('402 Insufficient Balance → 余额文案', () => {
  const body = JSON.stringify({
    error: { message: 'Insufficient Balance', type: 'billing_error', code: 'insufficient_balance' },
  })
  const r = formatLlmHttpUserMessage(402, body)
  assert.equal(r.kind, 'balance')
  assert.equal(r.userMessage, LLM_ERR_BALANCE)
  assert.equal(r.contextOverflow, false)
  assertChatSafe(r.userMessage)
})

test('body 含 insufficient quota（非 402）→ 余额文案', () => {
  const r = formatLlmHttpUserMessage(403, 'Error: insufficient_quota for this key')
  assert.equal(r.kind, 'balance')
  assert.equal(r.userMessage, LLM_ERR_BALANCE)
  assertChatSafe(r.userMessage)
})

test('401 / unauthorized / invalid api key → 访问密钥文案（无 API Key 字样）', () => {
  const cases = [
    [401, 'Unauthorized'],
    [403, JSON.stringify({ error: { message: 'Invalid API Key', code: 'invalid_api_key' } })],
    [401, '{"error":{"message":"Incorrect API key provided"}}'],
  ]
  for (const [status, body] of cases) {
    const r = formatLlmHttpUserMessage(status, body)
    assert.equal(r.kind, 'auth', `status=${status} body=${body}`)
    assert.equal(r.userMessage, LLM_ERR_AUTH)
    assertChatSafe(r.userMessage)
  }
})

test('429 → 频繁请求文案', () => {
  const r = formatLlmHttpUserMessage(429, '{"error":{"message":"Rate limit exceeded"}}')
  assert.equal(r.kind, 'rate_limit')
  assert.equal(r.userMessage, LLM_ERR_RATE_LIMIT)
  assertChatSafe(r.userMessage)
})

test('context overflow → 整理后重试，不把 raw body 给用户', () => {
  const body = JSON.stringify({
    error: {
      message: 'This model\'s maximum context length is 128000 tokens',
      code: 'context_length_exceeded',
    },
  })
  const r = formatLlmHttpUserMessage(400, body)
  assert.equal(r.kind, 'overflow')
  assert.equal(r.contextOverflow, true)
  assert.equal(r.userMessage, LLM_ERR_OVERFLOW)
  assert.equal(r.userMessage.includes('128000'), false)
  assertChatSafe(r.userMessage)
})

test('model not found / 不存在 → 模型不可用', () => {
  const cases = [
    [404, JSON.stringify({ error: { message: 'The model `foo` does not exist', code: 'model_not_found' } })],
    [400, '模型不存在：bar-v1'],
  ]
  for (const [status, body] of cases) {
    const r = formatLlmHttpUserMessage(status, body)
    assert.equal(r.kind, 'model_unavailable', body)
    assert.equal(r.userMessage, LLM_ERR_MODEL_UNAVAILABLE)
    assertChatSafe(r.userMessage)
  }
})

test('未知 500 → 通用友好文案，不含 HTTP/JSON', () => {
  const body = '{"error":{"message":"Internal server error","type":"server_error"}}'
  const r = formatLlmHttpUserMessage(500, body)
  assert.equal(r.kind, 'generic')
  assert.ok(r.userMessage.includes('暂时无法回复'))
  assert.equal(r.userMessage, LLM_ERR_GENERIC)
  assertChatSafe(r.userMessage)
})

test('带 JSON message 的解析进入 haystack', () => {
  const body = JSON.stringify({
    error: { message: 'Insufficient Balance', code: 402 },
  })
  const hay = extractUpstreamErrorHaystack(body)
  assert.match(hay, /Insufficient Balance/i)
  assert.equal(classifyLlmHttpError(200, body), 'balance')
})

test('可选 cfg.model 可拼进通用文案，且不泄漏 URL/密钥', () => {
  const r = formatLlmHttpUserMessage(503, 'upstream down', { provider: 'Acme', model: 'deepseek-chat' })
  assert.equal(r.kind, 'generic')
  assert.match(r.userMessage, /deepseek-chat/)
  assertChatSafe(r.userMessage)
  assert.equal(r.userMessage.includes('http'), false)
})

test('sanitizeBodyForLog 脱敏密钥并截断', () => {
  const raw = `Bearer sk-abcdefghijklmnopqrstuvwxyz123456 ${'x'.repeat(500)}`
  const out = sanitizeBodyForLog(raw, 80)
  assert.equal(out.includes('sk-abcdefgh'), false)
  assert.match(out, /\[redacted\]/)
  assert.ok(out.length <= 81)
})

test('任意 status+body 聊天 content 无技术泄漏（抽样）', () => {
  const samples = [
    [402, '{"error":{"message":"Insufficient Balance"}}'],
    [401, '⚠️ API Key 无效 from upstream'],
    [429, 'HTTP 429 Too Many Requests'],
    [500, '{"status":500,"error":{"message":"boom"}}'],
    [404, '{"error":{"code":"model_not_found","message":"model xyz not found"}}'],
    [400, '{"error":{"code":"context_length_exceeded","message":"too many tokens"}}'],
  ]
  for (const [status, body] of samples) {
    const { userMessage } = formatLlmHttpUserMessage(status, body)
    assertChatSafe(userMessage)
  }
})
