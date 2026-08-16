/**
 * Self-Harness Phase 2 — 模型桶解析顺序 / 精确优先 / 无 active 恒等
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-harness-bucket-'))
const prevData = process.env.OPPTRIX_DATA_DIR
process.env.OPPTRIX_DATA_DIR = tmp

const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
getUserDataStore().close()

const agent = await import('../packages/agent/dist/index.js')

const {
  migrateHarnessStore,
  saveHarnessStore,
  loadHarnessStore,
  resolveActiveHarnessVersionId,
  getActiveHarnessVersionForModel,
  normalizeHarnessModelRef,
  classifyVersionTier,
  promoteHarnessProposal,
  rollbackHarnessForModel,
  rollbackHarnessToDefault,
  applyHarnessSkillOverlay,
  clearHarnessOverlayCache,
} = agent

test('normalizeHarnessModelRef: trim / empty → null / no case fold', () => {
  assert.equal(normalizeHarnessModelRef('  openai:gpt-4o  '), 'openai:gpt-4o')
  assert.equal(normalizeHarnessModelRef(''), null)
  assert.equal(normalizeHarnessModelRef('   '), null)
  assert.equal(normalizeHarnessModelRef(null), null)
  assert.equal(normalizeHarnessModelRef('OpenAI:X'), 'OpenAI:X')
})

test('classifyVersionTier: A / B', () => {
  assert.equal(classifyVersionTier([]), 'A')
  assert.equal(
    classifyVersionTier([{ kind: 'skill_body_append', skillName: 'x', text: 't' }]),
    'A',
  )
  assert.equal(
    classifyVersionTier([{ kind: 'route_hint_append', text: 'prefer quote tools' }]),
    'A',
  )
  assert.equal(
    classifyVersionTier([
      { kind: 'skill_body_replace_span', skillName: 'x', from: 'a', to: 'b' },
    ]),
    'B',
  )
})

test('resolve order: exact → provider:* → * → null', () => {
  const store = migrateHarnessStore({
    formatVersion: 2,
    activeVersionId: 'v-star',
    activeByModel: {
      '*': 'v-star',
      'deepseek:*': 'v-ds',
      'deepseek:chat': 'v-exact',
    },
    autoPromote: { enabled: true, updatedAt: new Date().toISOString() },
    auditLog: [],
    versions: {
      'v-star': {
        id: 'v-star',
        createdAt: '2026-01-01T00:00:00.000Z',
        patches: [],
        skippedPatches: [],
        modelBucket: '*',
        tier: 'A',
      },
      'v-ds': {
        id: 'v-ds',
        createdAt: '2026-01-01T00:00:00.000Z',
        patches: [],
        skippedPatches: [],
        modelBucket: 'deepseek:*',
        tier: 'A',
      },
      'v-exact': {
        id: 'v-exact',
        createdAt: '2026-01-01T00:00:00.000Z',
        patches: [],
        skippedPatches: [],
        modelBucket: 'deepseek:chat',
        tier: 'A',
      },
    },
  })

  assert.equal(resolveActiveHarnessVersionId(store, 'deepseek:chat'), 'v-exact')
  assert.equal(resolveActiveHarnessVersionId(store, 'deepseek:reasoner'), 'v-ds')
  assert.equal(resolveActiveHarnessVersionId(store, 'openai:gpt-4o'), 'v-star')
  assert.equal(resolveActiveHarnessVersionId(store, null), 'v-star')
})

test('exact null bucket does not fall through to *', () => {
  const store = migrateHarnessStore({
    formatVersion: 2,
    activeVersionId: 'v-star',
    activeByModel: {
      '*': 'v-star',
      'openai:gpt-4o': null,
    },
    autoPromote: { enabled: true, updatedAt: new Date().toISOString() },
    auditLog: [],
    versions: {
      'v-star': {
        id: 'v-star',
        createdAt: '2026-01-01T00:00:00.000Z',
        patches: [{ kind: 'skill_body_append', skillName: 'morning-market-brief', text: '\nSTAR\n' }],
        skippedPatches: [],
      },
    },
  })
  assert.equal(resolveActiveHarnessVersionId(store, 'openai:gpt-4o'), null)
  assert.equal(resolveActiveHarnessVersionId(store, 'openai:other'), 'v-star')
})

test('promote modelBucket + getActiveForModel; no active identical overlay', () => {
  rollbackHarnessToDefault()
  clearHarnessOverlayCache()

  const baseBody = 'BASE'
  assert.equal(
    applyHarnessSkillOverlay('morning-market-brief', baseBody, {
      modelRef: 'openai:gpt-4o',
      bypassCache: true,
    }).body,
    baseBody,
  )

  const v = promoteHarnessProposal(
    {
      id: 'p-bucket',
      createdAt: new Date().toISOString(),
      targetWeaknessCodes: ['tool_error'],
      summary: 'model bucket',
      patches: [
        {
          kind: 'skill_body_append',
          skillName: 'morning-market-brief',
          text: '\n## Bucket Patch\n',
        },
      ],
    },
    { modelBucket: 'openai:gpt-4o', source: 'manual' },
  )
  assert.equal(v.modelBucket, 'openai:gpt-4o')
  assert.equal(getActiveHarnessVersionForModel('openai:gpt-4o')?.id, v.id)
  assert.equal(getActiveHarnessVersionForModel('deepseek:chat'), null)

  const overlaid = applyHarnessSkillOverlay('morning-market-brief', baseBody, {
    modelRef: 'openai:gpt-4o',
    bypassCache: true,
  })
  assert.match(overlaid.body, /Bucket Patch/)

  const other = applyHarnessSkillOverlay('morning-market-brief', baseBody, {
    modelRef: 'deepseek:chat',
    bypassCache: true,
  })
  assert.equal(other.body, baseBody)

  rollbackHarnessForModel('openai:gpt-4o')
  assert.equal(getActiveHarnessVersionForModel('openai:gpt-4o'), null)
  const store = loadHarnessStore()
  assert.equal(store.activeByModel['openai:gpt-4o'], null)
})

test('rollbackHarnessToDefault(modelRef) clears that bucket', () => {
  rollbackHarnessToDefault()
  promoteHarnessProposal(
    {
      id: 'p2',
      createdAt: new Date().toISOString(),
      targetWeaknessCodes: [],
      summary: 'x',
      patches: [
        {
          kind: 'route_hint_append',
          text: 'prefer get_stock_quote for price questions',
        },
      ],
    },
    { modelBucket: 'acme:m1' },
  )
  assert.ok(getActiveHarnessVersionForModel('acme:m1'))
  rollbackHarnessToDefault('acme:m1')
  assert.equal(getActiveHarnessVersionForModel('acme:m1'), null)
})

test.after(() => {
  try {
    getUserDataStore().close()
  } catch {
    /* ignore */
  }
  if (prevData == null) delete process.env.OPPTRIX_DATA_DIR
  else process.env.OPPTRIX_DATA_DIR = prevData
  fs.rmSync(tmp, { recursive: true, force: true })
})
