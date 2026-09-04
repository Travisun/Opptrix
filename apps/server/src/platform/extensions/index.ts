export { createExtensionManager, type CreateExtensionManagerOptions } from './create-extension-manager.js'
export { admitPlatformExtensions } from './admit-platform-extensions.js'
export { admitPlatformHostWorker } from './admit-platform-host-worker.js'
export {
  admitRegisterExtension,
  type AdmitRegisterExtensionRaw,
} from './admit-register-extension.js'
export { admitRegisterOpx } from './admit-register-opx.js'
export {
  parseOpxManifestFromZip,
  normalizeSafeEntryPath,
  OPX_ZIP_MAX_BYTES,
  OPX_MANIFEST_MAX_BYTES,
  OPX_ENTRY_SOURCE_MAX_BYTES,
  type ParseOpxManifestResult,
} from './parse-opx-manifest-from-zip.js'
export { admitActivateExtension } from './admit-activate-extension.js'
export { admitDeactivateExtension } from './admit-deactivate-extension.js'
export {
  createExtensionHostSupervisor,
  attachHostWorkerLoop,
  createInProcessHostWorkerHandle,
  runExtensionSourceInVm,
  type CreateExtensionHostSupervisorOptions,
  type ExtensionHostSupervisor,
  type ExtensionHostWorkerHandle,
  type HostWorkerStatus,
  type HostWorkerParentMessage,
  type HostWorkerChildMessage,
} from './host-worker-rpc.js'
export {
  CAPABILITY_TOKEN_RULES,
  ALL_EXTENSION_PERMISSIONS,
  resolveCapabilityRule,
  permissionSatisfies,
  mapLegacyCapabilities,
  type CapabilityTokenRule,
} from './capability-token-registry.js'
export type {
  ExtensionActivationMode,
  ExtensionPermission,
  ExtensionContributes,
  ExtensionGatewayAction,
  ExtensionHostApi,
  ExtensionHostFacade,
  ExtensionManager,
  ExtensionManifest,
  ExtensionRecord,
  ExtensionRunResult,
} from './types.js'
