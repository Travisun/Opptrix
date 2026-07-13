import { useCallback, useEffect, useRef, useState } from 'react'
import { Input, Spinner, Text, makeStyles } from '@fluentui/react-components'
import { CheckmarkCircleRegular } from '@fluentui/react-icons'
import { getProviderCatalog, saveProviderConfig, testProviderConfig } from '../api/client'
import type { PublicProviderRuntime } from '../types/provider'
import OpptrixField from '../components/opptrix/OpptrixField'
import { openExternalUrl } from '../platform/openUrl'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ONBOARDING_COPY } from './manifest'
import { OnboardingTextLink, useOnboardingShellStyles } from './OnboardingShell'

export const TONGHUASHUN_PROVIDER_ID = 'tonghuashun'
export const FUYAO_PORTAL_URL = 'https://fuyao.aicubes.cn/'

export type OnboardingFuyaoNavState = {
  canAdvance: boolean
  advancing: boolean
  advanceLabel: string
  advance: () => Promise<void>
}

const useStyles = makeStyles({
  card: {
    marginTop: 'clamp(16px, 2.5vh, 22px)',
    padding: '16px 18px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  readyBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.accent,
    lineHeight: 1.4,
  },
  readyMeta: {
    fontSize: '13px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  hint: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
  },
  guideTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
  },
  guideList: {
    margin: 0,
    paddingLeft: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  portalLink: {
    alignSelf: 'flex-start',
    fontSize: '12px',
  },
  error: {
    fontSize: '12px',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: opptrixCssVars.textSecondary,
  },
})

export function isTonghuashunConfigured(provider: PublicProviderRuntime | null | undefined): boolean {
  if (!provider) return false
  return provider.secretsConfigured.apiKey === true
}

function findTonghuashunProvider(
  groups: { providers: PublicProviderRuntime[] }[],
): PublicProviderRuntime | null {
  for (const group of groups) {
    const hit = group.providers.find(p => p.providerId === TONGHUASHUN_PROVIDER_ID)
    if (hit) return hit
  }
  return null
}

export function OnboardingFuyaoReadyPanel({
  provider,
}: {
  provider: PublicProviderRuntime | null
}) {
  const s = useStyles()
  const shell = useOnboardingShellStyles()

  return (
    <>
      <Text className={shell.sectionTitle} block>{ONBOARDING_COPY.fuyao.title}</Text>
      <Text className={shell.sectionLead} block>{ONBOARDING_COPY.fuyao.readyLead}</Text>
      <div className={s.card}>
        <span className={s.readyBadge}>
          <CheckmarkCircleRegular fontSize={16} />
          {ONBOARDING_COPY.fuyao.readyBadge}
        </span>
        <Text className={s.readyMeta} block>
          {provider?.enabled
            ? ONBOARDING_COPY.fuyao.readyEnabled
            : ONBOARDING_COPY.fuyao.readyDisabled}
        </Text>
        {provider?.secretPreviews?.apiKey && (
          <Text className={s.hint} block>
            当前密钥：{provider.secretPreviews.apiKey}
          </Text>
        )}
      </div>
    </>
  )
}

export function OnboardingFuyaoPanel({
  onComplete,
  onConfigured,
  onNavChange,
}: {
  onComplete: () => void
  onConfigured: () => void
  onNavChange: (nav: OnboardingFuyaoNavState | null) => void
}) {
  const s = useStyles()
  const shell = useOnboardingShellStyles()
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')

  const advanceImplRef = useRef<() => Promise<void>>(async () => {})

  const runAdvance = useCallback(async () => {
    const key = apiKey.trim()
    if (!key) {
      setError(ONBOARDING_COPY.fuyao.emptyKeyError)
      return
    }
    setAdvancing(true)
    setError('')
    try {
      const test = await testProviderConfig(TONGHUASHUN_PROVIDER_ID, { apiKey: key })
      if (!test.data?.ok) {
        setError(test.data?.message ?? ONBOARDING_COPY.fuyao.testFailedError)
        return
      }
      await saveProviderConfig(TONGHUASHUN_PROVIDER_ID, {
        enabled: true,
        extra: { apiKey: key },
      })
      onConfigured()
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败，请稍后重试')
    } finally {
      setAdvancing(false)
    }
  }, [apiKey, onComplete, onConfigured])

  advanceImplRef.current = runAdvance

  const canAdvance = apiKey.trim().length > 0 && !advancing

  const reportNav = useCallback(() => {
    onNavChange({
      canAdvance,
      advancing,
      advanceLabel: advancing ? '验证中…' : '继续',
      advance: () => advanceImplRef.current(),
    })
  }, [advancing, canAdvance, onNavChange])

  useEffect(() => {
    reportNav()
  }, [reportNav])

  useEffect(() => () => { onNavChange(null) }, [onNavChange])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getProviderCatalog()
      .then(data => {
        if (cancelled) return
        const provider = findTonghuashunProvider(data.groups)
        if (provider?.values.apiKey && typeof provider.values.apiKey === 'string') {
          setApiKey(String(provider.values.apiKey))
        }
      })
      .catch(() => { /* keep empty */ })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className={s.loading}>
        <Spinner size="tiny" />
        <Text>正在读取数据源配置…</Text>
      </div>
    )
  }

  return (
    <>
      <Text className={shell.sectionTitle} block>{ONBOARDING_COPY.fuyao.title}</Text>
      <Text className={shell.sectionLead} block>{ONBOARDING_COPY.fuyao.desc}</Text>
      <div className={s.card}>
        <Text className={s.guideTitle} block>{ONBOARDING_COPY.fuyao.apiGuideTitle}</Text>
        <ol className={s.guideList}>
          {ONBOARDING_COPY.fuyao.apiGuideSteps.map(step => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <OnboardingTextLink
          className={s.portalLink}
          onClick={() => { openExternalUrl(FUYAO_PORTAL_URL) }}
        >
          {ONBOARDING_COPY.fuyao.apiPortalLinkLabel}
        </OnboardingTextLink>
        <OpptrixField
          label={ONBOARDING_COPY.fuyao.apiFieldLabel}
          hint={ONBOARDING_COPY.fuyao.apiFieldHint}
        >
          <Input
            appearance="filled-darker"
            size="medium"
            type="password"
            value={apiKey}
            placeholder={ONBOARDING_COPY.fuyao.apiPlaceholder}
            onChange={(_, d) => {
              setApiKey(d.value ?? '')
              if (error) setError('')
            }}
          />
        </OpptrixField>
        {error && (
          <Text className={s.error} block role="alert">{error}</Text>
        )}
      </div>
    </>
  )
}
