import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  lookupModelsDevContextLimit,
  resetModelsDevCacheForTests,
} from '../packages/agent/dist/llm/models-dev-context.js'
import { formatTokenCount, formatTurnUsageLabel } from '../packages/agent/dist/llm/format-token-count.js'
import { parseOpenAiUsage, mergeTokenUsage } from '../packages/agent/dist/llm/token-usage.js'

const SAMPLE_CATALOG = {
  openai: {
    models: {
      'gpt-4o': { limit: { context: 128000, output: 16384 } },
      'gpt-4.1': { limit: { context: 1047576, output: 32768 } },
    },
  },
  deepseek: {
    models: {
      'deepseek-chat': { limit: { context: 1000000, output: 8192 } },
    },
  },
  anyapi: {
    models: {
      'anthropic/claude-sonnet-4-6': { limit: { context: 1000000, output: 64000 } },
      'deepseek/deepseek-chat': { limit: { context: 1000000, output: 384000 } },
    },
  },
}

describe('lookupModelsDevContextLimit', () => {
  it('exact match within provider', () => {
    const hit = lookupModelsDevContextLimit(SAMPLE_CATALOG, 'gpt-4o', 'openai')
    assert.equal(hit?.context, 128000)
  })

  it('case-insensitive match', () => {
    const hit = lookupModelsDevContextLimit(SAMPLE_CATALOG, 'GPT-4O', 'openai')
    assert.equal(hit?.context, 128000)
  })

  it('providerId:model ref form', () => {
    const hit = lookupModelsDevContextLimit(SAMPLE_CATALOG, 'openai:gpt-4.1')
    assert.equal(hit?.context, 1047576)
  })

  it('strip vendor prefix and cross-provider scan', () => {
    const hit = lookupModelsDevContextLimit(SAMPLE_CATALOG, 'deepseek-chat', 'custom-gateway')
    assert.equal(hit?.context, 1000000)
  })

  it('substring match with prefixed model id', () => {
    const hit = lookupModelsDevContextLimit(SAMPLE_CATALOG, 'claude-sonnet-4-6')
    assert.equal(hit?.context, 1000000)
  })

  it('returns null when no match', () => {
    const hit = lookupModelsDevContextLimit(SAMPLE_CATALOG, 'unknown-model-xyz')
    assert.equal(hit, null)
  })
})

describe('formatTokenCount', () => {
  it('formats under 1k as integer', () => {
    assert.equal(formatTokenCount(42), '42')
    assert.equal(formatTokenCount(999), '999')
  })

  it('formats thousands with one decimal', () => {
    assert.equal(formatTokenCount(1200), '1.2k')
    assert.equal(formatTokenCount(42000), '42k')
  })

  it('formats millions', () => {
    assert.equal(formatTokenCount(1_100_000), '1.1M')
  })

  it('turn usage label respects estimated flag', () => {
    assert.equal(formatTurnUsageLabel({ totalTokens: 1200, estimated: true }), '本轮约 1.2k')
    assert.equal(formatTurnUsageLabel({ totalTokens: 1200, estimated: false }), '本轮 1.2k')
  })
})

describe('parseOpenAiUsage', () => {
  it('parses OpenAI usage object', () => {
    const usage = parseOpenAiUsage({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    })
    assert.deepEqual(usage, {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
  })

  it('parses cached_tokens from prompt_tokens_details', () => {
    const usage = parseOpenAiUsage({
      prompt_tokens: 200,
      completion_tokens: 10,
      total_tokens: 210,
      prompt_tokens_details: { cached_tokens: 180 },
    })
    assert.equal(usage?.cachedPromptTokens, 180)
  })

  it('parses top-level cached_tokens', () => {
    const usage = parseOpenAiUsage({
      prompt_tokens: 50,
      completion_tokens: 5,
      total_tokens: 55,
      cached_tokens: 0,
    })
    assert.equal(usage?.cachedPromptTokens, 0)
  })

  it('omits cachedPromptTokens when absent', () => {
    const usage = parseOpenAiUsage({
      prompt_tokens: 10,
      completion_tokens: 1,
      total_tokens: 11,
    })
    assert.equal(usage?.cachedPromptTokens, undefined)
  })

  it('merges usage totals', () => {
    const a = { promptTokens: 10, completionTokens: 5, totalTokens: 15, cachedPromptTokens: 8 }
    const b = { promptTokens: 20, completionTokens: 8, totalTokens: 28, cachedPromptTokens: 2 }
    assert.deepEqual(mergeTokenUsage(a, b), {
      promptTokens: 30,
      completionTokens: 13,
      totalTokens: 43,
      cachedPromptTokens: 10,
    })
  })
})

describe('resolveBodyPromptCacheKey', () => {
  it('prefers explicit key with schema generation suffix', async () => {
    const { resolveBodyPromptCacheKey } = await import('../packages/agent/dist/llm/provider.js')
    assert.equal(
      resolveBodyPromptCacheKey('sess-1', 'opptrix-session:sess-1:s2'),
      'opptrix-session:sess-1:s2',
    )
    assert.equal(resolveBodyPromptCacheKey('sess-1', '  '), 'opptrix-session:sess-1')
    assert.equal(resolveBodyPromptCacheKey(undefined, undefined), undefined)
  })

  it('falls back to session id without generation', async () => {
    const { resolveBodyPromptCacheKey } = await import('../packages/agent/dist/llm/provider.js')
    assert.equal(resolveBodyPromptCacheKey('abc'), 'opptrix-session:abc')
  })
})

describe('resolveCacheWarmth / promptCacheKeyForSession', () => {
  it('derives warm|cold|unknown', async () => {
    const { resolveCacheWarmth, promptCacheKeyForSession } = await import(
      '../packages/agent/dist/llm/token-usage.js'
    )
    assert.equal(resolveCacheWarmth(undefined), 'unknown')
    assert.equal(resolveCacheWarmth({}), 'unknown')
    assert.equal(resolveCacheWarmth({ cachedPromptTokens: 0 }), 'cold')
    assert.equal(resolveCacheWarmth({ cachedPromptTokens: 12 }), 'warm')
    assert.equal(promptCacheKeyForSession('abc'), 'opptrix-session:abc')
  })
})

describe('computeCacheHitPercent / resolveSessionCacheHitSource', () => {
  it('computes percent and clamps 0–100', async () => {
    const { computeCacheHitPercent } = await import('../packages/agent/dist/llm/token-usage.js')
    assert.equal(computeCacheHitPercent(undefined, 100), undefined)
    assert.equal(computeCacheHitPercent(80, 100), 80)
    assert.equal(computeCacheHitPercent(50, 0), 100)
    assert.equal(computeCacheHitPercent(150, 100), 100)
    assert.equal(computeCacheHitPercent(-5, 100), 0)
  })

  it('prefers latest assistant turn over usageTotals', async () => {
    const { resolveSessionCacheHitSource } = await import('../packages/agent/dist/llm/token-usage.js')
    const turns = [
      { role: 'user', usage: undefined },
      {
        role: 'assistant',
        usage: { promptTokens: 200, completionTokens: 10, totalTokens: 210, cachedPromptTokens: 180 },
      },
    ]
    const totals = { promptTokens: 500, completionTokens: 50, totalTokens: 550, cachedPromptTokens: 100 }
    const hit = resolveSessionCacheHitSource(turns, totals)
    assert.equal(hit?.cachedPromptTokens, 180)
    assert.equal(hit?.promptTokens, 200)
  })

  it('falls back to usageTotals when no turn has cached', async () => {
    const { resolveSessionCacheHitSource } = await import('../packages/agent/dist/llm/token-usage.js')
    const turns = [{ role: 'assistant', usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 } }]
    const totals = { promptTokens: 100, completionTokens: 5, totalTokens: 105, cachedPromptTokens: 40 }
    const hit = resolveSessionCacheHitSource(turns, totals)
    assert.equal(hit?.cachedPromptTokens, 40)
  })
})

describe('models.dev cache reset', () => {
  it('resetModelsDevCacheForTests is callable', () => {
    resetModelsDevCacheForTests()
    assert.ok(true)
  })
})
