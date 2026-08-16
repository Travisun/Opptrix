import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  TOOL_PACK_MEMBERSHIP,
  TOOL_PACK_DEFS,
  alwaysOnPackIds,
  allToolPackIds,
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

test('always-on packs are core + meta + workspace', () => {
  assert.deepEqual(alwaysOnPackIds().sort(), ['core', 'meta', 'workspace'])
  assert.ok(toolsInPack('core').includes('search_instruments'))
  assert.ok(toolsInPack('meta').includes('activate_tool_pack'))
  assert.ok(toolsInPack('workspace').includes('opptrix_run'))
  assert.ok(!toolsInPack('workspace').includes('workspace_list'))
  assert.ok(!toolsInPack('workspace').includes('workspace_mkdir'))
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

test('resolver seeds market for 资金流 queries', () => {
  const packs = resolveSeedPacks({ message: '茅台主力资金净流入怎么样' })
  assert.ok(packs.includes('market'))
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

test('resolver seeds fundamentals for balance sheet / cash flow', () => {
  const packs = resolveSeedPacks({ message: '茅台最新资产负债表和经营现金流' })
  assert.ok(packs.includes('fundamentals'))
})

test('resolver seeds market for 连板天梯', () => {
  const packs = resolveSeedPacks({ message: '今天连板天梯看一下' })
  assert.ok(packs.includes('market'))
})

test('resolver seeds market for 交易日历', () => {
  const packs = resolveSeedPacks({ message: '今年 A 股交易日历休市日' })
  assert.ok(packs.includes('market'))
})

test('resolver seeds industry for 指数成分', () => {
  const packs = resolveSeedPacks({ message: '沪深300成分股有哪些' })
  assert.ok(packs.includes('industry'))
})

test('activate expands session pack bookkeeping without shrinking tool exposure', () => {
  const store = new ToolPackSessionStore()
  const sessionId = 'test-session'
  const before = resolveActivePackIds(store, sessionId, { message: '你好' })
  assert.deepEqual([...before].sort(), ['core', 'meta', 'workspace'])
  store.activate(sessionId, ['news'])
  const after = resolveActivePackIds(store, sessionId, { message: '你好' })
  assert.ok(after.includes('news'))
  const fullNames = toolNamesForPacks(allToolPackIds())
  const coldNames = toolNamesForPacks(before)
  assert.ok(fullNames.length > coldNames.length)
  assert.ok(fullNames.includes('list_news_articles'))
})

test('cold start always includes workspace pack tools', () => {
  const store = new ToolPackSessionStore()
  const packs = resolveActivePackIds(store, 'ws-always', { message: '随便问问' })
  assert.ok(packs.includes('workspace'))
  const names = toolNamesForPacks(packs)
  assert.ok(names.includes('workspace_glob'))
  assert.ok(names.includes('opptrix_run'))
  assert.ok(!names.includes('workspace_list'))
  assert.ok(!names.includes('workspace_mkdir'))
})

test('unloaded tool hint reflects frozen session tools', () => {
  const hint = unloadedToolHint('evaluate_instrument')
  assert.match(hint, /冻结|全量加载/)
  assert.match(hint, /instrument_analytics/)
  assert.match(hint, /选型卡|tools/)
  assert.doesNotMatch(hint, /请先调用 activate_tool_pack/)
})

test('unloaded tool hint for list_web_vendor names artifacts pack', () => {
  assert.equal(packIdForTool('list_web_vendor'), 'artifacts')
  const hint = unloadedToolHint('list_web_vendor')
  assert.match(hint, /冻结|tools/)
  assert.match(hint, /artifacts/)
  assert.doesNotMatch(hint, /未知或不支持/)
})

test('unknown tool hint falls back to workspace sandbox', () => {
  const hint = unloadedToolHint('totally_fake_tool_xyz')
  assert.match(hint, /list_tool_packs/)
  assert.match(hint, /workspace/)
  assert.match(hint, /opptrix_run|ensure_python|workspace_/)
  assert.match(hint, /勿虚构/)
})

test('activate_agent_skill does not trigger mid-loop tools schema rebuild', () => {
  const engineSrc = fs.readFileSync(
    new URL('../packages/agent/src/engine.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    engineSrc,
    /fn === 'activate_agent_skill'[\s\S]*?\)\s*\{\s*refreshTools = true/,
  )
  assert.match(engineSrc, /buildActivatedSkillsPrompt/)
  assert.match(engineSrc, /buildRoundTurnTail/)
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
  assert.match(prompt, /调用纪律/)
  assert.match(prompt, /workspace/)
  assert.match(prompt, /全量加载|冻结/)
  assert.match(prompt, /core \+ meta \+ workspace|默认加载 core \+ meta \+ workspace/)
  assert.match(prompt, /opptrix_run|沙盒|编程实现/)
  assert.match(prompt, /禁止仅为「开工」再 activate|勿仪式化|已加载/)
  assert.ok(prompt.length < 5000, 'catalog should stay compact')
  assert.ok(!prompt.includes('Tier 1'))
})

test('workspace seed patterns cover programming fallback without research spam', () => {
  assert.ok(resolveSeedPacks({ message: '写个脚本批量清洗这份 CSV' }).includes('workspace'))
  assert.ok(resolveSeedPacks({ message: '现成工具不够，编程实现自定义计算' }).includes('workspace'))
  assert.ok(!resolveSeedPacks({ message: '茅台现价多少' }).includes('workspace'))
})

test('full session pack load exposes all registered chat tools', () => {
  const full = new ToolRegistry(new ResearchHub()).list().length
  const exposed = toolNamesForPacks(allToolPackIds())
  assert.equal(exposed.length, full)
})
