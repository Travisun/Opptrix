/**
 * OpenCode 对标：末轮禁工具 + 大输出落盘 + coding 补种 workspace（不藏行情）
 */
import test from 'node:test'
import assert from 'node:assert/strict'

test('isLastSafetyRound: last 0-based round of max', async () => {
  const { isLastSafetyRound, LAST_STEP_TURN_TAIL } = await import(
    '../packages/agent/dist/loop/budget.js'
  )
  assert.equal(isLastSafetyRound(49, 50), true)
  assert.equal(isLastSafetyRound(48, 50), false)
  assert.equal(isLastSafetyRound(0, 1), true)
  assert.equal(isLastSafetyRound(0, 2), false)
  assert.ok(LAST_STEP_TURN_TAIL.includes('最后一步'))
})

test('coding intent seeds workspace; marketish packs not stripped', async () => {
  const {
    resolveToolRoutePlan,
    isCodingIntent,
    forceCodingSeedPacks,
  } = await import('../packages/agent/dist/mcp/tool-route-plan.js')

  const plan = resolveToolRoutePlan({
    message: '写一个 python 脚本把 CSV 清洗一下',
  })
  assert.equal(plan.intent, 'workspace_coding')
  assert.equal(isCodingIntent(plan.intent), true)
  assert.ok(plan.seedPacks.includes('workspace'))
  // 不强制 hide 行情工具；纪律上勿用行情代替读写，但不进 avoidTools
  assert.ok(!plan.avoidTools.includes('get_instrument_quotes'))
  assert.ok(!plan.avoidTools.includes('evaluate_instrument'))
  assert.ok(!plan.avoidTools.includes('get_instrument_snapshot'))
  assert.ok(!plan.preferredTools.includes('get_instrument_snapshot'))
  assert.ok(plan.avoidTools.includes('ensure_python'))

  const kept = forceCodingSeedPacks(
    ['workspace', 'market', 'fundamentals', 'news'],
  )
  assert.deepEqual(kept, ['workspace', 'market', 'fundamentals', 'news'])

  const ensured = forceCodingSeedPacks(['market', 'instrument_analytics'])
  assert.deepEqual(ensured, ['workspace', 'market', 'instrument_analytics'])
})

test('coding + stock code may still seed analytics', async () => {
  const { resolveToolRoutePlan } = await import(
    '../packages/agent/dist/mcp/tool-route-plan.js'
  )
  const plan = resolveToolRoutePlan({
    message: '帮我写个脚本处理 600519 的本地 CSV',
  })
  assert.equal(plan.intent, 'workspace_coding')
  assert.ok(plan.seedPacks.includes('workspace'))
  // 股票代码线索仍可播种 analytics；不强制 hide marketish
  assert.ok(plan.seedPacks.includes('instrument_analytics'))

  const research = resolveToolRoutePlan({
    message: '写个脚本拉茅台行情并做估值分析',
  })
  if (research.intent === 'workspace_coding') {
    assert.ok(research.seedPacks.includes('workspace'))
  }
})
