/**
 * Upgrade-mode API allowlist — when uiPhase is wizard_apply / first_boot_hooks,
 * only a small set of /api routes may proceed; SPA static (non-/api) is unaffected.
 */

export type UpgradeLockPhase = 'wizard_apply' | 'first_boot_hooks'

export const SYSTEM_UPDATE_LOCKED_CODE = 'system_update_locked'

/** User-facing; no paths / jargon. */
export const SYSTEM_UPDATE_LOCKED_MESSAGE = '系统正在更新，请稍候完成后再试'

export function isUpgradeLockPhase(phase: string | null | undefined): phase is UpgradeLockPhase {
  return phase === 'wizard_apply' || phase === 'first_boot_hooks'
}

/**
 * Returns true when the request path may proceed during an upgrade lock phase.
 * Non-/api paths (static UI) are always allowed.
 */
export function isApiAllowedDuringUpgrade(
  pathname: string,
  phase: UpgradeLockPhase,
): boolean {
  const path = pathname.split('?')[0] ?? pathname
  if (!path.startsWith('/api')) return true
  if (path === '/api/health') return true
  if (path === '/api/auth/status') return true
  if (path === '/api/system-update' || path.startsWith('/api/system-update/')) return true
  // Confirm apply may need a fresh login when the account is claimed.
  if (phase === 'wizard_apply') {
    if (path === '/api/auth/login' || path === '/api/auth/login/totp') return true
  }
  return false
}
