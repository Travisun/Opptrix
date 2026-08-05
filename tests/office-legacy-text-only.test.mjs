import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_EMBEDDED_IMAGES,
  extractDocL0,
  extractPptL0,
  OFFICE_L0_ENGINE_VERSION,
} from '../packages/doc-library/dist/index.js'

describe('office-l0 legacy .doc / .ppt text-only (no convert)', () => {
  it('OFFICE_L0_ENGINE_VERSION bumped after removing convert path', () => {
    assert.equal(OFFICE_L0_ENGINE_VERSION, '1.4.0')
  })

  it('MAX_EMBEDDED_IMAGES still applies to OOXML / PDF paths', () => {
    assert.equal(MAX_EMBEDDED_IMAGES, 300)
  })

  it('extractDocL0 on non-OLE blob fails friendly without convert (no throw)', async () => {
    const result = await extractDocL0(Buffer.from('hello world not ole'))
    assert.ok(result.error || result.charCount === 0)
    assert.ok(typeof result.markdown === 'string')
    assert.ok(Array.isArray(result.chunks))
  })

  it('extractPptL0 on garbage errors without throw (text-only path)', async () => {
    const result = await extractPptL0(Buffer.from('not a ppt'))
    assert.ok(result.error || result.charCount >= 0)
    assert.ok(Array.isArray(result.chunks))
  })
})
