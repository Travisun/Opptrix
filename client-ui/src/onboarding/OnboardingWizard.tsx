import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Spinner, Text, mergeClasses } from '@fluentui/react-components'
import type { OnboardingState } from './constants'
import { shouldShowOnboarding } from './constants'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { getConfig } from '../api/client'
import ProviderWizard, { type ProviderWizardNavState } from '../pages/ProviderWizard'
import { SettingsToastProvider } from '../pages/settings/SettingsToast'
import { isElectron } from '../platform/detect'
import { OnboardingDataList } from './OnboardingDataList'
import { OnboardingIntroCarousel } from './OnboardingIntroCarousel'
import { OnboardingLegalPanel } from './OnboardingLegalPanel'
import { OnboardingLlmReadyPanel } from './OnboardingLlmReadyPanel'
import { resolveActiveLlmFromConfig, type LlmActiveSummary } from './llmSummary'
import {
  OnboardingHeroBlock,
  OnboardingShell,
  useOnboardingShellStyles,
} from './OnboardingShell'
import {
  buildOnboardingSteps,
  type OnboardingNavStep,
} from './onboardingTheme'
import {
  isReturningUser,
  ONBOARDING_COPY,
  resolveOnboardingRelease,
} from './manifest'
import { loadOnboardingState, saveOnboardingComplete } from './onboardingState'
import { useAppVersion } from './useAppVersion'

function OnboardingLlmBody({
  onConfigured,
  onCompleteStep,
  onNavChange,
}: {
  onConfigured: () => void
  onCompleteStep: () => void
  onNavChange: (nav: ProviderWizardNavState | null) => void
}) {
  const s = useOnboardingShellStyles()

  return (
    <SettingsToastProvider>
      <Text className={s.sectionTitle} block>{ONBOARDING_COPY.llm.title}</Text>
      <Text className={s.sectionLead} block>{ONBOARDING_COPY.llm.desc}</Text>
      <ProviderWizard
        provider={null}
        onCancel={() => {}}
        onDone={() => {
          void onConfigured()
          onCompleteStep()
        }}
        hideCancel
        hideFooter
        compact
        flowMode="onboarding"
        onNavStateChange={onNavChange}
      />
    </SettingsToastProvider>
  )
}

export interface OnboardingWizardProps {
  priorState: OnboardingState | null
  appVersion: string
  versionLabel: string | null
  onComplete: () => void
}

export default function OnboardingWizard({
  priorState,
  appVersion,
  versionLabel,
  onComplete,
}: OnboardingWizardProps) {
  const s = useOnboardingShellStyles()
  const release = useMemo(() => resolveOnboardingRelease(appVersion), [appVersion])
  const steps = useMemo(() => buildOnboardingSteps(), [])

  const [stepIndex, setStepIndex] = useState(0)
  const [llmSkipped, setLlmSkipped] = useState(false)
  const [llmReady, setLlmReady] = useState(false)
  const [llmSummary, setLlmSummary] = useState<LlmActiveSummary | null>(null)
  const [llmNav, setLlmNav] = useState<ProviderWizardNavState | null>(null)
  const [llmReconfiguring, setLlmReconfiguring] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState('')

  const current = steps[stepIndex]!
  const returning = isReturningUser(priorState)
  const isLast = stepIndex >= steps.length - 1

  const refreshLlmStatus = useCallback(async () => {
    try {
      const cfg = await getConfig()
      setLlmReady(cfg.llm_configured)
      setLlmSummary(resolveActiveLlmFromConfig(cfg))
    } catch {
      setLlmReady(false)
      setLlmSummary(null)
    }
  }, [])

  useEffect(() => {
    if (current.phase === 'llm') void refreshLlmStatus()
    else {
      setLlmNav(null)
      setLlmReconfiguring(false)
      setLlmSummary(null)
    }
  }, [current.phase, refreshLlmStatus])

  useEffect(() => {
    if (llmReady) setLlmSkipped(false)
  }, [llmReady])

  const goNext = () => {
    if (!isLast) setStepIndex(i => i + 1)
  }

  const goToConfig = () => {
    const llmIndex = steps.findIndex(s => s.phase === 'llm')
    if (llmIndex >= 0) setStepIndex(llmIndex)
  }

  const goBack = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1)
  }

  const handleShellBack = () => {
    if (current.phase === 'llm' && llmNav?.canWizardBack) {
      llmNav.goWizardBack()
      return
    }
    goBack()
  }

  const skipLlm = () => {
    setLlmSkipped(true)
    setLlmReconfiguring(false)
    goNext()
  }

  const handleFinish = async () => {
    if (!agreed || finishing || !appVersion) return
    setFinishing(true)
    setFinishError('')
    try {
      await saveOnboardingComplete({ appVersion, llmSkipped })
      onComplete()
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setFinishing(false)
    }
  }

  let body: ReactNode = null
  let bodyFlush = false
  let layoutMode: 'display' | 'workflow' = 'workflow'
  let contentWide = false
  let contentAlignStart = false
  let footerSecondary: ReactNode = null
  let footerPrimary: ReactNode = null
  let canBack = stepIndex > 0

  if (current.phase === 'intro') {
    layoutMode = 'display'
    canBack = false
    body = (
      <OnboardingIntroCarousel
        release={release}
        returning={returning}
        versionLabel={versionLabel}
      />
    )
    footerPrimary = (
      <OpptrixButton variant="primary" onClick={goToConfig}>
        开始配置
      </OpptrixButton>
    )
  } else if (current.phase === 'llm') {
    bodyFlush = true
    contentWide = true
    contentAlignStart = true
    canBack = stepIndex > 0 || Boolean(llmNav?.canWizardBack)

    if (llmReady && !llmReconfiguring) {
      body = <OnboardingLlmReadyPanel summary={llmSummary} />
      footerSecondary = (
        <OpptrixButton variant="ghost" onClick={() => setLlmReconfiguring(true)}>
          更换配置
        </OpptrixButton>
      )
      footerPrimary = (
        <OpptrixButton variant="primary" onClick={goNext}>
          继续
        </OpptrixButton>
      )
    } else {
      body = (
        <OnboardingLlmBody
          onConfigured={() => { void refreshLlmStatus() }}
          onCompleteStep={() => {
            setLlmReconfiguring(false)
            goNext()
          }}
          onNavChange={setLlmNav}
        />
      )
      if (llmNav?.step === 1) {
        footerSecondary = (
          <OpptrixButton variant="ghost" onClick={skipLlm}>
            稍后配置
          </OpptrixButton>
        )
      }
      footerPrimary = (
        <OpptrixButton
          variant="primary"
          disabled={!llmNav?.canAdvance}
          onClick={() => { void llmNav?.advance() }}
        >
          {llmNav?.advanceLabel ?? '继续'}
        </OpptrixButton>
      )
    }
  } else if (current.phase === 'data') {
    bodyFlush = true
    contentWide = true
    contentAlignStart = true
    body = (
      <>
        <Text className={s.sectionTitle} block>{ONBOARDING_COPY.data.title}</Text>
        <Text className={s.sectionLead} block>{ONBOARDING_COPY.data.desc}</Text>
        <OnboardingDataList />
      </>
    )
    footerPrimary = (
      <OpptrixButton variant="primary" onClick={goNext}>
        继续
      </OpptrixButton>
    )
  } else {
    bodyFlush = true
    contentWide = true
    contentAlignStart = true
    body = (
      <OnboardingLegalPanel
        agreed={agreed}
        onAgreedChange={setAgreed}
        finishError={finishError || undefined}
      />
    )
    footerPrimary = (
      <OpptrixButton
        variant="primary"
        disabled={!agreed || finishing}
        onClick={() => { void handleFinish() }}
      >
        {finishing ? '正在进入…' : '进入 Opptrix'}
      </OpptrixButton>
    )
  }

  return (
    <OnboardingShell
      steps={steps}
      stepIndex={stepIndex}
      canBack={canBack}
      onBack={handleShellBack}
      bodyFlush={bodyFlush}
      layoutMode={layoutMode}
      contentWide={contentWide}
      contentAlignStart={contentAlignStart}
      footerSecondary={footerSecondary}
      footerPrimary={footerPrimary}
    >
      {body}
    </OnboardingShell>
  )
}

function GateMessage({
  title,
  desc,
  action,
}: {
  title: string
  desc: string
  action?: ReactNode
}) {
  const s = useOnboardingShellStyles()
  return (
    <div className={mergeClasses(s.root, 'opptrix-onboarding-shell')}>
      <div className={s.stage}>
        <div className={mergeClasses(s.scrollViewport, 'opptrix-onboarding-scroll')}>
          <div className={mergeClasses(s.scrollInner, s.scrollInnerDisplay)}>
            <div className={mergeClasses(s.content, s.contentDisplay)}>
              <OnboardingHeroBlock>
                <Text className={s.displayTitle} block>{title}</Text>
                <Text className={s.displayLead} block>{desc}</Text>
              </OnboardingHeroBlock>
            </div>
          </div>
        </div>
        {action && (
          <div className={mergeClasses(s.footerDock, 'opptrix-onboarding-footer-dock')}>
            <div className={mergeClasses(s.chromeRail, s.chromeRailDisplay)}>
              <footer className={s.footerSingle}>{action}</footer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function OnboardingGate({ children }: { children: ReactNode }) {
  const s = useOnboardingShellStyles()
  const { version, label, loading: versionLoading, reload: reloadVersion } = useAppVersion()
  const [priorState, setPriorState] = useState<OnboardingState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadingState, setLoadingState] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isElectron()) return
    let cancelled = false
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        document.documentElement.classList.remove('opptrix-electron-startup')
        window.electronAPI?.signalShellReady?.()
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(outer)
    }
  }, [])

  const reload = useCallback(async () => {
    setLoadingState(true)
    setLoadError('')
    try {
      const state = await loadOnboardingState()
      setPriorState(state)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '无法读取引导状态')
    } finally {
      setLoadingState(false)
    }
  }, [])

  const handleOnboardingComplete = useCallback(async () => {
    try {
      const state = await loadOnboardingState()
      setPriorState(state)
    } catch {
      /* 落库已成功时仍允许进入主界面 */
    }
    setDismissed(true)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const dismissedRef = useRef(false)

  useEffect(() => {
    if (!version || loadError || loadingState) {
      console.log('[gate] skip check: version=', version, 'loadError=', loadError, 'loadingState=', loadingState)
      return
    }
    const show = shouldShowOnboarding(priorState, version)
    console.log('[gate] shouldShow:', show, 'dismissed=', dismissed, 'version=', version, 'priorState=', priorState?.completedAt)
    if (show) {
      setDismissed(false)
      dismissedRef.current = false
    } else {
      dismissedRef.current = true
    }
  }, [version, priorState, loadError, loadingState])

  useEffect(() => {
    if (!isElectron()) return
    const api = window.electronAPI
    if (!api?.onAppUpdateStatus) return
    return api.onAppUpdateStatus(status => {
      if (status.state === 'ready' || status.state === 'installing') {
        dismissedRef.current = false
        void reloadVersion()
        void reload()
      }
    })
  }, [reload, reloadVersion])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      console.log('[gate] visible, dismissedRef=', dismissedRef.current)
      if (dismissedRef.current) return
      void reloadVersion()
      void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload, reloadVersion])

  if (versionLoading || loadingState) {
    return (
      <div className={mergeClasses(s.root, 'opptrix-onboarding-shell')}>
        <div className={s.centerLoading}>
          <Spinner size="medium" label="正在准备…" />
        </div>
      </div>
    )
  }

  if (!version) {
    return (
      <GateMessage
        title="暂时无法读取版本"
        desc="请确认服务已启动后重试。"
        action={(
          <OpptrixButton variant="primary" onClick={() => { void reloadVersion() }}>
            重试
          </OpptrixButton>
        )}
      />
    )
  }

  const appVersion = version
  const needsOnboarding = !dismissed
    && !loadError
    && shouldShowOnboarding(priorState, appVersion)

  if (loadError) {
    return (
      <GateMessage
        title="暂时无法连接"
        desc={`${loadError}。请确认服务已启动后重试。`}
        action={(
          <OpptrixButton variant="primary" onClick={() => { void reload() }}>
            重试
          </OpptrixButton>
        )}
      />
    )
  }

  if (needsOnboarding) {
    return (
      <OnboardingWizard
        priorState={priorState}
        appVersion={appVersion}
        versionLabel={label}
        onComplete={() => { void handleOnboardingComplete() }}
      />
    )
  }

  return <>{children}</>
}
