/**
 * 投研提示词工程 — 证据纪律 / L1–L3 档位 / 输出骨架
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAgentSystemRules,
  buildResearchEpistemicPlaybook,
  buildResearchOutputPlaybook,
  buildSessionClockPlaybook,
  buildWorkspaceAccessPlaybook,
} from '../packages/shared/dist/agent-prompt-guide.js'
import {
  resolveToolRoutePlan,
  resolveResearchTier,
  buildRoundRoutePlaybook,
} from '../packages/agent/dist/mcp/tool-route-plan.js'
import {
  ToolPackSessionStore,
  resolveActivePackIds,
  toolNamesForPacks,
} from '../packages/agent/dist/mcp/tool-pack-session.js'
import { ToolRegistry } from '../packages/agent/dist/tools.js'
import { ResearchHub } from '../packages/research-hub/dist/hub.js'

test('session clock playbook embeds authoritative local time', () => {
  const block = buildSessionClockPlaybook({
    iso: '2026-07-14T13:19:00.000Z',
    local: '2026/7/14 21:19:00',
    timezone: 'Asia/Shanghai',
    weekday: '星期二',
    unix_ms: 1_752_500_340_000,
  })
  assert.match(block, /会话时钟/)
  assert.match(block, /Asia\/Shanghai/)
  assert.match(block, /不必为此再调 get_current_time/)

  const rules = buildAgentSystemRules({
    sessionClock: block,
    researchTier: 'L1',
    activePacks: ['core', 'meta'],
  })
  assert.match(rules, /会话时钟/)
  assert.match(rules, /优先使用.*会话时钟|以其为「截至」基准/)
})

test('epistemic playbook prefers session clock over mandatory get_current_time', () => {
  const text = buildResearchEpistemicPlaybook()
  assert.match(text, /事实层/)
  assert.match(text, /禁止.*编造|禁编造/)
  assert.match(text, /会话时钟/)
  assert.match(text, /否证|风险/)
  assert.match(text, /不给出具体买卖/)
})

test('output playbooks differ by research tier', () => {
  const l1 = buildResearchOutputPlaybook('L1')
  const l2 = buildResearchOutputPlaybook('L2')
  const l3 = buildResearchOutputPlaybook('L3')
  assert.match(l1, /L1/)
  assert.ok(!l1.includes('投研备忘录'))
  assert.match(l2, /结构化解读/)
  assert.match(l3, /深度投研备忘录/)
  assert.match(l3, /数据缺口/)
})

test('system rules always include epistemic + tier skeleton', () => {
  const rules = buildAgentSystemRules({
    activePacks: ['core', 'meta'],
    researchTier: 'L3',
    routePlaybook: '【本轮工具选型卡】\n- test',
  })
  assert.match(rules, /投研证据纪律/)
  assert.match(rules, /深度投研备忘录/)
  assert.match(rules, /本轮工具选型卡/)
  assert.ok(!rules.includes('【资讯调阅'))
})

test('research tier: price=L1, news=L2, depth=L3, 全面 upgrades', () => {
  assert.equal(resolveResearchTier('price_only', '现价多少'), 'L1')
  assert.equal(resolveResearchTier('news_browse', '最近资讯'), 'L2')
  assert.equal(resolveResearchTier('depth_analysis', '分析 600519'), 'L3')
  assert.equal(resolveResearchTier('price_only', '全面分析一下现价逻辑'), 'L3')
})

test('route plan carries researchTier into playbook', () => {
  const plan = resolveToolRoutePlan({ message: '帮我深度分析 600519' })
  assert.equal(plan.researchTier, 'L3')
  assert.equal(plan.intent, 'depth_analysis')

  const store = new ToolPackSessionStore()
  const packs = resolveActivePackIds(store, 't2', { message: '帮我深度分析 600519' })
  const active = toolNamesForPacks(packs)
  const card = buildRoundRoutePlaybook(plan, active)
  assert.match(card, /研究档位：L3/)
  assert.match(card, /L3 覆盖检查/)
})

test('L1 plan playbook asks to stop after short path', () => {
  const plan = resolveToolRoutePlan({ message: '茅台现价多少' })
  assert.equal(plan.researchTier, 'L1')
  assert.equal(plan.preferredTools[0], 'get_instrument_quotes')
  const store = new ToolPackSessionStore()
  const active = toolNamesForPacks(resolveActivePackIds(store, 'l1', { message: '茅台现价多少' }))
  const card = buildRoundRoutePlaybook(plan, active)
  assert.match(card, /L1/)
  assert.ok(!card.includes('L3 覆盖检查'))
})

test('ToolRegistry systemPrompt embeds researcher persona and epistemic rules', () => {
  const prompt = new ToolRegistry(new ResearchHub()).systemPrompt({
    researchTier: 'L2',
    activePacks: ['core', 'meta'],
  })
  assert.match(prompt, /投研研究员/)
  assert.match(prompt, /投研证据纪律/)
  assert.match(prompt, /答复档位 L2/)
})

test('workspace playbook requires get_system_info and network egress policy', () => {
  const playbook = buildWorkspaceAccessPlaybook()
  assert.match(playbook, /get_system_info/)
  assert.match(playbook, /默认禁止|禁网|出站/)
  assert.match(playbook, /OPPTRIX_SHELL_ALLOWED_DOMAINS/)
  assert.match(playbook, /DNS|系统.*解析/)
  assert.match(playbook, /-c/)
  assert.match(playbook, /-n/)
  assert.match(playbook, /tracert/)
  assert.match(playbook, /powershell|cmd \/c|bash -c/)
  assert.match(playbook, /禁止.*整串拼接绕过|禁止编造/)
  assert.ok(!playbook.includes('禁止 Shell 执行'))

  const rules = buildAgentSystemRules({
    activePacks: ['core', 'meta', 'workspace'],
    activeToolNames: ['shell_run', 'http_fetch', 'get_system_info'],
    researchTier: 'L1',
  })
  assert.match(rules, /get_system_info/)
  assert.match(rules, /-c.*win32.*-n|win32.*-n/s)
  assert.ok(!rules.includes('禁止 Shell 执行'))
  assert.match(rules, /禁止声称.*禁止执行 Shell/)
  assert.match(rules, /禁 TCP 出站|默认禁/)
})

test('route hints mention get_system_info before shell argv', () => {
  const shellPlan = resolveToolRoutePlan({ message: 'ping 一下 baidu.com' })
  assert.equal(shellPlan.intent, 'workspace_shell')
  assert.match(shellPlan.routeHint, /get_system_info/)

  const latencyPlan = resolveToolRoutePlan({ message: '测一下百度网站延迟' })
  assert.equal(latencyPlan.intent, 'workspace_network_latency')
  assert.match(latencyPlan.routeHint, /get_system_info/)
})

test('全面分析 seeds market pack when budget allows', () => {
  const plan = resolveToolRoutePlan({ message: '全面分析一下 600519' })
  assert.equal(plan.researchTier, 'L3')
  assert.ok(
    plan.seedPacks.includes('instrument_analytics') || plan.seedPacks.includes('market'),
    `seedPacks=${plan.seedPacks.join(',')}`,
  )
  // 全面 → market 应进入 required/seed（预算 2 内与 analytics 并存）
  assert.ok(plan.seedPacks.includes('market'), '全面分析应尝试加载 market pack')
})
