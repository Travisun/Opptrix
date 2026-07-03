import type { AssetClass, Market, ProviderBinding } from '@opptrix/shared'
import { Capability } from './capabilities.js'

export type BindingKey = `${Market}:${AssetClass}:${Capability}`

export function bindingKey(market: Market, assetClass: AssetClass, capability: Capability): BindingKey {
  return `${market}:${assetClass}:${capability}`
}

/** Map legacy CN driver capabilities → default bindings (EQUITY unless noted) */
export function cnEquityBindings(
  capabilities: Capability[],
  defaultPriority: number,
): ProviderBinding[] {
  return capabilities.map(capability => ({
    market: 'CN',
    assetClass: 'EQUITY',
    capability,
    defaultPriority,
  }))
}

/** ETF-specific capabilities for CN market */
export const CN_ETF_CAPABILITIES: Capability[] = [
  Capability.STOCK_REALTIME,
  Capability.STOCK_KLINE,
  Capability.ETF_LIST,
  Capability.ETF_NAV,
  Capability.ETF_HOLDINGS,
  Capability.ETF_PROFILE,
]

export function cnEtfBindings(defaultPriority: number): ProviderBinding[] {
  return CN_ETF_CAPABILITIES.map(capability => ({
    market: 'CN',
    assetClass: 'ETF',
    capability,
    defaultPriority,
  }))
}

export function cnIndexBindings(capabilities: Capability[], defaultPriority: number): ProviderBinding[] {
  return capabilities
    .filter(c => [
      Capability.INDEX_REALTIME,
      Capability.INDEX_KLINE,
      Capability.INDEX_CONST,
    ].includes(c))
    .map(capability => ({
      market: 'CN',
      assetClass: 'INDEX',
      capability,
      defaultPriority,
    }))
}

export function usEquityBindings(
  capabilities: Capability[],
  defaultPriority: number,
): ProviderBinding[] {
  return capabilities.map(capability => ({
    market: 'US',
    assetClass: 'EQUITY',
    capability,
    defaultPriority,
  }))
}

export function cryptoSpotBindings(
  capabilities: Capability[],
  defaultPriority: number,
): ProviderBinding[] {
  return capabilities.map(capability => ({
    market: 'CRYPTO',
    assetClass: 'CRYPTO_SPOT',
    capability,
    defaultPriority,
  }))
}

export function regionalEquityBindings(
  market: 'JP' | 'KR' | 'HK',
  capabilities: Capability[],
  defaultPriority: number,
): ProviderBinding[] {
  return capabilities.map(capability => ({
    market,
    assetClass: 'EQUITY',
    capability,
    defaultPriority,
  }))
}
