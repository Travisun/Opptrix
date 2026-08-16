import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWeaknessReport,
  formatWeaknessReportMarkdown,
  sanitizeWeaknessSnippet,
  getResearchChecklist,
  updateResearchChecklist,
  resetResearchChecklistForTests,
} from '../packages/agent/dist/index.js'

test.beforeEach(() => {
  resetResearchChecklistForTests()
})

test('empty turns → no weaknesses', () => {
  const report = buildWeaknessReport({ turns: [] })
  assert.equal(report.weaknesses.length, 0)
  assert.equal(report.totals.weaknessCount, 0)
  assert.equal(report.totals.turnCount, 0)
  assert.match(formatWeaknessReportMarkdown(report), /未发现可分类的失败信号/)
})

test('error step → tool_error', () => {
  const report = buildWeaknessReport({
    sessionId: 's-tool-error',
    modelRef: 'deepseek:chat',
    turns: [
      {
        role: 'assistant',
        content: '暂时无法完成',
        at: '2026-08-16T01:00:00.000Z',
        toolSteps: [
          {
            id: 'step-1',
            tool: 'query_instrument',
            label: '查询行情',
            status: 'error',
            resultPreview: '{"error":"暂时无法获取数据"}',
            startedAt: '2026-08-16T01:00:00.000Z',
            finishedAt: '2026-08-16T01:00:01.000Z',
          },
        ],
      },
    ],
  })

  const bucket = report.weaknesses.find(w => w.code === 'tool_error')
  assert.ok(bucket)
  assert.equal(bucket.count, 1)
  assert.equal(bucket.confidence, 'high')
  assert.equal(bucket.evidence[0]?.tool, 'query_instrument')
  assert.equal(report.byModel?.['deepseek:chat']?.length, 1)
})

test('spin_guard structure → spin_guard bucket (not tool_error)', () => {
  const report = buildWeaknessReport({
    turns: [
      {
        role: 'assistant',
        content: '已停止重复调用',
        toolSteps: [
          {
            id: 'sg-1',
            tool: 'list_jobs',
            label: '查询后台任务',
            status: 'error',
            resultPreview: '{"error":"已拦截后台任务轮询","spin_guard":true,"hint":"请勿忙等"}',
            startedAt: '2026-08-16T02:00:00.000Z',
          },
        ],
      },
    ],
  })

  assert.ok(report.weaknesses.some(w => w.code === 'spin_guard'))
  assert.equal(report.weaknesses.some(w => w.code === 'tool_error'), false)
})

test('spin_guard text marker in resultDetail', () => {
  const report = buildWeaknessReport({
    turns: [
      {
        role: 'assistant',
        content: '',
        toolSteps: [
          {
            id: 'sg-2',
            tool: 'get_subagent',
            label: '查询协作任务',
            status: 'done',
            resultDetail: '{"spin_guard": true, "error": "已拦截协作任务轮询"}',
            startedAt: '2026-08-16T02:01:00.000Z',
          },
        ],
      },
    ],
  })
  assert.ok(report.weaknesses.some(w => w.code === 'spin_guard'))
})

test('empty assistant reply → empty_reply', () => {
  const report = buildWeaknessReport({
    turns: [
      { role: 'user', content: '分析一下', at: '2026-08-16T03:00:00.000Z' },
      { role: 'assistant', content: '   ', at: '2026-08-16T03:00:01.000Z' },
    ],
  })
  const bucket = report.weaknesses.find(w => w.code === 'empty_reply')
  assert.ok(bucket)
  assert.equal(bucket.count, 1)
})

test('checklist_stale when pending checklist and no progress', () => {
  const report = buildWeaknessReport({
    turns: [
      {
        role: 'assistant',
        content: '继续分析中',
        toolSteps: [
          {
            id: 'c-1',
            tool: 'activate_agent_skill',
            label: '激活技能',
            status: 'done',
            startedAt: '2026-08-16T04:00:00.000Z',
          },
        ],
      },
    ],
    checklist: [
      { id: 'a', title: '核对估值', status: 'pending' },
      { id: 'b', title: '整理结论', status: 'pending' },
    ],
  })
  assert.ok(report.weaknesses.some(w => w.code === 'checklist_stale'))
})

test('skill_skip_risk heuristic for seminar skill without create_web', () => {
  const report = buildWeaknessReport({
    activatedSkills: ['multi-role-research-council'],
    turns: [
      {
        role: 'assistant',
        content: '研讨结论如下…',
        toolsUsed: ['activate_agent_skill', 'run_subagent'],
        toolSteps: [
          {
            id: 'sk-1',
            tool: 'run_subagent',
            label: '运行协作任务',
            status: 'done',
            startedAt: '2026-08-16T05:00:00.000Z',
          },
        ],
      },
    ],
  })
  const bucket = report.weaknesses.find(w => w.code === 'skill_skip_risk')
  assert.ok(bucket)
  assert.equal(bucket.confidence, 'medium')
})

test('sanitizeWeaknessSnippet redacts secrets and absolute paths', () => {
  const sanitized = sanitizeWeaknessSnippet(
    'token=abc123secretkey /Users/mac/.opptrix/sk-live-abcdef 失败',
  )
  assert.match(sanitized, /\[已脱敏\]|\[路径已隐藏\]/)
  assert.doesNotMatch(sanitized, /\/Users\/mac/)
  assert.ok(sanitized.length <= 121)
})

test('buildWeaknessReport does not mutate checklist session state', () => {
  const sid = 'harness-readonly-checklist'
  updateResearchChecklist(sid, {
    mode: 'replace',
    items: [{ id: 'x', title: '取数', status: 'pending' }],
  })
  const before = getResearchChecklist(sid)

  buildWeaknessReport({
    sessionId: sid,
    turns: [{ role: 'assistant', content: '进行中' }],
    checklist: before,
  })

  assert.deepEqual(getResearchChecklist(sid), before)
})

test('markdown report uses Chinese headings', () => {
  const md = formatWeaknessReportMarkdown(
    buildWeaknessReport({
      turns: [
        {
          role: 'assistant',
          content: '',
          toolSteps: [
            {
              id: 'e1',
              tool: 'fetch_news',
              label: '获取新闻',
              status: 'error',
              resultPreview: '{"error":"网络不稳定"}',
              startedAt: '2026-08-16T06:00:00.000Z',
            },
          ],
        },
      ],
    }),
  )
  assert.match(md, /^# 会话弱点报告/m)
  assert.match(md, /工具执行失败/)
})
