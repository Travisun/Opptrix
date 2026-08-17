/**
 * outboundFetch 流式 body + TimeoutError 文案
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {
  outboundFetch,
  formatOutboundFetchError,
  isOutboundTimeoutError,
  resetOutboundNetworkForTests,
  setOutboundNetworkStatusForTests,
} from '@opptrix/shared'

describe('outboundFetch streaming + timeout copy', () => {
  /** @type {http.Server} */
  let server
  /** @type {number} */
  let port

  before(async () => {
    resetOutboundNetworkForTests()
    setOutboundNetworkStatusForTests({ family: 4 })
    process.env.OPPTRIX_OUTBOUND_FAMILY = '4'

    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        })
        res.write('chunk-a\n')
        setTimeout(() => {
          res.write('chunk-b\n')
          res.end()
        }, 250)
        return
      }
      if (url.pathname === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, n: 42 }))
        return
      }
      res.writeHead(404)
      res.end()
    })

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve(undefined))
    })
    const addr = server.address()
    assert.ok(addr && typeof addr === 'object')
    port = addr.port
  })

  after(async () => {
    resetOutboundNetworkForTests()
    delete process.env.OPPTRIX_OUTBOUND_FAMILY
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve(undefined)))
    })
  })

  it('resolves with readable body before upstream end (incremental read)', async () => {
    const started = Date.now()
    const resp = await outboundFetch(`http://127.0.0.1:${port}/stream`)
    const headerMs = Date.now() - started
    assert.ok(resp.ok)
    assert.ok(resp.body, 'body stream present')
    // 响应头应在 delayed end（250ms）之前就返回
    assert.ok(headerMs < 150, `headers resolved too late: ${headerMs}ms`)

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    const { value, done } = await reader.read()
    assert.equal(done, false)
    const first = decoder.decode(value)
    assert.ok(first.includes('chunk-a'), `first chunk: ${first}`)
    // 读到第一块时服务端尚未 end
    assert.ok(Date.now() - started < 200, 'first body chunk arrived before delayed end')

    const rest = []
    while (true) {
      const next = await reader.read()
      if (next.done) break
      rest.push(decoder.decode(next.value))
    }
    assert.ok(rest.join('').includes('chunk-b'))
  })

  it('still supports Response.json() / .text() for buffered callers', async () => {
    const resp = await outboundFetch(`http://127.0.0.1:${port}/json`)
    const data = await resp.json()
    assert.deepEqual(data, { ok: true, n: 42 })

    const resp2 = await outboundFetch(`http://127.0.0.1:${port}/json`)
    const text = await resp2.text()
    assert.equal(text, '{"ok":true,"n":42}')
  })

  it('maps TimeoutError to Chinese without English timeout wording', () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    assert.equal(isOutboundTimeoutError(timeout), true)
    const msg = formatOutboundFetchError(timeout)
    assert.equal(msg, '请求超时，请稍后重试')
    assert.ok(!/aborted due to timeout/i.test(msg))
    assert.ok(!/TimeoutError/i.test(msg))
  })

  it('maps AbortError similarly', () => {
    const abort = new DOMException('Aborted', 'AbortError')
    assert.equal(formatOutboundFetchError(abort), '请求超时，请稍后重试')
  })
})
