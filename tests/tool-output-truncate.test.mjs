/**
 * 大工具输出落盘（OpenCode 对标阈值）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('truncateToolOutputForModel: small payload passthrough', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tool-out-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const {
    truncateToolOutputForModel,
    TOOL_OUTPUT_MAX_BYTES,
  } = await import('../packages/agent/dist/loop/tool-output-truncate.js')

  const r = truncateToolOutputForModel({ ok: true, n: 1 })
  assert.equal(r.truncated, false)
  assert.ok(r.content.includes('"ok":true'))
  assert.ok(TOOL_OUTPUT_MAX_BYTES >= 50_000)
})

test('truncateToolOutputForModel: spills large output to shared tool-output/', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tool-out-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const {
    truncateToolOutputForModel,
    resolveToolOutputDir,
    resolveToolOutputSpillRoot,
    pruneToolOutputDir,
    TOOL_OUTPUT_ROOT_ID,
  } = await import('../packages/agent/dist/loop/tool-output-truncate.js')

  const big = { lines: Array.from({ length: 2500 }, (_, i) => `line-${i}-${'x'.repeat(40)}`) }
  const r = truncateToolOutputForModel(big, { toolName: 'workspace_read', sessionId: 's1' })
  assert.equal(r.truncated, true)
  assert.ok(r.relative_path)
  assert.ok(r.relative_path.startsWith('tool-output/'))
  assert.equal(r.root_id, TOOL_OUTPUT_ROOT_ID)
  const parsed = JSON.parse(r.content)
  assert.equal(parsed.truncated, true)
  assert.equal(parsed.root_id, 'shared')
  assert.ok(parsed.preview)
  assert.ok(String(parsed.hint).includes('workspace_read'))
  assert.ok(String(parsed.hint).includes('shared'))
  assert.ok(!String(parsed.hint).includes('应用数据目录外') || String(parsed.hint).includes('勿尝试'))
  const abs = path.join(resolveToolOutputDir(), path.basename(r.relative_path))
  assert.ok(fs.existsSync(abs))
  assert.ok(abs.startsWith(resolveToolOutputSpillRoot()))

  const pruned = pruneToolOutputDir({
    root: resolveToolOutputSpillRoot(),
    retentionDays: 0,
    nowMs: Date.now() + 1,
  })
  assert.ok(pruned.removed >= 1)
})

test('truncateToolOutputForModel: line threshold triggers spill', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tool-out-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { truncateToolOutputForModel, TOOL_OUTPUT_MAX_LINES } = await import(
    '../packages/agent/dist/loop/tool-output-truncate.js'
  )
  const text = Array.from({ length: TOOL_OUTPUT_MAX_LINES + 5 }, (_, i) => `L${i}`).join('\n')
  const r = truncateToolOutputForModel(text)
  assert.equal(r.truncated, true)
  assert.ok(r.relative_path)
})

test('truncate then enrichStepFromResult exposes truncated for progress/UI', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tool-out-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { truncateToolOutputForModel } = await import(
    '../packages/agent/dist/loop/tool-output-truncate.js'
  )
  const { enrichStepFromResult } = await import('../packages/agent/dist/chat-progress.js')

  const big = { lines: Array.from({ length: 2500 }, (_, i) => `row-${i}-${'y'.repeat(32)}`) }
  const trunc = truncateToolOutputForModel(big, { toolName: 'workspace_read', sessionId: 's-enrich' })
  assert.equal(trunc.truncated, true)
  const parsed = JSON.parse(trunc.content)
  // 与 engine：先 truncate，再把含 truncated 字段的 payload 交给 enrich
  const step = enrichStepFromResult({
    id: 'e1',
    tool: 'workspace_read',
    label: '读取工作区文件',
    status: 'running',
    startedAt: new Date().toISOString(),
  }, parsed)

  assert.equal(step.truncated, true)
  assert.equal(step.saved_rel_path, trunc.relative_path)
  assert.ok(String(step.saved_rel_path).startsWith('tool-output/'))
})
