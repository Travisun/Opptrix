import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TOOL_PACK_MEMBERSHIP,
  TOOL_PACK_DEFS,
  alwaysOnPackIds,
  toolsInPack,
  packIdForTool,
  buildToolPackCatalogPrompt,
} from '../packages/shared/dist/tool-packs.js'
import { ToolRegistry } from '../packages/agent/dist/tools.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'
import {
  resolveSeedPacks,
  MAX_SEEDED_BUSINESS_PACKS,
} from '../packages/agent/dist/mcp/tool-pack-resolver.js'
import {
  ToolPackSessionStore,
  resolveActivePackIds,
  toolNamesForPacks,
  unloadedToolHint,
  listToolPacksPayload,
} from '../packages/agent/dist/mcp/tool-pack-session.js'

test('every registered chat tool has exactly one pack membership', () => {
  const registry = new ToolRegistry(new ResearchHub())
  for (const t of registry.list()) {
    const pack = packIdForTool(t.name)
    assert.ok(pack, `missing pack for tool: ${t.name}`)
    assert.equal(TOOL_PACK_MEMBERSHIP[t.name], pack)
  }
})

test('always-on packs are core + meta', () => {
  assert.deepEqual(alwaysOnPackIds().sort(), ['core', 'meta'])
  assert.ok(toolsInPack('core').includes('search_instruments'))
  assert.ok(toolsInPack('meta').includes('activate_tool_pack'))
})

test('resolver seeds instrument_analytics for analysis + CN code', () => {
  const packs = resolveSeedPacks({ message: '分析一下 600519 茅台' })
  assert.ok(packs.includes('instrument_analytics'))
  assert.ok(packs.length <= MAX_SEEDED_BUSINESS_PACKS)
})

test('resolver seeds news for 资讯 queries', () => {
  const packs = resolveSeedPacks({ message: '最近有什么重要资讯公告？' })
  assert.ok(packs.includes('news'))
})

test('resolver seeds fundamentals for financial queries', () => {
  const packs = resolveSeedPacks({ message: '茅台最近几年营收和净利润同比怎么样' })
  assert.ok(packs.includes('fundamentals'))
  assert.ok(packs.length <= MAX_SEEDED_BUSINESS_PACKS)
})

test('resolver seeds portfolio for 持仓', () => {
  const packs = resolveSeedPacks({ message: '帮我看看我的持仓盈亏' })
  assert.ok(packs.includes('portfolio'))
})

test('resolver seeds etf for ETF/净值', () => {
  const packs = resolveSeedPacks({ message: '这只 ETF 净值和溢价率怎么样' })
  assert.ok(packs.includes('etf'))
})

test('resolver returns empty business packs when no match', () => {
  const packs = resolveSeedPacks({ message: '你好' })
  assert.deepEqual(packs, [])
})

test('activate expands active tool names across session', () => {
  const store = new ToolPackSessionStore()
  const sessionId = 'test-session'
  const before = resolveActivePackIds(store, sessionId, { message: '你好' })
  assert.deepEqual([...before].sort(), ['core', 'meta'])
  const namesBefore = toolNamesForPacks(before)
  assert.ok(namesBefore.includes('search_instruments'))
  assert.ok(!namesBefore.includes('list_news_articles'))

  store.activate(sessionId, ['news'])
  const after = resolveActivePackIds(store, sessionId, { message: '你好' })
  assert.ok(after.includes('news'))
  const namesAfter = toolNamesForPacks(after)
  assert.ok(namesAfter.includes('list_news_articles'))
  assert.ok(namesAfter.length > namesBefore.length)
})

test('unloaded tool hint points to activate_tool_pack', () => {
  const hint = unloadedToolHint('evaluate_instrument')
  assert.match(hint, /activate_tool_pack/)
  assert.match(hint, /instrument_analytics/)
})

test('list_tool_packs payload marks loaded state', () => {
  const payload = listToolPacksPayload(['core', 'meta', 'etf'])
  assert.equal(payload.packs.length, TOOL_PACK_DEFS.length)
  const etf = payload.packs.find(p => p.id === 'etf')
  assert.ok(etf?.loaded)
  const news = payload.packs.find(p => p.id === 'news')
  assert.ok(news && !news.loaded)
})

test('pack catalog prompt is slim vs legacy routing tables', () => {
  const prompt = buildToolPackCatalogPrompt()
  assert.match(prompt, /activate_tool_pack/)
  assert.ok(prompt.length < 4000, 'catalog should stay compact')
  assert.ok(!prompt.includes('Tier 1'))
})

test('cold start exposed tools << full registry', () => {
  const store = new ToolPackSessionStore()
  const packs = resolveActivePackIds(store, 's1', { message: '随便问问' })
  const exposed = toolNamesForPacks(packs)
  const full = new ToolRegistry(new ResearchHub()).list().length
  assert.ok(exposed.length < full)
  assert.ok(exposed.length <= toolsInPack('core').length + toolsInPack('meta').length)
})

test('analysis seed keeps tools under full set', () => {
  const store = new ToolPackSessionStore()
  const packs = resolveActivePackIds(store, 's2', { message: '分析 600519' })
  assert.ok(packs.includes('instrument_analytics'))
  assert.ok(packs.filter(p => p !== 'core' && p !== 'meta').length <= MAX_SEEDED_BUSINESS_PACKS)
  const exposed = toolNamesForPacks(packs)
  const full = new ToolRegistry(new ResearchHub()).list().length
  assert.ok(exposed.length < full)
  assert.ok(exposed.includes('evaluate_instrument'))
  assert.ok(exposed.includes('search_instruments'))
})
