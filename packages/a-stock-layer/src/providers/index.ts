/** Provider modules — §6.4 structure */
export * from './register.js'
export {
  PROVIDER_MANIFESTS,
  listProviderManifests,
  getProviderManifest,
  MARKET_GROUP_LABELS,
  MARKET_GROUP_ORDER,
} from './manifests.js'
export { ProviderCatalogService, createProviderCatalog } from './catalog.js'
export { getProviderConfigStore, ProviderConfigStore } from './config-store.js'
export { ProviderDirWatcher } from './provider-dir-watcher.js'
export {
  ProviderLoader,
  createProviderLoader,
  getProviderLoader,
  resetProviderLoader,
} from './loader.js'
export { ManifestRegistry, getManifestRegistry, resetManifestRegistry } from './manifest-registry.js'
export {
  PACKAGE_MAGIC as OPPX_PACKAGE_MAGIC,
  PACKAGE_FILE_EXTENSION as OPPX_FILE_EXTENSION,
  packOppx,
  unpackOppx,
  inspectOppxPackage,
  validateOppxSignature,
  validatePluginDirectory,
  suggestOppxFilename,
} from './oppx.js'
export type { OppxPackageMetadata, ProviderPluginManifest, OppxPackageInspectResult } from './oppx.js'
export {
  installFromOppx,
  installFromDirectory,
  uninstall as uninstallProviderPlugin,
  readInstalledIndex,
  writeInstalledIndex,
  listInstalledProviders,
  providersRootDir,
  installedIndexPath,
  installedProviderDir,
} from './installer.js'
export type { InstalledProviderEntry, InstalledProvidersIndex } from './installer.js'

export * from './tushare/index.js'
export * from './tickflow/index.js'
export * from './binance/index.js'
export * from './okx/index.js'
export * from './baostock/index.js'
export * from './zzshare/index.js'
export * from './tdx/index.js'
