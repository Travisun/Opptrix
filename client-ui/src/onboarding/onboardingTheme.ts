export type OnboardingPhase =
  | 'intro'
  | 'llm'
  | 'data'
  | 'legal'

export interface OnboardingNavStep {
  phase: OnboardingPhase
}

export function buildOnboardingSteps(): OnboardingNavStep[] {
  return [
    { phase: 'intro' },
    { phase: 'llm' },
    { phase: 'data' },
    { phase: 'legal' },
  ]
}

export function stepLabel(step: OnboardingNavStep): string {
  if (step.phase === 'intro') return '介绍'
  if (step.phase === 'llm') return '模型'
  if (step.phase === 'data') return '行情'
  return '协议'
}

export function stepCounter(index: number, total: number): string {
  return `${index + 1} / ${total}`
}

/** 介绍轮播每屏停留时长 */
export const ONBOARDING_INTRO_SLIDE_MS = 3000
