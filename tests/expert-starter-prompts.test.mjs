/**
 * Expert starterPrompts — normalize + parseExpertDefinition + LocalExpertsRepository 往返
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

// --- LocalExpertsRepository 往返（临时 OPPTRIX_DATA_DIR）---

const expertsTmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-experts-sp-'))

async function withExpertsRepo(fn) {
  const prevDir = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = expertsTmpRoot
  const { UserDataStore, LocalExpertsRepository } = await import('../packages/user-store/dist/index.js')
  try {
    try {
      UserDataStore.getInstance().close()
    } catch { /* 尚无实例 */ }
    const store = UserDataStore.getInstance()
    const repo = new LocalExpertsRepository(store)
    return await fn(repo)
  } finally {
    try {
      UserDataStore.getInstance().close()
    } catch { /* ignore */ }
    if (prevDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDir
  }
}

test.after(() => {
  fs.rmSync(expertsTmpRoot, { recursive: true, force: true })
})

test('LocalExpertsRepository create+get keeps starterPrompts when title empty and content set', async () => {
  await withExpertsRepo(repo => {
    const created = repo.create(
      {
        title: '快捷提问落库专家',
        summary: '验证 title 空、content 非空仍写入',
        tags: ['测试'],
        starterPrompts: [
          { id: 'sp-1', title: '', content: '帮我梳理这只股票的估值与风险' },
        ],
      },
      '你是一位测试专家。',
    )
    assert.ok(created.id)
    const got = repo.get(created.id)
    assert.ok(got)
    assert.ok(got.starterPrompts)
    assert.ok(got.starterPrompts.length >= 1)
    assert.equal(got.starterPrompts[0].content, '帮我梳理这只股票的估值与风险')
    assert.ok(got.starterPrompts[0].title.length > 0)
  })
})

test('LocalExpertsRepository save updates starterPrompts roundtrip', async () => {
  await withExpertsRepo(repo => {
    const created = repo.create(
      {
        title: '更新提问专家',
        summary: '验证 save 往返',
        starterPrompts: [
          { id: 'sp-a', title: '旧提问', content: '旧提问内容' },
        ],
      },
      '你是一位测试专家。',
    )
    const saved = repo.save(created.id, {
      starterPrompts: [
        { id: 'sp-b', title: '', content: '更新后的快捷提问正文' },
        { id: 'sp-c', title: '第二条', content: '另一条提问' },
      ],
    })
    assert.equal(saved.starterPrompts?.length, 2)
    assert.equal(saved.starterPrompts[0].content, '更新后的快捷提问正文')
    assert.ok(saved.starterPrompts[0].title.length > 0)

    const got = repo.get(created.id)
    assert.ok(got?.starterPrompts)
    assert.equal(got.starterPrompts.length, 2)
    assert.equal(got.starterPrompts[0].content, '更新后的快捷提问正文')
    assert.equal(got.starterPrompts[1].content, '另一条提问')
  })
})
