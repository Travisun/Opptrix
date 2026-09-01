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
  ensureSeedLayoutDirs,
  seedCurrentSlot,
  writeRuntimeMarker,
} from './seed.js'
export type { SeedOptions, SeedResult } from './seed.js'

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
