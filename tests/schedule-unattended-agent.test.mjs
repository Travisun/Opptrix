import test from 'node:test'
import assert from 'node:assert/strict'
import { JobRunner } from '../packages/schedule/dist/runner.js'

test('JobRunner agent_prompt passes unattended: true to chat', async () => {
  /** @type {{ sessionId: string, message: string, modelRef?: string, opts?: { unattended?: boolean } }[]} */
  const chatCalls = []

  const runner = new JobRunner({
    agent: {
      llmConfigured: true,
      createSession: async () => ({ id: 'sess-sched-1' }),
      chat: async (sessionId, message, modelRef, opts) => {
        chatCalls.push({ sessionId, message, modelRef, opts })
        return { reply: '后台完成', sessionId }
      },
    },
    shell: {
      run: async () => ({ ok: true, exit_code: 0, stdout: '', stderr: '' }),
    },
    getSettings: () => ({
      master_enabled: true,
      allow_shell_scripts: false,
      notify_on_complete: false,
      notify_on_error: true,
    }),
  })

  const job = {
    id: 'job-1',
    title: '收盘分析',
    enabled: true,
    kind: 'agent_prompt',
    schedule_kind: 'once',
    schedule: { run_at: new Date().toISOString() },
    payload: { prompt: '总结今日大盘' },
    os_registration_id: null,
    os_status: 'n/a',
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const run = {
    id: 'run-1',
    job_id: job.id,
    started_at: new Date().toISOString(),
    finished_at: null,
    status: 'running',
    trigger: 'manual',
    summary: null,
    error: null,
    session_id: null,
  }

  const result = await runner.execute(job, run)
  assert.equal(result.summary, '后台完成')
  assert.equal(chatCalls.length, 1)
  assert.equal(chatCalls[0].opts?.unattended, true)
  assert.equal(chatCalls[0].message, '总结今日大盘')
})
