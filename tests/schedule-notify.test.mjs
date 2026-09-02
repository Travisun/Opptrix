/**
 * 计划任务通知：合并规则、Webhook 校验、派发（mock fetch）
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveEffectiveNotify,
  shouldNotifyForStatus,
  validateWebhookUrl,
  buildWebhookPayload,
  createScheduleNotificationDispatcher,
  postScheduleWebhook,
  computeWebhookRetryDelayMs,
  isWebhookHttpStatusRetryable,
  resolveWebhookRetryPolicy,
  DEFAULT_SCHEDULE_NOTIFY,
} from '../packages/schedule/dist/index.js'
import { normalizeJobNotifyOverride } from '../packages/user-store/dist/index.js'

test('shouldNotifyForStatus respects notify_on', () => {
  assert.equal(shouldNotifyForStatus('failure', 'ok'), false)
  assert.equal(shouldNotifyForStatus('failure', 'error'), true)
  assert.equal(shouldNotifyForStatus('success', 'ok'), true)
  assert.equal(shouldNotifyForStatus('always', 'ok'), true)
})

test('validateWebhookUrl enforces https unless allow_http_webhooks', () => {
  assert.equal(validateWebhookUrl('https://example.com/h', false), null)
  assert.match(validateWebhookUrl('http://127.0.0.1/h', false) ?? '', /https/)
  assert.equal(validateWebhookUrl('http://127.0.0.1/h', true), null)
})

test('resolveEffectiveNotify — job off disables', () => {
  const global = { ...DEFAULT_SCHEDULE_NOTIFY, enabled: true, notify_on: 'always' }
  const resolved = resolveEffectiveNotify(
    global,
    { notify_mode: 'off' },
    'ok',
  )
  assert.equal(resolved, null)
})

test('resolveEffectiveNotify — custom webhooks override', () => {
  const global = {
    ...DEFAULT_SCHEDULE_NOTIFY,
    enabled: true,
    notify_on: 'always',
    webhooks: [{ id: 'g1', url: 'https://global', enabled: true }],
  }
  const resolved = resolveEffectiveNotify(
    global,
    normalizeJobNotifyOverride({
      notify_mode: 'custom',
      webhooks: [{ id: 'j1', url: 'https://job', enabled: true }],
    }),
    'ok',
  )
  assert.equal(resolved?.webhooks.length, 1)
  assert.equal(resolved?.webhooks[0]?.url, 'https://job')
})

test('createScheduleNotificationDispatcher posts webhook on job finish', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body })
    return new Response('ok', { status: 200 })
  }
  try {
    const settings = {
      master_enabled: true,
      run_when_closed: false,
      autostart: false,
      allow_shell_scripts: true,
      notify: {
        ...DEFAULT_SCHEDULE_NOTIFY,
        enabled: true,
        notify_on: 'always',
        webhooks: [{ id: 'w1', url: 'https://hook.test/notify', enabled: true }],
      },
    }
    const job = {
      id: 'job-1',
      title: '测试',
      enabled: true,
      kind: 'agent_prompt',
      schedule_kind: 'once',
      schedule: { run_at: new Date().toISOString() },
      payload: { prompt: 'hi' },
      os_registration_id: null,
      os_status: 'n/a',
      next_run_at: null,
      last_run_at: null,
      last_status: null,
      notify_override: null,
      created_at: '',
      updated_at: '',
    }
    const run = {
      id: 'run-1',
      job_id: 'job-1',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      status: 'ok',
      trigger: 'timer',
      summary: 'done',
      error: null,
      session_id: 'sess-1',
    }
    const dispatch = createScheduleNotificationDispatcher({
      getSettings: () => settings,
      getJob: () => job,
    })
    await dispatch({
      job,
      run,
      status: 'ok',
      summary: 'done',
    })
    assert.equal(calls.length, 1)
    const body = JSON.parse(String(calls[0].body))
    assert.equal(body.event, 'schedule.job.finished')
    assert.equal(body.job.id, 'job-1')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('resolveWebhookRetryPolicy default max delay is 24h', () => {
  const policy = resolveWebhookRetryPolicy({})
  assert.equal(policy.maxDelayMs, 24 * 60 * 60 * 1000)
})

test('computeWebhookRetryDelayMs grows exponentially and caps', () => {
  const policy = { baseDelayMs: 1000, maxDelayMs: 8000 }
  assert.equal(computeWebhookRetryDelayMs(0, policy, 0), 1000)
  assert.equal(computeWebhookRetryDelayMs(1, policy, 0), 2000)
  assert.equal(computeWebhookRetryDelayMs(2, policy, 0), 4000)
  assert.equal(computeWebhookRetryDelayMs(3, policy, 0), 8000)
  assert.equal(computeWebhookRetryDelayMs(4, policy, 0), 8000)
})

test('isWebhookHttpStatusRetryable — 5xx/429 yes, 4xx no', () => {
  assert.equal(isWebhookHttpStatusRetryable(500), true)
  assert.equal(isWebhookHttpStatusRetryable(429), true)
  assert.equal(isWebhookHttpStatusRetryable(400), false)
  assert.equal(isWebhookHttpStatusRetryable(404), false)
})

test('postScheduleWebhook retries on 503 then succeeds', async () => {
  let calls = 0
  const delays = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    calls += 1
    if (calls < 3) {
      return new Response('err', { status: 503 })
    }
    return new Response('ok', { status: 200 })
  }
  try {
    await postScheduleWebhook(
      'https://hook.test/retry',
      buildWebhookPayload(
        { id: 'j', title: 'T', kind: 'agent_prompt' },
        { id: 'r', trigger: 'manual', status: 'ok', started_at: 'a', finished_at: 'b' },
        'ok',
      ),
      undefined,
      {
        policy: {
          maxAttempts: 5,
          baseDelayMs: 10,
          maxDelayMs: 100,
          timeoutMs: 5000,
        },
        onAttempt: (info) => {
          if (info.delayMs != null) delays.push(info.delayMs)
        },
      },
    )
    assert.equal(calls, 3)
    assert.ok(delays.length >= 2)
    assert.ok(delays[0] >= 8)
    assert.ok(delays[1] >= 8)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('postScheduleWebhook does not retry on 400', async () => {
  let calls = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    calls += 1
    return new Response('bad', { status: 400 })
  }
  try {
    await assert.rejects(
      () => postScheduleWebhook(
        'https://hook.test/no-retry',
        buildWebhookPayload(
          { id: 'j', title: 'T', kind: 'agent_prompt' },
          { id: 'r', trigger: 'manual', status: 'error', started_at: 'a', finished_at: 'b' },
          'error',
        ),
        undefined,
        {
          policy: {
            maxAttempts: 5,
            baseDelayMs: 10,
            maxDelayMs: 100,
            timeoutMs: 5000,
          },
        },
      ),
      /不可重试|HTTP 400/,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('buildWebhookPayload shape', () => {
  const payload = buildWebhookPayload(
    {
      id: 'j',
      title: 'T',
      kind: 'agent_prompt',
    },
    {
      id: 'r',
      trigger: 'manual',
      status: 'error',
      started_at: 'a',
      finished_at: 'b',
    },
    'error',
    null,
    'boom',
  )
  assert.equal(payload.error, 'boom')
  assert.equal(payload.event, 'schedule.job.finished')
})
