/**
 * Offline vs remote translation selection (server) + isOfflineTranslationEnabled gate.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isOfflineTranslationEnabled,
} from '../packages/local-inference/dist/index.js'
import {
  resolveTranslationPlan,
  toUserFacingTranslationError,
} from '../apps/server/dist/translation-local.js'

describe('isOfflineTranslationEnabled', () => {
  it('true only for service_mode offline', () => {
    assert.equal(isOfflineTranslationEnabled({ service_mode: 'offline' }), true)
    assert.equal(isOfflineTranslationEnabled({ service_mode: 'remote' }), false)
    assert.equal(isOfflineTranslationEnabled({}), false)
  })
})

describe('resolveTranslationPlan', () => {
  it('tries offline when not remote and model path present', () => {
    const plan = resolveTranslationPlan({
      service_mode: 'offline',
      offline_model: '__auto__',
      remote_provider_id: null,
      remote_model: null,
    })
    // modelPath depends on machine; tryOffline mirrors Electron: offline + Boolean(modelPath)
    assert.equal(plan.tryOffline, Boolean(plan.modelPath))
    assert.equal(plan.remoteConfigured, false)
  })

  it('never tries offline in remote mode even if a model might exist', () => {
    const plan = resolveTranslationPlan({
      service_mode: 'remote',
      offline_model: '__auto__',
      remote_provider_id: 'p1',
      remote_model: 'm1',
    })
    assert.equal(plan.tryOffline, false)
    assert.equal(plan.remoteConfigured, true)
  })

  it('marks remoteConfigured when provider+model set', () => {
    const plan = resolveTranslationPlan({
      service_mode: 'offline',
      offline_model: '__auto__',
      remote_provider_id: 'openai',
      remote_model: 'gpt-4o-mini',
    })
    assert.equal(plan.remoteConfigured, true)
  })
})

describe('toUserFacingTranslationError', () => {
  it('maps ggml load failures and redacts absolute paths', () => {
    assert.match(
      toUserFacingTranslationError(new Error('failed to load model at /Users/mac/.opptrix/llms/x.gguf')),
      /无法加载|HY-MT/,
    )
    const redacted = toUserFacingTranslationError(
      new Error('boom at /Users/mac/.opptrix/llms/HY-MT.gguf'),
    )
    assert.ok(!redacted.includes('/Users/mac'))
  })
})
