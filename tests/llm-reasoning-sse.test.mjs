/**
 * reasoning_content SSE 累积 + 空正文提示 + 输出额度 ladder
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { describe, it } from 'node:test'
import {
  createProvider,
  EMPTY_REPLY_REASONING_HINT,
  resolveRequestMaxTokens,
  looksLikeReasoningModel,
  autoOutputBudget,
  REASONING_OUTPUT_TOKENS,
  HIGH_REASONING_OUTPUT_TOKENS,
  ORDINARY_OUTPUT_TOKENS,
  OUTPUT_TOKENS_64K,
  OUTPUT_TOKENS_128K,
  LEGACY_DEFAULT_MAX_TOKENS,
  LEGACY_ORDINARY_OUTPUT_TOKENS,
} from '../packages/agent/dist/index.js'

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })
}

describe('output budget ladder', () => {
  it('detects deepseek reasoning model names', () => {
    assert.equal(looksLikeReasoningModel('deepseek-reasoner'), true)
    assert.equal(looksLikeReasoningModel('deepseek-v4-flash'), true)
    assert.equal(looksLikeReasoningModel('deepseek-r1'), true)
    assert.equal(looksLikeReasoningModel('gpt-4o'), false)
  })

  it('auto ladder 32k / 32k / 64k', () => {
    assert.equal(autoOutputBudget(false), ORDINARY_OUTPUT_TOKENS)
    assert.equal(autoOutputBudget(true, 'low'), REASONING_OUTPUT_TOKENS)
    assert.equal(autoOutputBudget(true, 'medium'), REASONING_OUTPUT_TOKENS)
    assert.equal(autoOutputBudget(true, 'high'), HIGH_REASONING_OUTPUT_TOKENS)
    assert.equal(ORDINARY_OUTPUT_TOKENS, 32_768)
    assert.equal(REASONING_OUTPUT_TOKENS, 32_768)
    assert.equal(HIGH_REASONING_OUTPUT_TOKENS, OUTPUT_TOKENS_64K)
  })

  it('raises legacy 4096 / 16k for ordinary and reasoning; respects 64k / 128k / lower explicit', () => {
    assert.equal(
      resolveRequestMaxTokens({ model: 'gpt-4o' }),
      ORDINARY_OUTPUT_TOKENS,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: LEGACY_DEFAULT_MAX_TOKENS,
        model: 'gpt-4o-mini',
      }),
      ORDINARY_OUTPUT_TOKENS,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: LEGACY_ORDINARY_OUTPUT_TOKENS,
        model: 'gpt-4o',
      }),
      ORDINARY_OUTPUT_TOKENS,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: 512,
        model: 'gpt-4o',
      }),
      512,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: OUTPUT_TOKENS_64K,
        model: 'gpt-4o',
      }),
      OUTPUT_TOKENS_64K,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: OUTPUT_TOKENS_128K,
        model: 'gpt-4o',
      }),
      OUTPUT_TOKENS_128K,
    )
    assert.equal(
      resolveRequestMaxTokens({ model: 'deepseek-reasoner' }),
      REASONING_OUTPUT_TOKENS,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: LEGACY_DEFAULT_MAX_TOKENS,
        model: 'deepseek-v4-flash',
      }),
      REASONING_OUTPUT_TOKENS,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: 80_000,
        reasoningEffort: 'high',
        model: 'deepseek-reasoner',
      }),
      80_000,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: OUTPUT_TOKENS_128K,
        reasoningEffort: 'high',
        model: 'deepseek-reasoner',
      }),
      OUTPUT_TOKENS_128K,
    )
    assert.equal(
      resolveRequestMaxTokens({
        explicitMaxTokens: 512,
        model: 'deepseek-reasoner',
      }),
      512,
    )
    assert.equal(
      resolveRequestMaxTokens({ reasoningEffort: 'high' }),
      HIGH_REASONING_OUTPUT_TOKENS,
    )
  })
})

describe('reasoning_content SSE', () => {
  it('accumulates reasoning_content and maps empty content + length to hint', async () => {
    /** @type {Record<string, unknown> | null} */
    let lastBody = null
    const server = createServer(async (req, res) => {
      const chunks = []
      for await (const c of req) chunks.push(c)
      lastBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      })
      res.write('data: {"choices":[{"delta":{"reasoning_content":"think one. "}}]}\n\n')
      res.write('data: {"choices":[{"delta":{"reasoning_content":"think two."},"finish_reason":"length"}]}\n\n')
      res.write('data: {"usage":{"prompt_tokens":10,"completion_tokens":4096,"total_tokens":4106}}\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    })
    const port = await listen(server)
    try {
      const llm = createProvider({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-reasoner',
        baseUrl: `http://127.0.0.1:${port}/v1`,
      })
      /** @type {string[]} */
      const reasoningDeltas = []
      const turn = await llm.chat(
        [{ role: 'user', content: 'hi' }],
        undefined,
        undefined,
        {
          onDelta: (d) => {
            if (d.reasoningText) reasoningDeltas.push(d.reasoningText)
          },
        },
      )
      assert.equal(turn.reasoningContent, 'think one. think two.')
      assert.deepEqual(reasoningDeltas, ['think one. ', 'think two.'])
      assert.equal(turn.finishReason, 'length')
      assert.equal(turn.message.content, EMPTY_REPLY_REASONING_HINT)
      assert.ok(lastBody)
      assert.equal(/** @type {any} */ (lastBody).max_tokens, REASONING_OUTPUT_TOKENS)
      assert.equal(/** @type {any} */ (lastBody).stream, true)
    } finally {
      await new Promise((r) => server.close(r))
    }
  })

  it('JSON path accumulates reasoning_content', async () => {
    const server = createServer(async (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: '最终答案',
            reasoning_content: '内部推理',
          },
        }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }))
    })
    const port = await listen(server)
    try {
      const llm = createProvider({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
        baseUrl: `http://127.0.0.1:${port}/v1`,
      })
      const turn = await llm.chat([{ role: 'user', content: 'q' }])
      assert.equal(turn.reasoningContent, '内部推理')
      assert.equal(turn.message.content, '最终答案')
      assert.equal(turn.finishReason, 'stop')
    } finally {
      await new Promise((r) => server.close(r))
    }
  })

  it('tool_calls round-trips reasoning_content (incl. empty string) on next request', async () => {
    /** @type {Record<string, unknown>[]} */
    const bodies = []
    let hit = 0
    const server = createServer(async (req, res) => {
      const chunks = []
      for await (const c of req) chunks.push(c)
      bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      hit += 1
      res.writeHead(200, { 'Content-Type': 'application/json' })
      if (hit === 1) {
        res.end(JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              reasoning_content: '先查行情再答',
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'get_quote', arguments: '{"code":"600519"}' },
              }],
            },
          }],
        }))
        return
      }
      res.end(JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'ok' },
        }],
      }))
    })
    const port = await listen(server)
    try {
      const llm = createProvider({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-reasoner',
        baseUrl: `http://127.0.0.1:${port}/v1`,
      })
      const turn1 = await llm.chat([{ role: 'user', content: '茅台怎样' }])
      assert.equal(turn1.finishReason, 'tool_calls')
      assert.equal(turn1.reasoningContent, '先查行情再答')

      // 对齐 Engine：工具轮 push 一律带 reasoningContent（含空串）
      const assistantWithReasoning = {
        role: 'assistant',
        content: null,
        tool_calls: turn1.message.tool_calls,
        reasoningContent: turn1.reasoningContent ?? '',
      }
      await llm.chat([
        { role: 'user', content: '茅台怎样' },
        assistantWithReasoning,
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'get_quote',
          content: '{"price":1800}',
        },
      ])
      assert.equal(bodies.length, 2)
      const wire = /** @type {any} */ (bodies[1]).messages.find(
        (m) => m.role === 'assistant' && m.tool_calls,
      )
      assert.ok(wire)
      assert.equal(wire.reasoning_content, '先查行情再答')

      // 空思考也要带 key
      await llm.chat([
        {
          role: 'assistant',
          content: null,
          tool_calls: turn1.message.tool_calls,
          reasoningContent: '',
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'get_quote',
          content: '{}',
        },
      ])
      const emptyWire = /** @type {any} */ (bodies[2]).messages.find(
        (m) => m.role === 'assistant' && m.tool_calls,
      )
      assert.ok(emptyWire)
      assert.equal(emptyWire.reasoning_content, '')
      assert.ok('reasoning_content' in emptyWire)
    } finally {
      await new Promise((r) => server.close(r))
    }
  })
})
