/**
 * Unit tests for host port probe / free-port scan (node:net).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import {
  findFreeHostPort,
  isHostPortFree,
  isHostPortListening,
} from '../packages/selfhost/src/ports.mjs'

/**
 * @param {number} port
 * @returns {Promise<import('node:net').Server>}
 */
function occupyPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => resolve(server))
  })
}

/**
 * @param {import('node:net').Server} server
 */
function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}

test('isHostPortFree / findFreeHostPort skip occupied port', async () => {
  // Pick a high ephemeral-ish port unlikely to conflict with services
  const base = 18712
  let occupied = base
  let holder = null
  for (let i = 0; i < 40; i += 1) {
    try {
      holder = await occupyPort(base + i)
      occupied = base + i
      break
    } catch {
      holder = null
    }
  }
  assert.ok(holder, 'could not bind a test port')

  try {
    assert.equal(await isHostPortFree(occupied), false)
    assert.equal(await isHostPortListening(occupied), true)

    const free = await findFreeHostPort({
      start: occupied,
      end: occupied + 30,
      hardEnd: occupied + 50,
    })
    assert.notEqual(free, occupied)
    assert.equal(await isHostPortFree(free), true)
    assert.ok(free > occupied)
  } finally {
    await closeServer(holder)
  }

  assert.equal(await isHostPortFree(occupied), true)
})

test('isHostPortFree rejects invalid ports', async () => {
  assert.equal(await isHostPortFree(0), false)
  assert.equal(await isHostPortFree(-1), false)
  assert.equal(await isHostPortFree(70000), false)
})
