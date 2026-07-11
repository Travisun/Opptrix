import {
  emptyOnboardingState,
  ONBOARDING_STATE_KEY,
  type OnboardingState,
  LEGAL_AGREEMENTS_VERSION,
  ONBOARDING_FLOW_VERSION,
} from './constants'
import { getUserPreference, setUserPreference } from '../api/client'

export async function loadOnboardingState(): Promise<OnboardingState> {
  const resp = await getUserPreference<OnboardingState>(ONBOARDING_STATE_KEY)
  const value = resp.value
  if (!value || typeof value !== 'object') return emptyOnboardingState()
  return {
    ...emptyOnboardingState(),
    ...value,
  }
}

export async function saveOnboardingComplete(opts: {
  appVersion: string
  llmSkipped?: boolean
}): Promise<OnboardingState> {
  const now = new Date().toISOString()
  const next: OnboardingState = {
    completedAt: now,
    lastCompletedVersion: opts.appVersion,
    agreementsVersion: LEGAL_AGREEMENTS_VERSION,
    agreementsAcceptedAt: now,
    onboardingFlowVersion: ONBOARDING_FLOW_VERSION,
    llmSkipped: opts.llmSkipped,
  }
  await setUserPreference(ONBOARDING_STATE_KEY, next)
  return next
}
