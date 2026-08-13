import test from 'node:test'
import assert from 'node:assert/strict'
import {
  updateResearchChecklist,
  buildChecklistTurnTail,
  clearResearchChecklistSession,
  resetResearchChecklistForTests,
  seedChecklistOnSkillActivate,
  getResearchChecklist,
  hasPendingChecklistItems,
  isChecklistAllDone,
} from '../packages/agent/dist/loop/research-checklist.js'

test.beforeEach(() => {
  resetResearchChecklistForTests()
})

test('update merge and replace', () => {
  const sid = 'c1'
  const merged = updateResearchChecklist(sid, {
    mode: 'merge',
    items: [
      { id: 'a', title: '取行情', status: 'pending' },
      { id: 'b', title: '读新闻', status: 'pending' },
    ],
  })
  assert.equal(merged.ok, true)
  assert.equal(merged.pending_count, 2)

  const step = updateResearchChecklist(sid, {
    mode: 'merge',
    items: [{ id: 'a', title: '取行情', status: 'done' }],
  })
  assert.equal(step.ok, true)
  assert.equal(step.pending_count, 1)
  assert.equal(getResearchChecklist(sid).find(i => i.id === 'a')?.status, 'done')

  const replaced = updateResearchChecklist(sid, {
    mode: 'replace',
    items: [{ title: '只剩一项', status: 'pending' }],
  })
  assert.equal(replaced.ok, true)
  assert.equal(replaced.items.length, 1)
  assert.equal(hasPendingChecklistItems(sid), true)
})

test('turn-tail includes pending items', () => {
  const sid = 'c2'
  updateResearchChecklist(sid, {
    mode: 'replace',
    items: [
      { id: 'x', title: '核对 PE', status: 'pending' },
      { id: 'y', title: '已完成项', status: 'done' },
    ],
  })
  const tail = buildChecklistTurnTail(sid)
  assert.match(tail, /核对 PE/)
  assert.doesNotMatch(tail, /已完成项/)
})

test('skill seed placeholder + clear', () => {
  const sid = 'c3'
  seedChecklistOnSkillActivate(sid, ['morning-brief'])
  assert.equal(hasPendingChecklistItems(sid), true)
  assert.match(getResearchChecklist(sid)[0]?.title ?? '', /已激活技能/)
  clearResearchChecklistSession(sid)
  assert.equal(getResearchChecklist(sid).length, 0)
  assert.equal(isChecklistAllDone(sid), false)
})

test('all done when every item done or skipped', () => {
  const sid = 'c4'
  updateResearchChecklist(sid, {
    mode: 'replace',
    items: [
      { id: '1', title: 'A', status: 'done' },
      { id: '2', title: 'B', status: 'skipped' },
    ],
  })
  assert.equal(isChecklistAllDone(sid), true)
  assert.equal(buildChecklistTurnTail(sid), '')
})
