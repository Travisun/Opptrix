/**
 * 会话级 tools 冻结 — DSH 前缀缓存
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  allToolPackIds,
  businessPackIds,
  buildResearchTierTurnTail,
  buildAgentSystemRules,
} from '../packages/shared/dist/index.js'
import {
  orderToolsStable,
  resolveFullSessionToolNames,
  filterFrozenToolsForSubagent,
} from '../packages/agent/dist/index.js'
import {
  parseOpenAiUsage,
  promptCacheKeyForSession,
} from '../packages/agent/dist/llm/token-usage.js'

test('allToolPackIds includes always-on and all business packs', () => {
  const ids = allToolPackIds()
  assert.ok(ids.includes('core'))
  assert.ok(ids.includes('meta'))
  assert.ok(ids.includes('workspace'))
  assert.ok(ids.includes('news'))
  assert.ok(ids.includes('artifacts'))
  assert.equal(businessPackIds().includes('core'), false)
  assert.equal(businessPackIds().includes('meta'), false)
})

test('orderToolsStable ignores preferred and is byte-stable', () => {
  const tools = [
    { type: 'function', function: { name: 'z_local', description: 'z' } },
    { type: 'function', function: { name: 'ext__remote', description: 'r' } },
    { type: 'function', function: { name: 'a_local', description: 'a' } },
  ]
  const once = JSON.stringify(orderToolsStable(tools))
  const twice = JSON.stringify(orderToolsStable(tools))
  assert.equal(once, twice)
  const ordered = orderToolsStable(tools)
  assert.equal(ordered[0].function.name, 'ext__remote')
  assert.equal(ordered[1].function.name, 'a_local')
  assert.equal(ordered[2].function.name, 'z_local')
})

test('filterFrozenToolsForSubagent preserves stable toolsJson shape', () => {
  const entry = {
    openAiTools: [
      { type: 'function', function: { name: 'ask_user', description: 'x' } },
      { type: 'function', function: { name: 'workspace_read', description: 'y' } },
    ],
    activeNames: ['ask_user', 'run_subagent', 'workspace_read'],
    toolsJson: '[]',
    schemaGeneration: 0,
  }
  const filtered = filterFrozenToolsForSubagent(entry)
  assert.deepEqual(filtered.activeNames, ['workspace_read'])
  assert.equal(filtered.openAiTools.length, 1)
  assert.equal(filtered.openAiTools[0].function.name, 'workspace_read')
  assert.equal(filtered.toolsJson, JSON.stringify(filtered.openAiTools))
})

test('full session tool names cover registry chat tools', () => {
  const names = resolveFullSessionToolNames()
  assert.ok(names.includes('search_instruments'))
  assert.ok(names.includes('list_news_articles'))
  assert.ok(names.includes('opptrix_run'))
  assert.ok(names.length > 80)
})

test('research tier long branches live in turn-tail not stable system', () => {
  const rules = buildAgentSystemRules({ activePacks: undefined })
  assert.ok(!rules.includes('【答复档位 L3 — 深度投研备忘录】'))
  assert.ok(!rules.includes('【答复档位 L1 — 事实快答】'))
  const tail = buildResearchTierTurnTail('L3')
  assert.match(tail, /答复档位 L3/)
  assert.match(tail, /完备性/)
})

test('parseOpenAiUsage maps DeepSeek prompt_cache_hit_tokens', () => {
  const usage = parseOpenAiUsage({
    prompt_tokens: 1000,
    completion_tokens: 50,
    total_tokens: 1050,
    prompt_cache_hit_tokens: 800,
  })
  assert.equal(usage?.cachedPromptTokens, 800)
})

test('promptCacheKeyForSession appends schema generation suffix', () => {
  assert.equal(promptCacheKeyForSession('abc'), 'opptrix-session:abc')
  assert.equal(promptCacheKeyForSession('abc', 2), 'opptrix-session:abc:s2')
})

test('engine does not refresh tools on activate_tool_pack / activate_agent_skill', () => {
  const engineSrc = fs.readFileSync(
    new URL('../packages/agent/src/engine.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    engineSrc,
    /fn === 'activate_tool_pack'[\s\S]*refreshTools = true/,
  )
  assert.doesNotMatch(
    engineSrc,
    /fn === 'activate_agent_skill'[\s\S]*refreshTools = true/,
  )
  assert.match(engineSrc, /ensureFrozenSessionTools/)
  assert.match(engineSrc, /orderToolsStable/)
})

test('stable system prompt builder omits per-round activeToolNames', () => {
  const engineSrc = fs.readFileSync(
    new URL('../packages/agent/src/engine.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(engineSrc, /buildRoundSystemPrompt\(sessionId,\s*activeNames/)
})
