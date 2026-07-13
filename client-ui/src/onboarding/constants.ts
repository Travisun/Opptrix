/**
 * 浏览器端引导常量 — 与 packages/shared/src/onboarding.ts 保持同步。
 * client-ui 勿从 @opptrix/shared 主入口导入（会拖入 node:path）。
 */

export const ONBOARDING_STATE_KEY = 'onboarding_state'

/** 协议版本；更新法律文本时 bump，并与 shared 包同名常量一致 */
export const LEGAL_AGREEMENTS_VERSION = '2026-03'

/** 引导流程版本；改版引导 UI/步骤时 bump */
export const ONBOARDING_FLOW_VERSION = '2'

export interface OnboardingState {
  completedAt: string | null
  lastCompletedVersion: string | null
  agreementsVersion: string | null
  agreementsAcceptedAt: string | null
  onboardingFlowVersion?: string | null
  llmSkipped?: boolean
}

export function emptyOnboardingState(): OnboardingState {
  return {
    completedAt: null,
    lastCompletedVersion: null,
    agreementsVersion: null,
    agreementsAcceptedAt: null,
    onboardingFlowVersion: null,
  }
}

export function normalizeAppVersion(version: string): string {
  return version.replace(/^v/i, '').trim()
}

export function shouldShowOnboarding(
  state: OnboardingState | null | undefined,
  appVersion: string,
): boolean {
  const current = normalizeAppVersion(appVersion)
  if (!current) return true
  if (!state?.completedAt) return true

  const last = normalizeAppVersion(state.lastCompletedVersion ?? '')
  if (!last || last !== current) return true

  if ((state.onboardingFlowVersion ?? null) !== ONBOARDING_FLOW_VERSION) return true
  if (state.agreementsVersion !== LEGAL_AGREEMENTS_VERSION) return true

  return false
}
