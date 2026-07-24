export {
  resolveAgentWorkspaceRoot,
  resolveAgentPrivilegesRoot,
  DEFAULT_ROOT_ID,
} from './paths.js'
export {
  WorkspaceError,
  PathEscapeError,
  DenyPathError,
  QuotaExceededError,
  SsrfBlockedError,
  ConfirmationRequiredError,
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
  WorkspaceService,
  getWorkspaceService,
  resetWorkspaceService,
  type ConfirmHandler,
  type WorkspaceServiceOptions,
} from './service.js'
