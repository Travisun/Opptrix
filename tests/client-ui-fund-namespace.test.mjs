/**
 * 公募基金命名空间 CN:PF — 与 @opptrix/shared 对齐（client-ui 镜像同一逻辑）
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInstrumentNamespace,
  normalizeInstrumentRef,
  parseInstrumentNamespace,
} from '../packages/shared/dist/instrument-symbol.js'

test('buildInstrumentNamespace — 场外基金 CN:PF', () => {
  const ref = parseInstrumentNamespace('CN:PF.009049')
  assert.equal(ref?.assetClass, 'FUND')
  assert.equal(ref?.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})

test('buildInstrumentNamespace — 场内基金仍用 CN:PF', () => {
  const ref = normalizeInstrumentRef({
    market: 'CN',
    assetClass: 'FUND',
    symbol: '510330',
    exchange: 'PF',
  })
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.510330')
})

test('legacy CN:OF 规范为 CN:PF', () => {
  const ref = parseInstrumentNamespace('CN:OF.009049')
  assert.equal(ref?.assetClass, 'FUND')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})
