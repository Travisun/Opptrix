export {
  Capability,
  CACHE_TYPE,
  cnEquityBindings,
  cnEtfBindings,
  cnIndexBindings,
  usEquityBindings,
  cryptoSpotBindings,
  regionalEquityBindings,
  bindingKey,
  CN_ETF_CAPABILITIES,
} from '@opptrix/market-data-core'
export type { BindingKey, RegistryProvider } from '@opptrix/market-data-core'

export type {
  ProviderManifest,
  ProviderSettingsDefinition,
  ProviderBinding,
  Market,
  AssetClass,
  MarketGroup,
} from '@opptrix/shared'

export type {
  OpptrixProviderModule,
  ProviderRuntimeContext,
  ProviderJsonManifest,
  ProviderJsonEngine,
  ProviderJsonPublisher,
  ProviderJsonTrust,
  ProviderValidationResult,
} from './types.js'

export {
  defineProvider,
  validateProviderManifest,
  SDK_VERSION,
  VALID_PROVIDER_JSON_SCHEMA_VERSION,
} from './define-provider.js'
export type { DefineProviderInput } from './define-provider.js'
