import type { MarketGroup, ProviderManifest } from '@opptrix/shared'
import { TUSHARE_MANIFEST } from './tushare/manifest.js'
import { TICKFLOW_MANIFEST } from './tickflow/manifest.js'
import { BINANCE_MANIFEST } from './binance/manifest.js'
import { OKX_MANIFEST } from './okx/manifest.js'
import { BAOSTOCK_MANIFEST } from './baostock/manifest.js'
import { ZZSHARE_MANIFEST } from './zzshare/manifest.js'
import { TONGHUASHUN_MANIFEST } from './tonghuashun/manifest.js'
import { getManifestRegistry } from './manifest-registry.js'

export { TUSHARE_SETTINGS } from './tushare/settings.js'
export { TICKFLOW_SETTINGS } from './tickflow/settings.js'
export { BINANCE_SETTINGS } from './binance/settings.js'
export { OKX_SETTINGS } from './okx/settings.js'
export { BAOSTOCK_SETTINGS } from './baostock/settings.js'
export { ZZSHARE_SETTINGS } from './zzshare/settings.js'
export { TONGHUASHUN_SETTINGS } from './tonghuashun/settings.js'

/** Static built-in manifests — registered into ManifestRegistry by ProviderLoader.registerBuiltins() */
export const BUILTIN_PROVIDER_MANIFESTS: ProviderManifest[] = [
  TUSHARE_MANIFEST,
  TICKFLOW_MANIFEST,
  BINANCE_MANIFEST,
  OKX_MANIFEST,
  BAOSTOCK_MANIFEST,
  ZZSHARE_MANIFEST,
  TONGHUASHUN_MANIFEST,
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
