import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  formatResultPreview,
  formatToolLabel,
  formatArgsPreview,
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

test('enrichStepFromResult maps truncated spill meta for SSE / UI banner', () => {
  const step = enrichStepFromResult({
    id: 't1',
    tool: 'workspace_read',
    label: '读取工作区文件',
    status: 'running',
    startedAt: new Date().toISOString(),
  }, {
    truncated: true,
    preview: 'line-0\nline-1',
    relative_path: 'tool-output/abc123.json',
    bytes: 120_000,
    lines: 3000,
    hint: '完整输出已落盘…',
  })

  assert.equal(step.status, 'done')
  assert.equal(step.truncated, true)
  assert.equal(step.saved_rel_path, 'tool-output/abc123.json')
  assert.equal(step.ui_hint, undefined)
})

test('enrichStepFromResult keeps summary when truncation flags merge onto original result', () => {
  const step = enrichStepFromResult({
    id: 't2',
    tool: 'opptrix_run',
    label: 'Opptrix 运行',
    status: 'running',
    startedAt: new Date().toISOString(),
  }, {
    ok: true,
    exit_code: 0,
    stdout: 'hello from long run\n',
    truncated: true,
    resultTruncated: true,
    saved_rel_path: 'tool-output/run9.json',
    relative_path: 'tool-output/run9.json',
  })

  assert.equal(step.status, 'done')
  assert.equal(step.truncated, true)
  assert.equal(step.resultTruncated, true)
  assert.equal(step.saved_rel_path, 'tool-output/run9.json')
  assert.match(step.resultPreview ?? '', /退出码 0/)
  assert.match(step.resultPreview ?? '', /hello/)
})

test('shell tools have Chinese labels and result summaries', () => {
  // 优先 args.command
  const commandLabel = formatToolLabel('opptrix_run', {
    command: 'python3 demo.py --verbose',
    argv: ['should-not-appear'],
  })
  assert.match(commandLabel, /Opptrix 运行/)
  assert.match(commandLabel, /python3 demo\.py --verbose/)
  assert.doesNotMatch(commandLabel, /should-not-appear/)

  // 仅 argv 旧路径仍可用
  const runLabel = formatToolLabel('opptrix_run', { argv: ['python3', '-c', 'print(1)'] })
  assert.match(runLabel, /Opptrix 运行/)
  assert.match(runLabel, /python3/)

  // 无 command/argv 时回退结果 command_summary
  const summaryLabel = formatToolLabel('opptrix_run', {}, { command_summary: 'npm test' })
  assert.match(summaryLabel, /Opptrix 运行/)
  assert.match(summaryLabel, /npm test/)

  const { preview: runPreview } = formatResultPreview({
    ok: true,
    exit_code: 0,
    stdout: 'hello\n',
  }, 'opptrix_run')
  assert.match(runPreview, /退出码 0/)
  assert.match(runPreview, /hello/)

  // 兼容别名：旧名仍显示同一产品文案
  const aliasLabel = formatToolLabel('shell_run', { argv: ['node', '-e', '1'] })
  assert.match(aliasLabel, /Opptrix 运行/)
  assert.match(aliasLabel, /node/)
  const aliasCommand = formatToolLabel('shell_run', { command: 'ls -la' })
  assert.match(aliasCommand, /Opptrix 运行/)
  assert.match(aliasCommand, /ls -la/)

  const installLabel = formatToolLabel('opptrix_install', { manager: 'pip', packages: ['requests'] })
  assert.match(installLabel, /安装依赖/)
  assert.match(installLabel, /pip/)
  const installAlias = formatToolLabel('shell_install', { manager: 'npm', packages: [] })
  assert.match(installAlias, /安装依赖/)

  const preflightLabel = formatToolLabel('code_preflight', { path: 'demo.py' })
  assert.match(preflightLabel, /检查脚本/)
  const { preview: preflightPreview } = formatResultPreview({
    ok: true,
    path: 'demo.py',
    errors: [],
  }, 'code_preflight')
  assert.match(preflightPreview, /通过/)

  const { preview: statusPreview } = formatResultPreview({
    ready: true,
    supported: true,
    message: '就绪',
  }, 'shell_platform_status')
  assert.match(statusPreview, /隔离环境已就绪/)
})

test('formatToolLabel covers workspace, fetch, mcp, and namespaced tools', () => {
  const httpLabel = formatToolLabel('http_fetch', { url: 'https://quotes.example.com/v1/data' })
  assert.match(httpLabel, /获取网页内容/)
  assert.match(httpLabel, /quotes\.example\.com/)
  assert.doesNotMatch(httpLabel, /\bHTTP\b|\bMCP\b|\bAPI\b|\bProvider\b/i)

  const readLabel = formatToolLabel('workspace_read', { path: 'reports/2024/summary.md' })
  assert.match(readLabel, /读取工作区文件/)
  assert.match(readLabel, /summary\.md/)

  const mcpListLabel = formatToolLabel('list_mcp_servers', {})
  assert.equal(mcpListLabel, '查看已连接扩展')

  const namespacedLabel = formatToolLabel('tonghuashun__foo_bar', {})
  assert.match(namespacedLabel, /调用扩展能力/)
  assert.match(namespacedLabel, /foo bar/)
  assert.doesNotMatch(namespacedLabel, /tonghuashun|\bMCP\b|\bHTTP\b/i)

  const packLabel = formatToolLabel('activate_tool_pack', {
    pack_ids: ['news', 'etf', 'workspace'],
  })
  assert.match(packLabel, /激活工具包/)
  assert.match(packLabel, /news, etf, workspace/)
})

test('formatToolLabel RSS tools use RSS wording without rsshub', () => {
  const cats = formatToolLabel('list_rsshub_categories', {})
  assert.match(cats, /RSS/)
  assert.doesNotMatch(cats, /rsshub/i)

  const domains = formatToolLabel('list_rsshub_domains', { category: 'finance' })
  assert.match(domains, /RSS/)
  assert.match(domains, /finance/)
  assert.doesNotMatch(domains, /rsshub/i)

  const search = formatToolLabel('search_rsshub_routes', { q: '财联社' })
  assert.match(search, /RSS/)
  assert.match(search, /财联社/)
  assert.doesNotMatch(search, /rsshub/i)

  const routes = formatToolLabel('get_rsshub_domain_routes', { domain: 'cls.cn' })
  assert.match(routes, /RSS/)
  assert.match(routes, /cls\.cn/)
  assert.doesNotMatch(routes, /rsshub/i)
})

test('schedule tools have Chinese labels and result summaries', () => {
  const createLabel = formatToolLabel('create_scheduled_job', {
    title: '收盘复盘',
    kind: 'agent_prompt',
    schedule_kind: 'interval',
    schedule: { every_sec: 3600 },
  })
  assert.match(createLabel, /创建计划任务/)
  assert.match(createLabel, /收盘复盘/)
  assert.match(createLabel, /每隔 1 小时/)
  assert.doesNotMatch(createLabel, /agent_prompt|cron|shell_script|API|MCP/i)

  const listLabel = formatToolLabel('list_scheduled_jobs', {})
  assert.equal(listLabel, '查看计划任务')

  const runLabel = formatToolLabel('run_scheduled_job_now', {}, {
    job: { title: '晨间简报', kind: 'agent_prompt', enabled: true },
  })
  assert.match(runLabel, /立即执行计划任务/)
  assert.match(runLabel, /晨间简报/)

  const { preview: listPreview } = formatResultPreview({
    jobs: [
      { title: '收盘复盘', kind: 'agent_prompt', enabled: true },
      { title: '晨间简报', kind: 'agent_prompt', enabled: false },
    ],
  }, 'list_scheduled_jobs')
  assert.match(listPreview, /共 2 项/)
  assert.match(listPreview, /收盘复盘/)

  const { preview: createPreview } = formatResultPreview({
    job: {
      title: '收盘复盘',
      kind: 'agent_prompt',
      enabled: true,
      next_run_at: '2026-07-28T15:00:00.000Z',
      last_status: null,
    },
  }, 'create_scheduled_job')
  assert.match(createPreview, /已创建/)
  assert.match(createPreview, /收盘复盘/)
  assert.match(createPreview, /智能分析/)
  assert.doesNotMatch(createPreview, /agent_prompt|cron/i)

  const { preview: deletePreview } = formatResultPreview({
    needs_confirmation: true,
    summary: '删除计划任务「收盘复盘」',
  }, 'delete_scheduled_job')
  assert.match(deletePreview, /删除计划任务/)

  const { preview: runPreview } = formatResultPreview({
    run: { status: 'ok', summary: '大盘震荡，关注白酒板块' },
  }, 'run_scheduled_job_now')
  assert.match(runPreview, /已完成/)
  assert.match(runPreview, /大盘震荡/)
})

test('formatArgsPreview is human-readable not raw JSON', () => {
  const runPreview = formatArgsPreview({
    command: 'python train.py --epochs 3',
    title: '训练脚本',
  }, 'opptrix_run')
  assert.match(runPreview, /训练脚本|train\.py/)
  assert.doesNotMatch(runPreview, /^\{/)

  const globPreview = formatArgsPreview({ pattern: '**/*.ts', path: 'src' }, 'workspace_glob')
  assert.match(globPreview, /\*\*\/\*\.ts|匹配/)
  assert.doesNotMatch(globPreview, /^\{/)

  const grepPreview = formatArgsPreview({ pattern: 'formatToolLabel', path: 'packages' }, 'workspace_grep')
  assert.match(grepPreview, /formatToolLabel|搜索/)

  const patchPreview = formatArgsPreview({ path: 'a.ts', patch: '@@ -1 +1 @@\n+x' }, 'workspace_apply_patch')
  assert.match(patchPreview, /a\.ts|补丁/)
})

test('workspace_apply_patch has Chinese label', () => {
  const label = formatToolLabel('workspace_apply_patch', { path: 'src/app.ts' })
  assert.match(label, /应用补丁/)
  assert.match(label, /app\.ts/)
})
