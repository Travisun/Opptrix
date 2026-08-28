export type OnboardingPhase =
  | 'intro'
  | 'llm'
  | 'mcp'
  | 'data'
  | 'fuyao'
  | 'community'
  | 'account'
  | 'legal'

export interface OnboardingNavStep {
  phase: OnboardingPhase
}

export function buildOnboardingSteps(opts?: { includeAccount?: boolean }): OnboardingNavStep[] {
  const steps: OnboardingNavStep[] = [
    { phase: 'intro' },
    { phase: 'llm' },
    { phase: 'mcp' },
    { phase: 'data' },
    { phase: 'fuyao' },
    { phase: 'community' },
  ]
  if (opts?.includeAccount !== false) {
    steps.push({ phase: 'account' })
  }
  steps.push({ phase: 'legal' })
  return steps
}

export function stepLabel(step: OnboardingNavStep): string {
  if (step.phase === 'intro') return '介绍'
  if (step.phase === 'llm') return '模型'
  if (step.phase === 'mcp') return '扩展服务'
  if (step.phase === 'data') return '行情'
  if (step.phase === 'fuyao') return '历史行情'
  if (step.phase === 'community') return '交流群'
  if (step.phase === 'account') return '账户'
  return '协议'
}

export function stepCounter(index: number, total: number): string {
  return `${index + 1} / ${total}`
}

/** 介绍轮播每屏停留时长 */
export const ONBOARDING_INTRO_SLIDE_MS = 3000
