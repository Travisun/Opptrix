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
  assert.equal(parsed.payload?.mode, 'choice')
  assert.equal(parsed.payload?.allow_custom, true)
})

test('parseAskUserArgs confirm mode when options omitted or empty', () => {
  const omitted = parseAskUserArgs({ prompt: '是否授权使用本对话局域网？' })
  assert.equal(omitted.error, undefined)
  assert.deepEqual(omitted.payload?.options, [])
  assert.equal(omitted.payload?.mode, 'confirm')
  assert.equal(omitted.payload?.allow_custom, false)
  assert.equal(omitted.payload?.reject_label, undefined)
  assert.equal(omitted.payload?.confirm_label, undefined)

  const empty = parseAskUserArgs({ prompt: '继续？', options: [] })
  assert.equal(empty.error, undefined)
  assert.deepEqual(empty.payload?.options, [])
  assert.equal(empty.payload?.mode, 'confirm')
  assert.equal(empty.payload?.allow_custom, false)

  const customLabels = parseAskUserArgs({
    prompt: '是否授权？',
    mode: 'confirm',
    reject_label: '不允许',
    confirm_label: '授权使用',
  })
  assert.equal(customLabels.error, undefined)
  assert.equal(customLabels.payload?.mode, 'confirm')
  assert.equal(customLabels.payload?.reject_label, '不允许')
  assert.equal(customLabels.payload?.confirm_label, '授权使用')
  assert.equal(customLabels.payload?.allow_custom, false)
})

test('parseAskUserArgs text mode via mode=text or empty options + allow_custom', () => {
  const byMode = parseAskUserArgs({
    prompt: '请补充关注的行业',
    mode: 'text',
  })
  assert.equal(byMode.error, undefined)
  assert.equal(byMode.payload?.mode, 'text')
  assert.deepEqual(byMode.payload?.options, [])
  assert.equal(byMode.payload?.allow_custom, true)
  assert.equal(byMode.payload?.reject_label, undefined)
  assert.equal(byMode.payload?.confirm_label, undefined)

  const byAllowCustom = parseAskUserArgs({
    prompt: '还有哪些偏好？',
    options: [],
    allow_custom: true,
  })
  assert.equal(byAllowCustom.error, undefined)
  assert.equal(byAllowCustom.payload?.mode, 'text')
  assert.equal(byAllowCustom.payload?.allow_custom, true)

  const byAlias = parseAskUserArgs({
    prompt: '请填写备注',
    interaction: 'text',
  })
  assert.equal(byAlias.error, undefined)
  assert.equal(byAlias.payload?.mode, 'text')

  // 显式 confirm 优先于 allow_custom=true
  const confirmWins = parseAskUserArgs({
    prompt: '是否继续？',
    mode: 'confirm',
    allow_custom: true,
  })
  assert.equal(confirmWins.error, undefined)
  assert.equal(confirmWins.payload?.mode, 'confirm')
  assert.equal(confirmWins.payload?.allow_custom, true)
})

test('parseAskUserArgs allow_custom false hides custom for choice mode', () => {
  const parsed = parseAskUserArgs({
    prompt: '选一个',
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    allow_custom: false,
  })
  assert.equal(parsed.error, undefined)
  assert.equal(parsed.payload?.mode, 'choice')
  assert.equal(parsed.payload?.allow_custom, false)
})

test('parseAskUserArgs rejects single option array', () => {
  assert.match(
    parseAskUserArgs({
      prompt: '选一个',
      options: [{ id: 'a', label: '仅一项' }],
    }).error ?? '',
    /至少|confirm|text/,
  )
})

test('parseAskUserArgs rejects choice mode without options', () => {
  assert.match(
    parseAskUserArgs({ prompt: '选一个', mode: 'choice' }).error ?? '',
    /choice|options/,
  )
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

test('unattended helpers strip ask_user / request_secret and never hang', async () => {
  const {
    filterToolNamesForUnattended,
    filterOpenAiToolsForUnattended,
    isUnattendedBlockedTool,
    UNATTENDED_ASK_USER_RESULT,
    UNATTENDED_SECRET_RESULT,
    appendUnattendedTurnTail,
    pickUnattendedConfirmIds,
  } = await import('../packages/agent/dist/unattended.js')

  assert.equal(isUnattendedBlockedTool('ask_user'), true)
  assert.equal(isUnattendedBlockedTool('request_secret'), true)
  assert.equal(isUnattendedBlockedTool('shell_run'), false)

  assert.deepEqual(
    filterToolNamesForUnattended(['ask_user', 'shell_run', 'request_secret', 'search_instruments']),
    ['shell_run', 'search_instruments'],
  )

  const tools = [
    { type: 'function', function: { name: 'ask_user', description: '', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'shell_run', description: '', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'request_secret', description: '', parameters: { type: 'object', properties: {} } } },
  ]
  assert.deepEqual(
    filterOpenAiToolsForUnattended(tools).map(t => t.function.name),
    ['shell_run'],
  )

  assert.equal(UNATTENDED_ASK_USER_RESULT.ok, false)
  assert.equal(UNATTENDED_ASK_USER_RESULT.unattended, true)
  assert.match(UNATTENDED_ASK_USER_RESULT.error, /无人值守/)

  assert.equal(UNATTENDED_SECRET_RESULT.cancelled, true)
  assert.equal(UNATTENDED_SECRET_RESULT.unattended, true)

  const tail = appendUnattendedTurnTail('【本轮动态说明】')
  assert.match(tail, /无人值守/)
  assert.match(tail, /ask_user/)

  assert.deepEqual(
    pickUnattendedConfirmIds([
      { id: 'cancel' },
      { id: 'allow_once' },
      { id: 'allow_session' },
    ]),
    { selected_ids: ['allow_session'] },
  )
})
