export {
  resolveAgentWorkspaceRoot,
  resolveAgentPrivilegesRoot,
  resolveSessionWorkspaceRoot,
  resolveSharedWorkspaceRoot,
  assertSafeSessionId,
  migrateLegacyWorkspaceFiles,
  deleteSessionWorkspaceDirectory,
  DEFAULT_ROOT_ID,
  SHARED_ROOT_ID,
  SESSIONS_SUBDIR,
  SHARED_SUBDIR,
  LEGACY_SUBDIR,
} from './paths.js'
export {
  ensureSharedWorkspaceLayout,
  sharedDumpsDir,
  resetSharedWorkspaceLayoutCacheForTests,
} from './shared-workspace.js'
export {
  OFFLINE_K_META_RELATIVE_PATH,
  FULL_DUMP_RELATIVE_PATH,
  INCR_DUMP_RELATIVE_PATH,
  offlineKMetaPath,
  shouldAutoWriteOfflineKMeta,
  readOfflineKMeta,
  writeOfflineKMeta,
  recordOfflineKDumpSuccess,
  tryRecordOfflineKDumpSuccess,
  type OfflineKDumpKind,
  type OfflineKMeta,
} from './offline-k-meta.js'
export {
  WorkspaceError,
  PathEscapeError,
  DenyPathError,
  QuotaExceededError,
  SsrfBlockedError,
  ConfirmationRequiredError,
  NetworkInstallConfirmationRequiredError,
  NetworkEgressConfirmationRequiredError,
  ShellRunConfirmationRequiredError,
} from './errors.js'
export { buildGlobalDenyPaths, isPathDenied, isWorkspaceRootPath } from './deny.js'
export { resolveSafePath, ensureDirectory } from './path-gate.js'
export { assertAllowedUrl, assertAllowedHost } from './ssrf.js'
export {
  GrantStore,
  assertReadable,
  assertWritable,
  type GrantMode,
  type WorkspaceGrant,
} from './grants.js'
export {
  StickyPolicyStore,
  CONFIRM_OPTIONS,
  parseConfirmChoice,
  type StickyOperation,
  type ConfirmChoice,
} from './ask-policy.js'
export {
  QuotaTracker,
  DEFAULT_WORKSPACE_QUOTA_BYTES,
  getFreeDiskBytes,
} from './quota.js'
export { httpFetch, type HttpFetchParams, type HttpFetchResult } from './http-fetch.js'
export { streamDownloadToFile, type DownloadParams } from './download.js'
export {
  getSandboxSettings,
  saveSandboxSettings,
  resetSandboxSettingsStoreForTests,
} from './sandbox-settings-store.js'
export {
  getPythonSettings,
  savePythonSettings,
  resetPythonSettingsStoreForTests,
} from './python-settings-store.js'
export {
  resolveNodeRuntime,
  resolveNpmCliJs,
  nodeRuntimeAllowReadPaths,
  usesElectronAsNodeArgv,
  NODE_BINARIES,
  NPM_BINARIES,
  type NodeActiveSource,
  type NpmActiveSource,
  type NodeRuntimeStatus,
} from './node/resolve-node.js'
export { resolveShellArgv } from './shell/resolve-shell-argv.js'
export {
  resolvePythonRuntime,
  type PythonActiveSource,
  type PythonRuntimeStatus,
  PYTHON_BINARIES,
  PIP_BINARIES,
} from './python/resolve-python.js'
export { getPythonPlatformStatus } from './python/python-platform-status.js'
export {
  probePipIndexUrls,
  resolvePreferredPipIndexUrl,
  getPreferredPipIndexUrlSync,
  getSortedPipIndexUrlsSync,
  invalidatePipMirrorCache,
  rotatePreferredPipMirror,
  isPipMirrorNetworkFailure,
  PIP_MIRROR_CACHE_TTL_MS,
  resetPipMirrorCacheForTests,
  readPipMirrorCacheFileForTests,
} from './python/pip-mirrors.js'
export {
  getPythonInstallJobStatus,
  startPythonInstallJob,
  resetPythonInstallJobForTests,
  setPythonInstallPipelineDepsForTests,
  type PythonInstallJobSnapshot,
  type PythonInstallJobState,
  type PythonInstallPhase,
  type PythonInstallPipelineDeps,
} from './python/install-job.js'
export {
  WorkspaceService,
  getWorkspaceService,
  resetWorkspaceService,
  type ConfirmHandler,
  type WorkspaceServiceOptions,
} from './service.js'
export {
  ShellRunner,
  SessionNetworkEgressStore,
  SessionLanAccessStore,
  getSessionLanAccessStore,
  resetSessionLanAccessStoreForTests,
  isEffectiveLanAllowed,
  applySessionLanAskChoice,
  SESSION_LAN_ASK_OPTIONS,
  SessionSecretAccessStore,
  getSessionSecretAccessStore,
  resetSessionSecretAccessStoreForTests,
  applySessionSecretGrantChoice,
  SESSION_SECRET_GRANT_ASK_OPTIONS,
  redactSecretsInText,
  redactSecretsInUnknown,
  NetworkInstallStickyStore,
  NETWORK_EGRESS_CONFIRM_OPTIONS,
  parseNetworkEgressChoice,
  NETWORK_INSTALL_CONFIRM_OPTIONS,
  parseNetworkInstallChoice,
  ShellRunStickyStore,
  SHELL_RUN_CONFIRM_OPTIONS,
  parseShellRunConfirmChoice,
  summarizeShellArgv,
  buildSandboxConfigFromGrants,
  buildSandboxConfigFromGrantPaths,
  assertAllowedShellArgv,
  assertPackageInstallPolicy,
  commandNeedsNetwork,
  commandMayNeedEgressConfirmation,
  isNetworkDiagnosticCommand,
  parseDiagnosticTargetHost,
  mergeAllowedNetworkDomains,
  networkDomainsForDiagnosticTarget,
  networkDomainsForSessionHost,
  getGrantableMergedAllowedDomains,
  getGrantableMergedAllowedDomainsSync,
  getMergedRawAllowedDomains,
  getConfiguredAllowedDomains,
  getGrantableConfiguredAllowedDomains,
  getGrantableConfiguredAllowedDomainsSync,
  isHostInConfiguredAllowlist,
  isEgressHostPreAuthorized,
  resetConfiguredAllowedDomainsForTests,
  getShellPlatformStatus,
  PACKAGE_INSTALL_ALLOWED_DOMAINS,
  SRT_SUPPORTS_ALLOW_ALL_IN_ALLOWED_DOMAINS,
  detectNetworkEgressBlocked,
  buildNeedsNetworkEgressPayload,
  type ShellRunParams,
  type ShellRunResult,
  type ShellInstallParams,
  type ShellPlatformStatus,
  type ShellSecretRef,
} from './shell/index.js'
