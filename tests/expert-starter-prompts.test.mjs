/**
 * Expert starterPrompts — normalize + parseExpertDefinition
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeExpertStarterPrompts, MAX_EXPERT_STARTER_PROMPTS } from '../packages/shared/dist/expert.js'
import { parseExpertDefinition } from '../packages/agent/dist/experts/static-http-provider.js'

const BASE_DEF = {
  id: 'equity-analysis',
  title: '个股分析助手',
  summary: '聚焦单只标的的基本面、估值与趋势结构，给出结构化研究解读',
  icon: { kind: 'icon', value: 'expert' },
  tags: ['个股', '基本面'],
  official: true,
  source: 'builtin',
  persona: '你是一位个股分析助手，擅长从商业模式与估值出发帮助用户理解标的。',
  defaultPacks: ['fundamentals'],
  defaultResearchTier: 'L3',
  complianceVersion: '1',
}

test('normalizeExpertStarterPrompts trims, fills title, caps at 6, unique ids', () => {
  const raw = [
    { id: 'a', title: '  短标题  ', content: '  完整问题一  ' },
    { id: 'a', title: '重复 id', content: '完整问题二' },
    { title: '', content: '没有标题时用正文截断展示足够长的内容以便验证' },
    { content: '' },
    null,
    { id: 'b', title: '有效', content: '问题三' },
    { id: 'c', title: '四', content: '问题四' },
    { id: 'd', title: '五', content: '问题五' },
    { id: 'e', title: '六', content: '问题六' },
    { id: 'f', title: '七', content: '问题七' },
    { id: 'g', title: '八', content: '问题八' },
  ]
  const out = normalizeExpertStarterPrompts(raw)
  assert.ok(out)
  assert.equal(out.length, MAX_EXPERT_STARTER_PROMPTS)
  assert.equal(out[0].title, '短标题')
  assert.equal(out[0].content, '完整问题一')
  assert.equal(out[1].id !== 'a', true)
  assert.ok(out[2].title.length > 0)
  assert.match(out[2].title, /没有标题/)
  assert.equal(out[5].content, '问题五')
})

test('normalizeExpertStarterPrompts returns undefined for empty / invalid', () => {
  assert.equal(normalizeExpertStarterPrompts(undefined), undefined)
  assert.equal(normalizeExpertStarterPrompts([]), undefined)
  assert.equal(normalizeExpertStarterPrompts([{ title: 'x', content: '  ' }]), undefined)
  assert.equal(normalizeExpertStarterPrompts('bad'), undefined)
})

test('parseExpertDefinition keeps starterPrompts when present', () => {
  const parsed = parseExpertDefinition({
    ...BASE_DEF,
    starterPrompts: [
      { id: 'eq-1', title: '梳理这只股票', content: '请帮我梳理这只股票。' },
      { id: 'bad', title: '空正文', content: '   ' },
      { title: '', content: '仅有正文的提问' },
    ],
  })
  assert.ok(parsed)
  assert.ok(parsed.starterPrompts)
  assert.equal(parsed.starterPrompts.length, 2)
  assert.equal(parsed.starterPrompts[0].title, '梳理这只股票')
  assert.ok(parsed.starterPrompts[1].title.length > 0)
})

test('parseExpertDefinition omits starterPrompts when absent', () => {
  const parsed = parseExpertDefinition(BASE_DEF)
  assert.ok(parsed)
  assert.equal(parsed.starterPrompts, undefined)
})

test('parseExpertDefinition skips bad starter items without failing whole expert', () => {
  const parsed = parseExpertDefinition({
    ...BASE_DEF,
    starterPrompts: [null, 1, { foo: 'bar' }, { content: 'ok', title: '好' }],
  })
  assert.ok(parsed)
  assert.equal(parsed.starterPrompts?.length, 1)
  assert.equal(parsed.starterPrompts[0].content, 'ok')
})
