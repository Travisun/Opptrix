/**
 * TickFlow OpenAPI 静态接线审计 — 无需 API Key。
 * 对照 https://api.tickflow.org/openapi.json 的 19 path / 21 操作。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { TickflowClient } from '../packages/a-stock-layer/dist/providers/tickflow/api/client.js'
import { TickflowDriver } from '../packages/a-stock-layer/dist/providers/tickflow/driver.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientSrc = readFileSync(
  join(root, 'packages/a-stock-layer/src/providers/tickflow/api/client.ts'),
  'utf8',
)
const extensionsSrc = readFileSync(
  join(root, 'packages/a-stock-layer/src/providers/tickflow/markets/extensions.ts'),
  'utf8',
)
const handlerSrc = readFileSync(
  join(root, 'packages/a-stock-layer/src/providers/tickflow/markets/handler.ts'),
  'utf8',
)
const commonSrc = readFileSync(
  join(root, 'packages/a-stock-layer/src/providers/tickflow/markets/common.ts'),
  'utf8',
)

/** OpenAPI path → TickflowClient 方法 */
const OPENAPI_TO_CLIENT = [
  { path: 'GET /v1/exchanges', method: 'getExchanges' },
  { path: 'GET /v1/quotes', method: 'getQuotes' },
  { path: 'POST /v1/quotes', method: 'postQuotes' },
  { path: 'GET /v1/depth', method: 'getDepth' },
  { path: 'GET /v1/depth/batch', method: 'getDepthBatch' },
  { path: 'GET /v1/klines', method: 'getKlines' },
  { path: 'GET /v1/klines/batch', method: 'getKlinesBatch' },
  { path: 'GET /v1/klines/intraday', method: 'getKlinesIntraday' },
  { path: 'GET /v1/klines/intraday/batch', method: 'getKlinesIntradayBatch' },
  { path: 'GET /v1/klines/ex-factors', method: 'getKlinesExFactors' },
  { path: 'GET /v1/instruments', method: 'getInstruments' },
  { path: 'POST /v1/instruments', method: 'postInstruments' },
  { path: 'GET /v1/exchanges/{exchange}/instruments', method: 'getExchangeInstruments' },
  { path: 'GET /v1/universes', method: 'getUniverses' },
  { path: 'GET /v1/universes/{id}', method: 'getUniverse' },
  { path: 'POST /v1/universes/batch', method: 'postUniversesBatch' },
  { path: 'GET /v1/financials/income', method: 'getFinancialsIncome' },
  { path: 'GET /v1/financials/balance-sheet', method: 'getFinancialsBalanceSheet' },
  { path: 'GET /v1/financials/cash-flow', method: 'getFinancialsCashFlow' },
  { path: 'GET /v1/financials/metrics', method: 'getFinancialsMetrics' },
  { path: 'GET /v1/financials/shares', method: 'getFinancialsShares' },
]

const HANDLER_WIRING = [
  { path: 'GET /v1/quotes', needle: 'getQuotes', files: [handlerSrc, commonSrc] },
  { path: 'POST /v1/quotes', needle: 'postQuotes', files: [handlerSrc] },
  { path: 'GET /v1/klines', needle: 'getKlines', files: [commonSrc] },
  { path: 'GET /v1/depth', needle: 'getDepth', files: [commonSrc] },
  { path: 'GET /v1/instruments', needle: 'getInstruments', files: [commonSrc] },
  { path: 'POST /v1/instruments', needle: 'postInstruments', files: [commonSrc] },
  { path: 'GET /v1/exchanges/{exchange}/instruments', needle: 'getExchangeInstruments', files: [commonSrc] },
  { path: 'GET /v1/universes/{id}', needle: 'getUniverse', files: [commonSrc, extensionsSrc] },
  { path: 'GET /v1/financials/metrics', needle: 'getFinancialsMetrics', files: [commonSrc] },
]

const EXTENSION_WIRING = [
  { path: 'GET /v1/depth/batch', method: 'tfDepthBatch', needle: 'getDepthBatch' },
  { path: 'GET /v1/universes', method: 'tfListUniverses', needle: 'getUniverses' },
  { path: 'GET /v1/universes/{id}', method: 'tfGetUniverse', needle: 'getUniverse' },
  { path: 'POST /v1/universes/batch', method: 'tfUniverseBatch', needle: 'postUniversesBatch' },
  { path: 'GET /v1/klines/ex-factors', method: 'tfExFactors', needle: 'getKlinesExFactors' },
  { path: 'GET /v1/klines/batch', method: 'tfKlinesBatch', needle: 'getKlinesBatch' },
  { path: 'GET /v1/quotes (universes)', method: 'tfQuotesUniverses', needle: 'getQuotes({ universes' },
  { path: 'GET /v1/klines/intraday', method: 'tfKlinesIntraday', needle: 'getKlinesIntraday' },
  { path: 'GET /v1/klines/intraday/batch', method: 'tfIntradayBatch', needle: 'getKlinesIntradayBatch' },
]

test('TickflowClient implements all OpenAPI client methods', () => {
  const proto = TickflowClient.prototype
  for (const { path, method } of OPENAPI_TO_CLIENT) {
    assert.equal(typeof proto[method], 'function', `${path} → client.${method}`)
    assert.match(clientSrc, new RegExp(`\\b${method}\\(`), `client.ts defines ${method}`)
  }
  assert.equal(OPENAPI_TO_CLIENT.length, 21)
})

test('standard handlers wire quotes and klines endpoints', () => {
  for (const { path, needle, files } of HANDLER_WIRING) {
    const hit = files.some(src => src.includes(needle))
    assert.ok(hit, `${path} should reference ${needle} in handler/common`)
  }
  assert.match(handlerSrc, /getQuotes/, 'realtime uses GET /v1/quotes')
  assert.match(handlerSrc, /postQuotes/, 'batchRealtime uses POST /v1/quotes')
})

test('extension methods wire remaining OpenAPI paths', () => {
  for (const { path, method, needle } of EXTENSION_WIRING) {
    assert.match(extensionsSrc, new RegExp(`\\b${method}\\b`), `${path} → ${method}`)
    assert.ok(extensionsSrc.includes(needle), `${method} calls ${needle}`)
  }
})

test('TickflowDriver exposes extension methods on prototype', () => {
  const proto = TickflowDriver.prototype
  for (const { method } of EXTENSION_WIRING) {
    assert.equal(typeof proto[method], 'function', `TickflowDriver.${method}`)
  }
  assert.equal(typeof proto.fetchDepth, 'function', 'fetchDepth on common handler')
  assert.equal(typeof proto.realtime, 'function', 'realtime STOCK_REALTIME')
  assert.equal(typeof proto.kline, 'function', 'kline STOCK_KLINE')
})
