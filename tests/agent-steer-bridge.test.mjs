import test from 'node:test'
import assert from 'node:assert/strict'
import { SteerBridge, formatSteerUserMessage } from '../packages/agent/dist/loop/steer-bridge.js'

test('formatSteerUserMessage prefixes once', () => {
  assert.equal(formatSteerUserMessage('关注估值'), '（补充）关注估值')
  assert.equal(formatSteerUserMessage('（补充）已有'), '（补充）已有')
})

test('enqueue / consume / clear', () => {
  const bridge = new SteerBridge()
  bridge.enqueue('s1', ' 第一 ')
  bridge.enqueue('s1', '第二')
  assert.equal(bridge.hasPending('s1'), true)
  assert.deepEqual(bridge.peek('s1'), ['第一', '第二'])
  assert.deepEqual(bridge.consume('s1'), ['第一', '第二'])
  assert.equal(bridge.hasPending('s1'), false)
  assert.deepEqual(bridge.consume('s1'), [])

  bridge.enqueue('s2', 'x')
  bridge.clear('s2')
  assert.equal(bridge.hasPending('s2'), false)
})

test('empty enqueue ignored', () => {
  const bridge = new SteerBridge()
  bridge.enqueue('s', '   ')
  assert.equal(bridge.hasPending('s'), false)
})
