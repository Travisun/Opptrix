import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UserPromptBridge,
  parseAskUserArgs,
  normalizeUserPromptOptions,
  UserPromptCancelledError,
  USER_PROMPT_OPTIONS_MAX,
} from '../packages/agent/dist/user-prompt.js'

test('normalizeUserPromptOptions accepts 2–50 unique options', () => {
  const ok = normalizeUserPromptOptions([
    { id: 'a', label: '选项 A' },
    { id: 'b', label: '选项 B' },
  ])
  assert.deepEqual(ok, [
    { id: 'a', label: '选项 A' },
    { id: 'b', label: '选项 B' },
  ])

  const six = Array.from({ length: 6 }, (_, i) => ({
    id: `o${i}`,
    label: `选项 ${i + 1}`,
  }))
  assert.equal(normalizeUserPromptOptions(six)?.length, 6)

  const many = Array.from({ length: USER_PROMPT_OPTIONS_MAX }, (_, i) => ({
    id: `o${i}`,
    label: `选项 ${i + 1}`,
  }))
  assert.equal(normalizeUserPromptOptions(many)?.length, USER_PROMPT_OPTIONS_MAX)

  assert.equal(normalizeUserPromptOptions([{ id: 'a', label: '仅一项' }]), null)
  assert.equal(normalizeUserPromptOptions([
    { id: 'a', label: 'A' },
    { id: 'a', label: '重复' },
  ]), null)
  assert.equal(
    normalizeUserPromptOptions([
      ...many,
      { id: 'overflow', label: '超出' },
    ]),
    null,
  )
})

test('parseAskUserArgs validates prompt and options', () => {
  assert.match(parseAskUserArgs({ prompt: '', options: [] }).error ?? '', /prompt/)
  assert.match(
    parseAskUserArgs({
      prompt: '选一个',
      options: Array.from({ length: USER_PROMPT_OPTIONS_MAX + 1 }, (_, i) => ({
        id: `o${i}`,
        label: `选项 ${i + 1}`,
      })),
    }).error ?? '',
    /最多|精简/,
  )
  const parsed = parseAskUserArgs({
    prompt: '你想分析哪类标的？',
    title: '分析范围',
    options: [
      { id: 'cn', label: 'A 股' },
      { id: 'us', label: '美股' },
    ],
  })
  assert.equal(parsed.error, undefined)
  assert.equal(parsed.payload?.title, '分析范围')
  assert.equal(parsed.payload?.options.length, 2)
})

test('UserPromptBridge resolves submitted answers', async () => {
  const bridge = new UserPromptBridge()
  const sessionId = 'sess-1'
  const promptId = 'prompt-1'

  const answerPromise = bridge.waitForAnswer(sessionId, promptId)
  const submitted = bridge.submit(sessionId, promptId, {
    kind: 'option',
    selected_ids: ['cn'],
    selected_labels: ['A 股'],
  })
  assert.equal(submitted, true)
  const answer = await answerPromise
  assert.equal(answer.selected_labels[0], 'A 股')
})

test('UserPromptBridge rejects on session cancel', async () => {
  const bridge = new UserPromptBridge()
  const sessionId = 'sess-2'
  const promptId = 'prompt-2'

  const answerPromise = bridge.waitForAnswer(sessionId, promptId)
  bridge.cancelSession(sessionId)
  await assert.rejects(answerPromise, UserPromptCancelledError)
})
