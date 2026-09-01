export type {
  ShellBackgroundStartResult,
  ShellEscalate,
  ShellInstallParams,
  ShellIsolation,
  ShellNetworkIntent,
  ShellPlatformStatus,
  ShellPythonRuntimeInfo,
  ShellRunParams,
  ShellRunResult,
  ShellSecretRef,
} from './types.js'
export {
  buildSandboxConfigFromGrants,
  buildSandboxConfigFromGrantPaths,
  win32SystemReadAllowPaths,
  pythonActiveAllowReadPaths,
} from './config-from-grants.js'
export type { BuildSandboxConfigOptions } from './config-from-grants.js'
export {
  isWindowsAclStampForbidden,
  needsWindowsAclGrant,
  filterWindowsAclGrantPaths,
  finalizeFilesystemPathsForPlatform,
  windowsAclForbiddenRoots,
} from './windows-acl-path-policy.js'
export {
  assertAllowedShellArgv,
  assertPackageInstallPolicy,
  argvToCommandString,
  basenameOfArgv0,
  buildNpmInstallArgv,
  buildPipInstallArgv,
  commandNeedsNetwork,
  commandMayNeedEgressConfirmation,
  extractExplicitHostsFromArgv,
  injectPipCertArgv,
  isNetworkDiagnosticCommand,
  isShellBinaryAllowlisted,
  parseDiagnosticTargetHost,
  shellCommandMatchesDangerousPattern,
  syncCommandStringFromManagedArgv,
} from './package-policy.js'
export {
  parseCommandToArgv,
  commandNeedsRealShell,
  resolveShellCommandInput,
  shellWrapArgv,
} from './parse-command.js'
export { resolvePosixShellPath, SPAWN_ENOENT_HINT } from './resolve-shell-bin.js'
export {
  SessionShellRuntime,
  getSessionShellRuntime,
  hashSandboxConfig,
  resetSessionShellRuntimeForTests,
} from './session-runtime.js'
export type { SessionSrtAcquireResult } from './session-runtime.js'
export {
  mergeAllowedNetworkDomains,
  networkDomainsForInstallAllowed,
  networkDomainsForDiagnosticTarget,
  networkDomainsForSessionHost,
  networkDomainsWhenDenied,
  hostPatternsFromHttpsUrls,
  formatNetworkInstallConfirmPrompt,
  getConfiguredAllowedDomains,
  getGrantableMergedAllowedDomains,
  getGrantableMergedAllowedDomainsSync,
  getMergedRawAllowedDomains,
  getGrantableConfiguredAllowedDomains,
  getGrantableConfiguredAllowedDomainsSync,
  isHostInConfiguredAllowlist,
  resetConfiguredAllowedDomainsForTests,
  PACKAGE_INSTALL_ALLOWED_DOMAINS,
  SRT_SUPPORTS_ALLOW_ALL_IN_ALLOWED_DOMAINS,
  hostMatchesDomainPatterns,
  isHostInPackageInstallAllowlist,
} from './network-policy.js'
export {
  resolveBundledCaCertPath,
  materializeBundledCaCert,
  applyBundledCaCertEnv,
  clearBundledCaCertEnv,
  bundledCaCertAllowReadPaths,
} from './bundled-cacert.js'
export {
  detectNetworkEgressBlocked,
  assertEgressHostGrantable,
  isEgressHostPreAuthorized,
  buildNeedsNetworkEgressPayload,
} from './egress-runtime.js'
export {
  NetworkInstallStickyStore,
  NETWORK_INSTALL_CONFIRM_OPTIONS,
  parseNetworkInstallChoice,
} from './sticky-network.js'
export {
  SessionNetworkEgressStore,
  NETWORK_EGRESS_CONFIRM_OPTIONS,
  normalizeEgressHost,
  hostFromNetworkInput,
  parseNetworkEgressChoice,
} from './session-network-egress.js'
export type { NetworkEgressConfirmChoice } from './session-network-egress.js'
export {
  SessionLanAccessStore,
  getSessionLanAccessStore,
  resetSessionLanAccessStoreForTests,
  isEffectiveLanAllowed,
  applySessionLanAskChoice,
  SESSION_LAN_ASK_OPTIONS,
} from './session-lan-access.js'
export {
  SessionSecretAccessStore,
  getSessionSecretAccessStore,
  resetSessionSecretAccessStoreForTests,
  applySessionSecretGrantChoice,
  SESSION_SECRET_GRANT_ASK_OPTIONS,
} from './session-secret-access.js'
export { redactSecretsInText, redactSecretsInUnknown } from './secret-redact.js'
export {
  summarizeShellArgv,
} from './sticky-shell-run.js'
export { getShellPlatformStatus } from './platform.js'
export {
  resolveShellIsolationMode,
  type OpptrixShellIsolationMode,
} from './isolation-mode.js'
export {
  isDockerEnv,
  resolveAgentSandboxMode,
  DOCKER_PERSISTENCE_NOTE,
  type AgentSandboxMode,
} from '../env/docker-env.js'
export {
  ensureLinuxSandboxReady,
  linuxSandboxProfileStillNeeded,
  resetLinuxSandboxAutoInstallAttempt,
} from './ensure-linux-sandbox.js'
export {
  buildAppArmorProfileContent,
  getLinuxSandboxInstallState,
  isLinuxUserNsRestricted,
  isOpptrixAppArmorProfileApplied,
  linuxCanAutoInstall,
  pkexecAvailable,
  readUserNsRestrictedSync,
  resolveBwrapPathsForProfile,
} from './linux-sandbox-common.js'
export {
  ensureWindowsSandboxReady,
  isWindowsSandboxProvisioned,
  resetWindowsSandboxAutoInstallAttempt,
} from './ensure-windows-sandbox.js'
export {
  isRefreshableWindowsCredError,
  collectSandboxFailureText,
  withElevatedCredRefreshRetryOnThrow,
  withElevatedCredRefreshRetryOnResult,
  WIN_ERROR_LOGON_FAILURE,
  WIN_ERROR_NO_SUCH_LOGON_SESSION,
} from './windows-elevated-retry.js'
export {
  assertUnelevatedRejectsFullNetworkIsolation,
  spawnUnelevatedRestricted,
  isUnelevatedSpawnSupported,
  probeRestrictedTokenApi,
  UNELEVATED_FULL_NETWORK_REJECT_MESSAGE,
  UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
  UNELEVATED_SPAWN_FAILED_MESSAGE,
  UNELEVATED_INTERNAL_ERROR_MESSAGE,
  allocStruct,
  getWinApis,
  tryLoadKoffi,
  resetUnelevatedProbeCacheForTests,
} from './windows-unelevated/index.js'
export { resolveBundledSandboxBinConfig, resolveVendoredSrtWinExe } from './resolve-sandbox-bins.js'
export { resolveShellArgv, looksLikePythonBin, looksLikePipBin } from './resolve-shell-argv.js'
export type { ResolveShellArgvResult } from './resolve-shell-argv.js'
export { ShellRunner, applyPythonRuntimeToChildEnv, applyUtf8ChildEnv, type ShellRunnerDeps } from './runner.js'
export type {
  NetworkInstallPreflightResult,
  NetworkEgressPreflightResult,
} from './runner.js'
export {
  startShellCommandJob,
  getShellCommandJob,
  subscribeShellCommandJob,
  cancelShellCommandJob,
  clearSessionShellCommandJobs,
  resetShellCommandJobsForTests,
  isShellBgEnabled,
  clampShellBgTimeoutMs,
  countInFlightShellBgForSession,
  shellCommandJobAsyncHint,
  SHELL_BG_DEFAULT_TIMEOUT_MS,
  SHELL_BG_MAX_IN_FLIGHT_PER_SESSION,
  type ShellCommandJobSnapshot,
  type ShellCommandJobState,
} from './shell-command-job.js'
