/**
 * TickFlow 公开免费档 — 无 Key 即可启用；不发送 x-api-key；分钟 K 拒绝。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadTickflowConfig,
  isTickflowEnabled,
  isTickflowFreeTier,
  TICKFLOW_FREE_BASE_URL,
  TICKFLOW_DEFAULT_BASE_URL,
} from '../packages/a-stock-layer/dist/providers/tickflow/config.js'
import { TickflowClient } from '../packages/a-stock-layer/dist/providers/tickflow/api/client.js'
import { isIntradayTickflowPeriod, resolveTickflowKlineQuery } from '../packages/a-stock-layer/dist/providers/tickflow/normalize/klines.js'
import {
  resolveTickflowEffectiveCapabilities,
  TICKFLOW_PUBLIC_FREE_CAPS,
} from '../packages/a-stock-layer/dist/providers/tickflow/api/permissions.js'
import { tickflowSecretsOk } from '../packages/user-store/dist/provider-settings.js'
import { Capability } from '../packages/a-stock-layer/dist/core/capabilities.js'

test('fromConfig without apiKey returns client on free-api base', () => {
  const client = TickflowClient.fromConfig({
    enabled: true,
    apiKey: '',
    baseUrl: TICKFLOW_FREE_BASE_URL,
    permissionMode: 'auto',
    plan: 'free',
  })
  assert.ok(client)
  assert.equal(client.mode, 'free')
  assert.equal(client.baseUrl, TICKFLOW_FREE_BASE_URL)
})

test('empty apiKey uses SDK free mode', () => {
  const client = new TickflowClient('', TICKFLOW_FREE_BASE_URL)
  assert.equal(client.mode, 'free')
  assert.equal(client.baseUrl, TICKFLOW_FREE_BASE_URL)
})

test('apiKey present uses SDK full mode', () => {
  const client = new TickflowClient('test-key', TICKFLOW_DEFAULT_BASE_URL)
  assert.equal(client.mode, 'full')
  assert.equal(client.baseUrl, TICKFLOW_DEFAULT_BASE_URL)
})

test('isTickflowEnabled depends only on enabled', () => {
  assert.equal(isTickflowEnabled({ enabled: true, apiKey: '', baseUrl: TICKFLOW_FREE_BASE_URL, permissionMode: 'auto', plan: 'free' }), true)
  assert.equal(isTickflowEnabled({ enabled: false, apiKey: 'k', baseUrl: TICKFLOW_DEFAULT_BASE_URL, permissionMode: 'auto', plan: 'paid' }), false)
})

test('isTickflowFreeTier is true when apiKey blank', () => {
  assert.equal(isTickflowFreeTier({ enabled: true, apiKey: '', baseUrl: TICKFLOW_FREE_BASE_URL, permissionMode: 'auto', plan: 'free' }), true)
  assert.equal(isTickflowFreeTier({ enabled: true, apiKey: 'abc', baseUrl: TICKFLOW_DEFAULT_BASE_URL, permissionMode: 'auto', plan: 'free' }), false)
})

test('tickflowSecretsOk always true for public free', () => {
  assert.equal(tickflowSecretsOk({}), true)
  assert.equal(tickflowSecretsOk({ apiKey: '' }), true)
})

test('free tier rejects minute kline periods', () => {
  const minute = resolveTickflowKlineQuery('1m', 100)
  assert.ok(minute)
  assert.equal(isIntradayTickflowPeriod(minute.tfPeriod), true)
  const daily = resolveTickflowKlineQuery('daily', 60)
  assert.ok(daily)
  assert.equal(isIntradayTickflowPeriod(daily.tfPeriod), false)
})

test('public free caps exclude intraday and financials', () => {
  const caps = resolveTickflowEffectiveCapabilities('auto', 'free', false)
  assert.ok(caps.includes(Capability.STOCK_KLINE))
  assert.equal(caps.includes(Capability.INTRADAY_TICK), false)
  assert.equal(caps.includes(Capability.FINANCIAL_SUMMARY), false)
  assert.ok(TICKFLOW_PUBLIC_FREE_CAPS.length >= 1)
})

test('DEFAULTS and settings prefer enabled public free', async () => {
  const { TICKFLOW_SETTINGS } = await import('../packages/a-stock-layer/dist/providers/tickflow/settings.js')
  const enabledField = TICKFLOW_SETTINGS.fields.find(f => f.key === 'enabled')
  assert.equal(enabledField?.default, true)
})

test('keyed paid path keeps default base and full mode', () => {
  const client = TickflowClient.fromConfig({
    enabled: true,
    apiKey: 'secret',
    baseUrl: TICKFLOW_DEFAULT_BASE_URL,
    permissionMode: 'auto',
    plan: 'paid',
  })
  assert.ok(client)
  assert.equal(client.baseUrl, TICKFLOW_DEFAULT_BASE_URL)
  assert.equal(client.mode, 'full')
})
