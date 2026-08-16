/**
 * 会话上下文压缩 — 窗长启发式、micro/structured、overflow 识别
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveModelContextTokens,
  resolveContextBudget,
  SOFT_USAGE_RATIO,
  HARD_USAGE_RATIO,
  DEFAULT_CONTEXT_TOKENS,
  estimateTextTokens,
  microcompactMessages,
  assembleModelView,
  isContextOverflowError,
  emptySessionMemory,
  formatSessionMemoryForPrompt,
  parseSessionMemoryFromModelText,
  ensureContextBudget,
  CONTEXT_COMPACT_HINT,
  buildBudgetForModel,
  coveredPrefixHash,
  projectionValid,
  installMicroProjection,
  modelVisibleFromProjection,
} from '../packages/agent/dist/index.js'

function buildFatToolHistory(rounds, payloadChars) {
  const messages = [{ role: 'user', content: '分析 600519 并对比同行' }]
  for (let i = 0; i < rounds; i++) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: `c${i}`,
        type: 'function',
        function: { name: 'get_quote', arguments: '{}' },
      }],
    })
    messages.push({
      role: 'tool',
      tool_call_id: `c${i}`,
      name: 'get_quote',
      content: JSON.stringify({ price: 1800, blob: 'x'.repeat(payloadChars) }),
    })
  }
  messages.push({ role: 'assistant', content: '先看估值与量价。' })
  return messages
}

test('resolveModelContextTokens maps common families', () => {
  assert.equal(resolveModelContextTokens('gpt-4o'), 128_000)
  assert.equal(resolveModelContextTokens('claude-sonnet-4'), 200_000)
  assert.equal(resolveModelContextTokens('gpt-3.5-turbo'), 16_384)
  assert.equal(resolveModelContextTokens('unknown-xyz'), DEFAULT_CONTEXT_TOKENS)
})

test('resolveContextBudget soft/hard ratios', () => {
  const b = resolveContextBudget(100_000, 10_000)
  assert.ok(b.historyBudget > 0)
  assert.equal(b.softLimit, Math.floor(b.historyBudget * SOFT_USAGE_RATIO))
  assert.equal(b.hardLimit, Math.floor(b.historyBudget * HARD_USAGE_RATIO))
  assert.ok(b.softLimit <= b.hardLimit)
  assert.equal(SOFT_USAGE_RATIO, 0.85)
})

test('estimateTextTokens charges CJK tighter than latin chars/4', () => {
  const latin = estimateTextTokens('x'.repeat(400))
  const cjk = estimateTextTokens('中文测试'.repeat(100))
  assert.ok(latin > 0 && cjk > 0)
  // CJK ≈0.6 tok/char vs latin ≈0.25 → same length costs more for CJK
  assert.ok(cjk > latin)
  assert.equal(cjk, Math.ceil(400 * 0.6))
  assert.equal(latin, Math.ceil(400 / 4))
})

test('microcompactMessages shortens old tool bodies and keeps recent intact', () => {
  const fat = 'x'.repeat(5000)
  const messages = []
  for (let i = 0; i < 10; i++) {
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: `c${i}`,
        type: 'function',
        function: { name: 'get_quote', arguments: '{}' },
      }],
    })
    messages.push({
      role: 'tool',
      tool_call_id: `c${i}`,
      name: 'get_quote',
      content: JSON.stringify({ price: 1, payload: fat }),
    })
  }
  const { messages: out, changed } = microcompactMessages(messages, 4)
  assert.equal(changed, true)
  assert.equal(out.length, messages.length)
  const oldTool = out[1]
  assert.equal(oldTool.role, 'tool')
  assert.ok(String(oldTool.content).length < 5000)
  assert.match(String(oldTool.content), /_compacted|compacted/)
  const recentTool = out[out.length - 1]
  assert.equal(String(recentTool.content).length > 4000, true)
})

test('assembleModelView injects session memory and keeps system first', () => {
  const memory = emptySessionMemory({
    goal: '分析 600519 基本面',
    entities: '600519 贵州茅台',
  })
  const view = assembleModelView({
    systemPrompt: 'LAYER0',
    sessionMemory: memory,
    messages: [
      { role: 'user', content: '继续' },
      { role: 'assistant', content: '好的' },
    ],
    keepRecent: 24,
  })
  assert.equal(view[0].role, 'system')
  assert.equal(view[0].content, 'LAYER0')
  // 工作记忆刻意用 user 尾块注入，避免第二条 role:system 破坏前缀缓存
  assert.equal(view[1].role, 'user')
  assert.match(String(view[1].content), /600519/)
  assert.match(String(view[1].content), /工作记忆/)
})

test('parseSessionMemoryFromModelText preserves goal as sacred', () => {
  const prev = emptySessionMemory({ goal: '旧目标保留', entities: '旧实体' })
  const parsed = parseSessionMemoryFromModelText(
    [
      '## 目标',
      '研究宁德时代供需',
      '## 约束',
      '只用公开数据',
      '## 标的与实体',
      '300750',
      '## 已确认事实',
      '',
      '## 已做决定',
      '',
      '## 未决问题',
      '估值是否偏高',
      '## 已否证',
      '',
      '## 当前进度',
      '待取财报',
    ].join('\n'),
    prev,
    40,
  )
  assert.match(parsed.goal, /宁德时代/)
  assert.match(parsed.entities, /300750/)
  assert.match(parsed.openQuestions, /估值/)
  assert.equal(parsed.compactVersion, 2)
  const formatted = formatSessionMemoryForPrompt(parsed)
  assert.ok(formatted)
  assert.match(formatted, /目标/)
})

test('isContextOverflowError detects common upstream phrases', () => {
  assert.equal(isContextOverflowError('context_length_exceeded'), true)
  assert.equal(isContextOverflowError(undefined, 'Error: maximum context length'), true)
  assert.equal(isContextOverflowError('rate_limit'), false)
  assert.ok(CONTEXT_COMPACT_HINT.includes('整理'))
})

test('buildBudgetForModel resolves context window asynchronously', async () => {
  const budget = await buildBudgetForModel('unknown-model-xyz-for-test', 'LAYER0')
  assert.ok(budget.contextTokens > 0)
  assert.ok(budget.historyBudget > 0)
  assert.ok(budget.softLimit <= budget.hardLimit)
})

test('ensureContextBudget soft path triggers micro on small window', async () => {
  const messages = buildFatToolHistory(40, 4000)
  const { results, state, modelView } = await ensureContextBudget({
    modelId: 'gpt-3.5-turbo',
    systemPrompt: 'LAYER0',
    state: { messages, sessionMemory: null, contextProjection: null },
    llm: null,
  })
  assert.ok(results.some((r) => r.level === 'micro' && r.changed))
  // micro 仅投影：canonical 保留完整 tool 正文（不再 480/2400 永久撕毁）
  const oldTool = state.messages.find((m) => m.role === 'tool')
  assert.ok(oldTool)
  assert.ok(String(oldTool.content).length >= 4000)
  assert.ok(state.contextProjection)
  assert.ok(modelView.length > 0)
  assert.equal(modelView[0].role, 'system')
  // tool_calls 成组：assistant(tool_calls) 后仍有对应 tool
  for (let i = 0; i < state.messages.length; i++) {
    const m = state.messages[i]
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const id = m.tool_calls[0].id
      const next = state.messages[i + 1]
      assert.equal(next?.role, 'tool')
      assert.equal(next?.tool_call_id, id)
    }
  }
})

test('ensureContextBudget hard path writes sessionMemory via mock llm', async () => {
  const messages = buildFatToolHistory(40, 4000)
  const mockLlm = {
    async chat() {
      return {
        message: {
          role: 'assistant',
          content: [
            '## 目标',
            '分析 600519 并对比同行',
            '## 约束',
            '只用公开数据',
            '## 标的与实体',
            '600519',
            '## 已确认事实',
            '股价约 1800',
            '## 已做决定',
            '',
            '## 未决问题',
            '估值是否偏高',
            '## 已否证',
            '',
            '## 当前进度',
            '待取财报',
          ].join('\n'),
        },
        finishReason: 'stop',
      }
    },
    async listModels() {
      return []
    },
  }
  const { results, state } = await ensureContextBudget({
    modelId: 'gpt-3.5-turbo',
    systemPrompt: 'LAYER0',
    state: { messages, sessionMemory: null },
    llm: mockLlm,
  })
  assert.ok(results.some((r) => r.level === 'structured' && r.changed))
  assert.ok(state.sessionMemory)
  assert.ok(state.contextProjection)
  assert.match(state.sessionMemory.goal, /600519/)
  assert.match(state.sessionMemory.constraints, /公开/)
})

test('soft/micro does not rewrite canonical tool bodies; installs contextProjection', async () => {
  const messages = buildFatToolHistory(40, 4000)
  const before = messages
    .filter((m) => m.role === 'tool')
    .map((m) => String(m.content).length)
  const { results, state, modelView } = await ensureContextBudget({
    modelId: 'gpt-3.5-turbo',
    systemPrompt: 'LAYER0',
    state: { messages, sessionMemory: null, contextProjection: null },
    llm: null,
  })
  assert.ok(results.some((r) => r.level === 'micro' && r.changed))
  assert.ok(state.contextProjection)
  assert.ok(state.contextProjection.coveredCount > 0)
  assert.ok(projectionValid(state.contextProjection, state.messages))
  const after = state.messages
    .filter((m) => m.role === 'tool')
    .map((m) => String(m.content).length)
  assert.deepEqual(after, before)
  // modelView 应走投影：较早 tool 在投影里被截断
  const viewTools = modelView.filter((m) => m.role === 'tool')
  assert.ok(viewTools.some((m) => String(m.content).length < 4000))
})

test('assembleModelView prefers valid projection splice', () => {
  const messages = buildFatToolHistory(8, 2000)
  const micro = microcompactMessages(messages, 4)
  const projection = installMicroProjection(messages, micro.messages, 4, null)
  assert.ok(projection)
  assert.equal(projectionValid(projection, messages), true)
  const view = assembleModelView({
    systemPrompt: 'LAYER0',
    sessionMemory: null,
    messages,
    keepRecent: 4,
    contextProjection: projection,
  })
  assert.equal(view[0].content, 'LAYER0')
  // 投影前缀在 system 之后
  const withoutSystem = view.slice(1)
  assert.ok(withoutSystem.length > 0)
  // splice = projection.messages + canonical[covered:]
  const expectedTail = messages.slice(projection.coveredCount)
  const fromProj = modelVisibleFromProjection({
    systemPrompt: 'LAYER0',
    projection,
    canonical: messages,
    keepRecent: 4,
  })
  assert.equal(view.length, fromProj.length)
  assert.equal(
    view.filter((m) => m.role === 'tool').length,
    fromProj.filter((m) => m.role === 'tool').length,
  )
  assert.ok(expectedTail.length > 0)
  assert.equal(coveredPrefixHash(messages, projection.coveredCount), projection.coveredPrefixHash)
})

test('assembleModelView falls back when projection missing or invalid', () => {
  const messages = [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '嗨' },
  ]
  const legacy = assembleModelView({
    systemPrompt: 'LAYER0',
    sessionMemory: null,
    messages,
    keepRecent: 24,
  })
  assert.equal(legacy.length, 3)
  assert.equal(legacy[1].role, 'user')

  const invalid = {
    schemaVersion: 1,
    messages: [],
    coveredCount: 1,
    keepRecent: 16,
    // no hash → fail-closed
    projectionVersion: 1,
    updatedAt: new Date().toISOString(),
  }
  const fallback = assembleModelView({
    systemPrompt: 'LAYER0',
    sessionMemory: null,
    messages,
    keepRecent: 24,
    contextProjection: invalid,
  })
  assert.deepEqual(
    fallback.map((m) => m.role),
    legacy.map((m) => m.role),
  )
  assert.equal(projectionValid(invalid, messages), false)
})
