import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatResultPreview,
  formatToolLabel,
  enrichStepFromResult,
} from '../packages/agent/dist/chat-progress.js'

test('formatResultPreview summarizes batch_instrument_snapshots', () => {
  const { preview } = formatResultPreview({
    success: true,
    message: '批量快照 2 只',
    data: {
      trade_date: '2024-06-01',
      count: 2,
      discover_items: [
        { code: '600519', name: '贵州茅台', total_score: 82 },
        { code: '000001', name: '平安银行', pe: 5 },
      ],
      quotes: [],
    },
  }, 'batch_instrument_snapshots')

  assert.match(preview, /批量截面 2 只/)
  assert.match(preview, /2024-06-01/)
  assert.match(preview, /贵州茅台/)
  assert.match(preview, /82 分/)
})

test('formatResultPreview summarizes instrument snapshot quote', () => {
  const { preview } = formatResultPreview({
    success: true,
    data: {
      code: 'AAPL',
      name: 'Apple',
      quote: { price: 190.12, change_pct: 1.23 },
    },
  }, 'get_instrument_snapshot')

  assert.match(preview, /Apple/)
  assert.match(preview, /AAPL/)
  assert.match(preview, /190\.12/)
  assert.match(preview, /\+1\.23%/)
})

test('formatToolLabel includes instrument ref for evaluate_instrument', () => {
  const label = formatToolLabel('evaluate_instrument', {
    instrument: { market: 'US', assetClass: 'EQUITY', symbol: 'AAPL' },
  })
  assert.match(label, /US:AAPL/)
})

test('enrichStepFromResult marks failed hub responses as error', () => {
  const step = enrichStepFromResult({
    id: '1',
    tool: 'batch_instrument_snapshots',
    label: '批量获取候选标的快照',
    status: 'running',
    startedAt: new Date().toISOString(),
  }, { success: false, message: 'instruments 或 codes 必填' })

  assert.equal(step.status, 'error')
  assert.match(step.resultPreview ?? '', /instruments 或 codes 必填/)
})

test('shell tools have Chinese labels and result summaries', () => {
  const runLabel = formatToolLabel('shell_run', { argv: ['python3', '-c', 'print(1)'] })
  assert.match(runLabel, /运行命令/)
  assert.match(runLabel, /python3/)

  const { preview: runPreview } = formatResultPreview({
    ok: true,
    exit_code: 0,
    stdout: 'hello\n',
  }, 'shell_run')
  assert.match(runPreview, /退出码 0/)
  assert.match(runPreview, /hello/)

  const { preview: statusPreview } = formatResultPreview({
    ready: true,
    supported: true,
    message: '就绪',
  }, 'shell_platform_status')
  assert.match(statusPreview, /隔离环境已就绪/)
})
