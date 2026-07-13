import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assignSortOrders,
  compareDefaultProviderOrder,
  computeEffectiveRanks,
  defaultManifestTierPriority,
  providerRequiresApiKey,
  sortOrderToEffectivePriority,
  sortProvidersForCatalog,
} from '@opptrix/shared'

describe('provider-priority-order', () => {
  it('puts TickFlow first, then other API-key providers, then free', () => {
    const tickflow = {
      providerId: 'tickflow',
      title: 'TickFlow',
      sortOrder: null,
      requiresApiKey: true,
      manifestDefaultPriority: 80,
    }
    const tushare = {
      providerId: 'tushare',
      title: 'Tushare',
      sortOrder: null,
      requiresApiKey: true,
      manifestDefaultPriority: 90,
    }
    const free = {
      providerId: 'zzshare',
      title: 'ZZShare',
      sortOrder: null,
      requiresApiKey: false,
      manifestDefaultPriority: 110,
    }
    const sorted = sortProvidersForCatalog([free, tushare, tickflow])
    assert.deepEqual(sorted.map(p => p.providerId), ['tickflow', 'tushare', 'zzshare'])
  })

  it('puts API-key providers before free providers by default', () => {
    const paid = {
      providerId: 'tushare',
      title: 'Tushare',
      sortOrder: null,
      requiresApiKey: true,
      manifestDefaultPriority: 90,
    }
    const free = {
      providerId: 'zzshare',
      title: 'ZZShare',
      sortOrder: null,
      requiresApiKey: false,
      manifestDefaultPriority: 110,
    }
    assert.ok(compareDefaultProviderOrder(paid, free) < 0)
    const sorted = sortProvidersForCatalog([free, paid])
    assert.equal(sorted[0]?.providerId, 'tushare')
  })

  it('respects explicit sortOrder over tier defaults', () => {
    const a = {
      providerId: 'a',
      title: 'A',
      sortOrder: 20,
      requiresApiKey: false,
      manifestDefaultPriority: 10,
    }
    const b = {
      providerId: 'b',
      title: 'B',
      sortOrder: 0,
      requiresApiKey: true,
      manifestDefaultPriority: 90,
    }
    const sorted = sortProvidersForCatalog([a, b])
    assert.deepEqual(sorted.map(p => p.providerId), ['b', 'a'])
  })

  it('maps sortOrder to descending effective priority', () => {
    assert.equal(sortOrderToEffectivePriority(0), 10_000)
    assert.equal(sortOrderToEffectivePriority(10), 9_990)
  })

  it('assigns stepped sort orders for drag save', () => {
    assert.deepEqual(assignSortOrders(['x', 'y']), [
      { providerId: 'x', sortOrder: 0 },
      { providerId: 'y', sortOrder: 10 },
    ])
  })

  it('computes effective ranks only for eligible providers', () => {
    const ranks = computeEffectiveRanks([
      { providerId: 'a', priorityEligible: true },
      { providerId: 'b', priorityEligible: false },
      { providerId: 'c', priorityEligible: true },
    ])
    assert.equal(ranks.get('a'), 1)
    assert.equal(ranks.get('b'), undefined)
    assert.equal(ranks.get('c'), 2)
  })

  it('detects required secret fields', () => {
    assert.equal(providerRequiresApiKey([
      { key: 'token', type: 'secret', label: 'Token', required: true },
    ]), true)
    assert.equal(providerRequiresApiKey([
      { key: 'token', type: 'secret', label: 'Token', required: false },
    ]), false)
  })

  it('tiers default manifest priority with TickFlow on top', () => {
    assert.ok(defaultManifestTierPriority('tickflow', true, 80)
      > defaultManifestTierPriority('tushare', true, 90))
    assert.ok(defaultManifestTierPriority('tushare', true, 90)
      > defaultManifestTierPriority('zzshare', false, 110))
  })
})
