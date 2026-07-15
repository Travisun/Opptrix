/** 用户引导完成状态 — 存 user-store `preference` namespace */
export const ONBOARDING_STATE_KEY = 'onboarding_state'

/** 协议版本；更新法律文本或 URL 时 bump，已同意用户须重新确认 */
export const LEGAL_AGREEMENTS_VERSION = '2026-03'

/**
 * 引导流程版本；仅改版引导 UI/步骤（应用版本未变）时 bump，已走完用户须重走引导。
 */
export const ONBOARDING_FLOW_VERSION = '3'

export interface OnboardingState {
  /** ISO 8601 — 最近一次完整走完引导 */
  completedAt: string | null
  /** 完成引导时的应用版本 */
  lastCompletedVersion: string | null
  /** 用户同意的协议版本 */
  agreementsVersion: string | null
  /** ISO 8601 — 最近一次勾选协议 */
  agreementsAcceptedAt: string | null
  /** 完成引导时的流程版本 */
  onboardingFlowVersion?: string | null
  /** 引导中跳过 LLM 配置 */
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
