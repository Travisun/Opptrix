import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BaseEvent,
  EventDispatcher,
  SystemEvents,
  extensionEventName,
  topicMatches,
  hookNameToBusName,
  emitAfterHook,
} from '../packages/event-bus/dist/index.js'

test('event dispatcher priority and stop propagation', () => {
  const bus = new EventDispatcher()
  const order = []

  bus.on('demo', () => { order.push(1) }, 10)
  bus.on('demo', (e) => {
    order.push(2)
    e.stopPropagation()
  }, 20)
  bus.on('demo', () => { order.push(3) }, 5)

  const event = new BaseEvent()
  bus.dispatch('demo', event)
  assert.deepEqual(order, [2])
  assert.equal(event.propagationStopped, true)
})

test('topic subscribe wildcard', () => {
  const bus = new EventDispatcher()
  const names = []
  bus.subscribeTopic('job.*', env => { names.push(env.name) })
  bus.emit(SystemEvents.job.upsert, { id: '1' })
  bus.emit(SystemEvents.chat.turnStart, {})
  assert.deepEqual(names, [SystemEvents.job.upsert])
})

test('extension custom event naming', () => {
  assert.equal(
    extensionEventName('com.foo', 'done'),
    'ext.com.foo.done',
  )
  assert.equal(topicMatches('ext.com.foo.*', 'ext.com.foo.done'), true)
})

test('hook to bus bridge map', () => {
  assert.equal(hookNameToBusName('agent/turnStart'), SystemEvents.chat.turnStart)
  const bus = new EventDispatcher()
  const seen = []
  bus.subscribe(env => { seen.push(env.name) })
  emitAfterHook({ dispatcher: bus }, 'agent/turnStart', { sessionId: 's1' })
  assert.deepEqual(seen, [SystemEvents.chat.turnStart])
})
