/**
 * `@opptrix/system-update` — unified hot-update core for Docker and bare Node.
 *
 * Layout under `$OPPTRIX_SYSTEM_DIR` (see `resolveSystemDir`):
 * ```
 * boot -> slots/<currentVer>
 * backup -> slots/<prevVer>
 * update/
 * slots/<ver>/
 * state.json
 * ```
 */

export {
  OPPTRIX_EXIT_RESTART_APPLY,
  OPPTRIX_EXIT_RESTART_POST_HOOK,
  OPPTRIX_EXIT_RESTART_ROLLBACK,
  RUNTIME_MARKER_FILENAME,
  SERVER_ENTRY_SEGMENTS,
} from './constants.js'
export type { FirstBootUpgradePhase, SystemUiPhase } from './constants.js'

export {
  assertSafeVersion,
  dbSnapshotDir,
  isDockerEnv,
  resolveSeedRoot,
  resolveSystemDir,
  resolveSystemPaths,
  slotPath,
} from './paths.js'
export type { SystemPaths } from './paths.js'

export {
  emptyState,
  normalizeState,
  patchState,
  readState,
  writeState,
} from './state.js'
export type {
  DownloadJobStub,
  FirstBootUpgradeState,
  SystemUpdateState,
} from './state.js'

export {
  clearDirectoryPointer,
  ensureLayout,
  pointBackupToVersion,
  pointBootToVersion,
  readBackupVersion,
  readBootVersion,
  readDirectoryPointer,
  setDirectoryPointer,
  versionFromSlotDir,
} from './layout.js'

export { verifySlotDirectory, verifySlotVersion } from './verify.js'
export type { VerifySlotResult } from './verify.js'

export {
  ensureRuntimeMarkerForSeed,
  ensureSeedLayoutDirs,
  flushPendingUpdateState,
  seedCurrentSlot,
  stageSeedVersionAsPending,
  writeRuntimeMarker,
} from './seed.js'
export type {
  SeedOptions,
  SeedResult,
  StageSeedPendingOptions,
  StageSeedPendingResult,
} from './seed.js'

export {
  DEFAULT_RUNTIME_NODE_RANGE,
  readRuntimeMarker,
} from './runtime-marker.js'
export type {
  RuntimeMarker,
  RuntimeRequires,
  WriteRuntimeMarkerMeta,
} from './runtime-marker.js'

export {
  evaluateRuntimeRequires,
  nodeVersionSatisfies,
  parseBaseImageVersion,
  resolveHostBaseVersion,
} from './platform-check.js'
export type {
  RuntimeCheckEnv,
  RuntimeRequiresResult,
} from './platform-check.js'

export {
  listPostActivateHooks,
  runPostActivateHooks,
} from './hooks.js'
export type {
  HookProgressEvent,
  RunPostActivateHooksOptions,
  RunPostActivateHooksResult,
} from './hooks.js'

export {
  activatePending,
  markFirstBootUpgradeProgress,
  setPendingVersion,
} from './activate.js'
export type { ActivateOptions, ActivateResult } from './activate.js'

export { rollbackToBackup } from './rollback.js'
export type {
  RollbackOptions,
  RollbackResult,
  SchemaCompatCheck,
  SchemaCompatCheckArgs,
} from './rollback.js'

export {
  extractUpdateArchive,
  isZstdAvailable,
  sha256File,
  verifyArchiveSha256,
} from './extract.js'
export type { ExtractOptions, ExtractResult } from './extract.js'

export {
  parseRuntimeManifest,
  runtimeArchiveFilename,
  runtimeManifestFilename,
  runtimeSha256Filename,
} from './manifest.js'
export type { RuntimeReleaseManifest } from './manifest.js'

export { compareSemver, parseSemver } from './semver.js'

export {
  buildRuntimeDownloadCandidates,
  downloadRuntimeAssetPair,
  downloadToFile,
  resolveUpdateMirrorProfile,
} from './runtime-download.js'
export type {
  DownloadRuntimePairResult,
  RuntimeDownloadRefs,
  RuntimeDownloadSource,
  RuntimePackageMirrors,
  UpdateMirrorProfile,
} from './runtime-download.js'
export { probeDockerHubAuth } from './download-mirror-profile.js'

export {
  blockVersion,
  clearBlockedUpTo,
  isVersionBlocked,
  shouldOfferLatestVersion,
} from './blocked-versions.js'

export {
  MAIN_DB_BASENAME,
  collectSqliteDataFiles,
  deleteDbSnapshotDir,
  readDbSnapshotManifest,
  restoreMainDatabase,
  snapshotMainDatabase,
} from './db-snapshot.js'
export type { DbSnapshotManifest } from './db-snapshot.js'

export {
  materializeExternalSymlinks,
} from './materialize-tree.js'
export type { MaterializeExternalSymlinksResult } from './materialize-tree.js'

export {
  ABI_PINNED_NAME_PREFIXES,
  ABI_PINNED_PACKAGE_NAMES,
  DEFAULT_VENDOR_NODE_MODULES,
  HOT_PACK_FORBIDDEN_PACKAGE_NAMES,
  abiPinnedTarExcludeArgs,
  assertNoAbiPinnedInTree,
  ensureVendorModuleLinks,
  findAbiPinnedInTree,
  findHotPackForbiddenInTree,
  fuseVendorAbiIntoSlot,
  isAbiPinnedPackageName,
  isHotPackExcludedPackageName,
  isHotPackForbiddenPackageName,
  isLinkToVendor,
  listInstalledPackageNames,
  packageInstallPath,
  resolveVendorNodeModules,
  scrubHotPackForbiddenFromTree,
  scrubNestedAbiPinnedCopies,
} from './vendor-fuse.js'
export type { VendorFuseOptions, VendorFuseResult } from './vendor-fuse.js'
