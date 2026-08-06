import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decodeTextBufferBytes } from '../client-ui/src/utils/decodeTextBuffer.ts'
import { decodeTextBuffer } from '../packages/doc-library/dist/index.js'

describe('client decodeTextBufferBytes', () => {
  it('decodes utf8', () => {
    const bytes = new TextEncoder().encode('你好世界')
    assert.equal(decodeTextBufferBytes(bytes), '你好世界')
  })

  it('strips utf8 BOM', () => {
    const body = new TextEncoder().encode('标题')
    const bytes = new Uint8Array(3 + body.length)
    bytes[0] = 0xef
    bytes[1] = 0xbb
    bytes[2] = 0xbf
    bytes.set(body, 3)
    assert.equal(decodeTextBufferBytes(bytes), '标题')
  })

  it('decodes utf16le BOM', () => {
    const buf = Buffer.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59]) // 你好
    assert.equal(decodeTextBufferBytes(buf), '你好')
  })

  it('matches doc-library GBK heuristic', () => {
    // GBK 字节：你好
    const gbkNiHao = Buffer.from([0xc4, 0xe3, 0xba, 0xc3])
    assert.equal(decodeTextBuffer(gbkNiHao), '你好')
    assert.equal(decodeTextBufferBytes(gbkNiHao), decodeTextBuffer(gbkNiHao))
  })

  it('prefers utf8 for ascii', () => {
    const ascii = new TextEncoder().encode('hello\nworld')
    assert.equal(decodeTextBufferBytes(ascii), 'hello\nworld')
  })
})
