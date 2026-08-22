/**
 * client-ui 公募基金命名空间 — 与 @opptrix/shared CN:PF 对齐（Vite 侧镜像逻辑）
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

async function loadClientUiInstrument() {
  const entry = path.resolve('client-ui/src/market/instrument.ts')
  return import(pathToFileURL(entry).href)
}

test('buildInstrumentNamespace — 场外基金 CN:PF', async () => {
  const {
    buildInstrumentNamespace,
    normalizeWatchlistItem,
    parseInstrumentInput,
  } = await loadClientUiInstrument()

  const ref = parseInstrumentInput('CN:PF.009049')
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(ref.exchange, 'PF')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')

  const item = normalizeWatchlistItem({
    code: 'CN:PF.009049',
    name: '某公募基金',
    instrument: ref,
  })
  assert.equal(item.code, 'CN:PF.009049')
})

test('buildInstrumentNamespace — 场内基金仍用 CN:PF', async () => {
  const { buildInstrumentNamespace, normalizeWatchlistItem } = await loadClientUiInstrument()

  const ref = {
    market: 'CN',
    assetClass: 'FUND',
    symbol: '510330',
    exchange: 'PF',
  }
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.510330')

  const item = normalizeWatchlistItem({
    code: '510330',
    name: '华夏沪深300ETF',
    instrument: ref,
  })
  assert.equal(item.code, 'CN:PF.510330')
})

test('legacy CN:OF 规范为 CN:PF', async () => {
  const { parseInstrumentInput, buildInstrumentNamespace } = await loadClientUiInstrument()
  const ref = parseInstrumentInput('CN:OF.009049')
  assert.equal(ref.assetClass, 'FUND')
  assert.equal(buildInstrumentNamespace(ref), 'CN:PF.009049')
})
