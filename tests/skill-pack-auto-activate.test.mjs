/**
 * Skill activate → auto Tool Pack（allowed-tools / required-packs）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-skill-packs-'))
process.env.OPPTRIX_DATA_DIR = tmpRoot

const {
  resolvePackIdsFromSkill,
  splitSkillDeclarationTokens,
  ToolPackSessionStore,
} = await import('../packages/agent/dist/index.js')

const {
  createSkill,
  deleteUserSkill,
  getSkill,
  parseSkillMarkdown,
} = await import('../packages/agent-skills/dist/index.js')

test('splitSkillDeclarationTokens handles spaces and commas', () => {
  assert.deepEqual(splitSkillDeclarationTokens('a b,c'), ['a', 'b', 'c'])
  assert.deepEqual(splitSkillDeclarationTokens(''), [])
  assert.deepEqual(splitSkillDeclarationTokens(null), [])
  assert.deepEqual(splitSkillDeclarationTokens(undefined), [])
})

test('resolvePackIdsFromSkill maps create_web/create_canvas to artifacts', () => {
  const packs = resolvePackIdsFromSkill({
    allowedTools: 'create_web create_canvas',
  })
  assert.deepEqual([...packs].sort(), ['artifacts'])
})

test('resolvePackIdsFromSkill ignores unknown tool names; empty allowed-tools is ok', () => {
  assert.deepEqual(resolvePackIdsFromSkill({}), [])
  assert.deepEqual(resolvePackIdsFromSkill({ allowedTools: '' }), [])
  assert.deepEqual(resolvePackIdsFromSkill({ allowedTools: '   ' }), [])
  assert.deepEqual(
    resolvePackIdsFromSkill({ allowedTools: 'totally_unknown_tool xyz' }),
    [],
  )
})

test('resolvePackIdsFromSkill honors required-packs metadata', () => {
  const packs = resolvePackIdsFromSkill({
    metadata: { 'required-packs': 'artifacts strategy_extra' },
  })
  assert.ok(packs.includes('artifacts'))
  assert.ok(packs.includes('strategy_extra'))

  const packsCamel = resolvePackIdsFromSkill({
    metadata: { requiredPacks: 'news,browser' },
  })
  assert.ok(packsCamel.includes('news'))
  assert.ok(packsCamel.includes('browser'))
})

test('resolvePackIdsFromSkill merges allowed-tools and required-packs', () => {
  const packs = resolvePackIdsFromSkill({
    allowedTools: 'create_web',
    metadata: { 'required-packs': 'strategy_extra' },
  })
  assert.ok(packs.includes('artifacts'))
  assert.ok(packs.includes('strategy_extra'))
})

test('parseSkillMarkdown retains allowed-tools for pack resolution', () => {
  const md = `---
name: pack-parse-probe
description: Probe skill describing when to use create_canvas and create_web for reports.
allowed-tools: create_web create_canvas
metadata:
  required-packs: strategy_extra
---

# Body
`
  const parsed = parseSkillMarkdown(md)
  assert.equal(parsed.frontmatter.allowedTools, 'create_web create_canvas')
  const packs = resolvePackIdsFromSkill(parsed.frontmatter)
  assert.ok(packs.includes('artifacts'))
  assert.ok(packs.includes('strategy_extra'))
})

test('activate skill with allowed-tools: create_web create_canvas → session has artifacts', () => {
  const name = 'viz-pack-auto-activate'
  try {
    deleteUserSkill(name)
  } catch {
    // not present
  }
  const skill = createSkill({
    name,
    description: 'Test skill for auto activating artifacts pack when using canvas and web tools.',
    body: '# Test\n\nUse create_web and create_canvas.\n',
    allowedTools: 'create_web create_canvas',
  })
  try {
    const loaded = getSkill(name)
    assert.ok(loaded)
    assert.equal(loaded.allowedTools, 'create_web create_canvas')

    const packIds = resolvePackIdsFromSkill(loaded)
    assert.deepEqual([...packIds].sort(), ['artifacts'])

    const store = new ToolPackSessionStore()
    const sessionId = 'skill-pack-session-1'
    const { activated } = store.activate(sessionId, packIds)
    assert.ok(activated.includes('artifacts'))
    assert.ok(store.getActivated(sessionId).has('artifacts'))
  } finally {
    deleteUserSkill(name)
  }
})

test('builtin equity-deep-dive declares create_web → artifacts + research packs', () => {
  const skill = getSkill('equity-deep-dive')
  assert.ok(skill)
  assert.ok(skill.allowedTools?.includes('create_web'))
  assert.ok(skill.allowedTools?.includes('list_web_vendor'))
  assert.ok(skill.metadata?.title)
  assert.equal(skill.metadata?.['default-deliverable'], 'web')
  assert.ok(skill.metadata?.['required-packs']?.includes('artifacts'))
  const packs = resolvePackIdsFromSkill(skill)
  assert.ok(packs.includes('artifacts'))
  assert.ok(packs.includes('fundamentals') || packs.includes('instrument_analytics') || packs.includes('market'))
})

test('builtin create-canvas / create-web / create-mindmap activate → artifacts pack', () => {
  const canvas = getSkill('create-canvas')
  assert.ok(canvas)
  assert.equal(canvas.source, 'builtin')
  assert.ok(canvas.allowedTools?.includes('create_canvas'))
  assert.ok(canvas.metadata?.['required-packs']?.includes('artifacts'))
  assert.ok(canvas.metadata?.title)
  assert.deepEqual([...resolvePackIdsFromSkill(canvas)].sort(), ['artifacts'])

  const web = getSkill('create-web')
  assert.ok(web)
  assert.equal(web.source, 'builtin')
  assert.ok(web.allowedTools?.includes('create_web'))
  assert.ok(web.allowedTools?.includes('list_web_vendor'))
  assert.ok(web.metadata?.['required-packs']?.includes('artifacts'))
  assert.equal(web.metadata?.['default-deliverable'], 'web')
  assert.deepEqual([...resolvePackIdsFromSkill(web)].sort(), ['artifacts'])

  const mindmap = getSkill('create-mindmap')
  assert.ok(mindmap)
  assert.equal(mindmap.source, 'builtin')
  assert.ok(mindmap.allowedTools?.includes('create_mindmap'))
  assert.ok(mindmap.metadata?.['required-packs']?.includes('artifacts'))
  assert.deepEqual([...resolvePackIdsFromSkill(mindmap)].sort(), ['artifacts'])

  const store = new ToolPackSessionStore()
  const sessionId = 'skill-pack-create-artifacts'
  const { activated } = store.activate(sessionId, resolvePackIdsFromSkill(canvas))
  assert.ok(activated.includes('artifacts'))
  assert.ok(store.getActivated(sessionId).has('artifacts'))

  const store2 = new ToolPackSessionStore()
  const { activated: activatedWeb } = store2.activate(
    'skill-pack-web-only',
    resolvePackIdsFromSkill(web),
  )
  assert.ok(activatedWeb.includes('artifacts'))
  assert.ok(store2.getActivated('skill-pack-web-only').has('artifacts'))
})

test('builtin run-backtest / strategy-report activate → strategy_extra + artifacts', () => {
  const backtest = getSkill('run-backtest')
  assert.ok(backtest)
  assert.equal(backtest.source, 'builtin')
  assert.ok(backtest.allowedTools?.includes('run_backtest'))
  assert.ok(backtest.allowedTools?.includes('create_web'))
  assert.deepEqual([...resolvePackIdsFromSkill(backtest)].sort(), ['artifacts', 'strategy_extra'])

  const report = getSkill('strategy-report')
  assert.ok(report)
  assert.ok(report.allowedTools?.includes('strategy_report'))
  assert.ok(report.allowedTools?.includes('create_web'))
  assert.deepEqual([...resolvePackIdsFromSkill(report)].sort(), ['artifacts', 'strategy_extra'])

  const store = new ToolPackSessionStore()
  const { activated } = store.activate('skill-pack-backtest', resolvePackIdsFromSkill(backtest))
  assert.ok(activated.includes('strategy_extra'))
  assert.ok(activated.includes('artifacts'))
  assert.ok(store.getActivated('skill-pack-backtest').has('strategy_extra'))
})

test('builtin etf / portfolio / news / signals resolve business pack + artifacts', () => {
  assert.deepEqual([...resolvePackIdsFromSkill(getSkill('etf-research'))].sort(), ['artifacts', 'etf'])
  assert.deepEqual(
    [...resolvePackIdsFromSkill(getSkill('portfolio-review'))].sort(),
    ['artifacts', 'portfolio'],
  )
  assert.deepEqual([...resolvePackIdsFromSkill(getSkill('news-digest'))].sort(), ['artifacts', 'news'])
  assert.deepEqual(
    [...resolvePackIdsFromSkill(getSkill('instrument-signals'))].sort(),
    ['artifacts', 'instrument_analytics'],
  )
  assert.deepEqual([...resolvePackIdsFromSkill(getSkill('browser-browse'))].sort(), ['browser'])
  assert.deepEqual([...resolvePackIdsFromSkill(getSkill('scheduled-jobs'))].sort(), ['automation'])
})

test('research builtins declare create_web + artifacts + composer metadata', () => {
  const researchNames = [
    'morning-market-brief',
    'closing-market-brief',
    'news-digest',
    'equity-deep-dive',
    'earnings-quick-read',
    'instrument-signals',
    'industry-chain',
    'etf-research',
    'portfolio-review',
    'run-backtest',
    'strategy-report',
    'factor-exposure',
    'factor-research',
    'robustness-check',
    'pairs-rv',
    'universe-screen',
    'macro-brief',
    'style-rotation',
    'cross-asset',
    'liquidity-map',
    'catalyst-calendar',
    'northbound-flow',
    'theme-policy-map',
    'limit-move-attribution',
    'ah-compare',
    'mna-event',
    'ipo-note',
    'precedent-tx',
    'seo-refi',
    'credit-brief',
    'esg-scan',
  ]
  for (const name of researchNames) {
    const skill = getSkill(name)
    assert.ok(skill, name)
    assert.ok(skill.allowedTools?.includes('create_web'), `${name} allowed-tools create_web`)
    assert.ok(skill.allowedTools?.includes('list_web_vendor'), `${name} list_web_vendor`)
    assert.ok(
      skill.metadata?.['required-packs']?.includes('artifacts'),
      `${name} required-packs artifacts`,
    )
    assert.ok(skill.metadata?.title, `${name} metadata.title`)
    assert.ok(skill.metadata?.summary, `${name} metadata.summary`)
    assert.ok(skill.metadata?.category, `${name} metadata.category`)
    assert.ok(skill.metadata?.['slash-rank'], `${name} slash-rank`)
    assert.equal(skill.metadata?.['default-deliverable'], 'web', `${name} default-deliverable`)
    const packs = resolvePackIdsFromSkill(skill)
    assert.ok(packs.includes('artifacts'), `${name} resolves artifacts`)
  }
})

test('ops builtins default-deliverable none and skip forced create_web', () => {
  for (const name of ['browser-browse', 'scheduled-jobs', 'create-skill']) {
    const skill = getSkill(name)
    assert.ok(skill, name)
    assert.equal(skill.metadata?.['default-deliverable'], 'none')
    assert.ok(skill.metadata?.title)
    assert.ok(!skill.allowedTools?.includes('create_web'))
  }
})
