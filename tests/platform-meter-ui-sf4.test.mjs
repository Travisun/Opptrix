import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const copyPath = path.join(
  here,
  '../client-ui/src/pages/settings/platformMeterCopy.ts',
)

/** Smoke: product copy mapping stays in sync (no TSX/React load). */
describe('platformMeterCopy (SF4)', () => {
  it('maps denial codes to product-facing Chinese labels', () => {
    const src = readFileSync(copyPath, 'utf8')
    assert.match(src, /pack_disabled[\s\S]*相关能力包未启用/)
    assert.match(src, /quota_exceeded[\s\S]*调用次数已达上限/)
    assert.match(src, /请求未通过能力检查/)
  })
})
