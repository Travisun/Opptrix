export type {
  ShellInstallParams,
  ShellNetworkIntent,
  ShellPlatformStatus,
  ShellRunParams,
  ShellRunResult,
  ShellSecretRef,
} from './types.js'
export { buildSandboxConfigFromGrants, buildSandboxConfigFromGrantPaths } from './config-from-grants.js'
export type { BuildSandboxConfigOptions } from './config-from-grants.js'
export {
  assertAllowedShellArgv,
  assertPackageInstallPolicy,
  argvToCommandString,
  basenameOfArgv0,
  buildNpmInstallArgv,
  buildPipInstallArgv,
  commandNeedsNetwork,
  commandMayNeedEgressConfirmation,
  isNetworkDiagnosticCommand,
  parseDiagnosticTargetHost,
} from './package-policy.js'
export {
  mergeAllowedNetworkDomains,
  networkDomainsForInstallAllowed,
  networkDomainsForDiagnosticTarget,
  networkDomainsForSessionHost,
  networkDomainsWhenDenied,
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
} from './network-policy.js'
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
  ShellRunStickyStore,
  SHELL_RUN_CONFIRM_OPTIONS,
  parseShellRunConfirmChoice,
  summarizeShellArgv,
} from './sticky-shell-run.js'
export { getShellPlatformStatus } from './platform.js'
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
export { ensureWindowsSandboxReady, resetWindowsSandboxAutoInstallAttempt } from './ensure-windows-sandbox.js'
export { resolveBundledSandboxBinConfig, resolveVendoredSrtWinExe } from './resolve-sandbox-bins.js'
export { ShellRunner, type ShellRunnerDeps } from './runner.js'
