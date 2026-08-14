/**
 * workspace_replace_lines / applyLineEdits — 按行号批量替换与原子回滚
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('applyLineEdits: single line replace', async () => {
  const { applyLineEdits } = await import('../packages/agent-workspace/dist/line-edit/index.js')
  const r = applyLineEdits('a\nb\nc\n', [{ start_line: 2, new_text: 'B' }])
  assert.equal(r.ok, true)
  assert.equal(r.applied, 1)
  assert.equal(r.line_count_before, 3)
  assert.equal(r.line_count_after, 3)
  assert.equal(r.content, 'a\nB\nc\n')
  assert.equal(r.results[0].status, 'ok')
})

test('applyLineEdits: batch high-to-low preserves lower lines', async () => {
  const { applyLineEdits } = await import('../packages/agent-workspace/dist/line-edit/index.js')
  const r = applyLineEdits('1\n2\n3\n4\n', [
    { start_line: 1, new_text: 'A' },
    { start_line: 3, end_line: 4, new_text: 'C\nD' },
  ])
  assert.equal(r.ok, true)
  assert.equal(r.applied, 2)
  assert.equal(r.content, 'A\n2\nC\nD\n')
})

test('applyLineEdits: expect mismatch is atomic (no content)', async () => {
  const { applyLineEdits } = await import('../packages/agent-workspace/dist/line-edit/index.js')
  const original = 'alpha\nbeta\ngamma\n'
  const r = applyLineEdits(original, [
    { start_line: 1, new_text: 'ALPHA', expect_text: 'alpha' },
    { start_line: 2, new_text: 'BETA', expect_text: 'wrong' },
  ])
  assert.equal(r.ok, false)
  assert.equal(r.applied, 0)
  assert.equal(r.content, undefined)
  assert.ok(r.results.some(x => x.status === 'mismatch'))
})

test('applyLineEdits: out of range', async () => {
  const { applyLineEdits } = await import('../packages/agent-workspace/dist/line-edit/index.js')
  const r = applyLineEdits('only\n', [{ start_line: 5, new_text: 'x' }])
  assert.equal(r.ok, false)
  assert.equal(r.results[0].status, 'out_of_range')
})

test('applyLineEdits: overlap fails', async () => {
  const { applyLineEdits } = await import('../packages/agent-workspace/dist/line-edit/index.js')
  const r = applyLineEdits('a\nb\nc\n', [
    { start_line: 1, end_line: 2, new_text: 'x' },
    { start_line: 2, end_line: 3, new_text: 'y' },
  ])
  assert.equal(r.ok, false)
  assert.ok(r.results.every(x => x.status === 'overlap'))
})

test('applyLineEdits: delete line range with empty new_text', async () => {
  const { applyLineEdits } = await import('../packages/agent-workspace/dist/line-edit/index.js')
  const r = applyLineEdits('a\nb\nc\nd\n', [{ start_line: 2, end_line: 3, new_text: '' }])
  assert.equal(r.ok, true)
  assert.equal(r.content, 'a\nd\n')
  assert.equal(r.line_count_after, 2)
})

test('applyLineEdits: apply order large start_line first (internal)', async () => {
  const { applyLineEdits } = await import('../packages/agent-workspace/dist/line-edit/index.js')
  // If applied low-to-high incorrectly, replacing line 1 with 2 lines would shift line 3
  const r = applyLineEdits('L1\nL2\nL3\n', [
    { start_line: 3, new_text: 'TAIL' },
    { start_line: 1, new_text: 'H1\nH2' },
  ])
  assert.equal(r.ok, true)
  assert.equal(r.content, 'H1\nH2\nL2\nTAIL\n')
})

test('WorkspaceService.replaceLines: atomic mismatch leaves file unchanged', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-replace-lines-'))
  const sessionId = 'test-replace-lines'
  try {
    const ws = new WorkspaceService()
    const grant = ws.addGrant(sessionId, tmp, 'rw', 'tmp')
    const file = path.join(tmp, 'demo.py')
    await fs.writeFile(file, 'print(1)\nprint(2)\n', 'utf8')
    const before = await fs.readFile(file, 'utf8')
    const r = await ws.replaceLines(sessionId, grant.root_id, 'demo.py', [
      { start_line: 1, new_text: 'print(9)', expect_text: 'nope' },
    ])
    assert.equal(r.ok, false)
    assert.equal(await fs.readFile(file, 'utf8'), before)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

test('WorkspaceService.replaceLines: success + numbered read', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-replace-lines-ok-'))
  const sessionId = 'test-replace-lines-ok'
  try {
    const ws = new WorkspaceService()
    const grant = ws.addGrant(sessionId, tmp, 'rw', 'tmp')
    await fs.writeFile(path.join(tmp, 'demo.py'), 'a\nb\nc\n', 'utf8')
    const r = await ws.replaceLines(sessionId, grant.root_id, 'demo.py', [
      { start_line: 2, new_text: 'B', expect_text: 'b' },
    ])
    assert.equal(r.ok, true)
    assert.equal(r.applied, 1)
    assert.match((await fs.readFile(path.join(tmp, 'demo.py'), 'utf8')), /^a\nB\nc\n$/)
    assert.ok(r.numbered_snippets?.length)

    const numbered = await ws.readFile(sessionId, grant.root_id, 'demo.py', undefined, {
      start_line: 1,
      end_line: 2,
      numbered: true,
    })
    assert.match(numbered.content, /^0001\|a\n0002\|B\n$/)
    assert.equal(numbered.start_line, 1)
    assert.equal(numbered.end_line, 2)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})

test('WorkspaceService.replaceLines: missing file errors clearly', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  const { WorkspaceError } = await import('../packages/agent-workspace/dist/errors.js')
  resetWorkspaceService()
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-replace-missing-'))
  const sessionId = 'test-replace-missing'
  try {
    const ws = new WorkspaceService()
    const grant = ws.addGrant(sessionId, tmp, 'rw', 'tmp')
    await assert.rejects(
      () => ws.replaceLines(sessionId, grant.root_id, 'nope.py', [{ start_line: 1, new_text: 'x' }]),
      (err) => err instanceof WorkspaceError && /不存在|workspace_write/.test(err.message),
    )
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
})
