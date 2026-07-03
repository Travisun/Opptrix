import type { MarketGroup, ProviderManifest } from '@opptrix/shared'
import { TUSHARE_MANIFEST } from './tushare/manifest.js'
import { POLYGON_MANIFEST } from './polygon/manifest.js'
import { TIINGO_MANIFEST } from './tiingo/manifest.js'
import { FMP_MANIFEST } from './fmp/manifest.js'
import { TICKFLOW_MANIFEST } from './tickflow/manifest.js'
import { getManifestRegistry } from './manifest-registry.js'

export { TUSHARE_SETTINGS } from './tushare/settings.js'
export { POLYGON_SETTINGS } from './polygon/settings.js'
export { TIINGO_SETTINGS } from './tiingo/settings.js'
export { FMP_SETTINGS } from './fmp/settings.js'
export { TICKFLOW_SETTINGS } from './tickflow/settings.js'

/** Static built-in manifests — registered into ManifestRegistry by ProviderLoader.registerBuiltins() */
export const BUILTIN_PROVIDER_MANIFESTS: ProviderManifest[] = [
  TUSHARE_MANIFEST,
  POLYGON_MANIFEST,
  TIINGO_MANIFEST,
  FMP_MANIFEST,
  TICKFLOW_MANIFEST,
]

/** Live manifest list (built-in + installed). Prefer listProviderManifests(). */
export const PROVIDER_MANIFESTS: ProviderManifest[] = new Proxy([] as ProviderManifest[], {
  get(_target, prop, receiver) {
    const list = getManifestRegistry().list()
    const value = Reflect.get(list, prop, list)
    if (typeof value === 'function') return value.bind(list)
    return value
  },
  ownKeys() {
    return Reflect.ownKeys(getManifestRegistry().list())
  },
  getOwnPropertyDescriptor(_target, prop) {
    const list = getManifestRegistry().list()
    return Object.getOwnPropertyDescriptor(list, prop) ?? {
      enumerable: true,
      configurable: true,
    }
  },
})

export function getProviderManifest(providerId: string): ProviderManifest | undefined {
  return getManifestRegistry().get(providerId)
}

export function listProviderManifests(): ProviderManifest[] {
  return getManifestRegistry().list()
}

export const MARKET_GROUP_LABELS: Record<MarketGroup, string> = {
  CN: 'A 股',
  US: '美股',
  HK: '港股',
  JP: '日本股市',
  KR: '韩国股市',
  CRYPTO: '加密货币',
  GLOBAL: '全球 / 宏观',
}

export const MARKET_GROUP_ORDER: MarketGroup[] = ['CN', 'US', 'HK', 'JP', 'KR', 'CRYPTO', 'GLOBAL']
