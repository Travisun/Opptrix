import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  freeProviderThrottleCooldownMs,
  isFreeProviderThrottleTrigger,
  FREE_PROVIDER_EMPTY_BODY_REASON,
  FREE_PROVIDER_THROTTLE_FIXED_MS,
  FREE_PROVIDER_THROTTLE_MAX_MS,
} from '@opptrix/shared'

describe('free-provider-throttle', () => {
  it('uses fixed cooldown ladder for levels 1-6', () => {
    assert.equal(freeProviderThrottleCooldownMs(1), FREE_PROVIDER_THROTTLE_FIXED_MS[0])
    assert.equal(freeProviderThrottleCooldownMs(2), FREE_PROVIDER_THROTTLE_FIXED_MS[1])
    assert.equal(freeProviderThrottleCooldownMs(6), FREE_PROVIDER_THROTTLE_FIXED_MS[5])
  })

  it('escalates 7+ with +6h steps toward 24h cap then beyond', () => {
    assert.equal(freeProviderThrottleCooldownMs(7), 9 * 60 * 60_000)
    assert.equal(freeProviderThrottleCooldownMs(9), 21 * 60 * 60_000)
    assert.equal(freeProviderThrottleCooldownMs(10), FREE_PROVIDER_THROTTLE_MAX_MS)
    assert.equal(freeProviderThrottleCooldownMs(11), FREE_PROVIDER_THROTTLE_MAX_MS + 6 * 60 * 60_000)
  })

  it('detects HTTP and denied throttle signals', () => {
    assert.equal(isFreeProviderThrottleTrigger('HTTP 429').trigger, true)
    assert.equal(isFreeProviderThrottleTrigger('HTTP 403 forbidden').trigger, true)
    assert.equal(isFreeProviderThrottleTrigger('HTTP 502').trigger, true)
    assert.equal(isFreeProviderThrottleTrigger({ status: 400 }, {}).trigger, true)
    assert.equal(isFreeProviderThrottleTrigger('访问被拒绝').trigger, true)
    assert.equal(isFreeProviderThrottleTrigger(null, { emptyBody: true }).trigger, true)
    assert.equal(isFreeProviderThrottleTrigger(new Error(FREE_PROVIDER_EMPTY_BODY_REASON)).trigger, true)
    assert.equal(
      isFreeProviderThrottleTrigger(new Error(`请求失败 (200)：${FREE_PROVIDER_EMPTY_BODY_REASON}`)).trigger,
      true,
    )
    assert.equal(isFreeProviderThrottleTrigger('empty_data').trigger, false)
    assert.equal(isFreeProviderThrottleTrigger('provider timeout 15000ms').trigger, false)
  })
})
